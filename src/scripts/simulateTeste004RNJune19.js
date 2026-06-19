#!/usr/bin/env node
/**
 * Simulation — Official dossier 19/06/2026 (TESTE 004)
 *   TESTE 004  RN 16d  (sonda + icterícia + linguinha + busca <2h)
 *   TESTE 004  RN 19d  (Estratégia do Travesseiro tentada — linguagem fisiológica)
 *   TESTE 004  RN 20d  (sonecas diurnas curtas + acorda chorando após 20 min + melhora no colo
 *                       → refluxo fisiológico x patológico + suporte humano + colchão 45°)
 *
 * Layer A: deterministic — rules, prompts, forbidden, signals (no LLM)
 * Layer B: end-to-end — processTurn (LLM if OPENAI_API_KEY, else local fallback)
 *
 * Run with:  node src/scripts/simulateTeste004RNJune19.js
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
  'rn-physiological-not-behavioral-language',
  'rn-do-not-normalize-crib-cry-pattern',
  'rn-mattress-elevation-45',
  'rn-do-not-repeat-wake-latency',
];

const PROMPT_FRAGMENTS = [
  // 19d: linguagem fisiológica vs comportamental
  'fase de adaptacao fisiologica',
  'transicao de superficie',
  // 20d: padrão soneca curta no berço + colo
  'soneca diurna curta',
  'acorda chorando',
  'melhora no colo',
  // 20d: elevação do colchão e suporte humano (já existem mas reforçados)
  'elevacao do colchao em 45',
  'suporte humano',
  'material do pediatra',
  // 20d: não repetir pergunta já respondida
  'permanece cerca de',
  // 16d: complemento com sonda → conduta firme
  'complemento com sonda',
];

const FORBIDDEN_FRAGMENTS = [
  'acostumado ao colo',
  'adaptar ao berco',
  'normalizar choro ao acordar',
  'repetir pergunta cuja resposta a mae ja forneceu',
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
      id: 'rn-16d',
      ageDays: 16,
      message:
        'Oi, bom dia! Minha bb tem 16 dias. Ela teve que fazer o procedimento na linguinha e teve tbm icter\u00edcia. ' +
        'Agora ela est\u00e1 mamando bem e estou complementando das duas mamadas da noite (22h e madrugada) com 60 ml com a sonda. ' +
        'Mas mesmo assim, nessa \u00faltima madrugada, por exemplo, ap\u00f3s fazer bastante xixi, coc\u00f4, arrotar e solu\u00e7ar, ficou procurando o peito no intervalo menor que 2h. ' +
        'Na verdade, esse comportamento dela, de procurar o peito no intervalo menor que 2h iniciou j\u00e1 no finalzinho da tarde. ' +
        'Em vista disso, as madrugadas tem sido dif\u00edceis e as manh\u00e3s mais tranquilas. Como devo ajustar?',
      must: ['feeding_clinical_context', 'evening_pattern', 'short_feeding_interval', 'asks_how_to_improve', 'night_production_drop'],
    },
    {
      id: 'rn-19d',
      ageDays: 19,
      message:
        'Ol\u00e1, boa noite. Apesar de ter assistido as aulas continuo com a seguinte dificuldade. ' +
        'Tenho uma beb\u00ea de 19 dias, ela dorme bem \u00e0 noite e durante o dia tamb\u00e9m, mas no entanto, somente dorme no colo de dia e de noite. ' +
        'J\u00e1 tentei usar o m\u00e9todo do travesseiro, mas ao coloc\u00e1-la no ber\u00e7o, ap\u00f3s poucos minutos ela acorda e chora, n\u00e3o fica de jeito nenhum.',
      must: ['travesseiro_tried_without_success'],
    },
    {
      id: 'rn-20d',
      ageDays: 20,
      message:
        'Meu beb\u00ea de 20 dias passou a ter sonecas diurnas muito curtas no ber\u00e7o. ' +
        'Ele mama, dorme, \u00e9 colocado no ber\u00e7o, permanece cerca de 20 minutos, acorda chorando e volta a dormir bem apenas se for pego e ficar no colo. ' +
        '\u00c0 noite, dorme bem no ber\u00e7o. Esse comportamento \u00e9 esperado nessa fase?',
      must: ['asks_if_normal', 'diurnal_only_difficulty', 'wakes_short_after_crib_back_to_lap'],
    },
  ];
  for (const sc of signalCases) {
    const sig = extractSignals({ message: sc.message, conversation: [], ageBand: 'RN', ageDays: sc.ageDays });
    const ids = sig.signals.map((s) => s.id);
    console.log(`\n  ${sc.id}: ${ids.join(', ') || '\u2014'}`);
    for (const m of sc.must) bad += ids.includes(m) ? pass(`signal "${m}"`) : fail(`signal "${m}" not fired`);
    // The mother already gave the wake latency for 20d — must be flagged as provided
    if (sc.id === 'rn-20d') {
      bad += sig.provided.some((p) => p.id === 'wake_latency')
        ? pass('provided fact "wake_latency" registered (mother said "permanece cerca de 20 minutos")')
        : fail('provided fact "wake_latency" NOT registered for 20d — IA may re-ask');
    }
  }

  console.log(`\nLayer A result: ${bad === 0 ? 'ALL PASS' : bad + ' FAILED'}`);
  return bad === 0;
}

// ─── Layer B: end-to-end ───────────────────────────────────────────────────

const E2E = [
  {
    id: 'teste-004-rn-16d',
    label: 'TESTE 004 \u2014 RN 16 dias (sonda + icter\u00edcia + busca <2h)',
    profile: { motherName: '\u2014', babyName: 'bb', ageDays: 16 },
    message:
      'Oi, bom dia! Minha bb tem 16 dias. Ela teve que fazer o procedimento na linguinha e teve tbm icter\u00edcia. ' +
      'Agora ela est\u00e1 mamando bem e estou complementando das duas mamadas da noite (22h e madrugada) com 60 ml com a sonda. ' +
      'Mas mesmo assim, nessa \u00faltima madrugada, por exemplo, ap\u00f3s fazer bastante xixi, coc\u00f4, arrotar e solu\u00e7ar, ficou procurando o peito no intervalo menor que 2h. ' +
      'Na verdade, esse comportamento dela, de procurar o peito no intervalo menor que 2h iniciou j\u00e1 no finalzinho da tarde. ' +
      'Em vista disso, as madrugadas tem sido dif\u00edceis e as manh\u00e3s mais tranquilas. Como devo ajustar?',
    checks: (text, result, sig) => {
      const issues = []; const warn = []; const n = strip(text);
      if (!/\b16\s*dias\b/.test(n)) issues.push('must cite explicit age "16 dias"');
      if (!/(complemento.*sonda|sonda.*complemento|recebe complemento com sonda)/.test(n))
        issues.push('must explicitly name complemento com sonda as a signal');
      if (!/(baixa producao|menor producao|necessidade de suporte de producao|suporte.*producao)/.test(n))
        issues.push('must name baixa produção / suporte de produção (sonda hypothesis)');
      if (!/(durante o dia|tambem.*dia|tarde|fim.*tarde|final da tarde|finalzinho da tarde)/.test(n))
        issues.push('must consider the deficit also during the day / fim da tarde');
      if (!/(ordenha|estimular a producao|extra.*o leite)/.test(n))
        issues.push('must mention ordenha as production-stimulation strategy');
      if (!/(30\s*(a|–|-|—|ate|até)\s*40)/.test(n))
        issues.push('must include vertical 30 a 40 minutos');
      // Accept the term only when it appears in an explicit negation context.
      // Affirmative use ("ela fica com vício no peito") fails; negation
      // ("não é vício / não vício / não significa vício / ainda não cria
      // associação / não caracteriza") passes.
      if (/(vicio|mau habito|fazendo manha)/.test(n) && !/(n[aã]o\s+(e|é|um|uma|caracteriza|significa|configura|cria)?\s*(vicio|mau habito|manha|associacao)|aind?a?\s+n[aã]o\s+cria|n[aã]o\s+(vicio|mau habito|manha))/.test(n))
        issues.push('must NOT label RN comportamento as vício/manha/mau hábito');
      if (!/(amamenta|amament|amamentacao|aula.*amamenta|pratica e descomplicada)/.test(n))
        warn.push('nuance: ideally indicate the lesson "Amamentação Prática e Descomplicada"');
      // Avoid heavy normalization opener
      if (/^\s*(e compreensivel|e comum.*nessa fase.*beb)/.test(n.split(/(?<=[.!?])\s+/)[0] || ''))
        warn.push('nuance: avoid heavy normalization opener when sonda is in play');
      result.__warnings = warn; return issues;
    },
  },
  {
    id: 'teste-004-rn-19d',
    label: 'TESTE 004 \u2014 RN 19 dias (linguagem fisiol\u00f3gica, n\u00e3o comportamental)',
    profile: { motherName: '\u2014', babyName: 'bb', ageDays: 19 },
    message:
      'Ol\u00e1, boa noite. Apesar de ter assistido as aulas continuo com a seguinte dificuldade. ' +
      'Tenho uma beb\u00ea de 19 dias, ela dorme bem \u00e0 noite e durante o dia tamb\u00e9m, mas no entanto, somente dorme no colo de dia e de noite. ' +
      'J\u00e1 tentei usar o m\u00e9todo do travesseiro, mas ao coloc\u00e1-la no ber\u00e7o, ap\u00f3s poucos minutos ela acorda e chora, n\u00e3o fica de jeito nenhum.',
    checks: (text, result, sig) => {
      const issues = []; const warn = []; const n = strip(text);
      if (!/\b19\s*dias\b/.test(n)) issues.push('must cite explicit age "19 dias"');
      // Forbid behavioral framing — but accept the same vocabulary inside an
      // explicit negation like "AINDA NÃO CRIA associação ... vício ou mau
      // hábito por dormir no colo" (which is the methodologically correct
      // anti-association reassurance for RN).
      const behavFraming = /(acostumad[ao]\s+(a|ao)\s+(dormir\s+no\s+)?colo|acostumou.*colo|acostumar.*ao colo|vicio.*colo|mau habito.*colo|manha.*colo)/;
      const explicitNeg = /(aind?a?\s+n[aã]o\s+cria\s+(uma\s+)?associa[çc][aã]o[\s\S]{0,120}(colo|peito|vicio|mau habito|manha)|n[aã]o\s+(e|é|configura|significa|representa|deve\s+ser\s+(visto|entendido)\s+como)\s+(uma\s+)?(associa[çc][aã]o\s+negativa|v[íi]cio|mau\s+h[aá]bito|manha))/;
      if (behavFraming.test(n) && !explicitNeg.test(n))
        issues.push('must NOT use behavioral framing ("acostumado ao colo" / "vício no colo")');
      if (/(adaptar\s+(ao|para o)\s+berco|adaptacao\s+ao\s+berco)\b/.test(n) && !/(adaptacao fisiologica|transicao de superficie|transicao de textura|transicao colo)/.test(n))
        issues.push('must reframe as adaptação fisiológica / transição de superfície (not "adaptar ao berço" alone)');
      // Required: explicit anti-association reassurance
      if (!/(nao\s+(e|cria|configura)\s+(vicio|associacao\s+negativa|associacao\s+comportamental|mau\s+habito)|nao\s+e\s+falha|nao\s+significa\s+vicio|aind?a?\s+nao\s+cria\s+associacao)/.test(n))
        warn.push('nuance: ideally include explicit anti-association reassurance phrase');
      // Required: travesseiro practical execution
      if (!/(reassist|assist.*aula.*travesseiro|repetir o processo|repita o processo|exatamente como|aula.*travesseiro)/.test(n))
        issues.push('must orient (re)watching the Travesseiro lesson / repeating the process');
      if (!/(travesseiro.*(em cima|sobre).*colo|colo.*travesseiro|contencao.*mao|mao.*contencao|conter com.*mao)/.test(n))
        issues.push('must explain intermediate step (pillow over lap + hand containment)');
      // Triade do RN explicit (alimentação + desconforto gástrico + ambiente)
      if (!/(producao|transferencia|mamada efetiv|fluxo de leite|tarde)/.test(n))
        issues.push('must include feeding eixo (production/transfer/effective feeding)');
      if (!/(arrot|refluxo|desconforto|ar preso|regurgit)/.test(n))
        issues.push('must include desconforto gástrico eixo (arroto/refluxo/desconforto)');
      if (!/(ambient|escur|calmo|baixa estimulacao|luminosidade|ruido)/.test(n))
        warn.push('nuance: ideally include ambiente eixo of the tríade (alimentação + desconforto + ambiente)');
      // Vertical 30 a 40
      if (!/(30\s*(a|–|-|—|ate|até)\s*40)/.test(n))
        issues.push('must include vertical 30 a 40 minutos');
      // Cautious complement
      if (/complement/.test(n)
          && !/(orientacao do suporte|conforme orientacao|suporte do curso|curso\/suporte|acompanhamento)/.test(n))
        warn.push('nuance: when mentioning complemento, prefer language "conforme orientação do suporte/curso"');
      result.__warnings = warn; return issues;
    },
  },
  {
    id: 'teste-004-rn-20d',
    label: 'TESTE 004 \u2014 RN 20 dias (refluxo fisiol\u00f3gico x patol\u00f3gico + suporte humano + 45\u00b0)',
    profile: { motherName: '\u2014', babyName: 'bb', ageDays: 20 },
    message:
      'Meu beb\u00ea de 20 dias passou a ter sonecas diurnas muito curtas no ber\u00e7o. ' +
      'Ele mama, dorme, \u00e9 colocado no ber\u00e7o, permanece cerca de 20 minutos, acorda chorando e volta a dormir bem apenas se for pego e ficar no colo. ' +
      '\u00c0 noite, dorme bem no ber\u00e7o. Esse comportamento \u00e9 esperado nessa fase?',
    checks: (text, result, sig) => {
      const issues = []; const warn = []; const n = strip(text);
      if (!/\b20\s*dias\b/.test(n)) issues.push('must cite explicit age "20 dias"');
      // Don't normalize the cry-after-short-nap pattern
      if (/(sonecas curtas\s+(s[aã]o|podem ser)\s+esperadas|isso\s+(e|é)\s+esperado|comportamento\s+(e|é)\s+esperado)/.test(n)
          && !/(merece investigacao|investigar|avaliacao|avaliar)/.test(n))
        issues.push('must NOT normalize cry-after-short-nap pattern without investigation');
      // Investigation: feeding + production + saciedade
      if (!/(mamada efetiv|efetiv|saciedade|saciad|transferencia|producao)/.test(n))
        issues.push('must investigate effective feeding/production/saciedade');
      if (!/(busca.*peito.*pouco tempo|volta a buscar o peito|busca pelo peito em pouco tempo|busca precoce|continua procurando o peito)/.test(n))
        warn.push('nuance: ideally ask about busca precoce pelo peito');
      // Reflux differentiation
      if (!/(refluxo fisiologico|refluxo.*fisiologico)/.test(n))
        issues.push('must explicitly name refluxo fisiológico');
      if (!/(refluxo patologico|possibilidade de refluxo patologico|refluxo.*patologico|sinais de refluxo|vomito.*jato|engasgos|arqueamento|recusa alimentar|irritabilidade persistente)/.test(n))
        issues.push('must investigate possibility of refluxo patológico');
      // Pediatra material + human support
      if (!/(material do pediatra|pediatra roberto|aulas extras|aulas bonus|aulas b[oô]nus|roberto franklin)/.test(n))
        issues.push('must conduct to material do Pediatra (Roberto Franklin) nas Aulas Extras/Bônus');
      if (!/(suporte humano|encaminh.*suporte|suporte do curso|equipe de suporte)/.test(n))
        issues.push('must route to suporte humano (mandatory when refluxo patológico is suspected)');
      // Mattress 45°
      if (!/(elevacao do colchao|colchao.*45|45.*colchao|inclinar.*colchao|elevar.*colchao)/.test(n))
        issues.push('must offer elevação do colchão em 45° as postural measure');
      // Don't repeat what mother answered (20 min)
      if (/(em quanto tempo.*desperta|quanto tempo.*acorda.*ap[oó]s ser deitado|em quanto tempo ele desperta)/.test(n))
        issues.push('must NOT re-ask wake latency — mother already said ~20 minutos');
      // Vertical 30-40 + Moro/charutinho
      if (!/(30\s*(a|–|-|—|ate|até)\s*40)/.test(n))
        issues.push('must include vertical 30 a 40 minutos');
      if (!/(reflexo de moro|moro|charutinho|contencao)/.test(n))
        warn.push('nuance: ideally investigate reflexo de Moro / charutinho / contenção');
      // Travesseiro com transição prática
      if (/travesseiro/.test(n) && !/(travesseiro.*(em cima|sobre).*colo|colo.*travesseiro|contencao.*mao|mao.*contencao)/.test(n))
        warn.push('nuance: when citing Travesseiro, ideally describe the intermediate step (pillow over lap + containment)');
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
  console.log('ZLAYA LAB \u2014 Simulation TESTE 004 (19/06/2026) RN 16/19/20 dias');
  const a = runInfrastructureChecks();
  const b = await runE2EChecks();
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  if (a && b) console.log('OVERALL: \u2705 All layers passed \u2014 TESTE 004 corrections appear correctly implemented.');
  else console.log('OVERALL: \u26a0 Some checks failed/flagged \u2014 review items above.');
  process.exit(a && b ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
