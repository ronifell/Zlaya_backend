#!/usr/bin/env node
/**
 * Simulation — Official dossier 19/06/2026 (TESTE 005)
 *   TESTE 005  RN  6d  (berço ok de dia + problema só à noite — 30 a 40 min vertical sempre explícito)
 *   TESTE 005  RN  9d  (vespertine + medo de associação — NÃO escalonar refluxo patológico sem sinais clínicos)
 *   TESTE 005  RN 10d  (janela crítica 23h–02h — fazer perguntas antes/depois da mamada, não presumir ordenha)
 *   TESTE 005  RN 12d  (despertar único após sono precoce 19h-20h → ~23h — eixo mamada noturna, NÃO abrir por Moro/Travesseiro)
 *   TESTE 005  RN 12d/02 (madrugada — manter noturno + troca de fralda ANTES da mamada + linguagem neutra mamada/peito)
 *   TESTE 005  RN 13d  (choro no banho — eixo conforto/contenção/térmica, aulas filtradas — nada de Mamadas Efetivas / Passo 4 / Troca dia-noite)
 *
 * Layer A: deterministic — rules, prompts, forbidden, signals (no LLM)
 * Layer B: end-to-end — processTurn (LLM if OPENAI_API_KEY, else local fallback)
 *
 * Run with:  node src/scripts/simulateTeste005RNJune19.js
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSystemPrompt } from '../prompts/systemPrompt.js';
import { extractSignals } from '../services/signalExtractor.js';
import { processTurn } from '../services/zlayaPipeline.js';
import { config } from '../config/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const knowledge = path.join(__dirname, '..', 'knowledge', 'rn');

function strip(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function pass(label) { console.log(`  \u2713 ${label}`); return 0; }
function fail(label, detail = '') { console.log(`  \u2717 ${label}${detail ? ` \u2014 ${detail}` : ''}`); return 1; }

// ─── Layer A: infrastructure ───────────────────────────────────────────────

const NEW_RULE_IDS = [
  // TESTE 005 — RN 6d
  'rn-vertical-time-always-explicit',
  // TESTE 005 — RN 9d
  'rn-mattress-elevation-30-40',
  'rn-reflux-escalation-gated-by-clinical-signs',
  // TESTE 005 — RN 10d
  'rn-do-not-assume-ordenha-complement',
  'rn-night-critical-window-hunger-question-mandatory',
  'rn-night-window-narrow-lessons',
  // TESTE 005 — RN 12d (despertar após sono precoce)
  'rn-23h-wake-ask-feeding',
  // TESTE 005 — RN 12d/02 (madrugada + começar o dia + fralda antes da mamada)
  'rn-madrugada-keep-night-direct-answer',
  'rn-night-diaper-change-before-feed',
  // TESTE 005 — RN 13d (choro no banho)
  'rn-bath-crying-stay-on-topic',
  // TESTE 005 — concordância de gênero (caso 4)
  'rn-gender-consistency',
];

const PROMPT_FRAGMENTS = [
  // RN 6d — vertical 30 a 40 sempre explícita, inclusive berço-ok-de-dia
  'sempre que sua resposta mencionar a expressao "posicao vertical"',
  // RN 9d — gate clínico no escalonamento de refluxo
  'sinais clinicos concretos',
  'so e obrigatorio quando o quadro apresenta pelo menos um',
  'sem nenhum dos sinais clinicos concretos',
  // RN 9d — elevação 30 a 40 graus
  '30 a 40 graus',
  // RN 10d — duas perguntas indispensáveis em forma interrogativa
  'antes ou depois da mamada',
  'esse comportamento de ficar nervosa',
  // RN 10d — aulas restritas
  'passo 4: atencao a alimentacao associada ao sono',
  // RN 12d — despertar após sono precoce 19h–20h → ~23h (pergunta indispensável)
  'voce alimenta a bebe nesse horario',
  // RN 12d/02 — manter noturno + fralda antes da mamada
  'voce fez certo em manter o ambiente noturno',
  'troca de fralda na madrugada',
  'antes da mamada',
  'minima luz',
  // RN 13d — choro no banho (eixo conforto/contenção)
  'choro durante o banho',
  'fralda de pano',
  'barriguinha para baixo',
];

const FORBIDDEN_FRAGMENTS = [
  // RN 9d — não escalonar refluxo patológico sem sinais clínicos
  'escalonar precocemente para refluxo patologico',
  // RN 9d — 45° não é a única referência (o ° vira "°" depois do strip, sem diacrítico)
  'tratar a elevacao do colchao em 45',
  // RN 9d — não oferecer elevação como recurso genérico
  'oferecer a elevacao do colchao (em qualquer angulo) como recurso generico',
  // RN 6d — vertical sem o tempo
  'mencionar posicao vertical sem declarar o tempo oficial do metodo',
  // RN 10d — perguntas indispensáveis
  'deixar de fazer as duas perguntas indispensaveis para o caso da janela critica 23h',
  // RN 10d — presumir ordenha/complemento
  'presumir que a mae faz ordenha ou oferece complemento quando ela nao informou',
  // RN 10d — aulas amplas
  'indicar aulas amplas (inicio do sono noturno, troca dia-noite)',
];

function runInfrastructureChecks() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('LAYER A \u2014 Infrastructure (rules / prompt / forbidden / signals)');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  let bad = 0;
  const rules = JSON.parse(readFileSync(path.join(knowledge, 'rules.json'), 'utf-8'));
  const forbidden = JSON.parse(readFileSync(path.join(knowledge, 'forbidden.json'), 'utf-8'));
  const sysNorm = strip(buildSystemPrompt({ namespace: 'RN', band: { label: 'RN (0\u201328 dias)' } }));
  const forbNorm = strip(forbidden.forbiddenInterpretations.join(' \u2022 '));

  console.log('\n--- New fixed rules ---');
  for (const id of NEW_RULE_IDS) {
    bad += rules.fixedRules.some((r) => r.id === id) ? pass(`rule "${id}" present`) : fail(`rule "${id}" missing`);
  }

  console.log('\n--- System prompt fragments ---');
  for (const frag of PROMPT_FRAGMENTS) {
    bad += sysNorm.includes(strip(frag)) ? pass(`prompt has "${frag}"`) : fail(`prompt missing "${frag}"`);
  }

  console.log('\n--- Forbidden interpretations ---');
  for (const frag of FORBIDDEN_FRAGMENTS) {
    bad += forbNorm.includes(strip(frag)) ? pass(`forbidden has "${frag}"`) : fail(`forbidden missing "${frag}"`);
  }

  console.log('\n--- Signal extraction ---');
  const signalCases = [
    {
      id: 'rn-6d',
      ageDays: 6,
      message:
        'Beb\u00ea 6 dias, estabelecendo uma rotina. Faz todas as sonecas no ber\u00e7o, mas a noite n\u00e3o quer ficar no ber\u00e7o. ' +
        'Estou tendo que pega-lo e leva-lo para o meu quarto. o que pode ser?',
      must: ['crib_ok_day_problem_night'],
    },
    {
      id: 'rn-9d',
      ageDays: 9,
      message:
        'Beb\u00ea de 9 dias. Durante o dia faz sonecas geralmente de 2 a 2,5h sem dificuldades. ' +
        'Acorda chorando, mama um pouco, me esfor\u00e7o para mant\u00ea-lo acordado por uma meia hora, ele mama o outro peito, ' +
        'coloco para arrotar e vai para o ber\u00e7o. Em todo o processo est\u00e1 muito sonolento. ' +
        'Depois das 18h, mais ou menos, fica mais tempo acordado e j\u00e1 n\u00e3o deixa colocar para arrotar t\u00e3o facilmente. ' +
        'Assim que coloco no ber\u00e7o, desperta e come\u00e7a a chorar. Em geral eu tento muitas coisas, mas, por fim, ' +
        'ele s\u00f3 se acalma se voltar para o peito. Tenho medo dessa associa\u00e7\u00e3o negativa, mas muitas vezes nada mais funciona. ' +
        'Eu s\u00f3 queria que ele dormisse \u00e0 noite como dorme de dia. \u00c0s vezes s\u00f3 consigo coloc\u00e1-lo no ber\u00e7o depois de 1 da manh\u00e3. ' +
        'Isso \u00e9 normal para a idade? Como posso melhorar?',
      // For 9d, we mainly care that vespertine + late_crib + breast_soothing fire,
      // and the response stays in the alimentary frame (no premature reflux escalation).
      must: ['late_crib_placement'],
    },
    {
      id: 'rn-10d',
      ageDays: 10,
      message:
        'Beb\u00ea de 10 dias. Sigo janelas de sono com minha filha de 1h acordada e dorme por 3h. ' +
        'Durante o dia d\u00e1 certo, mas quando chega na madrugada no hor\u00e1rio de dormir de 23h \u00e0s 02h ela n\u00e3o consegue dormir ' +
        'e fica nervosa sugando as m\u00e3ozinhas e choramingando. Ser\u00e1 que sonecas com dura\u00e7\u00e3o de 3 horas est\u00e1 muito para ela? Devo diminuir?',
      must: ['night_hunger_signs_rn', 'asks_nap_duration_rn'],
    },
    {
      id: 'rn-12d-wake-after-early-sleep',
      ageDays: 12,
      message:
        'Minha nen\u00e9m tem 12 dias. \u00daltima soneca dela \u00e9 17:30, no m\u00e1ximo 18:00. ' +
        'Inicio o banho entre 18:30 e iniciar o sono da noite por volta de 19:00 a 20:00. ' +
        'Ela acorda umas 23:00 da noite e demora a pegar o sono novamente. ' +
        'Tem alguma sugest\u00e3o pra melhorar, voltar a dormir ou \u00e9 normal pela idade?',
      must: ['wake_after_early_sleep_rn'],
    },
    {
      id: 'rn-12d-madrugada-diaper',
      ageDays: 12,
      message:
        'Meu bebe esta noite acordou para mamar 4:40. Troquei a fralda de xixi pois estava muito cheia. ' +
        'Terminou de mamar era 5:20. Mas demorou para engrenar no sono novamente. ' +
        'Era quase 6:50 da manha quando ele realmente dormiu. ' +
        'Neste caso, seria interessante ter "come\u00e7ado o dia" com ele, abrindo janela, trocando o pijaminha ' +
        'e tentado colocar pra dormir de nvo, ou, manter ele ali no quarto - como fiz - para que ele dormisse? ' +
        'Sempre respeito a janela de sono, mas ele n\u00e3o estava dormindo de jeito nenhum. ' +
        'Ambiente estava adequado, escuro, ruido, fralda trocada, mama. ' +
        'Minha quest\u00e3o \u00e9: o dia dele nao vai inicar muito tarde? ' +
        'Provavelmente ele ir\u00e1 acordar umas 8:30 (maximo), pois irei acorda-lo prs mamar.',
      must: ['start_day_or_keep_night_rn', 'night_diaper_change_routine'],
    },
    {
      id: 'rn-13d-bath-crying',
      ageDays: 13,
      message:
        'Ol\u00e1, meu beb\u00ea tem 13 dias, percebi que ele chora muuuuuito na hora do banho ' +
        'e ainda uso aquelas almofadas para dar mais seguran\u00e7a e conforto. ' +
        'O que eu poderia fazer para diminuir esse choro?',
      must: ['bath_crying_rn'],
    },
  ];
  for (const sc of signalCases) {
    const sig = extractSignals({ message: sc.message, conversation: [], ageBand: 'RN', ageDays: sc.ageDays });
    const ids = sig.signals.map((s) => s.id);
    console.log(`\n  ${sc.id}: ${ids.join(', ') || '\u2014'}`);
    for (const m of sc.must) bad += ids.includes(m) ? pass(`signal "${m}"`) : fail(`signal "${m}" not fired`);
  }

  console.log(`\nLayer A result: ${bad === 0 ? 'ALL PASS' : bad + ' FAILED'}`);
  return bad === 0;
}

// ─── Layer B: end-to-end ───────────────────────────────────────────────────

const E2E = [
  {
    id: 'teste-005-rn-6d',
    label: 'TESTE 005 \u2014 RN 6 dias (ber\u00e7o ok de dia + problema s\u00f3 \u00e0 noite \u2014 vertical 30 a 40 min explicit)',
    profile: { motherName: '\u2014', babyName: 'bb', ageDays: 6 },
    message:
      'Beb\u00ea 6 dias, estabelecendo uma rotina. Faz todas as sonecas no ber\u00e7o, mas a noite n\u00e3o quer ficar no ber\u00e7o. ' +
      'Estou tendo que pega-lo e leva-lo para o meu quarto. o que pode ser?',
    checks: (text, result) => {
      const issues = []; const warn = []; const n = strip(text);
      if (!/\b6\s*dias\b/.test(n)) issues.push('must cite explicit age "6 dias"');
      // Hipótese principal: mamada noturna / baixa produção noturna
      if (!/(mamada noturna|producao.*(noite|noturna)|menor producao|baixa producao|menor transferencia|menor fluxo)/.test(n))
        issues.push('must name mamada noturna / baixa produção materna no período da noite');
      // Pergunta indispensável: ele mama no peito, fórmula ou os dois?
      if (!/(mama no peito|formula ou os dois|peito.*formula.*complemento|peito[,\.\s]+formula|forma de alimentacao)/.test(n))
        issues.push('must ask feeding form (peito, fórmula ou os dois)');
      // Pergunta indispensável: antes de colocar no berço, ele mama?
      if (!/(antes de colocar|antes de tentar|antes de transferir|antes do berc|antes de deita|antes dessa transferencia)/.test(n))
        warn.push('nuance: ideally ask "antes de colocar no berço à noite, ele mama?"');
      // Sinais de saciedade — lista oficial
      if (!/(solta o peito|relaxa o corpo|abre as mao|reduz o ritmo|sinais de saciedade)/.test(n))
        issues.push('must list sinais de saciedade');
      // POSIÇÃO VERTICAL com TEMPO EXPLÍCITO 30 a 40 min — REGRA CENTRAL DESTE CASO
      if (!/(30\s*(a|–|-|—|ate|até)\s*40\s*(min|minutos))/.test(n))
        issues.push('must include vertical "30 a 40 minutos" EXPLICITLY (regra central do TESTE 005 RN 6d)');
      // Não abrir por adaptação ao berço / Travesseiro / Moisés
      if (/^\s*(a estrategia do travesseiro|adaptar.{0,10}ao berc|adaptacao ao berc|para o moises)/.test(n))
        issues.push('must NOT open by Travesseiro / adaptar ao berço / Moisés');
      // Aulas: devem incluir Mamadas Efetivas e Estimule o Arroto; NÃO devem ter "Troca dia-noite" ou "Início do Sono Noturno"
      if (/troca dia[\s\-]?noite|inicio do sono noturno|trocar o dia pela noite/.test(n))
        issues.push('must NOT recommend Troca dia-noite / Início do Sono Noturno as principal lessons');
      if (!/(mamadas efetivas|amamenta|estimule o arroto)/.test(n))
        warn.push('nuance: ideally cite Mamadas Efetivas / Estimule o Arroto');
      // Linguagem cautelosa de produção
      if (/(a producao de leite da mae diminui apos as 18h|a producao cai apos as 18h)/.test(n))
        issues.push('must NOT use categorical phrasing about production drop after 18h');
      // Não presumir complemento/ordenha
      if (/(continue ordenhando|sua ordenha|avalie sua ordenha|mesmo com complemento|continue com o complemento)/.test(n))
        issues.push('must NOT assume mother is doing ordenha or offering complement');
      result.__warnings = warn; return issues;
    },
  },
  {
    id: 'teste-005-rn-9d',
    label: 'TESTE 005 \u2014 RN 9 dias (vespertino + medo de associa\u00e7\u00e3o \u2014 N\u00c3O escalonar reflexo patol\u00f3gico)',
    profile: { motherName: '\u2014', babyName: 'bb', ageDays: 9 },
    message:
      'Beb\u00ea de 9 dias. Durante o dia faz sonecas geralmente de 2 a 2,5h sem dificuldades. ' +
      'Acorda chorando, mama um pouco, me esfor\u00e7o para mant\u00ea-lo acordado por uma meia hora, ele mama o outro peito, ' +
      'coloco para arrotar e vai para o ber\u00e7o. Em todo o processo est\u00e1 muito sonolento. ' +
      'Depois das 18h, mais ou menos, fica mais tempo acordado e j\u00e1 n\u00e3o deixa colocar para arrotar t\u00e3o facilmente. ' +
      'Assim que coloco no ber\u00e7o, desperta e come\u00e7a a chorar. Em geral eu tento muitas coisas, mas, por fim, ' +
      'ele s\u00f3 se acalma se voltar para o peito. Tenho medo dessa associa\u00e7\u00e3o negativa, mas muitas vezes nada mais funciona. ' +
      'Eu s\u00f3 queria que ele dormisse \u00e0 noite como dorme de dia. \u00c0s vezes s\u00f3 consigo coloc\u00e1-lo no ber\u00e7o depois de 1 da manh\u00e3. ' +
      'Isso \u00e9 normal para a idade? Como posso melhorar?',
    checks: (text, result) => {
      const issues = []; const warn = []; const n = strip(text);
      if (!/\b9\s*dias\b/.test(n)) issues.push('must cite explicit age "9 dias"');
      // Hipótese central: baixa transferência / menor produção materna no fim do dia / noite
      if (!/(baixa transferencia|menor producao|baixa producao|menor fluxo|menor transferencia)/.test(n))
        issues.push('must name baixa transferência / menor produção no fim do dia/noite as central hypothesis');
      // Tranquilização sobre associação negativa — frase direta com a idade
      if (!/(aind?a?\s+nao\s+cria|nao\s+(e|configura|significa)\s+associacao\s+negativa|nao\s+e\s+vicio|nao\s+e\s+manha|nao\s+e\s+mau\s+habito|9\s*dias[\s\S]{0,150}nao\s+cria)/.test(n))
        issues.push('must include direct reassurance "com 9 dias ainda não cria associação negativa"');
      // Posição vertical 30 a 40 min EXPLÍCITA
      if (!/(30\s*(a|–|-|—|ate|até)\s*40\s*(min|minutos))/.test(n))
        issues.push('must include vertical 30 a 40 minutos');
      // Sinais de saciedade
      if (!/(solta o peito|relaxa o corpo|abre as mao|reduz o ritmo|sinais de saciedade)/.test(n))
        issues.push('must list sinais de saciedade');
      // Resposta DIRETA à pergunta "isso é normal?"
      if (!/(sim,?\s+esse|em parte sim|sim,?\s+(e|é|isso)|sim[,\.\s]|pode ocorrer em rn|e\s+comum no rn|e esperado no rn|e frequente no rn|e\s+comum\s+que|e\s+esperado\s+que)/.test(n))
        warn.push('nuance: ideally open with a direct answer to "isso é normal?"');
      // GATE CRÍTICO — NÃO escalonar para refluxo patológico sem sinais clínicos
      // A mãe não relatou: vômitos em jato, engasgos frequentes, recusa alimentar persistente, arqueamento, irritabilidade persistente
      if (/refluxo patologico/.test(n))
        issues.push('TESTE 005 RN 9d: must NOT escalate to "refluxo patológico" — no clinical signs in mother\'s report');
      if (/(material do pediatra|pediatra roberto|roberto franklin|aulas extras|aulas bonus|aulas b[oô]nus)/.test(n))
        issues.push('TESTE 005 RN 9d: must NOT route to material do Pediatra Roberto Franklin — premature without clinical signs');
      if (/(suporte humano|encaminh.*suporte|equipe de suporte)/.test(n))
        issues.push('TESTE 005 RN 9d: must NOT route to suporte humano — premature without clinical signs');
      // GATE CRÍTICO — NÃO recomendar explicitamente elevação do colchão sem sinais clínicos
      if (/(elevacao do colchao|colchao.{0,8}(30|40|45|inclinad|elevado)|elevar.{0,5}colchao|inclinar.{0,5}colchao)/.test(n))
        issues.push('TESTE 005 RN 9d: must NOT recommend mattress elevation — premature without clinical signs');
      // Refluxo fisiológico pode ser citado como possibilidade (não obrigatório, mas aceitável)
      if (/refluxo fisiologico/.test(n) && !/refluxo patologico/.test(n))
        warn.push('nuance: refluxo fisiológico mentioned as possibility — accepted, gate respected');
      // Linguagem cautelosa de produção
      if (/(a producao de leite da mae diminui apos as 18h|a producao cai apos as 18h)/.test(n))
        issues.push('must NOT use categorical phrasing about production drop after 18h');
      result.__warnings = warn; return issues;
    },
  },
  {
    id: 'teste-005-rn-10d',
    label: 'TESTE 005 \u2014 RN 10 dias (janela cr\u00edtica 23h\u201302h \u2014 perguntas antes/depois + n\u00e3o presumir ordenha)',
    profile: { motherName: '\u2014', babyName: 'bb', ageDays: 10 },
    message:
      'Beb\u00ea de 10 dias. Sigo janelas de sono com minha filha de 1h acordada e dorme por 3h. ' +
      'Durante o dia d\u00e1 certo, mas quando chega na madrugada no hor\u00e1rio de dormir de 23h \u00e0s 02h ela n\u00e3o consegue dormir ' +
      'e fica nervosa sugando as m\u00e3ozinhas e choramingando. Ser\u00e1 que sonecas com dura\u00e7\u00e3o de 3 horas est\u00e1 muito para ela? Devo diminuir?',
    checks: (text, result) => {
      const issues = []; const warn = []; const n = strip(text);
      if (!/\b10\s*dias\b/.test(n)) issues.push('must cite explicit age "10 dias"');
      // Pergunta direta: "Devo diminuir?" → responder DIRETAMENTE
      if (!/(2h?30\s*(a|–|-|—|ate|até)\s*3h?|2[,\.]?30\s*(a|–|-|—|ate|até)\s*3|2[,\.]?5\s*h)/.test(n)
          && !/(podem ser esperadas|nao e necessario diminuir|sao esperadas|nao precisa diminuir)/.test(n))
        issues.push('must respond DIRECTLY: sonecas de 2h30 a 3h podem ser esperadas — não é necessário diminuir');
      // Marcar nervosismo + sugar mãozinhas + choramingo como SINAL CLARO DE FOME
      if (!/(sinal.{0,10}(claro|forte)\s+de\s+fome|sinais.{0,10}(classicos|fortes|claros)\s+de\s+fome|isso\s+e\s+sinal\s+de\s+fome|indicam?\s+fome|comportamento.{0,20}(indica|sugere|aponta)\s+fome)/.test(n))
        issues.push('must mark sugar mãozinhas + nervosismo + choramingo as SINAL CLARO DE FOME (not generic agitação)');
      // PERGUNTAS INDISPENSÁVEIS — devem aparecer em forma interrogativa direta na resposta
      const askedFedAtTime = /(ela\s+(j[aá]\s+)?mamou\s+nesse\s+hor|nesse\s+hor[aá]rio[,\s]+ela\s+(j[aá]\s+)?(mamou|tem mamado)|antes\s+de\s+(tentar\s+coloc[aá]-la|coloc[aá]-la\s+no\s+ber).{0,80}ela\s+(j[aá]\s+)?(mama|mamou)|ela\s+(j[aá]\s+)?mamou\s+antes|voc[eê]\s+oferec[eu]\s+a\s+mamada\s+nesse\s+hor)/.test(n);
      if (!askedFedAtTime)
        issues.push('must ask "nesse horário, ela já mamou?" / "você ofereceu a mamada nesse horário?"');
      const askedBeforeOrAfter = /(antes\s+ou\s+depois\s+da\s+mamada|antes\s+da\s+mamada\s+ou\s+depois|depois\s+da\s+mamada\s+ou\s+antes|esse\s+comportamento.{0,80}(antes|depois)\s+da\s+mamada)/.test(n);
      if (!askedBeforeOrAfter)
        issues.push('must ask "esse comportamento acontece ANTES ou DEPOIS da mamada?"');
      // Árvore: se ANTES → alimentar (livre demanda); se DEPOIS → investigar
      if (!/(se\s+(for\s+)?antes.{0,80}(alimentar|oferec|mamar|livre demanda)|antes.{0,40}alimentar)/.test(n))
        warn.push('nuance: ideally include the branch "se ANTES da mamada → alimentar (livre demanda)"');
      if (!/(se\s+(for\s+)?depois.{0,200}(mamada efetiv|sucao ativa|saciedade|producao)|depois.{0,80}(investigar|verificar|avaliar).{0,80}(mamada|producao|saciedade))/.test(n))
        warn.push('nuance: ideally include the branch "se DEPOIS da mamada → investigar mamada efetiva/produção/saciedade"');
      // Sinais de saciedade
      if (!/(solta o peito|relaxa o corpo|abre as mao|reduz o ritmo|sinais de saciedade)/.test(n))
        issues.push('must list sinais de saciedade');
      // Posição vertical 30 a 40 min EXPLÍCITA
      if (!/(30\s*(a|–|-|—|ate|até)\s*40\s*(min|minutos))/.test(n))
        issues.push('must include vertical 30 a 40 minutos when mentioning vertical');
      // NÃO presumir ordenha
      if (/(continue\s+ordenhando|sua\s+ordenha|avalie\s+sua\s+ordenha|continua\s+ordenhando|sigo?\s+a\s+ordenha)/.test(n))
        issues.push('must NOT assume mother is doing ordenha (she did not inform)');
      // NÃO presumir complemento
      if (/(mesmo\s+com\s+(o\s+)?complemento|continue\s+com\s+o\s+complemento|seu\s+complemento|ajuste\s+do\s+complemento)/.test(n))
        issues.push('must NOT assume mother is offering complement (she did not inform)');
      // Aulas restritas
      if (/(inicio do sono noturno|troca dia[\s\-]?noite|trocar o dia pela noite|estabeleca o horario do inicio)/.test(n))
        issues.push('must NOT recommend Início do Sono Noturno / Troca dia-noite as principal lessons');
      if (!/(mamadas efetivas|passo 4|alimentacao associada ao sono|charutinho)/.test(n))
        warn.push('nuance: ideally cite Mamadas Efetivas / Passo 4 / Charutinho as principal lessons for this case');
      // Conduta diferenciada peito × fórmula × complemento (condicional)
      if (!/(se\s+(ela|ele)\s+mama\s+no\s+peito|mama\s+no\s+peito.{0,40}livre\s+demanda|formula\s+ou\s+complemento|forma\s+de\s+alimentacao)/.test(n))
        issues.push('must adapt closing to feeding form (conditional, not blindly "ofereça o peito")');
      result.__warnings = warn; return issues;
    },
  },
  {
    id: 'teste-005-rn-12d-wake-after-early-sleep',
    label: 'TESTE 005 \u2014 RN 12 dias (despertar \u00fanico ap\u00f3s sono precoce 19h\u201320h \u2192 ~23h \u2014 eixo mamada noturna)',
    profile: { motherName: '\u2014', babyName: 'nen\u00e9m', ageDays: 12 },
    message:
      'Minha nen\u00e9m tem 12 dias. \u00daltima soneca dela \u00e9 17:30, no m\u00e1ximo 18:00. ' +
      'Inicio o banho entre 18:30 e iniciar o sono da noite por volta de 19:00 a 20:00. ' +
      'Ela acorda umas 23:00 da noite e demora a pegar o sono novamente. ' +
      'Tem alguma sugest\u00e3o pra melhorar, voltar a dormir ou \u00e9 normal pela idade?',
    checks: (text, result) => {
      const issues = []; const warn = []; const n = strip(text);
      if (!/\b12\s*dias\b/.test(n)) issues.push('must cite explicit age "12 dias"');
      // Reconhecer o intervalo desde a última mamada (eixo principal)
      if (!/(intervalo.{0,40}(mamada|alimentac|ultima|leite)|desde a ultima mamada|desde a ultima alimentac|tempo desde a ultima)/.test(n))
        issues.push('must name the "intervalo importante desde a última mamada" frame');
      // Pergunta indispensável: "você alimenta nesse horário?" ou "você oferece a mamada nesse horário?"
      const askedFeedAtTime = /(voce\s+alimenta.{0,60}(nesse\s+hor[a\u00e1]rio|quando\s+(ela|ele)\s+acorda|nas\s+23)|voce\s+oferec[eu]\s+a\s+mamada\s+nesse\s+hor|quando\s+(ela|ele)\s+acorda\s+(as|\u00e0s)\s+23.{0,80}(mamada|oferece|alimenta))/.test(n);
      if (!askedFeedAtTime)
        issues.push('must ask "voc\u00ea alimenta a beb\u00ea nesse hor\u00e1rio?" / "quando ela acorda \u00e0s 23h, voc\u00ea oferece a mamada?"');
      // Conduta: se acorda com sinais de fome, deve ser alimentada
      if (!/(se\s+acorda\s+com\s+sinais\s+de\s+fome|com\s+sinais\s+de\s+fome.{0,60}(deve|ofere|aliment)|acord[ae].{0,40}com\s+fome.{0,40}(deve|ofere|aliment))/.test(n))
        issues.push('must include "se acorda com sinais de fome, deve ser alimentado(a)"');
      // POSIÇÃO VERTICAL 30 A 40 MIN — EXPLÍCITA
      if (!/(30\s*(a|–|-|—|ate|at\u00e9)\s*40\s*(min|minutos))/.test(n))
        issues.push('must include vertical "30 a 40 minutos" EXPLICITLY');
      // Sinais de saciedade — lista oficial
      if (!/(solta o peito|relaxa o corpo|abre as mao|reduz o ritmo|sinais de saciedade)/.test(n))
        issues.push('must list sinais de saciedade');
      // NÃO abrir com "é comum / é normal que os bebês apresentem padrões"
      if (/^\s*(e\s+comum|e\s+normal)\s+que\s+(os\s+)?bebes?\s+apresentem\s+padr/.test(n))
        issues.push('must NOT open with generic "\u00e9 comum/normal que os beb\u00eas apresentem padr\u00f5es variados"');
      // Moro/charutinho/Travesseiro como ABERTURA — proibido
      if (/^\s*(o\s+reflexo\s+de\s+moro|o\s+charutinho|a\s+estrategia\s+do\s+travesseiro)/.test(n))
        issues.push('must NOT open by Moro/charutinho/Travesseiro \u2014 they are secondary in this case');
      // Concordância de gênero — a mãe usou "minha neném" (feminino). Não usar "ele mama"
      if (/\b(se\s+ele\s+mama|ele\s+suga\s+ativamente|ele\s+solta\s+o\s+peito|ele\s+relaxa\s+o\s+corpo)\b/.test(n))
        issues.push('TESTE 005 RN 12d: must respect gender \u2014 "minha nen\u00e9m" is feminine; do not use "ele mama / ele suga / ele relaxa"');
      // NÃO tratar mamar para dormir como "associação negativa" em RN
      if (/(mamar para dormir|mama para dormir|mamada para dormir).{0,100}(associacao negativa|vicio|manha|mau habito)/.test(n))
        issues.push('must NOT frame mamar-para-dormir as "associa\u00e7\u00e3o negativa" in RN');
      // Aulas: Passo 4 aceitável apenas com ressalva
      if (/passo 4/.test(n) && !/(em rn|nessa fase|nesse periodo|com\s+\d+\s+dias).{0,200}(alimentacao\s+e\s+sono|fisiolog|nao\s+e\s+associacao|nao\s+significa\s+associacao)/.test(n))
        warn.push('nuance: when citing "Passo 4" in RN, ideally include the caveat that mamar-para-dormir is NOT associa\u00e7\u00e3o negativa nessa fase');
      result.__warnings = warn; return issues;
    },
  },
  {
    id: 'teste-005-rn-12d-madrugada-diaper',
    label: 'TESTE 005 \u2014 RN 12 dias / madrugada (manter noturno + fralda ANTES da mamada + linguagem neutra)',
    profile: { motherName: '\u2014', babyName: 'bb', ageDays: 12 },
    message:
      'Meu bebe esta noite acordou para mamar 4:40. Troquei a fralda de xixi pois estava muito cheia. ' +
      'Terminou de mamar era 5:20. Mas demorou para engrenar no sono novamente. ' +
      'Era quase 6:50 da manha quando ele realmente dormiu. ' +
      'Neste caso, seria interessante ter "come\u00e7ado o dia" com ele, abrindo janela, trocando o pijaminha ' +
      'e tentado colocar pra dormir de nvo, ou, manter ele ali no quarto - como fiz - para que ele dormisse? ' +
      'Sempre respeito a janela de sono, mas ele n\u00e3o estava dormindo de jeito nenhum. ' +
      'Ambiente estava adequado, escuro, ruido, fralda trocada, mama. ' +
      'Minha quest\u00e3o \u00e9: o dia dele nao vai inicar muito tarde? ' +
      'Provavelmente ele ir\u00e1 acordar umas 8:30 (maximo), pois irei acorda-lo prs mamar.',
    checks: (text, result) => {
      const issues = []; const warn = []; const n = strip(text);
      if (!/\b12\s*dias\b/.test(n)) issues.push('must cite explicit age "12 dias"');
      // Resposta DIRETA: "você fez certo em manter o ambiente noturno"
      if (!/(voce\s+fez\s+certo\s+em\s+manter|fez\s+certo\s+em\s+manter\s+o\s+ambiente\s+noturno|fez\s+a\s+coisa\s+certa\s+em\s+manter|conduta\s+correta.{0,30}manter\s+o\s+ambiente\s+noturno)/.test(n))
        issues.push('must respond DIRECTLY: "voc\u00ea fez certo em manter o ambiente noturno"');
      // Não precisa começar o dia
      if (!/(nao\s+precis[ae]\s+come(c|\u00e7)ar\s+o\s+dia|nao\s+e\s+necessario\s+(come(c|\u00e7)ar|iniciar)\s+o\s+dia|nao\s+ha\s+necessidade\s+de\s+(come(c|\u00e7)ar|iniciar)\s+o\s+dia)/.test(n))
        issues.push('must explicitly say "n\u00e3o precisa / n\u00e3o \u00e9 necess\u00e1rio come\u00e7ar o dia" nesse hor\u00e1rio');
      // Tranquilizar: dia começar mais tarde não é problema
      if (!/(n[\u00e3a]o\s+(h[\u00e1a])?\s*problema.{0,120}(dia|manh[a\u00e3]).{0,40}(comec[ae]r?|inici[ae]r?).{0,40}(mais\s+tarde|tarde)|dia\s+comec[ae]r\s+mais\s+tarde\s+nao\s+e\s+problema)/.test(n))
        warn.push('nuance: ideally reassure "n\u00e3o h\u00e1 problema o dia come\u00e7ar mais tarde ap\u00f3s madrugada dif\u00edcil"');
      // FRALDA ANTES DA MAMADA — REGRA CENTRAL DESTE CASO
      // aceita formulações variadas: "trocar a fralda antes da mamada", "troca de fralda ... feita antes da mamada",
      // "fralda antes da mamada", "antes da mamada ... troca fralda"
      const diaperBefore = /((troca[r]?|troc[ae]|troque[i]?)\s+(a\s+|de\s+|da\s+)?fralda[\s\S]{0,100}antes\s+(da\s+mamada|de\s+mamar)|fralda[\s\S]{0,30}antes\s+(da\s+mamada|de\s+mamar)|antes\s+(da\s+mamada|de\s+mamar)[\s\S]{0,140}(troca|trocar|troc[ae]|troque[i]?)\s+(a\s+|de\s+|da\s+)?fralda)/.test(n);
      if (!diaperBefore)
        issues.push('TESTE 005 RN 12d/02: must orient "troca de fralda ANTES da mamada" (regra central deste caso)');
      // Mínima luz
      if (!/(minima\s+luz|pouca\s+luz|luz\s+m[i\u00ed]nima)/.test(n))
        issues.push('must orient "m\u00ednima luz" na troca de fralda da madrugada');
      // Sem conversa (warning)
      if (!/(sem\s+conversa|pouca\s+conversa|sem\s+falar)/.test(n))
        warn.push('nuance: ideally orient "sem conversa" na madrugada');
      // POSIÇÃO VERTICAL 30 A 40 MIN — EXPLÍCITA
      if (!/(30\s*(a|–|-|—|ate|at\u00e9)\s*40\s*(min|minutos))/.test(n))
        issues.push('must include vertical "30 a 40 minutos" EXPLICITLY');
      // RN não cria associação negativa
      if (!/(aind?a?\s+nao\s+cria|n[\u00e3a]o\s+cria\s+associac[a\u00e3]o\s+(comportamental\s+)?negativa|n[\u00e3a]o\s+e\s+associac[a\u00e3]o\s+negativa)/.test(n))
        warn.push('nuance: ideally reassure "com 12 dias ainda n\u00e3o cria associa\u00e7\u00e3o negativa"');
      // NÃO indicar "Evite que o bebê troque o dia pela noite"
      if (/(evite que o bebe troque o dia pela noite|trocar o dia pela noite|troca dia[\s\-]?noite)/.test(n))
        issues.push('TESTE 005 RN 12d/02: must NOT recommend "Evite que o beb\u00ea troque o dia pela noite" \u2014 n\u00e3o \u00e9 o caso (epis\u00f3dio pontual)');
      // Linguagem neutra: mãe disse só "mamar" — Zlaya não deve PRESSUPOR "peito"
      const presumedBreast = /(?<!se\s|caso\s|quando\s)(ele\s+mama\s+no\s+peito|buscar\s+o\s+peito|voltar\s+ao\s+peito|dormir\s+no\s+peito)/.test(n);
      if (presumedBreast)
        warn.push('nuance: m\u00e3e usou s\u00f3 "mamar" \u2014 evite pressupor "peito"; prefira "mamada / alimenta\u00e7\u00e3o"');
      // NÃO usar termos comportamentais inadequados em RN — apenas USO AFIRMATIVO falha.
      // A metodologia usa "vício / manha / mau hábito" EM NEGAÇÃO ("não é vício, não é manha"),
      // e isso é a fórmula correta (mesma tolerância do TEST_GUIDE: "isso NÃO é uma associação negativa").
      // "treinamento de sono" e "deixar chorar" / "cry it out" / "extinção" continuam proibidos em qualquer contexto.
      if (/(treinamento\s+de\s+sono|deixar\s+chorar|cry\s+it\s+out|extinc[a\u00e3]o)/.test(n))
        issues.push('must NOT use "treinamento de sono / deixar chorar / cry it out / extin\u00e7\u00e3o" in RN');
      // Para "vício / manha / mau hábito": só falha se aparecer SEM negação imediata antes (≤ 30 chars).
      // Aceita: "nao e vicio", "nao vicio", "nao significa vicio", "nao configura manha" etc.
      // Isso espelha a tolerância do TEST_GUIDE ("isso NÃO é uma associação negativa").
      for (const m of n.matchAll(/(\bvicio\b|\bmanha\b|\bmau\s+habito\b)/g)) {
        const ctx = n.slice(Math.max(0, m.index - 30), m.index);
        if (!/\bn[ao]o\b/.test(ctx)) {
          issues.push('must NOT use "v\u00edcio / manha / mau h\u00e1bito" AFFIRMATIVELY (negation is allowed and used by the metodologia)');
          break;
        }
      }
      // Ressalva sobre acordar 8h30 para mamar (orientação médica)
      if (!/(orientac[a\u00e3]o\s+m[e\u00e9]dica|conforme.{0,40}(pediatra|m[e\u00e9]dico)|ganho\s+(de\s+)?peso|ganho\s+ponderal)/.test(n))
        warn.push('nuance: ideally add caveat about waking the baby to feed \u2014 follow medical orientation if applicable');
      result.__warnings = warn; return issues;
    },
  },
  {
    id: 'teste-005-rn-13d-bath-crying',
    label: 'TESTE 005 \u2014 RN 13 dias / choro no banho (eixo conforto/conten\u00e7\u00e3o/t\u00e9rmica \u2014 aulas filtradas)',
    profile: { motherName: '\u2014', babyName: 'bb', ageDays: 13 },
    message:
      'Ol\u00e1, meu beb\u00ea tem 13 dias, percebi que ele chora muuuuuito na hora do banho ' +
      'e ainda uso aquelas almofadas para dar mais seguran\u00e7a e conforto. ' +
      'O que eu poderia fazer para diminuir esse choro?',
    checks: (text, result) => {
      const issues = []; const warn = []; const n = strip(text);
      if (!/\b13\s*dias\b/.test(n)) issues.push('must cite explicit age "13 dias"');
      // Três causas prováveis (sensação de queda, insegurança, frio)
      if (!/(sensac[a\u00e3]o\s+de\s+queda|sentir\s+que\s+vai\s+cair)/.test(n))
        issues.push('must name "sensa\u00e7\u00e3o de queda" as probable cause');
      if (!/(inseguran[c\u00e7]a|sentir-se\s+inseguro|sentirem-se\s+inseguros)/.test(n))
        issues.push('must name "inseguran\u00e7a" as probable cause');
      if (!/(\bfrio\b|sensac[a\u00e3]o\s+de\s+frio)/.test(n))
        issues.push('must name "frio" as probable cause');
      // Fralda de pano + corpo submerso + barriguinha para baixo
      if (!/(fralda\s+de\s+pano)/.test(n))
        issues.push('must orient "fralda de pano" durante o banho');
      if (!/(corpinho\s+(mais\s+)?submerso|corpo\s+(mais\s+)?submerso|mais\s+submerso\s+na\s+agua|submers[oa]\s+na\s+agua)/.test(n))
        issues.push('must orient "corpinho mais submerso na \u00e1gua"');
      if (!/(barriguinha\s+para\s+baixo|de\s+barriguinha\s+para\s+baixo|barriga\s+para\s+baixo)/.test(n))
        issues.push('must include "posi\u00e7\u00e3o de barriguinha para baixo apoiada no bra\u00e7o"');
      // Segurança: apoio firme / supervisão total / controle total
      if (!/(apoio\s+firme|supervis[a\u00e3]o\s+total|controle\s+(total\s+)?do\s+corpo)/.test(n))
        issues.push('must reinforce safety: apoio firme / supervis\u00e3o total / controle total do corpo');
      // Ambiente aquecido / sem corrente de ar
      if (!/(ambiente\s+aquecido|sem\s+correntes\s+de\s+ar|sem\s+vento)/.test(n))
        issues.push('must orient "ambiente aquecido / sem correntes de ar"');
      // Banho curto (aceita singular e plural)
      if (!/(banhos?\s+curtos?|banhos?\s+breves?|banhos?\s+r[a\u00e1]pidos?|fa[c\u00e7]a.{0,30}banhos?\s+curtos?)/.test(n))
        issues.push('must orient "banho curto" (singular ou plural)');
      // Tudo preparado antes do banho
      if (!/(tudo\s+preparado|deix[ae].{0,40}preparado.{0,30}antes|preparado\s+antes\s+de\s+come(c|\u00e7)ar)/.test(n))
        warn.push('nuance: ideally orient "deixe tudo preparado antes de come\u00e7ar o banho"');
      // NÃO desviar para investigação alimentar
      if (/(produc[a\u00e3]o\s+de\s+leite|mamada\s+efetiv|baixa\s+producao|baixa\s+transferencia|sinais\s+de\s+saciedade.{0,120}(soltar\s+o\s+peito|relaxar\s+o\s+corpo))/.test(n))
        issues.push('TESTE 005 RN 13d: must NOT divert to mamada efetiva / saciedade / produ\u00e7\u00e3o \u2014 keep on bath topic');
      // NÃO indicar aulas erradas como prioritárias
      if (/(mamadas\s+efetivas|passo\s+4|inicio\s+do\s+sono\s+noturno|estabelec[ae]\s+o\s+horario|troca\s+dia[\s\-]?noite|evite\s+que\s+o\s+bebe\s+troque\s+o\s+dia\s+pela\s+noite|hora\s+da\s+bruxa|como\s+saber\s+se\s+sao\s+colicas)/.test(n))
        issues.push('TESTE 005 RN 13d: must NOT recommend Mamadas Efetivas / Passo 4 / In\u00edcio do Sono Noturno / Troca dia-noite / Hora da Bruxa / C\u00f3licas as principal lessons for bath crying');
      // Encaminhamento ao pediatra apenas com sinais clínicos específicos
      if (/(se\s+(o\s+)?choro\s+persistir|caso\s+(o\s+)?choro\s+persista)[^.]{0,80}(considere\s+|busque\s+|consulte\s+)?(buscar\s+|consultar\s+|orientac[a\u00e3]o\s+(com\s+)?)?(um\s+)?pediatra/.test(n))
        warn.push('nuance: avoid "se o choro persistir \u2192 pediatra" \u2014 refer to clinical signs FORA do banho');
      // Repetição + previsibilidade → adaptação
      if (!/(repetic[a\u00e3]o|previsibilidade|com\s+o\s+tempo.{0,40}(adapta|se\s+acostuma|melhora)|vai\s+se\s+adaptando|tend[ea]\s+a\s+se\s+adaptar)/.test(n))
        warn.push('nuance: ideally close with "com repeti\u00e7\u00e3o + previsibilidade, o beb\u00ea tende a se adaptar ao banho"');
      result.__warnings = warn; return issues;
    },
  },
];

async function runE2EChecks() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log(`LAYER B \u2014 End-to-end (engine: ${config.openai.apiKey ? 'OpenAI LLM' : 'local fallback'})`);
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  let passCount = 0, failCount = 0;
  for (const c of E2E) {
    console.log(`\n--- ${c.label} ---`);
    const sig = extractSignals({ message: c.message, conversation: [], ageBand: 'RN', ageDays: c.profile.ageDays });
    const result = await processTurn({ message: c.message, babyProfile: c.profile, conversation: [], conversationId: `sim-${c.id}` });
    const text = result.response?.text || '';
    console.log(`route   : ${result.route}`);
    console.log(`intent  : ${result.intent?.intent}`);
    console.log(`signals : ${sig.signals.map((s) => s.id).join(', ')}`);
    console.log(`source  : ${result.response?.source || result.responseSource || '\u2014'}`);
    console.log('--- response ---');
    console.log(text);
    console.log('--- checks ---');
    const issues = c.checks(text, result, sig);
    const warnings = result.__warnings || [];
    if (issues.length === 0) {
      passCount++; console.log('STATUS: \u2705 PASS');
    } else {
      failCount++; console.log('STATUS: \u274c FAIL');
      for (const i of issues) console.log(`  \u2717 ${i}`);
    }
    for (const w of warnings) console.log(`  \u26a0 ${w}`);
  }
  console.log(`\nLayer B result: ${passCount} passed, ${failCount} failed (of ${E2E.length})`);
  return failCount === 0;
}

async function main() {
  console.log('ZLAYA LAB \u2014 Simulation TESTE 005 (19/06/2026) RN 6/9/10/12/12/13 dias');
  const a = runInfrastructureChecks();
  const b = await runE2EChecks();
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  if (a && b) console.log('OVERALL: \u2705 All layers passed \u2014 TESTE 005 corrections appear correctly implemented.');
  else console.log('OVERALL: \u26a0 Some checks failed/flagged \u2014 review items above.');
  process.exit(a && b ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
