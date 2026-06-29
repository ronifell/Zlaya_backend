#!/usr/bin/env node
/**
 * Focused simulation — verifies TESTE 008 feature implementations:
 *   RN 16d  sonda + mama bem      → produção > transferência, icterícia histórico, Amamentação Prática
 *   RN 19d  travesseiro + colo    → queda de fluxo question, transição colo→berço, eixo alimentar
 *   RN 20d  soneca curta berço    → refluxo patológico + suporte humano + Pediatra + feeding axis
 *
 * Run: node src/scripts/simulateTeste008Features.js
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractSignals } from '../services/signalExtractor.js';
import { retrieve } from '../services/retrieval.js';
import { suggestedLessonsFromRetrieval } from '../services/fallback.js';
import {
  ensureIctericiaHistoricalOnly,
  ensureSondaOrdenhaComplete,
  ensureTravesseiroFeedingAxisComplete,
  ensureBehavioralBerçoReframing,
  ensureShortNapOpeningRefined,
  ensureRefluxRoutingComplete,
  ensureShortNapDiurnalBodyComplete,
  dedupeVerticalThirtyForty,
  enforceGenderConsistency,
} from '../services/safetyValidator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function strip(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
function pass(label, detail = '') {
  console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`);
  return 0;
}
function fail(label, detail = '') {
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  return 1;
}

const MSG_16D =
  'Minha bb tem 16 dias. Ela teve procedimento na linguinha e icterícia. Agora ela está mamando bem ' +
  'e recebo complemento com sonda nas mamadas da noite. Ficou procurando o peito em intervalo menor que 2h ' +
  'desde o finalzinho da tarde. Madrugadas difíceis, manhãs tranquilas.';

const MSG_19D =
  'Olá, boa noite. Tenho uma bebê de 19 dias, ela dorme bem à noite e durante o dia também, ' +
  'mas somente dorme no colo de dia e de noite. Já tentei usar o método do travesseiro, ' +
  'mas ao colocá-la no berço, após poucos minutos ela acorda e chora, não fica de jeito nenhum.';

const MSG_20D =
  'Meu bebê de 20 dias passou a ter sonecas diurnas muito curtas no berço. Ele mama, dorme, é colocado no berço, ' +
  'permanece cerca de 20 minutos, acorda chorando e volta a dormir bem apenas se for pego e ficar no colo. ' +
  'À noite, dorme bem no berço. Esse comportamento é esperado nessa fase?';

const CASES = [
  {
    id: 'RN-16d-sonda',
    label: 'TESTE 008 RN 16d — sonda + mama bem',
    ageDays: 16,
    message: MSG_16D,
    mustSignals: ['sonda_with_mama_bem_priority_production'],
    allowedLessonTitles: [/amamentacao pratica/i, /mamadas efetivas/i],
    forbiddenLessonTitles: [/inicio do sono/i, /troca.*dia.*noite/i],
    enricher: (ids) => {
      let text =
        'Especialmente com o histórico de icterícia e o procedimento na linguinha, pode haver dificuldade. ' +
        'A principal hipótese é baixa transferência de leite.';
      text = ensureIctericiaHistoricalOnly({ text, signalIds: ids, userMessage: MSG_16D }).text;
      text = ensureSondaOrdenhaComplete({ text, userMessage: MSG_16D, signalIds: ids }).text;
      return { text };
    },
    enricherMust: [
      /baixa produc[aã]o|suporte de produc[aã]o/,
      /complemento com sonda/,
      /ordenha/,
      /amamentac[aã]o pr[aá]tica/,
      /complemento.{0,80}(noite|durante o dia|final da tarde)/,
      /historico|agora est[aá] mamando bem/,
    ],
    enricherMustNot: [/hipotese principal.{0,40}baixa transferencia/],
  },
  {
    id: 'RN-19d-travesseiro',
    label: 'TESTE 008 RN 19d — travesseiro + colo (queda de fluxo)',
    ageDays: 19,
    message: MSG_19D,
    mustSignals: ['travesseiro_tried_without_success'],
    forbiddenLessonTitles: [/inicio do sono/i, /troca.*dia.*noite/i],
    enricher: (ids) => {
      let text =
        'Precisa se adaptar ao berço. Depois de arrotar e de ficar mantê-lo em posição vertical, tente novamente.';
      text = ensureBehavioralBerçoReframing({ text, signalIds: ids }).text;
      text = ensureTravesseiroFeedingAxisComplete({ text, signalIds: ids }).text;
      text = enforceGenderConsistency({ text, userMessage: MSG_19D }).text;
      text = dedupeVerticalThirtyForty({ text, userMessage: MSG_19D }).text;
      return { text };
    },
    enricherMust: [
      /queda.{0,40}fluxo.{0,60}(fim da tarde|come[cç]o da noite)/,
      /mamada efetiv|sinais de saciedade|produc[aã]o de leite/,
      /transi[cç][aã]o.{0,40}(colo|superf[ií]cie)/,
      /charutinho|reflexo de moro/,
      /ambiente escuro|baixa estimulacao/,
    ],
    enricherMustNot: [/adaptar.{0,20}ber[cç]o|acostumar.{0,20}ber[cç]o|mant[eê]-lo em posicao vertical|\bse\s+transi[cç][aã]o\b/],
  },
  {
    id: 'RN-20d-short-naps',
    label: 'TESTE 008 RN 20d — soneca curta + colo + refluxo',
    ageDays: 20,
    message: MSG_20D,
    mustSignals: ['wakes_short_after_crib_back_to_lap', 'diurnal_only_difficulty', 'asks_if_normal'],
    forbiddenLessonTitles: [/inicio do sono/i, /troca.*dia.*noite/i],
    enricher: (ids) => {
      let text = 'Esse padrão pode ocorrer no RN.';
      text = ensureShortNapOpeningRefined({ text, signalIds: ids }).text;
      text = ensureShortNapDiurnalBodyComplete({ text, signalIds: ids }).text;
      text = ensureRefluxRoutingComplete({
        text,
        userMessage: MSG_20D,
        signalIds: ids,
      }).text;
      return { text };
    },
    enricherMust: [
      /nao\s+deve\s+ser\s+tratad[ao]\s+como\s+simplesmente\s+esperad|merece\s+investigac[aã]o/,
      /refluxo\s+fisiol[oó]gico/,
      /refluxo\s+patol[oó]gico/,
      /suporte\s+humano/,
      /pediatra\s+roberto|material\s+do\s+pediatra|aulas?\s+extras/,
      /45[\s°º]*.{0,80}refluxo\s+patol|refluxo\s+patol.{0,80}45/,
      /30\s*a\s*40.{0,80}fisiol|fisiol.{0,80}30\s*a\s*40/,
      /mamada\s+efetiv|sinais\s+de\s+saciedade|busca.{0,40}peito/,
    ],
  },
];

async function main() {
  console.log('ZLAYA — Simulation: TESTE 008 feature verification');
  let bad = 0;

  console.log('\n--- Dedup vertical wording (TESTE 008 RN 19d) ---');
  const dedup = dedupeVerticalThirtyForty({
    text:
      'Mantenha em posição vertical por 30 a 40 minutos após a mamada. ' +
      'Depois de arrotar, mantenha em posição vertical por 30 a 40 minutos antes do berço.',
    userMessage: MSG_19D,
  });
  bad += /ser mantida em posicao vertical|mantenha-a em posicao vertical/.test(strip(dedup.text))
    ? pass('dedup uses gender-safe back-reference for feminine baby')
    : fail('dedup wording', dedup.text.slice(0, 120));

  console.log('\n--- Infrastructure rules ---');
  const rules = JSON.parse(
    readFileSync(path.join(__dirname, '..', 'knowledge', 'rn', 'rules.json'), 'utf-8'),
  );
  for (const id of [
    'rn-teste008-reflux-pathological-routing-on-investigation',
    'rn-teste008-sonda-amamentacao-pratica-lesson',
    'rn-teste008-travesseiro-queda-fluxo-question',
    'rn-teste008-short-nap-feeding-axis-body',
  ]) {
    bad += rules.fixedRules.some((r) => r.id === id)
      ? pass(`rule "${id}" present`)
      : fail(`rule "${id}" missing`);
  }

  const lessons = JSON.parse(
    readFileSync(path.join(__dirname, '..', 'knowledge', 'rn', 'lessons.json'), 'utf-8'),
  );
  bad += lessons.lessons.some((l) => l.id === 'lesson-amamentacao-pratica')
    ? pass('lesson "Amamentação Prática e Descomplicada" registered')
    : fail('lesson-amamentacao-pratica missing');

  for (const c of CASES) {
    console.log(`\n--- ${c.label} ---`);
    const sig = extractSignals({
      message: c.message,
      conversation: [],
      ageBand: 'RN',
      ageDays: c.ageDays,
    });
    const ids = sig.signals.map((s) => s.id);
    console.log(`  signals: ${ids.join(', ')}`);
    for (const m of c.mustSignals || []) {
      bad += ids.includes(m) ? pass(`signal "${m}"`) : fail(`signal "${m}" missing`);
    }

    const retrieval = await retrieve({
      query: c.message,
      namespace: 'RN',
      intent: 'test',
      boostThemes: sig.boostThemes,
    });
    const lessonList = suggestedLessonsFromRetrieval(retrieval, 'RN', ids);
    const titles = lessonList.map((l) => l.title).join(' | ');
    console.log(`  suggestedLessons: ${titles || '(none)'}`);

    for (const re of c.allowedLessonTitles || []) {
      bad += lessonList.some((l) => re.test(strip(l.title)))
        ? pass(`allowed lesson matches ${re}`)
        : fail(`expected allowed lesson ${re}`, titles);
    }
    let forbiddenFound = false;
    for (const l of lessonList) {
      for (const re of c.forbiddenLessonTitles || []) {
        if (re.test(l.title)) {
          bad += fail(`forbidden lesson present: ${l.title}`);
          forbiddenFound = true;
        }
      }
    }
    if ((c.forbiddenLessonTitles || []).length && !forbiddenFound) {
      bad += pass('no forbidden lessons in card list');
    }

    if (c.enricher) {
      const fix = c.enricher(ids);
      const nt = strip(fix.text);
      for (const re of c.enricherMust || []) {
        bad += re.test(nt) ? pass(`enricher matches ${re}`) : fail(`enricher missing ${re}`);
      }
      for (const re of c.enricherMustNot || []) {
        bad += !re.test(nt) ? pass(`enricher avoids ${re}`) : fail(`enricher must NOT match ${re}`);
      }
    }
  }

  console.log(
    `\n${bad === 0 ? 'OVERALL: ✅ All TESTE 008 checks passed (score target: 10/10).' : `OVERALL: ⚠ ${bad} check(s) failed.`}`,
  );
  process.exit(bad > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
