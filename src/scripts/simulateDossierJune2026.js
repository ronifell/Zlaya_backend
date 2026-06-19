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
  // 18/06/2026 dossiers
  'rn-sonda-equals-low-production',
  'rn-crib-ok-day-night-problem',
  'rn-night-hunger-signs',
  'rn-nap-duration-direct-answer',
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
    {
      id: 'teste-003-16-rn-16d',
      message:
        'Bebê de 16 dias. Agora está mamando bem. Complemento com sonda às 22h e madrugada, 60ml. Procura o peito antes de 2h desde o final da tarde. Madrugadas difíceis, manhãs tranquilas. Como devo ajustar?',
      mustSignalIds: ['feeding_clinical_context', 'short_feeding_interval'],
      priorityMustInclude: ['baixa producao materna', 'ordenhas', 'durante o dia'],
    },
    {
      id: 'teste-003-rn-6d',
      message:
        'Bebê 6 dias, estabelecendo uma rotina. Faz todas as sonecas no berço, mas a noite não quer ficar no berço. Estou tendo que pega-lo e leva-lo para o meu quarto. o que pode ser?',
      mustSignalIds: ['crib_ok_day_problem_night'],
      priorityMustInclude: ['mamada noturna', 'baixa producao', 'berco'],
    },
    {
      id: 'teste-003-rn-10d',
      message:
        'Bebê de 10 dias. Sigo janelas de sono com minha filha de 1h acordada e dorme por 3h. Durante o dia dá certo, mas quando chega na madrugada no horário de dormir de 23h às 02h ela não consegue dormir e fica nervosa sugando as mãozinhas e choramingando. Será que sonecas com duração de 3 horas está muito para ela? Devo diminuir?',
      mustSignalIds: ['night_hunger_signs_rn', 'asks_nap_duration_rn'],
      priorityMustInclude: ['sinal claro de fome', '2h30 a 3h', 'antes ou depois da mamada'],
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
      // Discomfort verbalization — per dossier this is a nuance refinement
      // on an already-9.6/10 response, not a hard requirement. Report as soft warning.
      const hasDiscomfortPath =
        /(desconforto.*deitar|deitar.*desconforto|desconforto pos|desconforto ao deitar|desconforto.*ap[oó]s.*mamada|sentindo desconforto|ar preso|refluxo|regurgita|dificuldade.*arrotar|dificuldade para arrotar|evitar.*volta.*leite|evitar.*refluxo)/.test(
          norm,
        );
      if (!hasDiscomfortPath) {
        result.__warnings = result.__warnings || [];
        result.__warnings.push('nuance: would be better to explicitly verbalize post-feed discomfort');
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
    id: 'teste-003-16-rn-16d',
    label: 'TESTE 003/16 — RN 16 dias (nota oficial 8/10, regressão de -0,2)',
    profile: { motherName: '—', babyName: 'bb', ageDays: 16 },
    message:
      'Oi, bom dia! Minha bb tem 16 dias. Ela teve que fazer o procedimento na linguinha e teve tbm icterícia. Agora ela está mamando bem e estou complementando das duas mamadas da noite (22h e madrugada) com 60 ml com a sonda. Mas mesmo assim, nessa última madrugada, por exemplo, após fazer bastante xixi, cocó, arrotar e soluçar, ficou procurando o peito no intervalo menor que 2h. Na verdade, esse comportamento dela, de procurar o peito no intervalo menor que 2h iniciou já no finalzinho da tarde. Em vista disso, as madrugadas tem sido difíceis e as manhãs mais tranquilas. Como devo ajustar?',
    checks: (text, result, sig) => {
      const issues = [];
      const norm = strip(text);
      if (!/(baixa producao materna|baixa producao de leite|necessidade de suporte de producao)/.test(norm)) {
        issues.push('must name "baixa produção materna" explicitly as primary hypothesis');
      }
      if (!/(ordenha)/.test(norm)) {
        issues.push('must mention ordenha as production-stimulation strategy');
      }
      if (!/(durante o dia|tambem durante o dia|complemento.*dia)/.test(norm)) {
        issues.push('must orient complement evaluation also during the day, not only at night');
      }
      if (/\bele\b/.test(norm) && !/\bela\b/.test(norm)) {
        issues.push('gender inconsistency: mother uses feminine, response uses only "ele"');
      }
      // Must NOT blame icterícia/linguinha as CURRENT cause
      if (/(ictericia|linguinha|frenulo).{0,80}(pode impactar|pode afetar|ainda impacta|dificulta a transferencia|explica o comportamento atual|contexto atual)/.test(norm)) {
        issues.push('must NOT cite icterícia/linguinha as current cause when "mama bem"');
      }
      return issues;
    },
  },
  {
    id: 'teste-003-rn-6d',
    label: 'TESTE 003 — RN 6 dias (nota oficial 5,5/10, regressão crítica)',
    profile: { motherName: '—', babyName: 'bb', ageDays: 6 },
    message:
      'Bebê 6 dias, estabelecendo uma rotina. Faz todas as sonecas no berço, mas a noite não quer ficar no berço. Estou tendo que pega-lo e leva-lo para o meu quarto. o que pode ser?',
    checks: (text, result, sig) => {
      const issues = [];
      const norm = strip(text);
      // Age fidelity
      const re = /\b(\d{1,2})\s*dias?\b/gi;
      let m;
      const wrongAges = [];
      const noRange = norm.replace(/0\s*[–\-]\s*28\s*dias?/gi, '');
      while ((m = re.exec(noRange)) !== null) {
        const n = Number(m[1]);
        if (Number.isFinite(n) && n !== 6 && n <= 60) wrongAges.push(m[0]);
      }
      if (wrongAges.length) issues.push(`age leaked (≠6): ${wrongAges.join(', ')}`);

      // Crib-OK-day pattern must NOT open by crib adaptation
      if (!/(mamada noturna|mamada da noite|mamada nesse periodo|alimentacao.*noite|alimentacao no periodo da noite|baixa producao|producao de leite no periodo da noite)/.test(norm)) {
        issues.push('must investigate nocturnal feeding / low milk production as primary hypothesis');
      }
      if (/(adaptacao ao berco|adaptar ao berco).{0,200}/.test(norm) && !/(nao e adaptacao|nao parece ser.*berco|berco nao e o problema|nao parece ser o berco)/.test(norm)) {
        // soft check: it's OK if the answer addresses crib AFTER reframing
        if (!/(como.*aceita o berco.*dia|como.*faz.*sonecas no berco.*dia|aceita.*durante o dia)/.test(norm)) {
          issues.push('must reframe away from crib-adaptation (baby accepts crib during the day)');
        }
      }
      if (!/(mama no peito.*formula|peito.*formula|formula.*peito|forma de alimentacao)/.test(norm)) {
        issues.push('must ask feeding method (peito/fórmula/ambos)');
      }
      if (!/(30\s*(a|–|-|—|ate|até)\s*40)/.test(norm)) {
        issues.push('must mention vertical 30 a 40 minutos');
      }
      return issues;
    },
  },
  {
    id: 'teste-003-rn-10d',
    label: 'TESTE 003 — RN 10 dias (nota oficial 7,8/10)',
    profile: { motherName: '—', babyName: 'bb', ageDays: 10 },
    message:
      'Bebê de 10 dias. Sigo janelas de sono com minha filha de 1h acordada e dorme por 3h. Durante o dia dá certo, mas quando chega na madrugada no horário de dormir de 23h às 02h ela não consegue dormir e fica nervosa sugando as mãozinhas e choramingando. Será que sonecas com duração de 3 horas está muito para ela? Devo diminuir?',
    checks: (text, result, sig) => {
      const issues = [];
      const norm = strip(text);
      if (!/(2h30 a 3h|2h30 a 3 horas|2 horas e meia a 3|nao e necessario diminuir|nao precisa diminuir|podem ser esperadas)/.test(norm)) {
        issues.push('must answer directly about nap duration (2h30–3h expected, no need to reduce automatically)');
      }
      if (!/(sinal claro de fome|sinal de fome|indica fome|esses sinais.*fome|sao sinais de fome|fome.*sugar.*maozinha|sugar.*maozinha.*fome)/.test(norm)) {
        issues.push('must read "sugar mãozinhas + nervoso + choramingo" as classic hunger sign');
      }
      if (!/(antes ou depois da mamada|antes da mamada ou depois|antes ou depois|ela mamou nesse horario|ela ja mamou|ela mamou.*horario|esse comportamento.*acontece|esse comportamento.*antes|esse comportamento.*depois|nesse horario.*mamou|antes da mamada|depois da mamada)/.test(norm)) {
        result.__warnings = result.__warnings || [];
        result.__warnings.push('nuance: would be better to ask explicitly if behavior is before/after the feed');
      }
      // Must not presume ordenha or complement without info
      if (/(voce esta fazendo ordenha|sua ordenha|seu complemento|o complemento que voce|recomendo aumentar.*complemento)/.test(norm)) {
        issues.push('must NOT presume ordenha/complement when mother did not inform');
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
    console.log(text.slice(0, 500) + (text.length > 500 ? '…' : ''));
    console.log('--- checks ---');

    const issues = c.checks(text, result, sig);
    const warnings = result.__warnings || [];
    if (issues.length === 0) {
      passCount++;
      console.log('STATUS: ✅ PASS');
      for (const w of warnings) console.log(`  ⚠ ${w}`);
    } else {
      failCount++;
      console.log('STATUS: ❌ FAIL');
      for (const i of issues) console.log(`  ✗ ${i}`);
      for (const w of warnings) console.log(`  ⚠ ${w}`);
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
