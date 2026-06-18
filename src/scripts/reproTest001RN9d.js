#!/usr/bin/env node
/**
 * Marco Zero Oficial dos testes RN — Teste 001 (RN 9 dias, 16/06/2026).
 * Mãe perguntou "isso é normal pra idade? como posso melhorar?".
 *
 * Critérios de aprovação derivados da rubrica oficial:
 *   - idade reportada = 9 dias (não pode virar 14, 7, etc.)
 *   - PRIMEIRA frase responde diretamente "isso é normal?" (Sim/Em parte sim/…)
 *     — não pode abrir com "É compreensível…" antes da resposta direta
 *   - 6 sinais de saciedade listados
 *   - bloco operacional ("se os sinais não aparecem, ofereça o peito de novo")
 *   - tranquilização explícita sobre associação negativa
 *   - posição vertical 30 a 40 minutos
 *   - pelo menos UMA pergunta concreta sobre o período noturno
 *     (seios mais flácidos / deglutição após 18h / ordenha à noite / complemento à noite)
 *   - vocabulário 100% método (sem "cluster", "mamadas agrupadas", "fome residual acumulada")
 */
import { processTurn } from '../services/zlayaPipeline.js';

const profile = { motherName: '—', babyName: 'bb', ageDays: 9 };

const message = [
  'Bebê de 9 dias. Durante o dia faz sonecas geralmente de 2 a 2,5h sem dificuldades.',
  'Acorda chorando, mama um pouco, me esforço para mantê-lo acordado por uma meia hora,',
  'ele mama o outro peito, coloco para arrotar e vai para o berço (em todo o processo está muito sonolento).',
  'Depois das 18h mais ou menos, fica mais tempo acordado e já não deixa colocar para arrotar tão facilmente.',
  'Assim que coloco no berço desperta e começa a chorar. Em geral eu tento muitas coisas, mas, por fim, ele só se acalma se voltar para o peito.',
  'Tenho medo dessa associação negativa, mas muitas vezes nada mais funciona.',
  'Eu só queria que ele dormisse à noite como dorme de dia. Às vezes só consigo colocá-lo no berço depois de 1 da manhã.',
  'Isso é normal pra idade? Como posso melhorar?',
].join(' ');

console.log('═════════════════════════════════════════════════════════════');
console.log('REPRO — TESTE 001 (RN 9 dias, 16/06/2026)');
console.log('═════════════════════════════════════════════════════════════');
console.log('PERFIL :', JSON.stringify(profile));
console.log('MENSAGEM (mãe):');
console.log(message);
console.log('-------------------------------------------------------------');

const result = await processTurn({
  message,
  babyProfile: profile,
  conversation: [],
  conversationId: 'repro-test001-rn9d',
});

console.log('ageBand     :', result.ageBand?.label, `(${result.ageDays} dias)`);
console.log('intent      :', `${result.intent?.intent} (conf=${result.intent?.confidence})`);
console.log('rota        :', result.route);
console.log('safety      :', `safe=${result.safety?.safe} viol=${(result.safety?.violations || []).length}`);
console.log('-------------------------------------------------------------');
console.log('RESPOSTA FINAL:');
console.log(result.response?.text);
console.log('-------------------------------------------------------------');

const text = result.response?.text || '';
const norm = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// 1) age preserved
const wrongAgeMatches = [];
const wrongAgeRe = /\b(\d{1,2})\s*dias?\b/gi;
const textNoRange = text.replace(/0\s*[–\-]\s*28\s*dias?/gi, '');
let mm;
while ((mm = wrongAgeRe.exec(textNoRange)) !== null) {
  const n = Number(mm[1]);
  if (Number.isFinite(n) && n !== 9 && n <= 60) wrongAgeMatches.push(mm[0]);
}
const ageOk = wrongAgeMatches.length === 0;

// 2) primeira frase responde diretamente
const firstSentence = text.split(/(?<=[.!?])\s+/)[0] || text;
const firstNorm = firstSentence.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const directOk = [
  /^\s*sim[\s,—\-:]/,
  /^\s*em\s+parte\s+sim/,
  /^\s*esse\s+padr[aã]o/,
  /^\s*esse\s+comportamento/,
  /^\s*isso\s+(pode|costuma|[eé])/,
  /^\s*[eé]\s+(comum|esperado|fisiol[oó]gico)/,
  /^\s*com\s+\d{1,3}\s+dias?/,
].some((re) => re.test(firstNorm));

