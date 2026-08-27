/**
 * Focused simulation: 56d TESTE 002, 57d TESTE 001, 49d TESTE 003.
 * Layer A = signals + enricher + lesson ranking.
 * Layer B = live processTurn (RUN_LIVE=1).
 */
import { extractSignals } from '../services/signalExtractor.js';
import { enrichThirtySixtyOfficialAnswer } from '../services/thirtySixtyOfficialEnricher.js';
import { suggestedLessonsFromRetrieval } from '../services/fallback.js';
import { processTurn } from '../services/zlayaPipeline.js';

function score(criteria, text, meta = {}) {
  let earned = 0;
  let total = 0;
  const detail = [];
  for (const c of criteria) {
    total += c.w;
    const ok = !!c.pass(text, meta);
    if (ok) earned += c.w;
    detail.push({ id: c.id, w: c.w, pass: ok });
  }
  return { score: total ? Math.round((earned / total) * 1000) / 10 : 0, detail };
}

function lessonMeta(lessons) {
  return {
    lessonsText: (lessons || []).map((l) => `${l.id || ''} ${l.title || ''}`).join(' | '),
    lessonIds: (lessons || []).map((l) => l.id || l),
  };
}

const CASES = [
  {
    id: '56d-t002',
    ageDays: 56,
    babyName: 'Pedro',
    sex: 'm',
    officialNote: 9.5,
    message:
      'Bebe de 56 dias. Posso colocar no berço e esperar ele dormir sozinho, se não estiver chorando? Ou preciso colocar ele em sono leve ? Ou em sono profundo?',
    draft: `É normal que, aos 56 dias, você tenha dúvidas sobre como colocar o bebê para dormir. A boa notícia é que, se ele estiver tranquilo e sem chorar, você pode colocá-lo acordado no berço e dar a oportunidade de adormecer ali. Não é necessário esperar que ele esteja em sono leve ou profundo.

Se ele começar a ficar irritado ou chorar, você pode acalmá-lo e seguir a condução do sono, sem exigir que ele adormeça sozinho nesse momento. Se ele adormecer mamando, pode ir já dormindo para o berço, sem a necessidade de acordá-lo.

Para entender melhor a situação, gostaria de saber como você tem realizado a condução do sono e se já está utilizando a estratégia do travesseiro. Isso pode ajudar a ajustar a abordagem.

Para mais informações sobre a adaptação ao berço, você pode conferir a aula sobre a estratégia do travesseiro no aplicativo.`,
    expectedSignal: 'crib_awake_start_30_60',
    forbiddenSignals: ['crib_adaptation_same_day_30_60', 'night_start_19_20_30_60'],
    mustLessons: ['lesson-travesseiro'],
    mustNotLessons: [
      'lesson-30-60-passo-2-estimulos',
      'lesson-30-60-passo-3-janela',
      'lesson-30-60-passo-4-rotina',
      'lesson-ruido-branco',
    ],
    retrievalDump: [
      'lesson-30-60-passo-2-estimulos',
      'lesson-30-60-passo-3-janela',
      'lesson-30-60-passo-4-rotina',
      'lesson-travesseiro',
      'lesson-ruido-branco',
    ],
    criteria: [
      { id: 'no_fallback', w: 10, pass: (t) => !/n[aã]o encontrei orienta[cç][aã]o suficiente/i.test(t) },
      { id: 'awake_ok', w: 15, pass: (t) => /acordad/i.test(t) && /ber[cç]o/i.test(t) },
      { id: 'not_required_stage', w: 15, pass: (t) => /n[aã]o [eé] necess[aá]rio esperar|sono leve ou profundo/i.test(t) },
      { id: 'soothe_if_cry', w: 10, pass: (t) => /irritad|chorar|acalma/i.test(t) },
      { id: 'feed_asleep', w: 15, pass: (t) => /j[aá] dormindo|adormecer mamando/i.test(t) },
      { id: 'travesseiro_aula', w: 15, pass: (t) => /aula.{0,80}travesseiro/i.test(t) },
      { id: 'keep_travesseiro', w: 10, pass: (t) => /estrat[eé]gia do travesseiro/i.test(t) },
      { id: 'no_transicao_generica', w: 10, pass: (t) => !/ajudar na transi[cç][aã]o/i.test(t) },
      { id: 'travesseiro_purpose', w: 10, pass: (t) => /tamb[eé]m pode ajudar na condu[cç][aã]o e na coloca[cç][aã]o do beb[eê] no ber[cç]o/i.test(t) && /seguran[cç]a/i.test(t) },
      { id: 'aula_once', w: 10, pass: (t) => ((t.match(/aula.{0,80}(travesseiro|estrat[eé]gia)|aula correspondente|confira a aula|assista [àa] aula|revise a aula/gi) || []).length <= 1) },
    ],
  },
  {
    id: '57d-t001',
    ageDays: 57,
    babyName: 'Lara',
    sex: 'f',
    officialNote: 6.5,
    message:
      'Oi! Bebê de 57 dias. Estou ensinando a adormecer direto no berço progressivamente... começo com sono da manhã e estou avançando gradativamente para as outras sonecas, até chegar no sono noturno. O indicado é ir progressivamente ou deveria tentar em todas as sonecas de uma vez? Além disso, em algumas tentativas, há choro e fico uns 10 min tentando acalmá-la. Quando não resolve, pego no colo, acalmo e refaço o processo novamente... O caminho é esse mesmo?',
    draft: `É normal que, aos 57 dias, você esteja ensinando seu bebê a adormecer no berço. Essa adaptação é um processo gradual e respeitar o ritmo do bebê é fundamental.
A orientação prática segura é que você pode avançar progressivamente, começando pelas sonecas diurnas e, conforme o bebê se adapta, ir para as sonecas da tarde e, por fim, para o sono noturno. Quando houver choro, utilize a contenção firme e aguarde a resposta do bebê sem cronometrar o tempo. Se o choro persistir e você precisar pegá-lo no colo para acalmá-lo, isso é aceitável. O importante é que ele se sinta seguro e confortável.
Para refinar sua abordagem, gostaria de saber: quanto tempo seu bebê permanece acordado antes das sonecas? E como você está realizando a estratégia do travesseiro?
O horário saudável e recomendado para o início do sono noturno é entre 19h e 20h.
A família pode organizar conforme sua dinâmica, mas iniciar o sono noturno por volta de 21h30 ou 22h não é o recomendado.
A janela de vigília pode variar entre 45 minutos a 1 hora e 15 minutos. Observe a que horas termina a última soneca e há quanto tempo está acordado.`,
    expectedSignal: 'crib_adaptation_same_day_30_60',
    forbiddenSignals: ['crib_awake_start_30_60', 'night_start_19_20_30_60'],
    mustLessons: ['lesson-travesseiro', 'lesson-30-60-passo-3-janela'],
    mustNotLessons: [
      'lesson-30-60-passo-2-estimulos',
      'lesson-30-60-passo-4-rotina',
      'lesson-ruido-branco',
    ],
    retrievalDump: [
      'lesson-30-60-passo-2-estimulos',
      'lesson-30-60-passo-3-janela',
      'lesson-30-60-passo-4-rotina',
      'lesson-travesseiro',
      'lesson-ruido-branco',
    ],
    criteria: [
      { id: 'same_day', w: 25, pass: (t) => /mesmo dia|daquele dia|todas as demais sonecas/i.test(t) },
      { id: 'not_progressive_days', w: 20, pass: (t) => !/avan[cç]ar progressivamente.{0,80}sonecas da tarde/i.test(t) },
      { id: 'no_night_start_leak', w: 15, pass: (t) => !/21h30 ou 22h n[aã]o [eé] o recomendado/i.test(t) },
      { id: 'resistance_loop', w: 15, pass: (t) => /colo/i.test(t) && /ber[cç]o/i.test(t) },
      { id: 'no_timer', w: 10, pass: (t) => /n[aã]o cronometr|sem cronometrar|sem tempo predeterminado/i.test(t) },
      { id: 'wake_ref', w: 10, pass: (t) => /45\s*min/i.test(t) && /1 hora e 15|1h15/i.test(t) },
      { id: 'no_paciencia_vaga', w: 10, pass: (t) => !/paci[eê]ncia e respeitar a resposta/i.test(t) },
      { id: 'consistency', w: 10, pass: (t) => /mantenha o processo com consist[eê]ncia e repeti[cç][aã]o/i.test(t) && /acolhendo o choro/i.test(t) },
      { id: 'no_boa_estrategia', w: 10, pass: (t) => !/pode ser uma boa estrat[eé]gia/i.test(t) },
    ],
  },
  {
    id: '49d-t003',
    ageDays: 49,
    babyName: 'Pedro',
    sex: 'm',
    officialNote: 9.2,
    message:
      'Meu bebê tem 1 mês e 19 dias, as sonecas duram uma média de 30 min, no máximo, em exceção, chega a durar 1h. No entanto, por vezes ele tem despertares durante as sonecas. Ele usa chupeta. Preciso ajustar algo?',
    draft: `É comum que bebês de 49 dias tenham sonecas que variam em duração, e sonecas de cerca de 30 minutos podem ocorrer nesta faixa etária. É importante observar que a duração das sonecas pode ser influenciada por fatores como a janela de vigília e a alimentação.

Para ajustar a situação, recomendo que você observe a janela de vigília do seu bebê, que deve ser de 45 minutos a 1 hora e 15 minutos. Se você perceber que ele está acordando após 30 minutos, pode ser útil iniciar a condução do sono um pouco antes, respeitando essa janela. Além disso, observe se os despertares coincidem com a queda da chupeta. Se não houver essa relação, a chupeta pode não ser a causa principal dos despertares.

Gostaria de saber como está a alimentação dele e os intervalos entre as mamadas. Além disso, quanto tempo ele costuma demorar para adormecer depois de ser colocado no berço?

Como ele usa chupeta, vale observar se os despertares acontecem justamente quando ela cai. Antes disso, observe como o bebê acorda da soneca: tranquilo, chorando, buscando peito ou com desconforto. Avalie alimentação/saciedade e só então, se a queda da chupeta coincidir com o despertar, ajuste a condução da sucção.`,
    expectedSignal: 'short_naps_pacifier_mention_30_60',
    forbiddenSignals: ['crib_awake_start_30_60', 'crib_adaptation_same_day_30_60'],
    mustLessons: ['lesson-30-60-sinais-sono', 'lesson-30-60-passo-3-janela'],
    mustNotLessons: ['lesson-travesseiro'],
    retrievalDump: [
      'lesson-travesseiro',
      'lesson-30-60-sinais-sono',
      'lesson-30-60-passo-3-janela',
      'lesson-30-60-passo-2-estimulos',
    ],
    criteria: [
      { id: 'pacifier_not_primary', w: 25, pass: (t) => !/principal hip[oó]tese.{0,120}chupeta/i.test(t) },
      { id: 'no_invented_irritado', w: 20, pass: (t) => !/acordando irritad|acorda irritad/i.test(t) },
      { id: 'no_early_from_30min', w: 20, pass: (t) => !/acordando ap[oó]s 30 minutos.{0,80}iniciar a condu[cç][aã]o.{0,40}antes/i.test(t) },
      { id: 'investigate_wake', w: 25, pass: (t) => /acordad[oa] antes das sonecas|tempo .{0,20}vig[ií]lia|permanece acordad/i.test(t) },
      { id: 'wake_ref', w: 20, pass: (t) => /45\s*min/i.test(t) && /1 hora e 15|1h15/i.test(t) },
    ],
  },
];

