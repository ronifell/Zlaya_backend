#!/usr/bin/env node
/**
 * Focused simulation — verifies TESTE 006 feature implementations:
 *   RN 13d  bath crying     → lesson filter + pediatric closing
 *   RN  6d  crib at night   → narrow lesson list
 *   RN 16d  sonda+mama bem  → icterícia historical only
 *   RN 20d  short diurnal   → Moro/Travesseiro in body + elevation split
 *
 * Run: node src/scripts/simulateTeste006Features.js
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractSignals } from '../services/signalExtractor.js';
import { retrieve } from '../services/retrieval.js';
import { suggestedLessonsFromRetrieval } from '../services/fallback.js';
import {
  ensureBathClosingComplete,
  ensureIctericiaHistoricalOnly,
  ensureShortNapDiurnalBodyComplete,
  ensureRefluxRoutingComplete,
} from '../services/safetyValidator.js';
import { processTurn } from '../services/zlayaPipeline.js';

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
    id: 'RN-13d-bath',
    label: 'TESTE 006 RN 13d — choro no banho (aulas + pediatra)',
    ageDays: 13,
    message:
      'Olá, meu bebê tem 13 dias, percebi que ele chora muuuuuito na hora do banho ' +
      'e ainda uso aquelas almofadas para dar mais segurança e conforto. ' +
      'O que eu poderia fazer para diminuir esse choro?',
    mustSignals: ['bath_crying_rn', 'bath_crying_isolated_rn'],
    forbiddenLessonTitles: [
      /mamadas efetivas/i,
      /hora da bruxa/i,
      /colicas/i,
      /passo 4/i,
      /inicio do sono/i,
      /troca.*dia.*noite/i,
    ],
    allowedLessonTitles: [/passo 1|ambiente/i],
    enricher: (ids) =>
      ensureBathClosingComplete({ text: 'Fralda de pano, banho curto.', signalIds: ids }),
    enricherMust: [
      /repetic[aã]o|previsibilidade/,
      /febre|recusa alimentar|prostrac[aã]o|vom[ií]tos importantes|choro inconsol[aá]vel fora do banho|mudan[cç]a importante.{0,30}comportamento/,
    ],
    enricherMustNot: [/se o choro persistir.{0,80}pediatra/i],
  },
  {
    id: 'RN-6d-crib-night',
    label: 'TESTE 006 RN 6d — berço ok de dia, problema só à noite',
    ageDays: 6,
    message:
      'Bebê 6 dias, estabelecendo uma rotina. Faz todas as sonecas no berço, mas a noite não quer ficar no berço. ' +
      'Estou tendo que pega-lo e leva-lo para o meu quarto. o que pode ser?',
    mustSignals: ['crib_ok_day_problem_night'],
    forbiddenLessonTitles: [
      /travesseiro/i,
      /charutinho|moro/i,
      /passo 4/i,
      /inicio do sono/i,
      /troca.*dia.*noite/i,
    ],
    allowedLessonTitles: [/mamadas efetivas/i, /estimule o arroto/i, /refluxo/i],
  },
  {
    id: 'RN-16d-sonda',
    label: 'TESTE 006 RN 16d — sonda + mama bem (icterícia só histórico)',
    ageDays: 16,
    message:
      'Oi, bom dia! Minha bb tem 16 dias. Ela teve que fazer o procedimento na linguinha e teve tbm icterícia. ' +
      'Agora ela está mamando bem e estou complementando das duas mamadas da noite (22h e madrugada) com 60 ml com a sonda. ' +
      'Mas mesmo assim, nessa última madrugada, por exemplo, após fazer bastante xixi, cocô, arrotar e soluçar, ' +
      'ficou procurando o peito no intervalo menor que 2h. Na verdade, esse comportamento dela, de procurar o peito ' +
      'no intervalo menor que 2h iniciou já no finalzinho da tarde. Em vista disso, as madrugadas tem sido difíceis ' +
      'e as manhãs mais tranquilas. Como devo ajustar?',
    mustSignals: ['sonda_with_mama_bem_priority_production'],
    enricher: (ids) =>
      ensureIctericiaHistoricalOnly({
        text: 'A icterícia pode impactar a transferência de leite nesta fase.',
        signalIds: ids,
      }),
    enricherMust: [
      /historico|histórico|agora est[aá] mamando bem|baixa produc[aã]o|complemento com sonda/i,
    ],
  },
  {
    id: 'RN-20d-short-naps',
    label: 'TESTE 006 RN 20d — sonecas curtas + colo (Moro + Travesseiro no corpo)',
    ageDays: 20,
    message:
      'Meu bebê de 20 dias passou a ter sonecas diurnas muito curtas no berço. Ele mama, dorme, é colocado no berço, ' +
      'permanece cerca de 20 minutos, acorda chorando e volta a dormir bem apenas se for pego e ficar no colo. ' +
      'À noite, dorme bem no berço. Esse comportamento é esperado nessa fase?',
    mustSignals: ['wakes_short_after_crib_back_to_lap', 'diurnal_only_difficulty'],
    enricher: (ids) =>
      ensureShortNapDiurnalBodyComplete({
        text: 'Investigue mamada efetiva e refluxo.',
        signalIds: ids,
      }),
    enricherMust: [
      /reflexo de moro|charutinho|conten[cç][aã]o/,
      /mamada efetiva|arroto|transferencia gradual|travesseiro/i,
    ],
  },
];

async function runUnitLayer() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('LAYER A — Unit (signals / lessons / enrichers / rules)');
  console.log('═══════════════════════════════════════════════════════════');

  let bad = 0;

  // Reflux elevation split
  console.log('\n--- Reflux elevation split ---');
  const refluxFix = ensureRefluxRoutingComplete({
    text: 'Investigue desconforto pós-mamada.',
    userMessage: 'acorda chorando no berco e melhora no colo',
    signalIds: ['wakes_short_after_crib_back_to_lap'],
  });
  const rt = strip(refluxFix.text);
  bad += /30\s*a\s*40/.test(rt)
    ? pass('append includes 30–40° for physiological')
    : fail('missing 30–40°');
  bad += !/fisiol.{0,120}45|45.{0,120}fisiol/.test(rt)
    ? pass('does NOT assign 45° to physiological reflux')
    : fail('45° wrongly tied to physiological');
  bad += /refluxo fisiol/.test(rt) && /refluxo patol/.test(rt)
    ? pass('differentiates physiological vs pathological')
    : fail('missing reflux differentiation');

  // Rules
  console.log('\n--- Infrastructure rules ---');
  const rulesPath = path.join(__dirname, '..', 'knowledge', 'rn', 'rules.json');
  const rules = JSON.parse(readFileSync(rulesPath, 'utf-8'));
  for (const id of [
    'rn-bath-lessons-filter',
    'rn-bath-pediatric-referral-specific',
    'rn-berco-night-feeding-narrow-lessons',
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
      bad += fix.appended ? pass('enricher appended missing content') : fail('enricher did not append');
      const nt = strip(fix.text);
      for (const re of c.enricherMust || []) {
        bad += re.test(nt) ? pass(`enricher text matches ${re}`) : fail(`enricher missing ${re}`);
      }
      for (const re of c.enricherMustNot || []) {
        bad += !re.test(nt) ? pass(`enricher avoids ${re}`) : fail(`enricher contains forbidden ${re}`);
      }
    }
  }

  console.log(`\nLayer A: ${bad === 0 ? 'ALL PASS' : `${bad} FAILURE(S)`}`);
  return bad;
}

async function runE2ELayer() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('LAYER B — End-to-end (processTurn)');
  console.log('═══════════════════════════════════════════════════════════');

  let bad = 0;
  const e2eCases = [
    {
      id: 'RN-13d-bath',
      label: 'RN 13d choro no banho',
      profile: { ageDays: 13 },
      message: CASES[0].message,
      checks: (result) => {
        const issues = [];
        const n = strip(result.response?.text || '');
        const lessons = (result.response?.suggestedLessons || []).map((l) => l.title);
        if (!/fralda\s+de\s+pano/.test(n)) issues.push('missing fralda de pano');
        if (!/(repetic[aã]o|previsibilidade).{0,80}(adapta|banho)/.test(n)) {
          issues.push('missing adaptation closing');
        }
        if (!/febre|recusa alimentar|prostrac[aã]o|vom[ií]tos importantes|fora do banho/.test(n)) {
          issues.push('missing specific pediatric signs');
        }
        for (const t of lessons) {
          if (/mamadas efetivas|hora da bruxa|colicas|passo 4|inicio do sono|troca.*dia/i.test(strip(t))) {
            issues.push(`forbidden lesson card: ${t}`);
          }
        }
        if (lessons.length && !/passo 1|ambiente/i.test(strip(lessons.join(' ')))) {
          issues.push('expected Passo 1 / Ambiente lesson only');
        }
        return issues;
      },
    },
    {
      id: 'RN-6d-crib',
      label: 'RN 6d berço à noite',
      profile: { ageDays: 6 },
      message: CASES[1].message,
      checks: (result) => {
        const issues = [];
        const lessons = (result.response?.suggestedLessons || []).map((l) => l.title);
        for (const t of lessons) {
          if (/travesseiro|charutinho|passo 4|inicio do sono|troca.*dia/i.test(strip(t))) {
            issues.push(`forbidden lesson card: ${t}`);
          }
        }
        const ok = lessons.some((t) => /mamadas efetivas|estimule o arroto|refluxo/i.test(strip(t)));
        if (lessons.length && !ok) issues.push('expected Mamadas/Arroto/Refluxo lessons');
        return issues;
      },
    },
  ];

  for (const c of e2eCases) {
    console.log(`\n--- ${c.label} ---`);
    const result = await processTurn({
      message: c.message,
      babyProfile: c.profile,
      conversation: [],
    });
    const lessons = (result.response?.suggestedLessons || []).map((l) => l.title);
    console.log(`  route: ${result.route?.path}`);
    console.log(`  signals: ${(result.signals || []).map((s) => s.id || s).join(', ') || '—'}`);
    console.log(`  suggestedLessons: ${lessons.join(' | ') || '(none)'}`);
    const issues = c.checks(result);
    if (issues.length) {
      bad += issues.length;
      for (const i of issues) bad += fail(i);
    } else {
      pass('end-to-end checks passed');
    }
    console.log('  response excerpt:', (result.response?.text || '').slice(0, 280).replace(/\n/g, ' ') + '…');
  }

  console.log(`\nLayer B: ${bad === 0 ? 'ALL PASS' : `${bad} FAILURE(S)`}`);
  return bad;
}

async function main() {
  console.log('ZLAYA — Simulation: TESTE 006 feature verification');
  const a = await runUnitLayer();
  const b = await runE2ELayer();
  const total = a + b;
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(
    total === 0
      ? 'OVERALL: ✅ All simulations passed — features correctly implemented.'
      : `OVERALL: ⚠ ${total} check(s) failed — review above.`,
  );
  process.exit(total > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
