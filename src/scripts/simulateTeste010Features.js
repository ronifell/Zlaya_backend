#!/usr/bin/env node
/**
 * Focused simulation — verifies TESTE 010 feature implementations:
 *   RN 13d  banho + almofadas → barriguinha central, no-hunger-onset,
 *             sem pediatra em queixa isolada.
 *   RN 16d  sonda + mama bem + busca <2h → sem normalização de abertura,
 *             fraseologia canônica da hipótese de produção (não regredir 009).
 *   RN 19d  Travesseiro + colo → lista fechada com frase completa,
 *             saciedade sem back-reference dupla, sonecas no colo fortes,
 *             orientação direta de arroto, Charutinho na lista textual
 *             (não regredir 009).
 *
 * Run: node src/scripts/simulateTeste010Features.js
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractSignals } from '../services/signalExtractor.js';
import { retrieve } from '../services/retrieval.js';
import { suggestedLessonsFromRetrieval } from '../services/fallback.js';
import {
  ensureBanhoBarriguinhaCentralAction,
  ensureBanhoNoStartAtHungerOnset,
  ensureNoPediatraOnPureBathCase,
  ensureSondaNoOpeningNormalization,
  ensureProducaoCanonicalPhrasing,
  ensureTravesseiroListClosingSentence,
  fixTravesseiroSatietyDoubleBackReference,
  ensureTravesseiroSonecasNoColoPhrase,
  ensureTravesseiroDirectArrotoInstruction,
  ensureCharutinhoInTextualLessonList,
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

const MSG_13D_BATH =
  'Olá, meu bebê tem 13 dias, percebi que ele chora muuuuuito na hora do banho e ainda uso ' +
  'aquelas almofadas para dar mais segurança e conforto. O que eu poderia fazer para diminuir esse choro?';

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
    id: 'RN-13d-banho-teste010',
    label: 'TESTE 010 RN 13d — choro no banho (barriguinha central + no-hunger-onset)',
    ageDays: 13,
    message: MSG_13D_BATH,
    mustSignals: ['bath_crying_rn', 'bath_crying_isolated_rn'],
    allowedLessonTitles: [/passo\s+1|prepare\s+o\s+ambiente/i],
    forbiddenLessonTitles: [
      /mamadas\s+efetivas/i,
      /hora\s+da\s+bruxa/i,
      /colicas|cólicas/i,
      /inicio\s+do\s+sono|início\s+do\s+sono/i,
      /troca.*dia.*noite/i,
    ],
    enricher: (ids) => {
      let text =
        'É comum RN chorarem no banho. Experimente a posição de barriguinha para baixo apoiada no braço. ' +
        'Escolha um momento em que ele não esteja com muita fome. Se o choro persistir, consulte o pediatra.';
      text = ensureBanhoBarriguinhaCentralAction({ text, signalIds: ids }).text;
      text = ensureBanhoNoStartAtHungerOnset({ text, signalIds: ids }).text;
      text = ensureNoPediatraOnPureBathCase({ text, signalIds: ids, userMessage: MSG_13D_BATH }).text;
      return { text };
    },
    enricherMust: [
      /inicie\s+o\s+banho\s+com\s+o\s+beb[eê]\s+de\s+barriguinha\s+para\s+baixo/,
      /(?:n[aã]o\s+inici(?:e|ar)|evite\s+iniciar)\s+o\s+banho\s+(?:nem\s+)?no\s+in[ií]cio\s+da\s+fome/,
    ],
    enricherMustNot: [
      /experimente\s+a\s+posi[cç][aã]o\s+de\s+barriguinha\s+para\s+baixo/,
      /n[aã]o\s+esteja\s+com\s+muita\s+fome/,
      /se\s+o\s+choro\s+persistir,?\s+consulte\s+o\s+pediatra/,
    ],
  },
  {
    id: 'RN-16d-sonda-teste010',
    label: 'TESTE 010 RN 16d — sonda + mama bem (abertura sem normalização + fraseologia canônica)',
    ageDays: 16,
    message: MSG_16D,
    mustSignals: ['sonda_with_mama_bem_priority_production', 'short_feeding_interval'],
    allowedLessonTitles: [/amamentacao pratica/i, /mamadas efetivas/i],
    forbiddenLessonTitles: [/inicio do sono/i, /troca.*dia.*noite/i],
    enricher: (ids) => {
      let text =
        'É esperado que o bebê busque o peito frequentemente e é normal nessa fase. ' +
        'A principal hipótese é baixa produção materna ou necessidade de suporte de produção ou menor produção materna. ' +
        'Se ele mama no peito, ofereça novamente. Ele continua procurando o peito em pouco tempo. ' +
        'Após a mamada, respeitando o tempo em posição vertical já orientado antes de transferir para o berço.';
      // TESTE 009 guards (não regredir)
      text = ensureIctericiaHistoricalOnly({ text, signalIds: ids, userMessage: MSG_16D }).text;
      text = ensureSondaNoOverNormalization({ text, signalIds: ids }).text;
      text = ensureSondaOrdenhaComplete({ text, userMessage: MSG_16D, signalIds: ids }).text;
      text = enforceGenderConsistency({ text, userMessage: MSG_16D }).text;
      text = dedupeVerticalThirtyForty({ text, userMessage: MSG_16D }).text;
      text = fixVerticalBackReferenceFragment({ text, userMessage: MSG_16D }).text;
      // TESTE 010 guards
      text = ensureSondaNoOpeningNormalization({ text, signalIds: ids }).text;
      text = ensureProducaoCanonicalPhrasing({ text }).text;
      return { text };
    },
    enricherMust: [
      /baixa\s+produ[cç][aã]o\s+materna\s+ou\s+necessidade\s+de\s+suporte\s+de\s+produ[cç][aã]o/,
      /complemento\s+com\s+sonda/,
      /amamentac[aã]o\s+pr[aá]tica/,
    ],
    enricherMustNot: [
      /e\s+esperado\s+que\s+o\s+beb[eê]\s+busque\s+o\s+peito\s+frequentemente/,
      /suporte\s+de\s+produ[cç][aã]o\s+ou\s+menor\s+produ[cç][aã]o\s+materna/,
      /\bse ele mama\b/,
      /\bele continua\b/,
      /respeitando o tempo em posicao vertical ja orientado antes de transferir/,
    ],
  },
  {
    id: 'RN-19d-travesseiro-teste010',
    label: 'TESTE 010 RN 19d — Travesseiro + colo (redação limpa: lista, saciedade, sonecas, arroto, charutinho)',
    ageDays: 19,
    message: MSG_19D,
    mustSignals: ['travesseiro_tried_without_success'],
    allowedLessonTitles: [/mamadas\s+efetivas/i, /travesseiro/i, /ber[cç]o/i],
    forbiddenLessonTitles: [/inicio\s+do\s+sono/i, /troca.*dia.*noite/i],
    enricher: (ids) => {
      let text =
        "As aulas que podem te ajudar são: 'Estratégia do Travesseiro', 'Berço do Bebê', 'Estimule o Arroto' e 'Mamadas Efetivas'." +
        'Após a mamada, depois de arrotar e de ser mantida em posição vertical antes de transferir para o berço. ' +
        'Utilize o travesseiro sobre o colo. Observe se há necessidade de arroto. ' +
        'Se houver reflexo de Moro, use o charutinho também durante o dia. ' +
        'Ela permanece mais confortável depois do arroto e da depois de arrotar e de ser mantida em posição vertical.';
      // TESTE 009 guards (não regredir)
      text = ensureBehavioralBerçoReframing({ text, signalIds: ids }).text;
      text = ensureTravesseiroFeedingAxisComplete({ text, signalIds: ids }).text;
      text = ensureNoGenericSupportInTravesseiroCase({ text, signalIds: ids }).text;
      text = enforceGenderConsistency({ text, userMessage: MSG_19D }).text;
      // TESTE 010 guards
      text = ensureTravesseiroListClosingSentence({ text, signalIds: ids, userMessage: MSG_19D }).text;
      text = fixTravesseiroSatietyDoubleBackReference({ text, userMessage: MSG_19D }).text;
      text = ensureTravesseiroSonecasNoColoPhrase({ text, signalIds: ids, userMessage: MSG_19D }).text;
      text = ensureTravesseiroDirectArrotoInstruction({ text, signalIds: ids, userMessage: MSG_19D }).text;
      text = ensureCharutinhoInTextualLessonList({ text, signalIds: ids }).text;
      return { text };
    },
    enricherMust: [
      /mantenha\s+a\s+beb[eê]\s+em\s+posi[cç][aã]o\s+vertical\s+por\s+30\s*a\s*40\s+minutos,?\s+observe\s+se\s+ela\s+arrotou/,
      /permanece\s+mais\s+confort[aá]vel\s+depois\s+do\s+arroto\s+e\s+ap[óo]s\s+ser\s+mantida\s+em\s+posi[cç][aã]o\s+vertical/,
      /muitas\s+sonecas\s+podem\s+acontecer\s+com\s+a\s+beb[eê]\s+no\s+travesseiro\s+em\s+cima\s+do\s+colo/,
      /coloque\s+para\s+arrotar\s+e\s+observe\s+se\s+ela\s+fica\s+mais\s+confort[aá]vel\s+depois\s+do\s+arroto/,
      /charutinho\s+e\s+os\s+reflexos\s+de\s+moro/,
    ],
    enricherMustNot: [
      /mamadas\s+efetivas['"]?\.\s*ap[óo]s\s+a\s+mamada,\s+depois\s+de\s+arrotar\s+e\s+de\s+ser\s+mantid[oa]\s+em\s+posi[cç][aã]o\s+vertical\s+antes\s+de\s+transferir/,
      /depois\s+do\s+arroto\s+e\s+da\s+depois\s+de\s+arrotar/,
      /observ(?:e|ar)\s+se\s+h[aá]\s+necessidade\s+de\s+arroto/,
      /\bse\s+transi[cç][aã]o\b/,
      /nao hesite em buscar suporte/,
    ],
  },
];

async function main() {
  console.log('ZLAYA — Simulation: TESTE 010 feature verification');
  let bad = 0;

  console.log('\n--- Infrastructure rules (TESTE 010) ---');
  const rules = JSON.parse(
    readFileSync(path.join(__dirname, '..', 'knowledge', 'rn', 'rules.json'), 'utf-8'),
  );
  for (const id of [
    'rn-teste010-banho-barriguinha-como-acao-central',
    'rn-teste010-banho-nao-iniciar-no-inicio-da-fome',
    'rn-teste010-banho-nao-indicar-pediatra',
    'rn-teste010-sonda-no-over-normalization-abertura',
    'rn-teste010-producao-fraseologia-canonica',
    'rn-teste010-dedupe-blocos-orientacao',
    'rn-teste010-travesseiro-lista-fecha-com-frase-completa',
    'rn-teste010-travesseiro-satiety-back-reference-fix',
    'rn-teste010-travesseiro-sonecas-no-colo-nos-primeiros-dias',
    'rn-teste010-travesseiro-arroto-orientacao-direta',
    'rn-teste010-travesseiro-charutinho-lista-textual',
  ]) {
    bad += rules.fixedRules.some((r) => r.id === id)
      ? pass(`rule "${id}" present`)
      : fail(`rule "${id}" missing`);
  }

  console.log('\n--- TESTE 009 non-regression rules ---');
  for (const id of [
    'rn-teste009-ictericia-linguinha-historical-only',
    'rn-teste009-sonda-busca-investigate-production',
    'rn-teste009-travesseiro-reframing-contextual',
    'rn-teste009-no-generic-human-support-travesseiro',
  ]) {
    bad += rules.fixedRules.some((r) => r.id === id)
      ? pass(`rule "${id}" still present`)
      : fail(`rule "${id}" missing — regression`);
  }

  console.log('\n--- Barriguinha para baixo como ação central (TESTE 010 RN 13d) ---');
  const barriguinha = ensureBanhoBarriguinhaCentralAction({
    text: 'Experimente a posição de barriguinha para baixo apoiada no braço.',
    signalIds: ['bath_crying_rn', 'bath_crying_isolated_rn'],
  });
  bad += /inicie\s+o\s+banho\s+com\s+o\s+beb[eê]\s+de\s+barriguinha\s+para\s+baixo/.test(strip(barriguinha.text))
    ? pass('rewrote "experimente a posição" → "inicie o banho ... barriguinha para baixo"')
    : fail('barriguinha central rewrite', barriguinha.text.slice(0, 160));

  console.log('\n--- Não iniciar no início da fome (TESTE 010 RN 13d) ---');
  const hungerFix = ensureBanhoNoStartAtHungerOnset({
    text: 'Escolha um momento em que ele não esteja com muita fome.',
    signalIds: ['bath_crying_rn'],
  });
  const hn = strip(hungerFix.text);
  bad += !/n[aã]o\s+esteja\s+com\s+muita\s+fome/.test(hn)
    ? pass('removed permissive "não esteja com muita fome"')
    : fail('permissive hunger phrase still present', hungerFix.text);
  bad += /(?:n[aã]o\s+inici(?:e|ar)|evite\s+iniciar)\s+o\s+banho\s+(?:nem\s+)?no\s+in[ií]cio\s+da\s+fome/.test(hn)
    ? pass('added canonical "não iniciar/evite iniciar o banho no início da fome"')
    : fail('canonical hunger phrase missing', hungerFix.text);

  console.log('\n--- Sem pediatra em queixa isolada de banho (TESTE 010 RN 13d) ---');
  const pediatraFix = ensureNoPediatraOnPureBathCase({
    text: 'Uma orientação prática. Se o choro persistir, consulte o pediatra. Mantenha ambiente aquecido.',
    signalIds: ['bath_crying_rn', 'bath_crying_isolated_rn'],
    userMessage: MSG_13D_BATH,
  });
  bad += !/se\s+o\s+choro\s+persistir,?\s+consulte\s+o\s+pediatra/.test(strip(pediatraFix.text))
    ? pass('removed generic "consulte o pediatra" from body')
    : fail('generic pediatra still present', pediatraFix.text);
  // Should preserve conditional pediatra when there are clinical signs in the message
  const pediatraKeep = ensureNoPediatraOnPureBathCase({
    text: 'Se o choro persistir com febre e recusa alimentar, consulte o pediatra.',
    signalIds: ['bath_crying_rn', 'bath_crying_isolated_rn'],
    userMessage: 'Meu bebê tem febre e recusa mamar.',
  });
  bad += /consulte\s+o\s+pediatra/.test(strip(pediatraKeep.text))
    ? pass('keeps pediatra when clinical signs in mother message')
    : fail('pediatra removed even with clinical signs — false positive', pediatraKeep.text);

  console.log('\n--- Sonda: sem normalização de abertura (TESTE 010 RN 16d) ---');
  const sondaOpening = ensureSondaNoOpeningNormalization({
    text: 'É esperado que o bebê busque o peito frequentemente e é normal nessa fase. O restante da resposta segue.',
    signalIds: ['sonda_with_mama_bem_priority_production'],
  });
  const so = strip(sondaOpening.text);
  bad += !/e\s+esperado\s+que\s+o\s+beb[eê]\s+busque\s+o\s+peito\s+frequentemente/.test(so)
    ? pass('removed opening normalization phrase')
    : fail('opening normalization still present', sondaOpening.text.slice(0, 200));
  bad += /baixa\s+produ[cç][aã]o\s+materna\s+ou\s+necessidade\s+de\s+suporte\s+de\s+produ[cç][aã]o/.test(so)
    ? pass('replaced with canonical hypothesis opening')
    : fail('canonical hypothesis missing', sondaOpening.text);

  console.log('\n--- Fraseologia canônica da produção (TESTE 010 RN 16d) ---');
  const producao = ensureProducaoCanonicalPhrasing({
    text: 'A principal hipótese é baixa produção materna ou necessidade de suporte de produção ou menor produção materna.',
  });
  bad += !/suporte\s+de\s+produc[aã]o\s+ou\s+menor\s+produc[aã]o\s+materna/.test(strip(producao.text))
    ? pass('removed redundant tail "ou menor produção materna"')
    : fail('redundant tail still present', producao.text);

  console.log('\n--- Travesseiro: lista fecha com frase completa (TESTE 010 RN 19d) ---');
  const listFix = ensureTravesseiroListClosingSentence({
    text:
      "As aulas que podem te ajudar são: 'Estratégia do Travesseiro', 'Berço do Bebê', 'Estimule o Arroto' e 'Mamadas Efetivas'." +
      'Após a mamada, depois de arrotar e de ser mantida em posição vertical antes de transferir para o berço.',
    signalIds: ['travesseiro_tried_without_success'],
    userMessage: MSG_19D,
  });
  const lf = strip(listFix.text);
  bad += !/mamadas\s+efetivas['"]?\.\s*ap[óo]s\s+a\s+mamada,\s+depois\s+de\s+arrotar\s+e\s+de\s+ser\s+mantida\s+em\s+posi[cç][aã]o\s+vertical\s+antes\s+de\s+transferir/.test(lf)
    ? pass('broken tail rewritten')
    : fail('broken tail still present', listFix.text.slice(0, 200));
  bad += /mantenha\s+a\s+beb[eê]\s+em\s+posi[cç][aã]o\s+vertical\s+por\s+30\s*a\s*40\s+minutos,?\s+observe\s+se\s+ela\s+arrotou/.test(lf)
    ? pass('canonical closing sentence present')
    : fail('canonical closing sentence missing', listFix.text.slice(0, 220));

  console.log('\n--- Travesseiro: back-reference dupla saciedade (TESTE 010 RN 19d) ---');
  const backRef = fixTravesseiroSatietyDoubleBackReference({
    text: 'Ela permanece mais confortável depois do arroto e da depois de arrotar e de ser mantida em posição vertical.',
    userMessage: MSG_19D,
  });
  const br = strip(backRef.text);
  bad += !/depois\s+do\s+arroto\s+e\s+da\s+depois\s+de\s+arrotar/.test(br)
    ? pass('double back-reference removed')
    : fail('double back-reference still present', backRef.text);
  bad += /depois\s+do\s+arroto\s+e\s+ap[óo]s\s+ser\s+mantida\s+em\s+posi[cç][aã]o\s+vertical\s+por\s+30\s*a\s*40\s+minutos/.test(br)
    ? pass('canonical satiety back-reference present')
    : fail('canonical satiety back-reference missing', backRef.text);

  console.log('\n--- Travesseiro: frase forte de sonecas no colo (TESTE 010 RN 19d) ---');
  const sonecas = ensureTravesseiroSonecasNoColoPhrase({
    text: 'Utilize o travesseiro sobre o colo.',
    signalIds: ['travesseiro_tried_without_success'],
    userMessage: MSG_19D,
  });
  bad += /muitas\s+sonecas\s+podem\s+acontecer\s+com\s+a\s+beb[eê]\s+no\s+travesseiro\s+em\s+cima\s+do\s+colo/.test(strip(sonecas.text))
    ? pass('sonecas-no-colo strong phrase appended')
    : fail('sonecas-no-colo strong phrase missing', sonecas.text.slice(0, 220));

  console.log('\n--- Travesseiro: orientação direta de arroto (TESTE 010 RN 19d) ---');
  const arroto = ensureTravesseiroDirectArrotoInstruction({
    text: 'Observe se há necessidade de arroto.',
    signalIds: ['travesseiro_tried_without_success'],
    userMessage: MSG_19D,
  });
  const ar = strip(arroto.text);
  bad += !/observ(?:e|ar)\s+se\s+h[aá]\s+necessidade\s+de\s+arroto/.test(ar)
    ? pass('timid arroto instruction removed')
    : fail('timid arroto instruction still present', arroto.text);
  bad += /coloque\s+para\s+arrotar\s+e\s+observe\s+se\s+ela\s+fica\s+mais\s+confort[aá]vel\s+depois\s+do\s+arroto/.test(ar)
    ? pass('direct arroto instruction present')
    : fail('direct arroto instruction missing', arroto.text);

  console.log('\n--- Travesseiro: Charutinho na lista textual (TESTE 010 RN 19d) ---');
  const charutinhoList = ensureCharutinhoInTextualLessonList({
    text:
      "As aulas que podem te ajudar são: 'Estratégia do Travesseiro', 'Berço do Bebê', 'Estimule o Arroto' e 'Mamadas Efetivas'. " +
      'Se houver reflexo de Moro ou desorganização corporal, use o charutinho.',
    signalIds: ['travesseiro_tried_without_success'],
  });
  bad += /charutinho\s+e\s+os\s+reflexos\s+de\s+moro/.test(strip(charutinhoList.text))
    ? pass('Charutinho e os Reflexos de Moro added to textual list')
    : fail('Charutinho not added to textual list', charutinhoList.text.slice(0, 240));

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
      bad += re.test(n) ? pass(`enricher must: ${re}`) : fail(`enricher must: ${re}`, text.slice(0, 200));
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
