#!/usr/bin/env node
/**
 * Simulation — Official dossiers 18/06/2026 (TESTE 003)
 *   TESTE 003  RN 19d  (Estratégia do Travesseiro — execução prática)
 *   TESTE 003  RN 20d  (refluxo fisiológico x patológico + período da queixa diurno)
 *   TESTE 003  RN 22d  (chupeta cai — aprovado, ajustes mínimos)
 *   TESTE 003  RN 23d  (charutinho + "mama bem" + não repetir técnicas em uso)
 *
 * Layer A: deterministic — rules, prompts, forbidden, signals (no LLM)
 * Layer B: end-to-end — processTurn (LLM if OPENAI_API_KEY, else local fallback)
 *
 * Run with:  node src/scripts/simulateTeste003RNJune18.js
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
  'rn-travesseiro-practical-execution',
  'rn-difficulty-triad',
  'rn-reflux-physiological-vs-pathological',
  'rn-pathological-reflux-routing',
  'rn-match-complaint-period',
  'rn-charutinho-daytime-naps',
];

const PROMPT_FRAGMENTS = [
  'etapa intermediaria',
  'travesseiro em cima do colo',
  'elevacao do colchao em 45',
  'refluxo fisiologico x patologico',
  'aulas extras',
  'queixa principal for de sonecas diurnas',
  'charutinho tambem de dia',
  'triade do rn',
];

const FORBIDDEN_FRAGMENTS = [
  'estrategia do travesseiro de forma generica',
  'queda de producao no fim do dia/noite quando a queixa principal e diurna',
  'a propria suspeita ja exige suporte humano',
  'restringir o charutinho apenas ao periodo noturno',
];

function runInfrastructureChecks() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('LAYER A \u2014 Infrastructure (rules / prompt / forbidden / signals)');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  let bad = 0;
  const rules = JSON.parse(readFileSync(path.join(knowledge, 'rules.json'), 'utf-8'));
  const forbidden = JSON.parse(readFileSync(path.join(knowledge, 'forbidden.json'), 'utf-8'));
  const chunks = JSON.parse(readFileSync(path.join(knowledge, 'chunks.json'), 'utf-8'));
  const sysNorm = strip(buildSystemPrompt({ namespace: 'RN', band: { label: 'RN (0\u201328 dias)' } }));
  const forbNorm = strip(forbidden.forbiddenInterpretations.join(' \u2022 '));

  console.log('\n--- New fixed rules ---');
  for (const id of NEW_RULE_IDS) {
    bad += rules.fixedRules.some((r) => r.id === id) ? pass(`rule "${id}" present`) : fail(`rule "${id}" missing`);
  }

  console.log('\n--- New authorized chunks ---');
  for (const id of [
    'rn-chunk-travesseiro-execucao-pratica',
    'rn-chunk-rn-triade-dificuldade',
    'rn-chunk-match-periodo-queixa',
    'rn-chunk-charutinho-diurno',
  ]) {
    bad += chunks.chunks.some((c) => c.id === id) ? pass(`chunk "${id}" present`) : fail(`chunk "${id}" missing`);
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
      id: 'rn-19d', ageDays: 19,
      message:
        'Tenho uma beb\u00ea de 19 dias, ela dorme bem \u00e0 noite e durante o dia tamb\u00e9m, mas somente dorme no colo de dia e de noite. J\u00e1 tentei usar o m\u00e9todo do travesseiro, mas ao coloc\u00e1-la no ber\u00e7o, ap\u00f3s poucos minutos ela acorda e chora.',
      must: ['travesseiro_tried_without_success'],
    },
    {
      id: 'rn-20d', ageDays: 20,
      message:
        'Meu beb\u00ea de 20 dias passou a ter sonecas diurnas muito curtas no ber\u00e7o. Ele mama, dorme, \u00e9 colocado no ber\u00e7o, permanece cerca de 20 minutos, acorda chorando e volta a dormir bem apenas no colo. \u00c0 noite dorme bem no ber\u00e7o. Esse comportamento \u00e9 esperado nessa fase?',
      must: ['asks_if_normal', 'diurnal_only_difficulty'],
    },
    {
      id: 'rn-22d', ageDays: 22,
      message:
        'Ol\u00e1, minha beb\u00ea tem 22 dias. Ela est\u00e1 usando chupeta devido \u00e0 necessidade de suc\u00e7\u00e3o, por\u00e9m, quando ela dorme com a chupeta, ela acorda porque a chupeta cai e preciso ficar colocando novamente. Como consigo resolver?',
      must: ['pacifier_in_rn'],
    },
    {
      id: 'rn-23d', ageDays: 23,
      message:
        'Minha beb\u00ea tem 23 dias, dorme bem \u00e0 noite por cerca de 3 horas, mas apenas com charutinho. Durante o dia as sonecas est\u00e3o mais dif\u00edceis: mama bem, dorme no colo, mas acorda logo ao ser colocada no ber\u00e7o, mesmo com t\u00e9cnica do travesseiro, ru\u00eddo e controle de luminosidade.',
      must: ['travesseiro_tried_without_success', 'diurnal_only_difficulty', 'mama_bem_with_concurrent_symptoms'],
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
    id: 'teste-003-rn-19d',
    label: 'TESTE 003 \u2014 RN 19 dias (Estrat\u00e9gia do Travesseiro \u2014 execu\u00e7\u00e3o pr\u00e1tica)',
    profile: { motherName: '\u2014', babyName: 'bb', ageDays: 19 },
    message:
      'Ol\u00e1, boa noite. Apesar de ter assistido as aulas continuo com a seguinte dificuldade. Tenho uma beb\u00ea de 19 dias, ela dorme bem \u00e0 noite e durante o dia tamb\u00e9m, mas no entanto, somente dorme no colo de dia e de noite. J\u00e1 tentei usar o m\u00e9todo do travesseiro, mas ao coloc\u00e1-la no ber\u00e7o, ap\u00f3s poucos minutos ela acorda e chora, n\u00e3o fica de jeito nenhum.',
    checks: (text, result, sig) => {
      const issues = []; const warn = []; const n = strip(text);
      if (!/\b19\s*dias\b/.test(n)) issues.push('must cite explicit age "19 dias"');
      if (!sig.signals.some((s) => s.id === 'travesseiro_tried_without_success')) issues.push('signal travesseiro_tried_without_success should fire');
      if (!/(assist|reassist|rever a aula|aula da estrategia do travesseiro|repetir o processo)/.test(n)) issues.push('must orient (re)watching the Travesseiro lesson / repeating the process');
      if (!/(travesseiro.*(em cima|sobre).*colo|colo.*travesseiro|contencao.*mao|mao.*contencao|conter com.*mao)/.test(n)) issues.push('must explain intermediate step (pillow over lap + hand containment)');
      if (!/(producao|transferencia|mamada efetiv)/.test(n)) warn.push('nuance: ideally evaluate milk production (afternoon flow)');
      if (!/(30\s*(a|–|-|—|ate|até)\s*40)/.test(n)) warn.push('nuance: vertical 30 a 40 min');
      // Forbid vício/mau hábito/manha framing — but accept the same vocabulary
      // inside an explicit negation (the methodologically correct
      // anti-association reassurance for RN: "AINDA NÃO CRIA associação ...
      // não é vício, manha ou mau hábito").
      if (
        /(vicio|mau habito|fazendo manha)/.test(n)
        && !/(n[aã]o\s+(e|é|um|uma|caracteriza|significa|configura|cria|deve\s+ser\s+(visto|tratado|entendido)\s+como)?\s*(vicio|mau habito|manha|associacao)|aind?a?\s+n[aã]o\s+cria|n[aã]o\s+(vicio|mau habito|manha))/.test(n)
      ) issues.push('must NOT label as vício/mau hábito');
      result.__warnings = warn; return issues;
    },
  },
  {
    id: 'teste-003-rn-20d',
    label: 'TESTE 003 \u2014 RN 20 dias (refluxo fisiol\u00f3gico x patol\u00f3gico + per\u00edodo diurno)',
    profile: { motherName: '\u2014', babyName: 'bb', ageDays: 20 },
    message:
      'Meu beb\u00ea de 20 dias passou a ter sonecas diurnas muito curtas no ber\u00e7o. Ele mama, dorme, \u00e9 colocado no ber\u00e7o, permanece cerca de 20 minutos, acorda chorando e volta a dormir bem apenas se for pego e ficar no colo. \u00c0 noite, dorme bem no ber\u00e7o. Esse comportamento \u00e9 esperado nessa fase?',
    checks: (text, result, sig) => {
      const issues = []; const warn = []; const n = strip(text);
      if (!/\b20\s*dias\b/.test(n)) issues.push('must cite explicit age "20 dias"');
      const first = strip((text.split(/(?<=[.!?])\s+/)[0] || text).slice(0, 200));
      if (!/^\s*(sim|em parte sim|esse padrao|isso pode|e comum|e esperado|em parte)/.test(first)) warn.push('nuance: first sentence should answer normality directly');
      // Must NOT apply end-of-day/night production-drop framing to a daytime complaint
      if (/(fim do dia|fim da noite|producao.*no.*noite|producao.*fim do dia|menor producao.*noite|baixa producao.*noite)/.test(n)) issues.push('must NOT apply end-of-day/night production-drop hypothesis (complaint is diurnal)');
      if (!/(mamada.*efetiv|efetiv|saciedade|saciad|transferencia|producao|mamadas diurnas|durante o dia|periodo da tarde|fluxo de leite)/.test(n)) issues.push('must investigate daytime feeding (efetividade/saciedade/produção)');
      if (!/(refluxo|desconforto.*deitar|desconforto pos|ar preso)/.test(n)) warn.push('nuance: differentiate physiological vs pathological reflux');
      result.__warnings = warn; return issues;
    },
  },
  {
    id: 'teste-003-rn-22d',
    label: 'TESTE 003 \u2014 RN 22 dias (chupeta cai \u2014 ajustes m\u00ednimos)',
    profile: { motherName: '\u2014', babyName: 'Liz', ageDays: 22 },
    message:
      'Ol\u00e1, minha beb\u00ea tem 22 dias. Ela est\u00e1 usando chupeta devido \u00e0 necessidade de suc\u00e7\u00e3o, por\u00e9m, quando ela dorme com a chupeta, ela acorda porque a chupeta cai e preciso ficar colocando novamente. Como consigo resolver?',
    checks: (text, result, sig) => {
      const issues = []; const warn = []; const n = strip(text);
      if (result.intent?.intent === 'associacao_comportamental') issues.push('intent must not be associacao_comportamental');
      if (!/(forma de alimentacao|peito.*formula|formula.*peito|usa formula|recebe complemento|mama no peito)/.test(n)) issues.push('must ask/confirm feeding method before advising breast');
      if (!/(chupeta.*cai|cai.*chupeta|continuar dormindo|nao precisa recolocar|se ela acordar)/.test(n)) issues.push('must include practical pacifier management');
      if (!/(reflexo de succao|necessidade de succao|necessidade de regulacao|regulacao)/.test(n)) issues.push('must frame chupeta as reflexo de sucção/regulação');
      if (/(manter a chupeta presa|design para nao cair|dependencia da chupeta|prender a chupeta)/.test(n)) issues.push('forbidden pacifier-fixation guidance');
      if (/\bele\b/.test(n) && !/\bela\b/.test(n)) issues.push('gender inconsistency: mother uses feminine, response uses only "ele"');
      result.__warnings = warn; return issues;
    },
  },
  {
    id: 'teste-003-rn-23d',
    label: 'TESTE 003 \u2014 RN 23 dias (charutinho de dia + "mama bem" + n\u00e3o repetir t\u00e9cnicas)',
    profile: { motherName: '\u2014', babyName: 'bb', ageDays: 23 },
    message:
      'Minha beb\u00ea tem 23 dias, dorme bem \u00e0 noite por cerca de 3 horas, mas apenas com charutinho. Sem o charutinho, apresenta muitos espasmos pelo reflexo de Moro e desperta. Durante o dia, as sonecas est\u00e3o mais dif\u00edceis: mama bem, dorme no colo, mas acorda logo ao ser colocada no ber\u00e7o ou no Mois\u00e9s, mesmo com t\u00e9cnica do travesseiro, ru\u00eddo e controle de luminosidade. O que mais pode ser feito para ela se acostumar a dormir fora do colo?',
    checks: (text, result, sig) => {
      const issues = []; const warn = []; const n = strip(text);
      if (!/\b23\s*dias\b/.test(n)) issues.push('must cite explicit age "23 dias"');
      if (!sig.signals.some((s) => s.id === 'mama_bem_with_concurrent_symptoms')) issues.push('signal mama_bem_with_concurrent_symptoms should fire');
      if (!/(mamada efetiv|producao|transferencia|saciedade)/.test(n)) issues.push('must investigate effective feeding / production (not accept "mama bem")');
      if (!/(charutinho.*(dia|soneca diurna|durante o dia)|durante o dia.*charutinho|charutinho.*sonecas)/.test(n)) warn.push('nuance: ideally orient charutinho also for daytime naps');
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
  console.log('ZLAYA LAB \u2014 Simulation TESTE 003 (18/06/2026) RN 19/20/22/23 dias');
  const a = runInfrastructureChecks();
  const b = await runE2EChecks();
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  if (a && b) console.log('OVERALL: \u2705 All layers passed \u2014 TESTE 003 corrections appear correctly implemented.');
  else console.log('OVERALL: \u26a0 Some checks failed/flagged \u2014 review items above.');
  process.exit(a && b ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
