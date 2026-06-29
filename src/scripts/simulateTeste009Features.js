#!/usr/bin/env node
/**
 * Focused simulation — verifies TESTE 009 feature implementations:
 *   RN 16d  sonda + mama bem + busca <2h  → produção central, icterícia histórico,
 *             complemento durante o dia, sem over-normalization, gênero feminino
 *
 * Run: node src/scripts/simulateTeste009Features.js
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
  ensureSondaNoOverNormalization,
  fixVerticalBackReferenceFragment,
  ensureBehavioralBerçoReframing,
  ensureTravesseiroFeedingAxisComplete,
  ensureNoGenericSupportInTravesseiroCase,
  enforceGenderConsistency,
  dedupeVerticalThirtyForty,
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
  'e recebo complemento com sonda de 60 ml nas mamadas da noite: 22h e madrugada. Mesmo após xixi, cocô, ' +
  'arroto e soluço, ficou procurando o peito em intervalo menor que 2h desde o finalzinho da tarde. ' +
  'Madrugadas difíceis, manhãs tranquilas.';

const MSG_19D =
  'Olá, boa noite. Apesar de ter assistido as aulas continuo com a seguinte dificuldade. Tenho uma bebê de 19 dias, ' +
  'ela dorme bem à noite e durante o dia também, mas no entanto, somente dorme no colo de dia e de noite. ' +
  'Já tentei usar o método do travesseiro, mas ao colocá-la no berço, após poucos minutos ela acorda e chora, não fica de jeito nenhum.';

const CASES = [
  {
    id: 'RN-16d-sonda-teste009',
    label: 'TESTE 009 RN 16d — sonda + mama bem + busca <2h',
    ageDays: 16,
    message: MSG_16D,
    mustSignals: ['sonda_with_mama_bem_priority_production', 'short_feeding_interval'],
    allowedLessonTitles: [/amamentacao pratica/i, /mamadas efetivas/i],
    forbiddenLessonTitles: [/inicio do sono/i, /troca.*dia.*noite/i],
    enricher: (ids) => {
      let text =
        'Especialmente com o histórico de icterícia e o procedimento na linguinha, muitos comportamentos são fisiológicos e esperados. ' +
        'A principal hipótese é baixa transferência de leite. Após a mamada, respeitando o tempo em posição vertical já orientado antes de transferir para o berço, ' +
        'se ele mama no peito, observe sinais de saciedade.';
      text = ensureIctericiaHistoricalOnly({ text, signalIds: ids, userMessage: MSG_16D }).text;
      text = ensureSondaNoOverNormalization({ text, signalIds: ids }).text;
      text = ensureSondaOrdenhaComplete({ text, userMessage: MSG_16D, signalIds: ids }).text;
      text = enforceGenderConsistency({ text, userMessage: MSG_16D }).text;
      text = dedupeVerticalThirtyForty({ text, userMessage: MSG_16D }).text;
      text = fixVerticalBackReferenceFragment({ text, userMessage: MSG_16D }).text;
      return { text };
    },
    enricherMust: [
      /baixa produc[aã]o|suporte de produc[aã]o/,
      /complemento com sonda/,
      /ordenha/,
      /amamentac[aã]o pr[aá]tica/,
      /avali(ar|e).{0,80}complemento.{0,80}(durante o dia|tambem durante o dia|ao longo do dia)/,
      /historico|agora est[aá] mamando bem/,
      /posi[cç][aã]o vertical.{0,40}30\s*a\s*40/,
    ],
    enricherMustNot: [
      /hipotese principal.{0,40}baixa transferencia/,
      /especialmente com o historico de ictericia/,
      /fisiologicos?\s+e\s+esperados/,
      /\bse ele mama\b/,
      /\bele continua\b/,
      /respeitando o tempo em posicao vertical ja orientado antes de transferir/,
    ],
  },
  {
    id: 'RN-19d-travesseiro-teste009',
    label: 'TESTE 009 RN 19d — Travesseiro + colo (reframing contextual)',
    ageDays: 19,
    message: MSG_19D,
    mustSignals: ['travesseiro_tried_without_success'],
    allowedLessonTitles: [/mamadas efetivas/i, /travesseiro/i, /ber[cç]o/i],
    forbiddenLessonTitles: [/inicio do sono/i, /troca.*dia.*noite/i],
    enricher: (ids) => {
      let text =
        'Precisa se adaptar ao berço. Para ajudar sua bebê a se adaptar ao berço, observe sinais de saciedade. ' +
        'Se precisar de mais ajuda, não hesite em buscar suporte.';
      text = ensureBehavioralBerçoReframing({ text, signalIds: ids }).text;
      text = ensureTravesseiroFeedingAxisComplete({ text, signalIds: ids }).text;
      text = ensureNoGenericSupportInTravesseiroCase({ text, signalIds: ids }).text;
      text = enforceGenderConsistency({ text, userMessage: MSG_19D }).text;
      return { text };
    },
    enricherMust: [
      /dificuldade na transi[cç][aã]o|nessa transi[cç][aã]o do colo/,
      /solta o peito|abre as maozinhas|ritmo da succao/,
      /livre demanda|reavalie.{0,40}(produc[aã]o|transfer)/,
      /queda.{0,40}fluxo.{0,60}(fim da tarde|come[cç]o da noite)/,
    ],
    enricherMustNot: [
      /\bse\s+transi[cç][aã]o\b/,
      /precisa se transi[cç][aã]o/,
      /nao hesite em buscar suporte/,
      /adaptar.{0,20}ber[cç]o/,
    ],
  },
];

async function main() {
  console.log('ZLAYA — Simulation: TESTE 009 feature verification');
  let bad = 0;

  console.log('\n--- Infrastructure rules ---');
  const rules = JSON.parse(
    readFileSync(path.join(__dirname, '..', 'knowledge', 'rn', 'rules.json'), 'utf-8'),
  );
  for (const id of [
    'rn-teste009-ictericia-linguinha-historical-only',
    'rn-teste009-sonda-busca-investigate-production',
    'rn-teste009-production-over-transfer-sonda',
    'rn-teste009-deficit-also-during-day',
    'rn-teste009-complement-evaluate-day-and-afternoon',
    'rn-teste009-ordenhas-day-and-afternoon',
    'rn-teste009-travesseiro-reframing-contextual',
    'rn-teste009-travesseiro-satiety-and-insufficient-conduct',
    'rn-teste009-no-generic-human-support-travesseiro',
  ]) {
    bad += rules.fixedRules.some((r) => r.id === id)
      ? pass(`rule "${id}" present`)
      : fail(`rule "${id}" missing`);
  }

  console.log('\n--- Berço reframing contextual (TESTE 009 RN 19d) ---');
  const reframe = ensureBehavioralBerçoReframing({
    text:
      'Precisa se adaptar ao berço. Dificuldades para se adaptar ao berço. ' +
      'Para ajudar sua bebê a se adaptar ao berço.',
    signalIds: ['travesseiro_tried_without_success'],
  });
  const rn = strip(reframe.text);
  bad += /dificuldade na transi[cç][aã]o|precisa de apoio nessa transi[cç][aã]o|ajudar sua bebe nessa transi[cç][aã]o/.test(rn)
    ? pass('contextual berço reframing avoids "se transição"')
    : fail('berço reframing', reframe.text.slice(0, 160));
  bad += !/\bse\s+transi[cç][aã]o\b/.test(rn)
    ? pass('no "se transição" grammar error')
    : fail('still contains "se transição"', reframe.text);

  console.log('\n--- Vertical fragment fix (TESTE 009 RN 16d) ---');
  const verticalFix = fixVerticalBackReferenceFragment({
    text: 'Após a mamada, respeitando o tempo em posição vertical já orientado antes de transferir para o berço.',
    userMessage: MSG_16D,
  });
  bad += /mantenha-a em posicao vertical por 30 a 40 minutos/.test(strip(verticalFix.text))
    ? pass('fragmented vertical back-reference rewritten to full sentence')
    : fail('vertical fragment fix', verticalFix.text.slice(0, 120));

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

    const { text } = c.enricher(ids);
    const n = strip(text);
    for (const re of c.enricherMust) {
      bad += re.test(n) ? pass(`enricher must: ${re}`) : fail(`enricher must: ${re}`);
    }
    for (const re of c.enricherMustNot) {
      bad += !re.test(n) ? pass(`enricher must-not: ${re}`) : fail(`enricher must-not: ${re}`, 'still present');
    }
  }

  console.log(`\n${bad === 0 ? 'ALL PASS' : `${bad} failure(s)`}`);
  process.exit(bad === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
