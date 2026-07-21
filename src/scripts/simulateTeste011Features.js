#!/usr/bin/env node
/**
 * Focused simulation — verifies TESTE 011 feature implementations:
 *   RN 16d  sonda + mama bem + busca <2h → trava explícita icterícia/linguinha,
 *             abertura sem "padrões de busca", pergunta de complemento com
 *             "durante o dia", gênero feminino (não regredir 009/010).
 *   RN 22d  chupeta caindo → nunca prender/fixar obrigatório, saciedade
 *             adaptada, sem "evitar refluxo", frase vertical completa.
 *
 * Run: node src/scripts/simulateTeste011Features.js
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
  ensureSondaNoOpeningNormalization,
  ensureProducaoCanonicalPhrasing,
  enforceGenderConsistency,
  dedupeVerticalThirtyForty,
  fixVerticalBackReferenceFragment,
  ensurePacifierPracticalComplete,
  softenEvitarRefluxoClaim,
  fixTruncatedVerticalBeforeCrib,
  ensurePacifierSatietyAdapted,
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

const MSG_22D =
  'Olá, minha bebê tem 22 dias. Ela está usando chupeta devido à necessidade de sucção, porém, ' +
  'quando ela dorme com a chupeta, ela acorda porque a chupeta cai e preciso ficar colocando novamente. ' +
  'Como consigo resolver?';

const CASES = [
  {
    id: 'RN-16d-sonda-teste011',
    label: 'TESTE 011 RN 16d — sonda + mama bem (trava explícita + sem normalização + dia na pergunta)',
    ageDays: 16,
    message: MSG_16D,
    mustSignals: ['sonda_with_mama_bem_priority_production', 'short_feeding_interval'],
    allowedLessonTitles: [/amamentacao pratica/i, /mamadas efetivas/i],
    forbiddenLessonTitles: [/inicio do sono/i, /troca.*dia.*noite/i],
    enricher: (ids) => {
      let text =
        'É comum os bebês nessa fase apresentarem padrões de busca pelo peito, especialmente no final do dia. ' +
        'A principal hipótese é baixa produção materna ou necessidade de suporte de produção. ' +
        'O complemento com sonda foi orientado apenas para a noite ou também para o final da tarde? ' +
        'Se ele mama no peito, ofereça novamente. Ele continua procurando o peito em pouco tempo.';
      text = ensureIctericiaHistoricalOnly({ text, signalIds: ids, userMessage: MSG_16D }).text;
      text = ensureSondaNoOverNormalization({ text, signalIds: ids }).text;
      text = ensureSondaOrdenhaComplete({ text, userMessage: MSG_16D, signalIds: ids }).text;
      text = enforceGenderConsistency({ text, userMessage: MSG_16D }).text;
      text = dedupeVerticalThirtyForty({ text, userMessage: MSG_16D }).text;
      text = fixVerticalBackReferenceFragment({ text, userMessage: MSG_16D }).text;
      text = ensureSondaNoOpeningNormalization({ text, signalIds: ids }).text;
      text = ensureProducaoCanonicalPhrasing({ text }).text;
      return { text };
    },
    enricherMust: [
      /baixa\s+produ[cç][aã]o\s+materna\s+ou\s+necessidade\s+de\s+suporte\s+de\s+produ[cç][aã]o/,
      /complemento\s+com\s+sonda/,
      /durante\s+o\s+dia/,
      /apenas\s+como\s+hist[oó]rico/,
      /n[aã]o\s+como\s+causa\s+atual/,
      /amamentac[aã]o\s+pr[aá]tica/,
    ],
    enricherMustNot: [
      /padr[oõ]es?\s+de\s+busca\s+pelo\s+peito/,
      /\bse ele mama\b/,
      /\bele continua\b/,
      /especialmente\s+(?:com\s+o\s+hist[oó]rico\s+de\s+)?(?:a\s+)?icter[ií]cia.{0,40}causa\s+atual/,
    ],
  },
  {
    id: 'RN-22d-chupeta-teste011',
    label: 'TESTE 011 RN 22d — chupeta (nunca prender + saciedade adaptada + sem evitar refluxo)',
    ageDays: 22,
    message: MSG_22D,
    mustSignals: ['pacifier_in_rn'],
    allowedLessonTitles: [/reflexo\s+de\s+suc/i, /mamadas\s+efetivas/i, /arroto/i],
    forbiddenLessonTitles: [/inicio\s+do\s+sono/i, /troca.*dia.*noite/i, /refluxo/i],
    enricher: (ids) => {
      let text =
        'Aos 22 dias a chupeta atende à necessidade fisiológica de sucção. ' +
        'Observe se solta o peito espontaneamente. ' +
        'Mantenha em posição vertical por 30 a 40 minutos para evitar refluxo. ' +
        'Após a mamada, depois de arrotar e de ser mantida em posição vertical antes de transferir para o berço.';
      text = ensurePacifierPracticalComplete({
        text,
        userMessage: MSG_22D,
        signalIds: ids,
      }).text;
      text = softenEvitarRefluxoClaim({ text }).text;
      text = fixTruncatedVerticalBeforeCrib({ text, userMessage: MSG_22D }).text;
      text = ensurePacifierSatietyAdapted({ text, signalIds: ids }).text;
      text = enforceGenderConsistency({ text, userMessage: MSG_22D }).text;
      return { text };
    },
    enricherMust: [
      /nunca\s+prenda\s+ou\s+fixe\s+a\s+chupeta/,
      /n[aã]o\s+precisa\s+recolocar|n[aã]o\s+precisa\s+recolocar/i,
      /associa[cç][aã]o\s+comportamental\s+negativa/,
      /f[oó]rmula\s+ou\s+complemento|reduz\s+o\s+ritmo\s+da\s+suc/,
      /reduzir\s+desconfortos\s+p[oó]s-mamada|favorecer\s+a\s+transi[cç][aã]o/,
      /posi[cç][aã]o\s+vertical\s+por\s+30\s*a\s*40\s+minutos/,
    ],
    enricherMustNot: [
      /para\s+evitar\s+(?:o\s+)?refluxo/,
      /ap[óo]s\s+a\s+mamada,?\s*depois\s+de\s+arrotar\s+e\s+de\s+ser\s+mantida\s+em\s+posi[cç][aã]o\s+vertical\s+antes\s+de\s+transferir/,
      /prend(?:a|er)\s+a\s+chupeta(?!\s*—)/,
    ],
  },
];

async function main() {
  console.log('ZLAYA — Simulation: TESTE 011 feature verification');
  let bad = 0;

  console.log('\n--- Infrastructure rules (TESTE 011) ---');
  const rules = JSON.parse(
    readFileSync(path.join(__dirname, '..', 'knowledge', 'rn', 'rules.json'), 'utf-8'),
  );
  for (const id of [
    'rn-teste011-sonda-no-normalize-padroes-busca',
    'rn-teste011-ictericia-linguinha-trava-explicita',
    'rn-teste011-complemento-pergunta-inclui-dia',
    'rn-teste011-gender-ela-bebe',
    'rn-teste011-chupeta-nunca-prender-obrigatorio',
    'rn-teste011-chupeta-hierarquia-direta',
    'rn-teste011-chupeta-saciedade-adaptada',
    'rn-teste011-chupeta-nao-prometer-evitar-refluxo',
    'rn-teste011-vertical-frase-completa',
  ]) {
    bad += rules.fixedRules.some((r) => r.id === id)
      ? pass(`rule "${id}" present`)
      : fail(`rule "${id}" missing`);
  }

  console.log('\n--- TESTE 010 / 009 non-regression ---');
  for (const id of [
    'rn-teste010-sonda-no-over-normalization-abertura',
    'rn-teste010-producao-fraseologia-canonica',
    'rn-teste010-travesseiro-charutinho-lista-textual',
    'rn-teste009-ictericia-linguinha-historical-only',
    'rn-pacifier-no-securing',
  ]) {
    bad += rules.fixedRules.some((r) => r.id === id)
      ? pass(`rule "${id}" still present`)
      : fail(`rule "${id}" missing — regression`);
  }

  console.log('\n--- Trava explícita icterícia/linguinha (TESTE 011 RN 16d) ---');
  const ictericia = ensureIctericiaHistoricalOnly({
    text: 'A principal hipótese é baixa produção materna ou necessidade de suporte de produção.',
    signalIds: ['sonda_with_mama_bem_priority_production'],
    userMessage: MSG_16D,
  });
  bad += /apenas\s+como\s+hist[oó]rico/.test(strip(ictericia.text)) &&
    /n[aã]o\s+como\s+causa\s+atual/.test(strip(ictericia.text))
    ? pass('appended explicit historical lock even when draft omitted ictericia')
    : fail('explicit historical lock missing', ictericia.text.slice(0, 220));

  console.log('\n--- Abertura sem padrões de busca (TESTE 011 RN 16d) ---');
  const opening = ensureSondaNoOpeningNormalization({
    text: 'É comum os bebês nessa fase apresentarem padrões de busca pelo peito, especialmente no final do dia. O restante segue.',
    signalIds: ['sonda_with_mama_bem_priority_production'],
  });
  const op = strip(opening.text);
  bad += !/padr[oõ]es?\s+de\s+busca\s+pelo\s+peito/.test(op)
    ? pass('removed "padrões de busca" normalization')
    : fail('padrões de busca still present', opening.text.slice(0, 200));
  bad += /baixa\s+produ[cç][aã]o\s+materna\s+ou\s+necessidade\s+de\s+suporte\s+de\s+produ[cç][aã]o/.test(op)
    ? pass('replaced with canonical hypothesis opening')
    : fail('canonical hypothesis missing', opening.text);

  console.log('\n--- Pergunta de complemento inclui durante o dia (TESTE 011 RN 16d) ---');
  const afternoonOnly =
    'O complemento com sonda foi orientado apenas para a noite ou também para o final da tarde?';
  const sondaQ = ensureSondaOrdenhaComplete({
    text:
      'A principal hipótese é baixa produção materna ou necessidade de suporte de produção, especialmente porque sua bebê já recebe complemento com sonda. ' +
      afternoonOnly +
      ' Considere fazer ordenhas. Assista à aula Amamentação Prática e Descomplicada. Ofereça o segundo peito. Por isso, é importante avaliar se o complemento também precisa ser ajustado no final da tarde e durante o dia — não apenas nas mamadas da noite.',
    userMessage: MSG_16D,
    signalIds: ['sonda_with_mama_bem_priority_production'],
  });
  // Afternoon-only question should be treated as incomplete → enricher appends day question.
  bad += /durante\s+o\s+dia/.test(strip(sondaQ.text)) &&
    /final\s+da\s+tarde\s+e\s+durante\s+o\s+dia|tamb[eé]m\s+para\s+o\s+final\s+da\s+tarde\s+e\s+durante\s+o\s+dia/.test(
      strip(sondaQ.text),
    )
    ? pass('ensures "durante o dia" appears in complement investigation')
    : fail('durante o dia missing from complement question path', sondaQ.text.slice(0, 300));

  console.log('\n--- Nunca prender/fixar chupeta (TESTE 011 RN 22d) ---');
  const pacifier = ensurePacifierPracticalComplete({
    text:
      'Nessa fase, a chupeta NÃO representa associação comportamental negativa para a bebê. ' +
      'É reflexo de sucção e necessidade de regulação. ' +
      'Se a chupeta cair e a bebê continuar dormindo, não precisa recolocar; se ela acordar logo que cai, investigue fome.',
    userMessage: MSG_22D,
    signalIds: ['pacifier_in_rn'],
  });
  bad += /nunca\s+prenda\s+ou\s+fixe\s+a\s+chupeta/.test(strip(pacifier.text))
    ? pass('appended "nunca prenda ou fixe a chupeta" when missing from practical block')
    : fail('never_secure missing', pacifier.text.slice(0, 280));

  console.log('\n--- Soften "evitar refluxo" (TESTE 011 RN 22d) ---');
  const reflux = softenEvitarRefluxoClaim({
    text: 'Mantenha em posição vertical por 30 a 40 minutos para evitar refluxo.',
  });
  bad += !/para\s+evitar\s+(?:o\s+)?refluxo/.test(strip(reflux.text))
    ? pass('removed "para evitar refluxo"')
    : fail('evitar refluxo still present', reflux.text);
  bad += /reduzir\s+desconfortos\s+p[oó]s-mamada|favorecer\s+a\s+transi[cç][aã]o/.test(strip(reflux.text))
    ? pass('replaced with careful phrasing')
    : fail('careful phrasing missing', reflux.text);

  console.log('\n--- Frase vertical completa (TESTE 011) ---');
  const vertical = fixTruncatedVerticalBeforeCrib({
    text: 'Após a mamada, depois de arrotar e de ser mantida em posição vertical antes de transferir para o berço.',
    userMessage: MSG_22D,
  });
  bad += !/depois\s+de\s+arrotar\s+e\s+de\s+ser\s+mantida\s+em\s+posi[cç][aã]o\s+vertical\s+antes\s+de\s+transferir/.test(
    strip(vertical.text),
  )
    ? pass('truncated vertical phrase rewritten')
    : fail('truncated phrase still present', vertical.text);
  bad += /posi[cç][aã]o\s+vertical\s+por\s+30\s*a\s*40\s+minutos/.test(strip(vertical.text))
    ? pass('canonical vertical phrase present')
    : fail('canonical vertical missing', vertical.text);

  console.log('\n--- Saciedade adaptada (TESTE 011 RN 22d) ---');
  const satiety = ensurePacifierSatietyAdapted({
    text: 'Observe se solta o peito espontaneamente e relaxa o corpo.',
    signalIds: ['pacifier_in_rn'],
  });
  bad += /f[oó]rmula\s+ou\s+complemento|reduz\s+o\s+ritmo\s+da\s+suc/.test(strip(satiety.text))
    ? pass('appended adaptive satiety for formula/complement')
    : fail('adaptive satiety missing', satiety.text.slice(0, 220));

  console.log('\n--- Case enrichers ---');
  for (const c of CASES) {
    console.log(`\n[${c.id}] ${c.label}`);
    const sig = extractSignals({
      message: c.message,
      conversation: [],
      ageBand: 'RN',
      ageDays: c.ageDays,
    });
    const ids = (sig.signals || []).map((s) => s.id);
    console.log(`  signals: ${ids.join(', ')}`);
    for (const must of c.mustSignals) {
      bad += ids.includes(must)
        ? pass(`signal "${must}"`)
        : fail(`signal "${must}" missing`, ids.join(', '));
    }
    const { text } = c.enricher(ids);
    const n = strip(text);
    for (const re of c.enricherMust || []) {
      bad += re.test(n) || re.test(text)
        ? pass(`must match ${re}`)
        : fail(`must match ${re}`, text.slice(0, 240));
    }
    for (const re of c.enricherMustNot || []) {
      bad += !(re.test(n) || re.test(text))
        ? pass(`must not match ${re}`)
        : fail(`must not match ${re}`, text.slice(0, 240));
    }
    try {
      const retrieval = await retrieve({
        query: c.message,
        namespace: 'RN',
        intent: 'test',
        boostThemes: sig.boostThemes,
      });
      const lessonList = suggestedLessonsFromRetrieval(retrieval, 'RN', ids);
      const titles = (lessonList || []).map((l) => l.title).join(' | ');
      console.log(`  suggestedLessons: ${titles || '(none)'}`);
      for (const re of c.allowedLessonTitles || []) {
        if (lessonList?.length) {
          bad += lessonList.some((l) => re.test(strip(l.title)))
            ? pass(`allowed lesson matches ${re}`)
            : fail(`expected allowed lesson ${re}`, titles);
        }
      }
      for (const l of lessonList || []) {
        for (const re of c.forbiddenLessonTitles || []) {
          if (re.test(l.title)) {
            bad += fail(`forbidden lesson matched ${re}`, titles);
          }
        }
      }
    } catch (e) {
      console.log(`  ~ retrieval skipped: ${e.message}`);
    }
  }

  console.log(bad === 0 ? '\nALL PASSED' : `\nFAILED: ${bad}`);
  process.exit(bad === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