// 3) 6 sinais de saciedade + bloco operacional
const signs = [
  /solt[ae]r?\s+(o\s+)?peito/,
  /relaxa(r|do)?\s+(o\s+)?corpo/,
  /(abre|abrir|abrindo)\s+(as\s+)?(maozinhas|maos)/,
  /(reduz|reduzir|diminui|diminuir)\s+(o\s+)?ritmo\s+(d[ae]\s+)?suc[çc][aã]o/,
  /tranquil[oa]\s+(ap[óo]s|depois)/,
  /confort[aá]vel\s+(depois|ap[óo]s)/,
];
const signsHit = signs.filter((re) => re.test(norm)).length;
const operationalOk = /(ofere[çc]a\s+(o\s+peito\s+)?(de\s+)?novo|ofere[çc]a\s+novamente\s+o\s+peito|pode\s+indicar\s+que\s+a\s+mamada|n[aã]o\s+foi\s+suficient|se\s+ao\s+contr[aá]rio|se\s+(ele|ela)\s+continua\s+agitad)/.test(norm);

// 4) tranquilização sobre associação negativa
const reassureOk = /(n[aã]o\s+configura\s+associa[çc][aã]o\s+negativa|essa\s+leitura\s+n[aã]o\s+se\s+aplica|n[aã]o\s+[eé]\s+associa[çc][aã]o\s+negativa|n[aã]o\s+caracter[ií]za\s+associa[çc][aã]o\s+negativa|fisiol[oó]gico\s+e\s+esperado)/.test(norm);

// 5) posição vertical 30–40
const verticalOk = /(30\s*(a|–|-|—|ate|até)\s*40\s*min|posi[çc][aã]o\s+vertical\s+por\s+30\s*(a|–|-|—)\s*40)/.test(norm);

// 6) deep night-production question
const deepNight = [
  /seios\s+(ficam\s+)?(mais\s+)?fl[aá]cidos?/,
  /sensa[çc][aã]o\s+de\s+menor\s+enchimento/,
  /deglut[ií][çc][aã]o\s+(audi|vel|ouv)/,
  /ouvir\s+(a\s+)?deglut/,
  /ordenha\s+de\s+avalia[çc][aã]o/,
  /volume\s+do\s+complemento\s+[aà]\s+noite/,
  /complemento.*noite.*satisfa|satisfaz.*pr[oó]xima\s+mamada/,
  /quanto\s+tempo\s+(cada\s+peito|a\s+mamada)\s+dura\s+(ap[oó]s|depois)\s+as?\s+18/,
].some((re) => re.test(norm));

// 7) vocabulário oficial — sem termos importados
const noClusterOk = !/cluster|mamadas?\s+agrupadas?|fome\s+residual/.test(norm);

const checks = [
  ['idade preservada (9 dias)', ageOk, wrongAgeMatches],
  ['primeira frase responde diretamente', directOk, firstSentence.slice(0, 120)],
  ['6 sinais de saciedade listados (≥4 dos 6)', signsHit >= 4, signsHit],
  ['bloco operacional "se não aparecem"', operationalOk, ''],
  ['tranquilização sobre associação negativa', reassureOk, ''],
  ['posição vertical 30 a 40 minutos', verticalOk, ''],
  ['pergunta concreta sobre produção noturna', deepNight, ''],
  ['vocabulário oficial (sem cluster/agrupada/fome residual)', noClusterOk, ''],
];

console.log('VERIFICAÇÕES OFICIAIS — TESTE 001:');
let allOk = true;
for (const [name, ok, extra] of checks) {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${extra !== '' ? ` (${JSON.stringify(extra)})` : ''}`);
  if (!ok) allOk = false;
}

console.log('-------------------------------------------------------------');
if (allOk) {
  console.log('STATUS: ✅ PASS — todos os critérios do teste 001 atendidos.');
  process.exit(0);
}
console.log('STATUS: ❌ FAIL — verificar itens marcados com ✗ acima.');
process.exit(1);