let failed = 0;
function check(ok, name, detail) {
  if (ok) console.log(`  PASS  ${name}`);
  else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('\n=== Layer A: signals + lesson ranking + enricher ===\n');

for (const c of CASES) {
  console.log(`-- ${c.id} (official ${c.officialNote}/10) --`);
  const signals = extractSignals({ message: c.message, ageBand: '30_60', ageDays: c.ageDays });
  const ids = (signals.signals || []).map((s) => s.id);
  check(ids.includes(c.expectedSignal), `${c.id} signal ${c.expectedSignal}`, ids.join(', '));
  for (const bad of c.forbiddenSignals || []) {
    check(!ids.includes(bad), `${c.id} not ${bad}`, ids.join(', '));
  }

  const ranked = suggestedLessonsFromRetrieval(
    { chunks: [{ chunk: { relatedLessons: c.retrievalDump } }] },
    '30_60',
    ids,
  );
  const rankedIds = ranked.map((l) => l.id);
  for (const id of c.mustLessons) {
    check(rankedIds.includes(id), `${c.id} lesson ${id}`, rankedIds.join(', ') || '—');
  }
  for (const id of c.mustNotLessons) {
    check(!rankedIds.includes(id), `${c.id} no lesson ${id}`, rankedIds.join(', ') || '—');
  }

  const before = score(c.criteria, c.draft);
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: c.draft,
    message: c.message,
    signals,
    babyProfile: { babyName: c.babyName, ageDays: c.ageDays, sex: c.sex },
  });
  const after = score(c.criteria, enriched.text);
  const failA = after.detail.filter((d) => !d.pass).map((d) => d.id);
  check(failA.length === 0, `${c.id} enricher ${after.score}/100 (was ${before.score})`, failA.join(', '));
  if (failA.length) {
    console.log('    snippet:', enriched.text.slice(0, 240).replace(/\s+/g, ' '));
  }
}

