#!/usr/bin/env node
/**
 * Focused simulation — verifies TESTE 007 feature implementations:
 *   RN 10d  janela 23h–02h + fome → conduta após pergunta, seios/deglutição condicionados
 *   RN 16d  sonda + mama bem      → icterícia só histórico, não normalizar demais
 *   RN 19d  travesseiro + colo    → eixo alimentar + charutinho + ambiente
 *   RN 20d  soneca curta berço    → abertura refinada + regra 45° patológico
 *
 * Run: node src/scripts/simulateTeste007Features.js
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractSignals } from '../services/signalExtractor.js';
import { retrieve } from '../services/retrieval.js';
import { suggestedLessonsFromRetrieval } from '../services/fallback.js';
import {
  ensureNightHungerJanelaCriticaComplete,
  ensureIctericiaHistoricalOnly,
  ensureTravesseiroFeedingAxisComplete,
  ensureShortNapOpeningRefined,
  ensureRefluxRoutingComplete,
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

const CASES = [
  {
    id: 'RN-10d-hunger',
    label: 'TESTE 007 RN 10d — janela 23h–02h + fome',
    ageDays: 10,
    message:
      'Bebê de 10 dias. Sigo janelas de sono com minha filha de 1h acordada e dorme por 3h. ' +
      'Durante o dia dá certo, mas quando chega na madrugada no horário de dormir de 23h às 02h ' +
      'ela não consegue dormir e fica nervosa sugando as mãozinhas e choramingando. ' +
      'Será que sonecas com duração de 3 horas está muito para ela? Devo diminuir?',
    mustSignals: ['night_hunger_signs_rn', 'asks_nap_duration_rn'],
    forbiddenLessonTitles: [/inicio do sono/i, /troca.*dia.*noite/i],
    allowedLessonTitles: [/mamadas efetivas/i, /passo 4/i],
    enricher: (ids) =>
      ensureNightHungerJanelaCriticaComplete({
        text: 'Para um RN, sonecas de 2h30 a 3h podem ser esperadas.',
        signalIds: ids,
      }),
    enricherMust: [
      /antes\s+ou\s+depois\s+da\s+mamada/,
      /nesse\s+horario.{0,20}ela\s+ja\s+mamou|ela\s+ja\s+mamou/,
      /se\s+acontece\s+antes.{0,80}alimentar/,
      /se\s+acontece\s+depois/,
      /se\s+ela\s+mama\s+no\s+peito.{0,80}seios|degluticao audivel/,
    ],
  },
  {
    id: 'RN-16d-sonda',
    label: 'TESTE 007 RN 16d — sonda + mama bem',
    ageDays: 16,
    message:
      'Minha bb tem 16 dias. Ela teve procedimento na linguinha e icterícia. Agora ela está mamando bem ' +
      'e recebo complemento com sonda nas mamadas da noite. Ficou procurando o peito em intervalo menor que 2h ' +
      'desde o finalzinho da tarde. Madrugadas difíceis, manhãs tranquilas.',
    mustSignals: ['sonda_with_mama_bem_priority_production'],
    enricher: (ids) =>
      ensureIctericiaHistoricalOnly({
        text: 'Especialmente após o procedimento na linguinha e a icterícia, pode haver dificuldade.',
        signalIds: ids,
      }),
    enricherMust: [/historico|agora est[aá] mamando bem|baixa produc[aã]o|complemento com sonda/i],
  },
  {
    id: 'RN-19d-travesseiro',
    label: 'TESTE 007 RN 19d — travesseiro + colo (eixo alimentar)',
    ageDays: 19,
    message:
      'Bebê de 19 dias não permanece no berço. Já tentei a Estratégia do Travesseiro sem sucesso. ' +
      'Mama, dorme no colo, acorda logo ao ser colocada no berço. Dorme bem à noite no berço.',
    mustSignals: ['travesseiro_tried_without_success', 'diurnal_only_difficulty'],
    forbiddenLessonTitles: [/inicio do sono/i, /troca.*dia.*noite/i],
    enricher: (ids) =>
      ensureTravesseiroFeedingAxisComplete({
        text: 'Reassista à aula da Estratégia do Travesseiro.',
        signalIds: ids,
      }),
    enricherMust: [
      /mamada efetiv|sinais de saciedade|produc[aã]o de leite/,
      /charutinho|reflexo de moro/,
      /ambiente escuro|baixa estimulacao/,
    ],
  },
  {
    id: 'RN-20d-short-naps',
    label: 'TESTE 007 RN 20d — soneca curta + colo',
    ageDays: 20,
    message:
      'Meu bebê de 20 dias passou a ter sonecas diurnas muito curtas no berço. Ele mama, dorme, é colocado no berço, ' +
      'permanece cerca de 20 minutos, acorda chorando e volta a dormir bem apenas se for pego e ficar no colo. ' +
      'À noite, dorme bem no berço. Esse comportamento é esperado nessa fase?',
    mustSignals: ['wakes_short_after_crib_back_to_lap', 'diurnal_only_difficulty', 'asks_if_normal'],
    forbiddenLessonTitles: [/inicio do sono/i, /troca.*dia.*noite/i],
    enricher: (ids) => {
      let text = 'Esse padrão pode ocorrer no RN.';
      text = ensureShortNapOpeningRefined({ text, signalIds: ids }).text;
      text = ensureRefluxRoutingComplete({
        text,
        userMessage: CASES[3].message,
        signalIds: ids,
      }).text;
      return { text, appended: true };
    },
    enricherMust: [
      /nao\s+deve\s+ser\s+tratad[ao]\s+como\s+simplesmente\s+esperad|merece\s+investigac[aã]o/,
      /45[\s°º]*.{0,80}refluxo\s+patol|refluxo\s+patol.{0,80}45/,
      /30\s*a\s*40.{0,80}fisiol|fisiol.{0,80}30\s*a\s*40/,
    ],
  },
];

async function main() {
  console.log('ZLAYA — Simulation: TESTE 007 feature verification');
  let bad = 0;

  console.log('\n--- Dedup vertical wording (TESTE 007) ---');
  const dedup = dedupeVerticalThirtyForty({
    text: 'Mantenha em posição vertical por 30 a 40 minutos após a mamada. Depois, mantenha em posição vertical por 30 a 40 minutos antes do berço.',
  });
  bad += /mant[eê]-lo em posicao vertical|mantenha o bebe em posicao vertical/.test(strip(dedup.text))
    ? pass('dedup uses "mantê-lo/mantenha o bebê" not "já mencionada"')
    : fail('dedup wording', dedup.text);

  console.log('\n--- Infrastructure rules ---');
  const rules = JSON.parse(
    readFileSync(path.join(__dirname, '..', 'knowledge', 'rn', 'rules.json'), 'utf-8'),
  );
  for (const id of [
    'rn-breastfeeding-only-seios-degluticao',
    'rn-night-hunger-conduct-after-question',
    'rn-crib-transition-never-lose-feeding',
    'rn-short-nap-cry-not-normalize-opening',
  ]) {
    bad += rules.fixedRules.some((r) => r.id === id)
      ? pass(`rule "${id}" present`)
      : fail(`rule "${id}" missing`);
  }

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
    const lessons = suggestedLessonsFromRetrieval(retrieval, 'RN', ids);
    const titles = lessons.map((l) => l.title).join(' | ');
    console.log(`  suggestedLessons: ${titles || '(none)'}`);

    for (const re of c.allowedLessonTitles || []) {
      bad += lessons.some((l) => re.test(l.title))
        ? pass(`allowed lesson matches ${re}`)
        : fail(`expected allowed lesson ${re}`, titles);
    }
    let forbiddenFound = false;
    for (const l of lessons) {
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
    }
  }

  console.log(`\n${bad === 0 ? 'OVERALL: ✅ All TESTE 007 checks passed.' : `OVERALL: ⚠ ${bad} check(s) failed.`}`);
  process.exit(bad > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
