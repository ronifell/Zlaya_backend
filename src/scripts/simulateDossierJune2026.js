#!/usr/bin/env node
/**
 * Simulation — Official dossiers 17/06/2026
 *   TESTE 001  RN 9d  (berço vespertino + "isso é normal?" + "como melhorar?")
 *   TESTE 001/16 RN 16d (complemento/sonda + icterícia/linguinha + "mama bem")
 *   TESTE 002    RN 22d (chupeta cai + forma de alimentação)
 *
 * Layer A: deterministic — rules, prompts, signals (no LLM)
 * Layer B: end-to-end — processTurn (LLM or local fallback)
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

function pass(label) {
  console.log(`  ✓ ${label}`);
  return true;
}

function fail(label, detail = '') {
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  return 1;
}

// ─── Layer A: infrastructure ───────────────────────────────────────────────

const RULE_IDS = [
  'rn-post-feed-discomfort',
  'rn-night-practical-sequence',
  'rn-travesseiro-support-only',
  'rn-clinical-history-not-current',
  'rn-complement-sonda-guidance',
  'rn-confirm-feeding-before-breast',
  'rn-pacifier-practical-management',
  'rn-satiety-cautious-language',
  'rn-gender-consistency',
];

const PROMPT_FRAGMENTS = [
  'desconforto leve pos-mamada ao deitar',
  'sequencia pratica noturna',
  'estrategia do travesseiro',
  'agora mama bem',
  'complemento com sonda',
  'forma de alimentacao',
  'cair e o bebe continuar dormindo',
  'pode indicar que a mamada nao foi suficiente',
  'consistencia de genero',
];

function runInfrastructureChecks() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('LAYER A — Infrastructure (rules / prompt / forbidden / signals)');
  console.log('══════════════════════════════════════════════════════════════');

  let ok = 0;
  let bad = 0;

  const rules = JSON.parse(readFileSync(path.join(knowledge, 'rules.json'), 'utf-8'));
  const forbidden = JSON.parse(readFileSync(path.join(knowledge, 'forbidden.json'), 'utf-8'));
  const system = buildSystemPrompt({ namespace: 'RN', band: { label: 'RN (0–28 dias)' } });
  const sysNorm = strip(system);

  for (const id of RULE_IDS) {
    const found = rules.fixedRules.some((r) => r.id === id);
    if (found) ok += pass(`rule "${id}" present`);
    else bad += fail(`rule "${id}" missing`);
  }

  for (const frag of PROMPT_FRAGMENTS) {
    if (sysNorm.includes(frag)) ok += pass(`systemPrompt contains "${frag}"`);
    else bad += fail(`systemPrompt missing "${frag}"`);
  }

  const forbNorm = strip(forbidden.forbiddenInterpretations.join(' '));
  if (forbNorm.includes('ictericia') && forbNorm.includes('agora mama bem')) {
    ok += pass('forbidden: icterícia as current cause when "mama bem"');
  } else {
    bad += fail('forbidden interpretation for icterícia/histórico');
  }

  // Signal expectations per dossier message
  const signalCases = [
    {
      id: 'teste-001-rn-9d',
      message:
        'Bebê de 9 dias. Depois das 18h piora. Assim que coloco no berço desperta. Dificuldade de arrotar. Só se acalma no peito. Medo de associação negativa. Só consigo colocar no berço depois de 1 da manhã. Isso é normal pra idade? Como posso melhorar?',
      mustSignalIds: [
        'asks_if_normal',
        'asks_how_to_improve',
        'evening_pattern',
        'wakes_on_transfer',
        'late_crib_placement',
        'breast_soothing',
      ],
      priorityMustInclude: ['desconforto', 'sequencia', 'travesseiro'],
    },
    {
      id: 'teste-001-16-rn-16d',
      message:
        'Bebê de 16 dias, teve icterícia e linguinha. Agora está mamando bem. Complemento com sonda às 22h e madrugada, 60ml. Procura o peito antes de 2h desde o final da tarde. Madrugadas difíceis, manhãs tranquilas. Como devo ajustar?',
      mustSignalIds: [
        'asks_how_to_improve',
        'feeding_clinical_context',
        'night_production_drop',
        'short_feeding_interval',
        'mama_bem_with_concurrent_symptoms',
      ],
      priorityMustInclude: ['historico', 'complemento', 'final da tarde'],
    },
    {
      id: 'teste-002-rn-22d',
      message:
        'Olá, minha bebê tem 22 dias. Ela está usando chupeta devido à necessidade de sucção, porém, quando ela dorme com a chupeta, ela acorda porque a chupeta cai e preciso ficar colocando novamente. Como consigo resolver?',
      mustSignalIds: ['pacifier_in_rn'],
      priorityMustInclude: ['chupeta cair', 'genero'],
      priorityMustIncludeAny: ['forma de alimentacao', 'mama no peito'],
    },
  ];

  console.log('\n--- Signal extraction ---');
  for (const sc of signalCases) {
    console.log(`\n  Case: ${sc.id}`);
    const sig = extractSignals({ message: sc.message, conversation: [] });
    const ids = sig.signals.map((s) => s.id);
    console.log(`    signals fired: ${ids.join(', ') || '—'}`);

    for (const required of sc.mustSignalIds) {
      if (ids.includes(required)) ok += pass(`  ${sc.id}: signal "${required}"`);
      else bad += fail(`  ${sc.id}: signal "${required}" not fired`);
    }

    const prioNorm = strip(sig.priorities.join(' '));
    for (const kw of sc.priorityMustInclude || []) {
      if (prioNorm.includes(strip(kw))) ok += pass(`  ${sc.id}: priority mentions "${kw}"`);
      else bad += fail(`  ${sc.id}: priority missing "${kw}"`);
    }
    if (sc.priorityMustIncludeAny?.length) {
      const anyHit = sc.priorityMustIncludeAny.some((kw) => prioNorm.includes(strip(kw)));
      if (anyHit) ok += pass(`  ${sc.id}: priority mentions feeding-method question`);
      else bad += fail(`  ${sc.id}: priority missing feeding-method question`);
    }
  }

  console.log(`\nLayer A summary: ${ok} passed, ${bad} failed`);
  return bad === 0;
}

// ─── Layer B: end-to-end ───────────────────────────────────────────────────

const E2E_CASES = [
  {
    id: 'teste-001-rn-9d',
    label: 'TESTE 001 — RN 9 dias (nota oficial 9,6/10)',
    profile: { motherName: '—', babyName: 'bb', ageDays: 9 },
    message:
      'Bebê de 9 dias. Durante o dia faz sonecas geralmente de 2 a 2,5h sem dificuldades. Acorda chorando, mama um pouco, me esforço para mantê-lo acordado por uma meia hora, ele mama o outro peito, coloco para arrotar e vai para o berço (em todo o processo está muito sonolento). Depois das 18h mais ou menos, fica mais tempo acordado e já não deixa colocar para arrotar tão facilmente. Assim que coloco no berço desperta e começa a chorar. Em geral eu tento muitas coisas, mas, por fim, ele só se acalma se voltar para o peito. Tenho medo dessa associação negativa, mas muitas vezes nada mais funciona. Eu só queria que ele dormisse à noite como dorme de dia. Às vezes só consigo colocá-lo no berço depois de 1 da manhã. Isso é normal pra idade? Como posso melhorar?',
    checks: (text, result, sig) => {
      const issues = [];
      const norm = strip(text);
      const first = strip((text.split(/(?<=[.!?])\s+/)[0] || text).slice(0, 200));
      const directNormality = /^\s*(sim|em parte sim|esse padrao|isso pode|e comum|e esperado)/.test(first);
      if (!directNormality) issues.push('first sentence must answer "isso é normal?" directly');

      if (!/(30\s*(a|–|-|—|ate|até)\s*40|posicao vertical)/.test(norm)) {
        issues.push('must include vertical 30–40 min guidance');
      }
      if (!/(desconforto.*deitar|deitar.*desconforto|desconforto pos-mamada|desconforto pos mamada|desconforto ao deitar|ar preso|digestao.*curso|refluxo fisiologico.*deitar|dificuldade.*arrotar)/.test(norm)) {
        issues.push('must verbalize post-feed discomfort when lying down');
      }
      if (!/(sequencia|mamada.*efetiv|segundo peito|arrotar.*vertical|ambiente.*calmo|transferencia.*berco)/.test(norm)) {
        issues.push('must include practical night sequence or steps');
      }
      if (!/(nao configura associacao|nao e associacao|nao caracteriza associacao|fisiologic)/.test(norm)) {
        issues.push('must reassure about associação negativa');
      }
      if (!sig.signals.some((s) => s.id === 'asks_how_to_improve')) {
        issues.push('signal asks_how_to_improve should fire');
      }
      if (/(cluster|mamadas agrupadas|fome residual)/.test(norm)) {
        issues.push('forbidden external vocabulary');
      }
      return issues;
    },
  },
  {
    id: 'teste-001-16-rn-16d',
    label: 'TESTE 001/16 — RN 16 dias (nota oficial 8,2/10)',
    profile: { motherName: '—', babyName: 'bb', ageDays: 16 },
    message:
      'Mãe de bebê de 16 dias relata que a bebê passou por procedimento na linguinha e teve icterícia. Informa que agora está mamando bem, mas recebe complemento com sonda em duas mamadas da noite, às 22h e na madrugada, com 60 ml. Apesar de fazer xixi, cocô, arrotar e soluçar, a bebê ficou procurando o peito em intervalo menor que 2h. Esse comportamento começou no final da tarde. As madrugadas têm sido difíceis e as manhãs mais tranquilas. A mãe pergunta como deve ajustar.',
    checks: (text, result, sig) => {
      const issues = [];
      const norm = strip(text);

      if (!/(baixa transferencia|menor producao|baixa producao)/.test(norm)) {
        issues.push('must name primary hypothesis (produção/transferência fim do dia)');
      }
      if (!/(30\s*(a|–|-|—|ate|até)\s*40|posicao vertical)/.test(norm)) {
        issues.push('must include vertical 30–40 min');
      }
      // Must NOT blame icterícia/linguinha as CURRENT cause
      const blamesHistory =
        /(ictericia|linguinha|frenulo).{0,80}(pode impactar|pode afetar|ainda impacta|dificulta a transferencia|dificulta a amamentacao|explica o comportamento atual)/.test(
          norm,
        );
      if (blamesHistory) issues.push('must NOT cite icterícia/linguinha as current cause when "mama bem"');

      if (!/(complemento|sonda).{0,200}(final da tarde|fim da tarde|tarde|18h|periodo em que|quando o comportamento)/.test(norm)) {
        issues.push('must address complement evaluation in late afternoon, not only 22h');
      }
      if (!/(ordenha|dois seios|producao|acompanhamento)/.test(norm)) {
        issues.push('should mention production support (ordenha/dois seios/acompanhamento)');
      }
      if (!sig.signals.some((s) => s.id === 'mama_bem_with_concurrent_symptoms')) {
        issues.push('signal mama_bem_with_concurrent_symptoms should fire');
      }
      return issues;
    },
  },
  {
    id: 'teste-002-rn-22d',
    label: 'TESTE 002 — RN 22 dias (nota oficial 8,5/10)',
    profile: { motherName: '—', babyName: 'Liz', ageDays: 22 },
    message:
      'Olá, minha bebê tem 22 dias. Ela está usando chupeta devido à necessidade de sucção, porém, quando ela dorme com a chupeta, ela acorda porque a chupeta cai e preciso ficar colocando novamente. Como consigo resolver?',
    checks: (text, result, sig) => {
      const issues = [];
      const norm = strip(text);

      if (result.intent?.intent === 'associacao_comportamental') {
        issues.push('intent must not be associacao_comportamental');
      }
      if (!/(forma de alimentacao|peito.*formula|formula.*peito|peito exclusivo|usa formula|recebe complemento)/.test(norm)) {
        issues.push('must ask or confirm feeding method before advising breast');
      }
      if (!/(chupeta cai|continuar dormindo|nao precisa recolocar|recolocar)/.test(norm)) {
        issues.push('must include practical pacifier management');
      }
      if (!/(reflexo de succao|necessidade de succao|necessidade de regulacao|regulacao)/.test(norm)) {
        issues.push('must frame chupeta as reflexo de sucção/regulação');
      }
      if (/(manter a chupeta presa|design para nao cair|dependencia da chupeta)/.test(norm)) {
        issues.push('forbidden pacifier fixation guidance');
      }
      if (!/(30\s*(a|–|-|—|ate|até)\s*40|posicao vertical)/.test(norm)) {
        issues.push('must include vertical 30–40 min post-feed');
      }
      // Gender: message uses "ela/minha bebê" — response should not switch to "ele"
      if (/\bele\b/.test(norm) && !/\bela\b/.test(norm)) {
        issues.push('gender inconsistency: mother uses feminine, response uses only "ele"');
      }
      return issues;
    },
  },
];

async function runE2EChecks() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`LAYER B — End-to-end (engine: ${config.openai.apiKey ? 'OpenAI LLM' : 'local fallback'})`);
  console.log('══════════════════════════════════════════════════════════════');

  let passCount = 0;
  let failCount = 0;

  for (const c of E2E_CASES) {
    console.log(`\n--- ${c.label} ---`);
    const sig = extractSignals({ message: c.message, conversation: [] });
    const result = await processTurn({
      message: c.message,
      babyProfile: c.profile,
      conversation: [],
      conversationId: `sim-${c.id}`,
    });

    const text = result.response?.text || '';
    console.log(`route   : ${result.route}`);
    console.log(`intent  : ${result.intent?.intent}`);
    console.log(`signals : ${sig.signals.map((s) => s.id).join(', ')}`);
    console.log(`source  : ${result.response?.source || '—'}`);
    console.log('--- response (excerpt) ---');
    console.log(text.slice(0, 600) + (text.length > 600 ? '…' : ''));
    console.log('--- checks ---');

    const issues = c.checks(text, result, sig);
    if (issues.length === 0) {
      passCount++;
      console.log('STATUS: ✅ PASS');
    } else {
      failCount++;
      console.log('STATUS: ❌ FAIL');
      for (const i of issues) console.log(`  ✗ ${i}`);
    }
  }

  console.log(`\nLayer B summary: ${passCount} passed, ${failCount} failed (of ${E2E_CASES.length})`);
  return failCount === 0;
}

async function main() {
  console.log('ZLAYA LAB — Simulation of dossier corrections (17/06/2026)');
  const layerA = runInfrastructureChecks();
  const layerB = await runE2EChecks();

  console.log('\n══════════════════════════════════════════════════════════════');
  if (layerA && layerB) {
    console.log('OVERALL: ✅ All layers passed — corrections appear correctly implemented.');
    process.exit(0);
  }
  console.log('OVERALL: ❌ Some checks failed — review items above.');
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