const RUN_LIVE = process.env.RUN_LIVE !== '0';
if (RUN_LIVE) {
  console.log('\n=== Layer B: live processTurn ===\n');
  for (const c of CASES) {
    console.log(`-- ${c.id} live --`);
    try {
      const result = await processTurn({
        conversationId: `sim-focus-${c.id}-${Date.now()}`,
        message: c.message,
        babyProfile: { motherName: 'Ana', babyName: c.babyName, ageDays: c.ageDays, sex: c.sex },
        conversation: [],
      });
      const text = result?.response?.text || '';
      const lessons = result?.response?.suggestedLessons || [];
      const meta = lessonMeta(lessons);
      const after = score(c.criteria, text, meta);
      const failA = after.detail.filter((d) => !d.pass).map((d) => d.id);
      const lessonIds = meta.lessonIds;
      console.log('  route:', result?.route?.path || result?.route);
      console.log('  lessons:', lessonIds.join(', ') || '—');
      console.log('  text:', text.replace(/\s+/g, ' '));
      check(failA.length === 0, `${c.id} live rubric ${after.score}/100`, failA.join(', '));
      for (const id of c.mustLessons) {
        check(lessonIds.includes(id), `${c.id} live lesson ${id}`, lessonIds.join(', ') || '—');
      }
      for (const id of c.mustNotLessons) {
        check(!lessonIds.includes(id), `${c.id} live no lesson ${id}`, lessonIds.join(', ') || '—');
      }
    } catch (err) {
      failed += 1;
      console.log(`  ERROR  ${c.id} live: ${err.message}`);
    }
  }
} else {
  console.log('\n(Set RUN_LIVE=1 for live processTurn; default is live. RUN_LIVE=0 skips.)\n');
}

console.log(`\nSUMMARY: ${failed === 0 ? 'ALL PASS' : `${failed} failed`}\n`);
process.exit(failed ? 1 : 0);
