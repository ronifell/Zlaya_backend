/**
 * Official 30–60 dossiers regression (Layer A + optional Layer B).
 * Does not touch RN knowledge.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSystemPrompt } from '../prompts/systemPrompt.js';
import { extractSignals } from '../services/signalExtractor.js';
import { processTurn } from '../services/zlayaPipeline.js';
import { suggestedLessonsFromRetrieval } from '../services/fallback.js';
import { enrichThirtySixtyOfficialAnswer } from '../services/thirtySixtyOfficialEnricher.js';
import { applyThirtySixtyIntentOverrides } from '../services/intentClassifier.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const K = path.join(__dirname, '..', 'knowledge', '30_60');

const rules = JSON.parse(readFileSync(path.join(K, 'rules.json'), 'utf8'));
const chunks = JSON.parse(readFileSync(path.join(K, 'chunks.json'), 'utf8'));
const forbidden = JSON.parse(readFileSync(path.join(K, 'forbidden.json'), 'utf8'));

let passed = 0;
let failed = 0;
function pass(name) {
  passed += 1;
  console.log(`  PASS  ${name}`);
}
function fail(name, detail) {
  failed += 1;
  console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}
function assert(cond, name, detail) {
  if (cond) pass(name);
  else fail(name, detail);
}

function strip(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

console.log('\n=== Layer A: knowledge + prompt + signals ===\n');

assert(
  rules.fixedRules.some((r) => /45 minutos a 1 hora/i.test(r.rule)),
  'rule: janela 45min–1h',
);
assert(
  !rules.fixedRules.some((r) => /minimo de 4 a 5 sonecas|mínimo de 4 a 5 sonecas/i.test(r.rule) && !/NAO imponha|NÃO imponha/i.test(r.rule)),
  'rule: no hard min 4–5 naps',
);
assert(
  rules.fixedRules.some((r) => /20 a 30 minutos/i.test(r.rule)),
  'rule: vertical 20–30',
);
assert(
  rules.fixedRules.some((r) => /NAO classifica|NÃO classifica/i.test(r.rule) && /mau habito|mau hábito/i.test(r.rule)),
  'rule: no mau hábito 0–3m',
);
assert(
  rules.fixedRules.some((r) => /19h e 20h|19h a 20h/i.test(r.rule)),
  'rule: night start 19–20h',
);
assert(
  rules.fixedRules.some((r) => /90 a 120 ml/i.test(r.rule)),
  'rule: bottle 90–120 ml contextual',
);

const janelaChunk = chunks.chunks.find((c) => c.id === '30-60-chunk-janela-sono-sonecas');
assert(janelaChunk && /45 minutos a 1 hora/i.test(janelaChunk.text), 'chunk janela text');
assert(janelaChunk && /NAO imponha um minimo|NÃO imponha um mínimo/i.test(janelaChunk.text), 'chunk rejects min naps mandate');
assert(janelaChunk && /NAO permita soneca diurna de ate 3 horas/i.test(janelaChunk.text), 'chunk janela rejects 3h nap');
assert(janelaChunk && /10 a 15 min/i.test(janelaChunk.text), 'chunk janela micro-nap reconduce');

const ceciliaChunk = chunks.chunks.find((c) => c.id === '30-60-chunk-caso-cecilia');
assert(
  ceciliaChunk && !ceciliaChunk.intent.includes('dificuldade_para_dormir') && !ceciliaChunk.intent.includes('adaptacao_ao_berco'),
  'chunk cecilia not auto-retrieved on ordinary day-sleep difficulty',
);
const refluxChunk = chunks.chunks.find((c) => c.id === '30-60-chunk-refluxo-oculto-aplv-60d');
assert(refluxChunk && /ronquinho/i.test(refluxChunk.text), 'chunk reflux includes ronquinho');
const acalmarChunk = chunks.chunks.find((c) => c.id === '30-60-chunk-acalmar-uma-posicao');
assert(acalmarChunk && /a cada 30 segundos/i.test(acalmarChunk.text), 'chunk acalmar 30s');

const prompt = buildSystemPrompt({
  namespace: '30_60',
  band: { id: '30_60', label: '30 a 60 dias', minDays: 29, maxDays: 60 },
});
assert(/45 minutos a 1 hora/i.test(prompt), 'prompt has 45min–1h');
assert(/20 a 30 minutos/i.test(prompt), 'prompt has vertical 20–30');
assert(/MAU H[AÁ]BITO PROIBIDO/i.test(prompt), 'prompt bans mau hábito');
assert(!/m[ií]nimo 4–5 sonecas|m[ií]nimo 4-5 sonecas/i.test(prompt), 'prompt no min naps');
assert(!/FOCO ALIMENTAR antes de sono/i.test(prompt), 'prompt does not include RN block');
assert(/usa chupeta, isso NÃO a torna hipótese principal/i.test(prompt), 'prompt: pacifier not auto-primary');
assert(/NÃO “adaptação ao berço” nem “acostumada ao colo/i.test(prompt) || /NÃO “adaptação ao berço”/i.test(prompt), 'prompt: 51d hierarchy');
assert(/banho às 21h30 NÃO é recomendado/i.test(prompt), 'prompt: bath 21h30 not recommended');
assert(/CONSOLIDE 21h30/i.test(prompt), 'prompt: TESTE 006 consolidate 21h30');
assert(/essa situa[cç][aã]o [eé] comum e pode ser ajustada/i.test(prompt), 'prompt: TESTE 006 bans “situação é comum”');
assert(/ANTECIPE a condu[cç][aã]o/i.test(prompt), 'prompt: TESTE 006 anticipate conduction');
assert(/NÃO invente que ele demora 40–45/i.test(prompt) || /NÃO invente que ele demora 40-45/i.test(prompt), 'prompt: TESTE 006 55d no invented 40-45');
assert(/NÃO pergunte como ele acorda das sonecas/i.test(prompt), 'prompt: TESTE 006 55d no leaked nap-wake questions');
assert(/sem repetir o mesmo bloco/i.test(prompt), 'prompt: TESTE 006 56d cry-calm once');
assert(/N[AÃ]O diga [àa] m[aã]e que o acolhimento/i.test(prompt), 'prompt: 56d no operational once-limit');
assert(/iniciar a condu[cç][aã]o AP[OÓ]S esse per[ií]odo est[aá] correto/i.test(prompt), 'prompt: TESTE 006 49d no post-window start');
assert(/NÃO oriente interromper o peito/i.test(prompt), 'prompt: no comfort-feed interrupt');
assert(/mamou e dormiu/i.test(prompt) || /18h30/i.test(prompt), 'prompt: 48d early ritual');
assert(/n[aã]o [eé] necessariamente um problema/i.test(prompt) || /NÃO normalize o intervalo 18h30/i.test(prompt), 'prompt: 48d do not normalize 18h30-20h');
assert(/NÃO acrescente sintomas/i.test(prompt), 'prompt: do not invent symptoms');
assert(/NÃO vincule o fim da janela/i.test(prompt), 'prompt: 51d no window-to-feed');
assert(/NÃO fracionar a soneca da manhã/i.test(prompt), 'prompt: 55d no invented morning fraction');
assert(/NÃO diga s[oó] “ajudar na transi[cç][aã]o”/i.test(prompt) || /ajudar na transi/i.test(prompt), 'prompt: 56d travesseiro purpose');
assert(/consist[eê]ncia e repeti[cç][aã]o/i.test(prompt), 'prompt: 57d consistency not patience');
assert(/n[aã]o significa automaticamente necessidade de alimenta/i.test(prompt), 'prompt: TESTE 007 30d suck-relax not auto hunger');
assert(/primeira parte da noite/i.test(prompt) && /[uú]ltima mamada efetiva/i.test(prompt), 'prompt: TESTE 011 40d first stretch + last effective feed');
assert(/N[AÃ]O normalize automaticamente que um beb[eê] de 30 a 60 dias/i.test(prompt), 'prompt: TESTE 007 51d no colo/peito normalize');
assert(/N[AÃ]O indique ru[ií]do branco sem rela[cç][aã]o demonstrada/i.test(prompt), 'prompt: TESTE 007 51d no ruído branco');
assert(/pode ser uma boa ferramenta/i.test(prompt), 'prompt: TESTE 007 57d no boa ferramenta');
assert(/N[AÃ]O h[aá] prazo oficial definido nas regras/i.test(prompt), 'prompt: crib learn timeline has no official prazo');
assert(/aula priorit[aá]ria [eé] Janela de Vig[ií]lia/i.test(prompt), 'prompt: TESTE 007 55d Janela lesson primary');
assert(/facilitar a transi[cç][aã]o para o sono/i.test(prompt), 'prompt: TESTE 007 31d no peito as sleep aid');
assert(/N[AÃ]O recomende .{0,8}refor[cç]ar as mamadas/i.test(prompt), 'prompt: TESTE 008 30d no reinforce feeds');
assert(/N[AÃ]O atribua o quadro [aà] janela de vig[ií]lia/i.test(prompt), 'prompt: TESTE 008 30d no wake without evidence');
assert(/2 horas a 2 horas e 30|2h–2h30|2h-2h30/i.test(prompt) && /IN[IÍ]CIO/i.test(prompt), 'prompt: 05/09 40d peito 2h–2h30 from start of last feed');
assert(/associa[cç][oõ]es negativas entre acordar e mamar/i.test(prompt), 'prompt: TESTE 008 40d no negative assoc');
assert(/inicie essa condu[cç][aã]o quando ela estiver calma/i.test(prompt), 'prompt: TESTE 008 51d no calma start');
assert(/Ele apresenta sinais de saciedade ap[oó]s as mamadas/i.test(prompt), 'prompt: TESTE 008 55d no satiety ask');
assert(/ap[oó]s esse per[ií]odo acordado/i.test(prompt), 'prompt: TESTE 008 49d no after-window start');
assert(/20 a 30 minutos de posi[cç][aã]o vertical/i.test(prompt), 'prompt: TESTE 011 30d postural 20–30');
assert(/dura[cç][aã]o da soneca da manh[aã]/i.test(prompt), 'prompt: TESTE 009 30d no morning-nap ask');
assert(/Isso ajudar[aá] a entender melhor a situa[cç][aã]o/i.test(prompt), 'prompt: TESTE 009 31d no orphan ajudará');
assert(/e O banho/i.test(prompt), 'prompt: TESTE 009 45d no e O banho');
assert(/Como ele desperta das sonecas/i.test(prompt), 'prompt: TESTE 009 49d ask how wakes');
assert(/Ap[oó]s esse per[ií]odo, ofere[cç]a uma mamada efetiva/i.test(prompt), 'prompt: TESTE 009 51d no window-to-feed');
assert(/suc[cç][aã]o para relaxar/i.test(prompt), 'prompt: TESTE 010 30d no suction-for-relax first');
assert(/N[AÃ]O apresente 30 a 40 minutos como regra geral|refer[eê]ncia GERAL de 20 a 30/i.test(prompt), 'prompt: TESTE 011 30d postural 20–30 general');
assert(/N[AÃ]O indique aula de Sinais de Sono/i.test(prompt), 'prompt: TESTE 010 30d no Sinais de Sono lesson');
assert(/contribuindo para a dificuldade em relaxar no ber[cç]o/i.test(prompt), 'prompt: TESTE 010 31d no morning-nap → delay');
assert(/investiga[cç][aã]o gen[eé]rica de .{0,8}mamada efetiva/i.test(prompt), 'prompt: TESTE 010 31d no generic feed probe');
assert(/Despertar Irritado P[oó]s-?Soneca/i.test(prompt), 'prompt: TESTE 010 40d no angry-wake lesson at night');
assert(/Estrat[eé]gias para o Sono Noturno/i.test(prompt), 'prompt: TESTE 010 40d night-sleep lesson');
assert(/fa[cç]a uma mamada efetiva/i.test(prompt), 'prompt: TESTE 010 51d no window-to-feed faça');
assert(/Ele parece tranquilo, chorando ou buscando o peito/i.test(prompt), 'prompt: TESTE 010 55d no leaked how-wakes');
assert(/Isso nos ajudar[aá] a ajustar a rotina/i.test(prompt), 'prompt: TESTE 011 31d no isso nos ajudará');
assert(/primeira parte da noite/i.test(prompt), 'prompt: TESTE 011 40d first-night stretch');
assert(/n[aã]o acordar um beb[eê] saud[aá]vel/i.test(prompt), 'prompt: TESTE 011 40d no healthy-wake comparison');
assert(/prefer[eê]ncia/i.test(prompt), 'prompt: TESTE 011 51d no colo/peito preference');
assert(/caprichar nas mamadas/i.test(prompt), 'prompt: TESTE 011 55d no unprompted feed');
assert(/~3h aos 30 dias|cerca de 3 horas aos 30/i.test(prompt), 'prompt: 05/09 jejum ~3h at 30 days');
assert(/~5h aos 60|cerca de 5 horas aos 60/i.test(prompt), 'prompt: 05/09 jejum ~5h at 60 days');
assert(/N[AÃ]O some 10 a 20 minutos extras/i.test(prompt), 'prompt: 05/09 no extra 10–20 on wake window');
assert(/2 a 5 minutos/i.test(prompt), 'prompt: 05/09 pacifier wait 2–5 min');
assert(/80 cm/i.test(prompt), 'prompt: 05/09 white noise 80 cm');
assert(/24\s*°C|24 °C|24°C/i.test(prompt), 'prompt: 05/09 room ~24°C');
assert(/IDENTIFICAR O PROBLEMA/i.test(prompt), 'prompt: 05/09 reasoning sequence');
assert(/regras oficiais vigentes prevalecem/i.test(prompt), 'prompt: protocol authority over old aulas');
assert(/efeito vulc/i.test(prompt), 'prompt: no efeito vulcânico');
assert(/ronquinho/i.test(prompt), 'prompt: reflux ronquinho');
assert(/a cada 30 segundos/i.test(prompt), 'prompt: acalmar 30s');
assert(/ENCERR/i.test(prompt) && /[uú]ltima soneca/i.test(prompt), 'prompt: 6.12 last nap');
assert(/90 a 150/i.test(prompt), 'prompt: no 90–150 ml');
assert(/charutinho/i.test(prompt), 'prompt: do not import RN charutinho');
assert(/N[AÃ]O 3 horas/i.test(prompt), 'prompt: nap cap not 3h');

const sig48 = extractSignals({
  message: 'Bebê de 48 dias. Estou começando a rotina do sono dela umas 18:30, até 20 horas está dormindo. transferir pro berço em sono profundo ou com os olhos abertos para criar autonomia',
  ageBand: '30_60',
  ageDays: 48,
});
assert(sig48.signals.some((s) => s.id === 'early_night_ritual_crib_30_60'), '48d: early ritual signal');
assert(!sig48.signals.some((s) => s.id === 'night_start_19_20_30_60'), '48d: not 19-20 late-start axis');

const sig55 = extractSignals({
  message: 'quando a chupeta cai da boca ele reclama. janela de sono dele está maior que 1h15. Geralmente 1h30 a 1h45',
  ageBand: '30_60',
  ageDays: 55,
});
assert(sig55.signals.some((s) => s.id === 'pacifier_drop_long_wake_30_60'), '55d: pacifier drop + long wake');
assert(!sig55.signals.some((s) => s.id === 'keep_pacifier_30_60'), '55d: not keep-pacifier axis');
assert(!sig55.signals.some((s) => s.id === 'wake_window_30_60'), '55d: not generic wake-window 40-45 axis');
assert(!sig55.signals.some((s) => s.id === 'excess_total_wake_30_60'), '55d: not excess-wake axis');
assert(!sig55.priorities.some((p) => /40–45|40-45 min/i.test(p)), '55d: no invented 40-45 in priorities');
{
  const lessons55 = suggestedLessonsFromRetrieval(
    {
      chunks: [
        {
          chunk: {
            relatedLessons: [
              'lesson-30-60-sinais-sono',
              'lesson-30-60-passo-3-janela',
              'lesson-travesseiro',
            ],
          },
        },
      ],
    },
    '30_60',
    ['pacifier_drop_long_wake_30_60'],
  );
  const ids55 = lessons55.map((l) => l.id);
  assert(ids55[0] === 'lesson-30-60-passo-3-janela', '55d lessons prioritize Janela de Vigília');
  assert(ids55.includes('lesson-30-60-sinais-sono'), '55d lessons may keep Sinais as complementary');
  assert(!ids55.includes('lesson-travesseiro'), '55d lessons exclude Travesseiro');
}

{
  const lessons30 = suggestedLessonsFromRetrieval(
    {
      chunks: [
        {
          chunk: {
            relatedLessons: [
              'lesson-30-60-sinais-sono',
              'lesson-refluxo',
              'lesson-30-60-passo-3-janela',
            ],
          },
        },
      ],
    },
    '30_60',
    ['nap_angry_wake_30_60'],
  );
  const ids30L = lessons30.map((l) => l.id);
  assert(ids30L.includes('lesson-refluxo'), '30d lessons: refluxo only axis');
  assert(!ids30L.includes('lesson-30-60-sinais-sono'), '30d lessons: no Sinais de Sono');
  assert(!ids30L.includes('lesson-30-60-passo-3-janela'), '30d lessons: no Janela');
}

const sig56 = extractSignals({
  message: 'Posso colocar no berço e esperar ele dormir sozinho, se não estiver chorando? Ou preciso colocar ele em sono leve ? Ou em sono profundo?',
  ageBand: '30_60',
  ageDays: 56,
});
assert(sig56.signals.some((s) => s.id === 'crib_awake_start_30_60'), '56d: crib awake start');
assert(!sig56.signals.some((s) => s.id === 'night_start_19_20_30_60'), '56d: not 19-20 night start');
assert(!sig56.signals.some((s) => s.id === 'early_night_ritual_crib_30_60'), '56d: not 18h30 ritual');
assert(
  forbidden.forbiddenInterpretations.some((x) => /ruido branco quando a duvida e apenas colocar acordado/i.test(x)),
  'forbidden: 56d no auto-dump of unrelated aulas',
);
{
  const bercoChunk = chunks.chunks.find((c) => c.id === '30-60-chunk-inicio-sono-berco-acordado');
  assert(!!bercoChunk, 'chunk: 56d crib-awake exists');
  assert(
    JSON.stringify(bercoChunk?.relatedLessons || []) === JSON.stringify(['lesson-travesseiro']),
    'chunk: 56d relatedLessons is Travesseiro only',
  );
  const lessons56 = suggestedLessonsFromRetrieval(
    {
      chunks: [
        {
          chunk: {
            relatedLessons: [
              'lesson-30-60-passo-2-estimulos',
              'lesson-30-60-passo-3-janela',
              'lesson-30-60-passo-4-rotina',
              'lesson-travesseiro',
              'lesson-ruido-branco',
            ],
          },
        },
      ],
    },
    '30_60',
    ['crib_awake_start_30_60'],
  );
  const ids56 = lessons56.map((l) => l.id);
  assert(ids56.includes('lesson-travesseiro'), '56d lessons include Travesseiro');
  assert(
    !ids56.some((id) => /passo-2-estimulos|passo-3-janela|passo-4-rotina|ruido-branco/.test(id)),
    '56d lessons exclude estímulos/janela/rotina/ruído',
  );
}

const sig57 = extractSignals({
  message: 'Estou ensinando a adormecer direto no berço progressivamente... avançando gradativamente. fico uns 10 min tentando acalmá-la. refaço o processo',
  ageBand: '30_60',
  ageDays: 57,
});
assert(sig57.signals.some((s) => s.id === 'crib_adaptation_same_day_30_60'), '57d: same-day crib adaptation');
assert(!sig57.signals.some((s) => s.id === 'night_start_19_20_30_60'), '57d: not 19-20 night start');
assert(!sig57.signals.some((s) => s.id === 'crib_awake_start_30_60'), '57d: not 56d awake-vs-stage axis');
{
  const lessons57 = suggestedLessonsFromRetrieval(
    {
      chunks: [
        {
          chunk: {
            relatedLessons: [
              'lesson-30-60-passo-2-estimulos',
              'lesson-30-60-passo-3-janela',
              'lesson-30-60-passo-4-rotina',
              'lesson-travesseiro',
              'lesson-ruido-branco',
            ],
          },
        },
      ],
    },
    '30_60',
    ['crib_adaptation_same_day_30_60'],
  );
  const ids57 = lessons57.map((l) => l.id);
  assert(ids57.includes('lesson-travesseiro'), '57d lessons include Travesseiro');
  assert(ids57.includes('lesson-30-60-passo-3-janela'), '57d lessons include janela');
  assert(
    !ids57.some((id) => /passo-2-estimulos|passo-4-rotina|ruido-branco/.test(id)),
    '57d lessons exclude estímulos/rotina/ruído',
  );
}

const sig49 = extractSignals({
  message: 'sonecas duram 30 min, usa chupeta. Preciso ajustar algo?',
  ageBand: '30_60',
  ageDays: 49,
});
assert(!sig49.signals.some((s) => s.id === 'pacifier_in_rn'), '49d: pacifier_in_rn blocked');
assert(!sig49.signals.some((s) => s.id === 'asks_how_to_improve'), '49d: asks_how_to_improve blocked');
assert(
  sig49.signals.some((s) => s.id === 'short_naps_pacifier_mention_30_60'),
  '49d: short naps + pacifier mention signal',
);
assert(
  sig49.priorities.some((p) => /NÃO autoriza hipótese principal|nao autoriza hipotese principal|NÃO autoriza/i.test(p) || /quando ela cai/i.test(p)),
  '49d: pacifier is conditional, not primary',
);
assert(
  sig49.priorities.some((p) => /45 minutos a 1 hora/i.test(p) || /20 a 30/i.test(p) || /mau hábito|mau habito/i.test(p)),
  '49d: 30_60 priorities present',
);

const sig30 = extractSignals({
  message: 'quando acorda ela acorda muito brava e chora bastante e só acalma dando o peito mama bem pouco e relaxa',
  ageBand: '30_60',
  ageDays: 30,
});
const sigNight = extractSignals({
  message: 'após as 04:00 da manhã ele acorda de 1 em 1 hrs, coloco no peito ele mama mesmo sabendo que não é fome',
  ageBand: '30_60',
  ageDays: 40,
});
assert(sig30.signals.some((s) => s.id === 'nap_angry_wake_30_60'), '30d: angry wake signal');
assert(sigNight.signals.some((s) => s.id === 'night_hourly_wakes_30_60'), '40d-night: hourly wakes signal');
assert(!sigNight.signals.some((s) => s.id === 'keep_pacifier_30_60'), '40d-night: not pacifier keep');
assert(!sig30.signals.some((s) => s.id === 'asks_how_to_improve'), '30d: no RN how-to-improve');

const rnPrompt = buildSystemPrompt({
  namespace: 'RN',
  band: { id: 'RN', label: 'RN (0–28 dias)', minDays: 0, maxDays: 28 },
});
assert(/FOCO ALIMENTAR antes de sono/i.test(rnPrompt), 'RN prompt still has RN rules');

assert(
  forbidden.forbiddenInterpretations.some((x) => /mau habito|mau hábito/i.test(x)),
  'forbidden interpretation bans mau hábito class',
);
assert(
  forbidden.forbiddenInterpretations.some((x) => /essa situacao e comum e pode ser ajustada/i.test(x)),
  'forbidden: TESTE 006 no “situação é comum”',
);
  assert(
    forbidden.forbiddenInterpretations.some((x) => /associar a soneca longa da manha a dificuldade para relaxar/i.test(x)),
    'forbidden: TESTE 010 no morning-nap → delay to sleep',
  );
  assert(
    forbidden.forbiddenInterpretations.some((x) => /aula de Sinais de Sono como conteudo prioritario/i.test(x)),
    'forbidden: TESTE 010 no Sinais de Sono as primary for angry wake',
  );
  assert(
    forbidden.forbiddenInterpretations.some((x) => /Despertar Irritado Pos-Soneca para despertares noturnos/i.test(x)),
    'forbidden: TESTE 010 40d no angry-wake lesson at night',
  );
  assert(
    forbidden.forbiddenInterpretations.some((x) => /parece tranquilo, chorando ou buscando o peito/i.test(x)),
    'forbidden: TESTE 010 55d no leaked how-wakes',
  );
assert(
  rules.fixedRules.some((r) => /UMA vez so|UMA unica orientacao/i.test(r.rule) && /21h30/i.test(r.rule)),
  'rule: TESTE 006 21h30 once',
);

assert(
  forbidden.forbiddenTerms.some((t) => /efeito vulc/i.test(t)),
  'forbidden term: efeito vulcânico',
);
assert(
  forbidden.forbiddenInterpretations.some((x) => /90 a 150 ml/i.test(x)),
  'forbidden: no 90–150 ml',
);
assert(
  forbidden.forbiddenInterpretations.some((x) => /charutinho/i.test(x)),
  'forbidden: no RN charutinho import',
);
assert(
  rules.fixedRules.some((r) => /IDENTIFICAR O PROBLEMA/i.test(r.rule)),
  'rule: 05/09 reasoning sequence',
);
assert(
  rules.fixedRules.some((r) => /ronquinho/i.test(r.rule)),
  'rule: reflux ronquinho',
);
assert(
  rules.fixedRules.some((r) => /a cada 30 segundos/i.test(r.rule)),
  'rule: acalmar 30s',
);

function countAngryWakeParas(text) {
  return String(text || '')
    .split(/\n{2,}/)
    .filter((p) => {
      const nap = /1 hora ou at[eé] mais|soneca de (cerca de )?1\s*h|dura[cç][aã]o da soneca|n[aã]o (consideraria|parece ser) .{0,40}(principal )?(problema|ponto)/i.test(p);
      const wake = /irritad|brav[oa]|chor|despertar .{0,30}aten[cç]/i.test(p);
      return nap && wake;
    }).length;
}

function count2130Sentences(text) {
  return (String(text || '').match(/[^.!?\n]*(?:21h30|21:30)[^.!?]*[.!?]/gi) || []).length;
}

console.log('\n=== Layer A: TESTE 006 enricher replay ===\n');

{
  const message30 =
    'Minha bebê de 30 dias faz sonecas de 1h às vezes mais.. quando acorda ela acorda muito brava e chora bastante e só acalma dando o peito mama bem pouco e relaxa.. como melhorar? Antes da soneca ela já mama em média 20 a 30 min';
  const draft30 = `Como ela consegue dormir por cerca de 1 hora ou até mais, eu não consideraria a duração da soneca o principal problema neste momento. O que chama mais atenção é ela acordar muito irritada e relaxar depois de sugar um pouco. Por isso, primeiro observaria como está a mamada e se existe algum desconforto depois dela.

Essa situação é comum e pode ser ajustada com algumas orientações.

Depois da mamada, antes de deitar: houve arroto? Ela ficou em posição vertical, e por quanto tempo? A referência é permanecer 20 a 30 minutos em posição vertical.

Como a soneca dura 1 hora ou mais e ela acorda irritada, chorando bastante, e relaxa após sugar, vale investigar a alimentação, a efetividade da mamada e o desconforto depois dela.

Esse padrão também pode apontar para algum desconforto depois da mamada, inclusive refluxo. Você pode conferir a aula 'O que é o refluxo?' no aplicativo.`;
  const sig = extractSignals({ message: message30, ageBand: '30_60', ageDays: 30 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft30,
    message: message30,
    signals: sig,
    babyProfile: { babyName: 'Lara', ageDays: 30, sex: 'f' },
  });
  assert(!/essa situa[cç][aã]o [eé] comum/i.test(enriched.text), 'TESTE 006 30d: no “situação é comum”');
  assert(countAngryWakeParas(enriched.text) === 1, 'TESTE 006 30d: angry-wake reading once', String(countAngryWakeParas(enriched.text)));
  assert(/20 a 30 minutos/i.test(enriched.text), 'TESTE 006 30d: keep feed duration 20–30');
  assert(/20 a 30 minutos/i.test(enriched.text), 'TESTE 006 30d: postural 20–30');
  assert(!/posi[cç][aã]o vertical por (cerca de )?30 a 40 minutos/i.test(enriched.text), 'TESTE 006 30d: no postural 30–40');
  assert(/refluxo/i.test(enriched.text), 'TESTE 006 30d: keep reflux');
  assert(!/como est[aá] o sono noturno/i.test(enriched.text), 'TESTE 006 30d: no night-sleep question');
}

console.log('\n=== Layer A: TESTE 007 enricher replay ===\n');

{
  const message30 =
    'Minha bebê de 30 dias faz sonecas de 1h às vezes mais.. quando acorda ela acorda muito brava e chora bastante e só acalma dando o peito mama bem pouco e relaxa.. como melhorar? Antes da soneca ela já mama em média 20 a 30 min';
  const draft30 = `Como ela consegue dormir por cerca de 1 hora ou até mais, eu não consideraria a duração da soneca o principal problema neste momento. O que chama mais atenção é ela acordar muito irritada e relaxar depois de sugar um pouco. Por isso, primeiro observaria como está a mamada e se existe algum desconforto depois dela.

A soneca de 1h ou mais não é o problema principal. O despertar irritado merece atenção.

Como ela mama 20 a 30 minutos antes da soneca e, ao despertar, suga pouco e relaxa, isso indica que ela precisa se alimentar.

Depois da mamada, antes de deitar: houve arroto? Ela ficou em posição vertical, e por quanto tempo? A referência é permanecer 20 a 30 minutos em posição vertical.

Esse padrão também pode apontar para algum desconforto depois da mamada, inclusive refluxo. Você pode conferir a aula 'O que é o refluxo?' no aplicativo.`;
  const sig = extractSignals({ message: message30, ageBand: '30_60', ageDays: 30 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft30,
    message: message30,
    signals: sig,
    babyProfile: { babyName: 'Lara', ageDays: 30, sex: 'f' },
  });
  assert(countAngryWakeParas(enriched.text) === 1, 'TESTE 007 30d: nap/wake reading once', String(countAngryWakeParas(enriched.text)));
  assert(/n[aã]o comprova saciedade|n[aã]o significa automaticamente/i.test(enriched.text), 'TESTE 007 30d: time ≠ satiety; suck-relax not auto hunger');
  assert(!/indica que ela precisa se alimentar/i.test(enriched.text), 'TESTE 007 30d: no auto-hunger from suck-relax');
  assert(/20 a 30 minutos/i.test(enriched.text), 'TESTE 007 30d: keep feed duration 20–30');
  assert(/20 a 30 minutos/i.test(enriched.text), 'TESTE 007 30d: postural 20–30');
  assert(!/posi[cç][aã]o vertical por (cerca de )?30 a 40 minutos/i.test(enriched.text), 'TESTE 007 30d: no postural 30–40');
  assert(/refluxo/i.test(enriched.text), 'TESTE 007 30d: keep reflux');
  assert(/arroto/i.test(enriched.text), 'TESTE 007 30d: keep burp ask');
}

{
  const message40 =
    'Olá. Meu bb tem 40 dias , tem noites que ele dorme super bem acorda entre 2:30 a 3 hrs , só que tem dia que após as 04:00 da manhã ele acorda de 1 em 1 hrs tento fazer ele continuar a dormir no berço porém sem sucesso, aí pego ele fico ninando no colo sem sucesso, aí coloco ele no peito ele mama mesmo sabendo que não é fome, ele mama e dorme. Continuo assim por ele ainda ser novinho ?';
  const draft40 = `É compreensível que você esteja enfrentando dificuldades com os despertares noturnos do seu bebê de 40 dias. É comum que, nesta faixa etária, os bebês tenham variações no padrão de sono, e isso pode ser desafiador.

A orientação prática segura é que, após as 4h da manhã, se ele acordar de hora em hora, você deve tentar fazê-lo dormir novamente sem oferecer o peito imediatamente. Isso é importante para Verifique também o horário da última mamada antes das 4h e a rotina alimentar do dia, pois isso pode influenciar os despertares. Se já passaram cerca de 2h30 a 3h desde a última mamada efetiva, você pode oferecer o peito até a saciedade.

Você costuma oferecer peito ou mamadeira automaticamente quando ele acorda antes de 3h?

Recomendo que você revise a aula sobre sono noturno no módulo 3, que pode ajudar a entender melhor como lidar com esses despertares.

Uma coisa é não acordar um bebê saudável e com bom ganho de peso só para mamar. Outra é ele acordar sozinho depois das 4h, de hora em hora, e mamar quando o peito é oferecido — e depois dormir. Nesse segundo caso, o intervalo de 3 horas não serve sozinho para decidir que a mamada não é necessária.

Antes de pensar em associação peito–sono, vale olhar a alimentação: ele mama no peito, fórmula ou complemento? Como está a rotina alimentar do dia — intervalos, efetividade das mamadas e manutenção da saciedade? Como está o ganho de peso e a produção de leite? Nesses despertares ele faz uma mamada efetiva ou só suga um pouco e adormece? Depois de mamar, houve arroto e posição vertical por 20 a 30 minutos? Há sinais de desconforto?`;
  const sig = extractSignals({ message: message40, ageBand: '30_60', ageDays: 40 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft40,
    message: message40,
    signals: sig,
    babyProfile: { babyName: 'Pedro', ageDays: 40, sex: 'm' },
  });
  const stretchPos = enriched.text.search(/primeira parte da noite/i);
  const sleepPos = enriched.text.search(/sem oferecer (imediatamente o peito|o peito imediatamente)/i);
  assert(stretchPos >= 0 && (sleepPos < 0 || stretchPos < sleepPos), 'TESTE 007 40d: first-night stretch before reconduce');
  assert(!/Isso [eé] importante para/i.test(enriched.text), 'TESTE 007 40d: no truncated “Isso é importante para”');
  assert(/2h\s*30|2h30/i.test(enriched.text) && /mamada efetiva/i.test(enriched.text), 'TESTE 007 40d: 2h30–3h → feed');
  assert(!/rotina alimentar/i.test(enriched.text), 'TESTE 007 40d: no daytime-feed displacement');
  assert(/vertical|arroto/i.test(enriched.text), 'TESTE 007 40d: keep postural');
}

{
  const message51 =
    'Minha neném 1 mês e 21 dias tem dificuldade de dormir durante o dia, só dorme se for no colo, e no peito, tento fazer a técnica do travesseiro, as vezes da certo e as vezes não, quanto tempo pra ela aprender?';
  const draft51 = `É normal que a bebê de 51 dias tenha dificuldade para dormir durante o dia, especialmente se ela só consegue adormecer no colo ou no peito. Essa fase é de adaptação e é esperado que haja variações no sono.

Para ajudar a bebê a dormir, siga este passo a passo: primeiro, observe a janela de vigília de 45 minutos a 1 hora e 15 minutos e conduza a mamada efetiva, garantindo que ela esteja saciada. Se ela ainda estiver no peito, retire-a e mantenha-a em posição vertical por 20 a 30 minutos. Depois, inicie a condução do sono, utilizando a técnica do travesseiro que você já está aplicando. É importante que a transferência para o berço ou outra superfície ocorra quando ela estiver calma, não durante uma crise de choro.

Não existe um prazo fixo para que ela aprenda a dormir de forma mais independente; a evolução depende da repetição e consistência nas práticas, respeitando a maturidade dela.

Para entender melhor, gostaria de saber: quanto tempo a bebê permanece acordada antes das sonecas? Como você está realizando a Estratégia do Travesseiro?

Recomendo que você confira a aula sobre a Estratégia do Travesseiro para mais orientações práticas.

Quando ela ‘só dorme no peito’, diferencie: ainda está com fome; fez mamada efetiva e ficou saciada; ou já saciada permanece sugando enquanto adormece. Se ainda houver sinais de fome, mantenha a alimentação. Se ela já estiver saciada e continuar no peito, retire-a do peito, coloque em posição vertical e, depois, conduza ao sono.

Se você já está utilizando a técnica do travesseiro, investigue como está sendo a execução e em que momento da vigília você a inicia.

Na condução, use contenção e presença observando a resposta da bebê — sem cronometrar o choro e sem tempo predeterminado.`;
  const sig = extractSignals({ message: message51, ageBand: '30_60', ageDays: 51 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft51,
    message: message51,
    signals: sig,
    babyProfile: { babyName: 'Lara', ageDays: 51, sex: 'f' },
  });
  assert(!/[eé] (normal|comum) que a beb[eê] de 51 dias/i.test(enriched.text), 'TESTE 007 51d: no age-normalize opening');
  assert(!/fase [eé] de adapta[cç][aã]o/i.test(enriched.text), 'TESTE 007 51d: no adaptation-phase normalize');
  assert(/por que ela est[aá] conseguindo entrar em sono apenas no colo/i.test(enriched.text), 'TESTE 007 51d: investigate colo/peito first');
  assert(((enriched.text.match(/retir[ae]-a(?: do peito)?|retire-a do peito/gi) || []).length <= 1), 'TESTE 007 51d: satiety conduct once');
  assert(((enriched.text.match(/execu[cç][aã]o.{0,40}travesseiro|travesseiro.{0,40}execu|executando.{0,40}travesseiro|realizando.{0,40}travesseiro/gi) || []).length <= 1), 'TESTE 007 51d: travesseiro once');
  assert(!/ru[ií]do branco/i.test(enriched.text), 'TESTE 007 51d: no ruído branco');
  assert(/aula.{0,80}travesseiro/i.test(enriched.text), 'TESTE 007 51d: keep travesseiro lesson');
}

{
  const lessons51 = suggestedLessonsFromRetrieval(
    {
      chunks: [
        {
          chunk: {
            relatedLessons: [
              'lesson-travesseiro',
              'lesson-30-60-passo-3-janela',
              'lesson-ruido-branco',
            ],
          },
        },
      ],
    },
    '30_60',
    ['day_sleep_difficulty_30_60'],
  );
  const ids51 = lessons51.map((l) => l.id);
  assert(ids51.includes('lesson-travesseiro'), '51d lessons include Travesseiro');
  assert(!ids51.includes('lesson-ruido-branco'), '51d lessons exclude ruído branco');
}

{
  const message31 =
    'Ola tudo bem? Meu filho tem 31 dias, sempre fez as sonecas no berço, que duravam cerca de 2 hrs/ 2 hrs e 30. Mas faz 02 dias que ele tem feito uma soneca grande pela manhã e, durante a tarde, as sonecas estão bem curtas. Um ciclo de sono. Ele desperta e eu ate tendo nina-lo no berço, mas ele nao retorna. Depois de 30 minutos ja esta com sono novamente. Outra questao eh que ele demora femais para iniciar a soneca. O ambiente esta ajustado, ele esta alimentado, tudo tranquilo, janela de sono del eh de 1 hr/1 hr 15, quando vai dando este horário, vou para o quarto; coloco ruido, quarto escuro, nino ele no colo e ainda acordado transfiro pro berço. Quando no berço, ele demora muuuito prw relaxar, quase 40/45 minutos. Nao sei como conduzir nesta situação. Faz uns 4,5 dias que esta assim.';
  const draft31 = `Olá! É compreensível que você esteja enfrentando dificuldades com as sonecas do seu filho de 31 dias. Mudanças no padrão de sono são comuns nessa fase, e é importante ajustar a rotina para ajudar na condução do sono.

A principal hipótese aqui é a vigília excessiva. Como ele demora cerca de 40 a 45 minutos para relaxar no berço, o tempo total acordado pode estar em torno de 1h40 a 2h, o que é excessivo.

Para ajudar, recomendo fracionar a soneca da manhã para cerca de 1h30 a 2h. Isso pode ajudar a distribuir melhor as sonecas ao longo do dia e evitar que ele fique muito cansado. Se a mamada estiver se aproximando, oferecer o peito pode ajudar a relaxá-lo e facilitar a transição para o sono.

Para mais orientações sobre como estruturar a rotina e conduzir o sono, você pode conferir a aula sobre ‘Rotina por Janelas’ no aplicativo.

A vigília excessiva vem da soma — não da soneca longa da manhã: se a condução começa depois de cerca de 1h–1h15 e ele ainda leva uns 40–45 minutos para adormecer, o tempo acordado chega perto de 1h40–2h — acima da referência de 45 minutos a 1 hora e 15 minutos.

Como ele já demora cerca de 40 a 45 minutos para adormecer, antecipe o início da condução — não espere os sinais de sono — para que ele entre em sono dentro da janela de 45 minutos a 1 hora e 15 minutos.

Também é importante saber qual costuma ser o intervalo entre as mamadas: se durante a demora para adormecer ele estiver se aproximando do próximo intervalo alimentar, considere fome antes de insistir no sono.`;
  const sig = extractSignals({ message: message31, ageBand: '30_60', ageDays: 31 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft31,
    message: message31,
    signals: sig,
    babyProfile: { babyName: 'João', ageDays: 31, sex: 'm' },
  });
  assert(!/oferecer o peito pode ajudar a relax|facilitar a transi[cç][aã]o para o sono/i.test(enriched.text), 'TESTE 007 31d: no breast as sleep aid');
  assert(/considere fome antes de insistir no sono/i.test(enriched.text), 'TESTE 007 31d: keep hunger-if-interval');
  assert(/vig[ií]lia excessiva vem da soma|n[aã]o da soneca longa da manh/i.test(enriched.text), 'TESTE 007 31d: keep sum-not-morning-nap');
  assert(/antecip/i.test(enriched.text), 'TESTE 007 31d: keep anticipate');
}

{
  const message55 =
    'Bom dia! Bebê de 55 dias e chupa chupeta… quando a chupeta cai da boca ele reclama… devo colocá-la logo em seguida ou devo esperar um pouco para colocá-la na boca dele novamente? Outra coisa, a janela de sono dele está maior que 1h15. Geralmente 1h30 a 1h45! Tem problema?';
  const draft55 = `Bom dia! É normal que o bebê de 55 dias use a chupeta e reclame quando ela cai. Se ele só reclama, você pode observar por um momento se ele continua dormindo. Se despertar e precisar, ofereça a chupeta novamente.

Sobre a janela de sono, se está acima de 1h15, O ideal é que a janela de vigília fique entre 45 minutos e 1h15.

E quanto tempo ele demora para adormecer depois de você iniciar a condução?

Recomendo que você confira a aula sobre ‘Sinais de Sono’ para mais orientações sobre como conduzir o sono do seu bebê.

Para entender melhor, quanto tempo ele demora para entrar em sono após você iniciar a condução?

Quando a chupeta cair e ele apenas reclamar, você não precisa recolocá-la imediatamente. Observe um pouco para ver se ele consegue continuar dormindo sem a chupeta. Se ele despertar e precisar de ajuda para retomar o sono, você pode oferecê-la novamente.

Sobre o tempo acordado: a referência de janela de vigília é de 45 minutos a 1 hora e 15 minutos. Permanecer acordado habitualmente por 1h30 a 1h45 já ultrapassa o esperado para essa faixa etária. Procure observar os sinais de sono e iniciar a preparação para dormir antes de ultrapassar repetidamente 1h15.`;
  const sig = extractSignals({ message: message55, ageBand: '30_60', ageDays: 55 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft55,
    message: message55,
    signals: sig,
    babyProfile: { babyName: 'Pedro', ageDays: 55, sex: 'm' },
  });
  assert(((enriched.text.match(/n[aã]o precisa recoloc|n[aã]o [eé] necess[aá]rio recoloc/gi) || []).length === 1), 'TESTE 007 55d: pacifier once');
  assert(((enriched.text.match(/quanto tempo (ele|ela) demora para (entrar em sono|adormecer)/gi) || []).length === 1), 'TESTE 007 55d: one enter-sleep ask');
  assert(/quanto tempo ele demora para entrar em sono ap[oó]s voc[eê] iniciar a condu[cç][aã]o/i.test(enriched.text), 'TESTE 007 55d: canonical ask');
  assert(!/adormecer depois de voc[eê] iniciar a condu[cç][aã]o/i.test(enriched.text), 'TESTE 007 55d: no adormecer-depois ask');
  assert(/aula.{0,40}Janela de Vig[ií]lia/i.test(enriched.text), 'TESTE 007 55d: Janela de Vigília lesson');
  assert(!/aula sobre ['‘’“”']?Sinais de Sono/i.test(enriched.text), 'TESTE 007 55d: Sinais de Sono is not the directed aula');
}

{
  const message57 =
    'Oi! Bebê de 57 dias. Estou ensinando a adormecer direto no berço progressivamente... começo com sono da manhã e estou avançando gradativamente para as outras sonecas, até chegar no sono noturno. O indicado é ir progressivamente ou deveria tentar em todas as sonecas de uma vez? Além disso, em algumas tentativas, há choro e fico uns 10 min tentando acalmá-la. Quando não resolve, pego no colo, acalmo e refaço o processo novamente... O caminho é esse mesmo?';
  const draft57 = `É normal que a adaptação ao berço traga desafios, especialmente aos 57 dias. O que você está fazendo é um passo importante para ajudar seu bebê a se acostumar a dormir no berço.

A orientação prática segura é começar pela primeira soneca da manhã e seguir com todas as demais sonecas daquele mesmo dia no berço. Repita esse processo diariamente até consolidar. Quando houver choro, acalme seu bebê no colo e, em seguida, retorne ao berço, repetindo até que ele adormeça. Não é necessário cronometrar o choro; o foco deve ser na consistência e na repetição, acolhendo o choro e ajudando no colo quando necessário. A Estratégia do Travesseiro pode ser uma boa ferramenta para auxiliar nesse processo, então, se você já a utiliza, observe como está sendo feita.

Use a Estratégia do Travesseiro na condução e na colocação no berço.

Assista à aula sobre a Estratégia do Travesseiro no aplicativo para aprender como aplicá-la corretamente.`;
  const sig = extractSignals({ message: message57, ageBand: '30_60', ageDays: 57 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft57,
    message: message57,
    signals: sig,
    babyProfile: { babyName: 'Lara', ageDays: 57, sex: 'f' },
  });
  assert(!/pode ser uma boa (ferramenta|estrat[eé]gia)/i.test(enriched.text), 'TESTE 007 57d: no optional ferramenta wording');
  assert(/Use a Estrat[eé]gia do Travesseiro na condu[cç][aã]o e na coloca[cç][aã]o no ber[cç]o/i.test(enriched.text), 'TESTE 007 57d: keep direct Travesseiro');
  assert(((enriched.text.match(/Use a Estrat[eé]gia do Travesseiro na condu[cç][aã]o e na coloca[cç][aã]o no ber[cç]o/gi) || []).length === 1), 'TESTE 007 57d: direct Travesseiro once');
  assert(/aula.{0,80}travesseiro/i.test(enriched.text), 'TESTE 007 57d: keep Travesseiro lesson');
}

console.log('\n=== Layer A: TESTE 008 enricher replay ===\n');

{
  const message30 =
    'Minha bebê de 30 dias faz sonecas de 1h às vezes mais.. quando acorda ela acorda muito brava e chora bastante e só acalma dando o peito mama bem pouco e relaxa.. como melhorar? Antes da soneca ela já mama em média 20 a 30 min';
  const draft30 = `Como ela consegue dormir por cerca de 1 hora ou até mais, eu não consideraria a duração da soneca o principal problema neste momento. O que chama mais atenção é ela acordar muito irritada e relaxar depois de sugar um pouco. Por isso, primeiro observaria como está a mamada e se existe algum desconforto depois dela.

O tempo de mamada, sozinho, não comprova saciedade — mesmo que ela tenha mamado 20 a 30 minutos antes da soneca. Observe sucção ativa, deglutição e sinais de saciedade. Sugar pouco e relaxar ao despertar não significa automaticamente que ela precise se alimentar: investigue também desconforto e se a sucção está sendo usada para relaxar.

É compreensível que a sua bebê de 30 dias acorde muito irritada após sonecas de cerca de 1 hora ou mais. O que chama atenção aqui é esse despertar bravo e o fato de ela só se acalmar ao mamar, mesmo que por pouco tempo.

A principal hipótese é que isso pode estar relacionado à alimentação e à saciedade, além de possíveis desconfortos após a mamada. É importante investigar se a mamada foi efetiva, ou seja, se houve sucção ativa e deglutição, e se ela apresentou sinais de saciedade. Além disso, observe o que acontece entre o fim da mamada e o momento de deitar: houve arroto? Ela permaneceu em posição vertical por 20 a 30 minutos após a mamada?

Para melhorar essa situação, considere reforçar as mamadas antes das sonecas, garantindo que ela esteja bem alimentada. Também é fundamental respeitar a janela de vigília de 45 minutos a 1 hora e 15 minutos, evitando que ela fique acordada por muito tempo, o que pode levar à hiperestimulação.

Por fim, você pode revisar a aula sobre refluxo, que pode ajudar a entender melhor a situação dela.`;
  const sig = extractSignals({ message: message30, ageBand: '30_60', ageDays: 30 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft30,
    message: message30,
    signals: sig,
    babyProfile: { babyName: 'Lara', ageDays: 30, sex: 'f' },
  });
  assert(!/refor[cç]ar as mamadas/i.test(enriched.text), 'TESTE 008 30d: no reinforce feeds');
  assert(!/hiperestimula/i.test(enriched.text) && !/respeitar a janela de vig[ií]lia/i.test(enriched.text), 'TESTE 008 30d: no wake/hyper without evidence');
  assert(countAngryWakeParas(enriched.text) === 1, 'TESTE 008 30d: nap/wake reading once', String(countAngryWakeParas(enriched.text)));
  assert(/n[aã]o comprova saciedade/i.test(enriched.text), 'TESTE 008 30d: time ≠ satiety');
  assert(/n[aã]o significa automaticamente/i.test(enriched.text), 'TESTE 008 30d: suck-relax not auto hunger');
  assert(/arrot/i.test(enriched.text) && /20 a 30 minutos/i.test(enriched.text), 'TESTE 008 30d: postural 20–30');
  assert(/refluxo/i.test(enriched.text), 'TESTE 008 30d: keep reflux');
}

{
  const message40 =
    'Olá. Meu bb tem 40 dias , tem noites que ele dorme super bem acorda entre 2:30 a 3 hrs , só que tem dia que após as 04:00 da manhã ele acorda de 1 em 1 hrs tento fazer ele continuar a dormir no berço porém sem sucesso, aí pego ele fico ninando no colo sem sucesso, aí coloco ele no peito ele mama mesmo sabendo que não é fome, ele mama e dorme. Continuo assim por ele ainda ser novinho ?';
  const draft40 = `É compreensível que você esteja enfrentando dificuldades com os despertares do seu bebê de 40 dias. É comum que, nesta faixa etária, os bebês apresentem variações no padrão de sono, e isso pode ser desafiador para as mães.

O primeiro passo é identificar o horário da última mamada antes das 4h da manhã. Se já transcorreram aproximadamente 2h30 a 3h desde uma mamada efetiva, ofereça mamada efetiva até a saciedade. Se ainda não completou esse intervalo após uma mamada efetiva, tente conduzi-lo novamente ao sono sem oferecer imediatamente o peito.

Se já se passaram ~2h30–3h desde a mamada efetiva, você pode tentar conduzir o bebê de volta ao sono sem oferecer o peito imediatamente. É importante lembrar que nem todo despertar é sinal de fome; pode ser apenas agitação. Isso ajuda a evitar associações negativas entre acordar e mamar.

E como está a alimentação dele durante o dia?

Recomendo que você revise a aula sobre o sono noturno, que pode oferecer mais insights sobre como lidar com esses despertares.

A percepção de que ‘não é fome’ não basta — e a decisão de oferecer o peito não se resume a ele ainda ser novinho.

Uma coisa é não acordar um bebê saudável e com bom ganho de peso só para mamar. Outra é ele acordar sozinho depois das 4h, de hora em hora, e mamar quando o peito é oferecido — e depois dormir. Nesse segundo caso, o intervalo de 3 horas não serve sozinho para decidir que a mamada não é necessária.

Antes de pensar em associação peito–sono, vale olhar a alimentação: ele mama no peito, fórmula ou complemento? Como está a rotina alimentar do dia — intervalos, efetividade das mamadas e manutenção da saciedade? Como está o ganho de peso e a produção de leite? Nesses despertares ele faz uma mamada efetiva ou só suga um pouco e adormece? Depois de mamar, houve arroto e posição vertical por 20 a 30 minutos? Há sinais de desconforto?`;
  const sig = extractSignals({ message: message40, ageBand: '30_60', ageDays: 40 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft40,
    message: message40,
    signals: sig,
    babyProfile: { babyName: 'Pedro', ageDays: 40, sex: 'm' },
  });
  assert(!/j[aá] se passaram.{0,80}2h\s*30.{0,160}sem oferecer/i.test(enriched.text), 'TESTE 008 40d: no 2h30–3h contradiction');
  assert(!/associa[cç][oõ]es negativas/i.test(enriched.text), 'TESTE 008 40d: no negative assoc');
  assert(/mamada efetiva/i.test(enriched.text) && /2h\s*30|2h30/i.test(enriched.text), 'TESTE 008 40d: due interval → feed');
  const stretchPos = enriched.text.search(/primeira parte da noite/i);
  const sleepPos = enriched.text.search(/sem oferecer (imediatamente o peito|o peito imediatamente)/i);
  assert(stretchPos >= 0 && (sleepPos < 0 || stretchPos < sleepPos), 'TESTE 008 40d: first-night stretch before reconduce');
  assert(!/rotina alimentar/i.test(enriched.text), 'TESTE 008 40d: no daytime-feed displacement');
  assert(/vertical|arroto/i.test(enriched.text), 'TESTE 008 40d: keep postural');
}

{
  const message51 =
    'Minha neném1 mês e 21 dias tem dificuldade de dormir durante o dia, só dorme se for no colo, e no peito, tento fazer a técnica do travesseiro, as vezes da certo e as vezes não, quanto tempo pra ela aprender?';
  const draft51 = `Antes de pensarmos em quanto tempo ela levará para aprender, precisamos entender por que ela está conseguindo entrar em sono apenas no colo ou no peito.

É compreensível que a sua bebê de 51 dias tenha dificuldade para dormir durante o dia, especialmente nessa faixa etária, onde muitos bebês preferem o colo ou o peito para adormecer. Isso é comum e esperado.

Para ajudá-la a dormir, siga este passo a passo: primeiro, observe a janela de vigília dela, que deve ser de 45 minutos a 1 hora e 15 minutos. Se ela ainda estiver com fome, mantenha a alimentação. Se estiver saciada e permanecer no peito, você pode retirar do peito e colocá-la em posição vertical por 20 a 30 minutos. Depois, conduza-a ao sono, utilizando a técnica do travesseiro que você já está aplicando. É importante que você inicie essa condução quando ela estiver calma, e não durante uma crise de choro.

Quanto ao tempo para aprender, não existe um prazo fixo — a evolução depende da consistência e repetição na organização da alimentação, vigília e sono.

Para entender melhor, poderia me informar quanto tempo a bebê permanece acordada antes das sonecas e como a Estratégia do Travesseiro está sendo realizada?

Recomendo também revisar a aula sobre a Estratégia do Travesseiro para garantir que você está aplicando da melhor forma possível.

Quando ela ‘só dorme no peito’, diferencie: ainda está com fome; fez mamada efetiva e ficou saciada; ou já saciada permanece sugando enquanto adormece. Se ainda houver sinais de fome, mantenha a alimentação. Se ela já estiver saciada e continuar no peito, retire-a do peito, coloque em posição vertical e, depois, conduza ao sono.

Na condução, use contenção e presença observando a resposta da bebê — sem cronometrar o choro e sem tempo predeterminado.`;
  const sig = extractSignals({ message: message51, ageBand: '30_60', ageDays: 51 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft51,
    message: message51,
    signals: sig,
    babyProfile: { babyName: 'Lara', ageDays: 51, sex: 'f' },
  });
  assert(!/inicie.{0,50}quando (ela|a beb[eê]) estiver calma/i.test(enriched.text), 'TESTE 008 51d: no calma-start rule');
  assert(((enriched.text.match(/retir[ae]-a(?: do peito)?|retire-a do peito|retirar do peito/gi) || []).length <= 1), 'TESTE 008 51d: satiety conduct once');
  assert(/diferencie:\s*ainda est[aá] com fome/i.test(enriched.text) && /retire-a do peito|retir[ae]-a do peito/i.test(enriched.text), 'TESTE 008 51d: keep complete satiety conduct');
  assert(/aula.{0,80}travesseiro/i.test(enriched.text), 'TESTE 008 51d: keep travesseiro lesson');
  assert(/por que ela est[aá] conseguindo entrar em sono apenas no colo/i.test(enriched.text), 'TESTE 008 51d: investigate first');
}

{
  const message55 =
    'Bom dia! Bebê de 55 dias e chupa chupeta… quando a chupeta cai da boca ele reclama… devo colocá-la logo em seguida ou devo esperar um pouco para colocá-la na boca dele novamente? Outra coisa, a janela de sono dele está maior que 1h15. Geralmente 1h30 a 1h45! Tem problema?';
  const draft55 = `Bom dia!

Se a chupeta cair e ele apenas reclamar, você não precisa recolocá-la imediatamente. Observe se ele continua dormindo. Se despertar e precisar de ajuda, você pode oferecer a chupeta novamente.

Sobre a janela de vigília: aos 55 dias, a referência é de 45 minutos a 1 hora e 15 minutos. Permanecer acordado habitualmente por 1h30 a 1h45 já ultrapassa o indicado para essa faixa etária. Procure observar os sinais de sono e iniciar a preparação para dormir antes de ultrapassar 1h15.

Para entender melhor, quanto tempo ele demora para entrar em sono após você iniciar a condução?

Ele apresenta sinais de saciedade após as mamadas?

Você pode conferir também a aula sobre Janela de Vigília no aplicativo.`;
  const sig = extractSignals({ message: message55, ageBand: '30_60', ageDays: 55 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft55,
    message: message55,
    signals: sig,
    babyProfile: { babyName: 'Pedro', ageDays: 55, sex: 'm' },
  });
  assert(!/sinais de saciedade ap[oó]s as mamadas/i.test(enriched.text), 'TESTE 008 55d: no satiety ask');
  assert(/n[aã]o precisa recoloc/i.test(enriched.text), 'TESTE 008 55d: keep pacifier wait');
  assert(/1h30|1h\s*30/i.test(enriched.text) && /ultrapass|acima/i.test(enriched.text), 'TESTE 008 55d: keep 1h30–1h45 above');
  assert(/aula.{0,40}Janela de Vig[ií]lia/i.test(enriched.text), 'TESTE 008 55d: keep Janela lesson');
  assert(((enriched.text.match(/quanto tempo (ele|ela) demora para (entrar em sono|adormecer)/gi) || []).length === 1), 'TESTE 008 55d: one enter-sleep ask');
}

{
  const message57 =
    'Oi! Bebê de 57 dias. Estou ensinando a adormecer direto no berço progressivamente... começo com sono da manhã e estou avançando gradativamente para as outras sonecas, até chegar no sono noturno. O indicado é ir progressivamente ou deveria tentar em todas as sonecas de uma vez? Além disso, em algumas tentativas, há choro e fico uns 10 min tentando acalmá-la. Quando não resolve, pego no colo, acalmo e refaço o processo novamente... O caminho é esse mesmo?';
  const draft57 = `É normal que a adaptação ao berço traga desafios, especialmente aos 57 dias. O que você está fazendo é um passo importante para ajudar seu bebê a se acostumar a dormir no berço.

A orientação prática segura é começar pela primeira soneca da manhã e seguir com todas as demais sonecas daquele mesmo dia no berço. Repita esse processo diariamente até consolidar. Quando houver choro, acalme seu bebê no colo e, em seguida, retorne ao berço, repetindo até que ele adormeça. Não é necessário cronometrar o choro; o foco deve ser na consistência e na repetição, acolhendo o choro e ajudando no colo quando necessário. A Estratégia do Travesseiro pode ser uma boa ferramenta para auxiliar nesse processo, então, se você já a utiliza, observe como está sendo feita.

Use a Estratégia do Travesseiro na condução e na colocação no berço.

Assista à aula sobre a Estratégia do Travesseiro no aplicativo para aprender como aplicá-la corretamente.`;
  const sig = extractSignals({ message: message57, ageBand: '30_60', ageDays: 57 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft57,
    message: message57,
    signals: sig,
    babyProfile: { babyName: 'Lara', ageDays: 57, sex: 'f' },
  });
  assert(!/pode ser uma boa (ferramenta|estrat[eé]gia)/i.test(enriched.text), 'TESTE 008 57d: no optional ferramenta');
  assert(/Use a Estrat[eé]gia do Travesseiro na condu[cç][aã]o e na coloca[cç][aã]o no ber[cç]o/i.test(enriched.text), 'TESTE 008 57d: keep direct Travesseiro');
  assert(/aula.{0,80}travesseiro/i.test(enriched.text), 'TESTE 008 57d: keep Travesseiro lesson');
}

{
  const message49 =
    'Meu bebê tem 1 mês e 19 dias, as sonecas duram uma média de 30 min, no máximo, em exceção, chega a durar 1h. No entanto, por vezes ele tem despertares durante as sonecas. Ele usa chupeta. Preciso ajustar algo?';
  const draft49 = `É compreensível que você esteja buscando ajustes nas sonecas do seu bebê de 49 dias. Sonecas de cerca de 30 minutos podem ocorrer nessa faixa etária, e é importante observar como ele desperta.

Para ajudar a melhorar a situação, recomendo que você respeite a janela de vigília, que é de 45 minutos a 1 hora e 15 minutos. Isso significa que, após esse período acordado, é hora de iniciar a condução para a soneca. Além disso, observe se os despertares coincidem com a queda da chupeta. Se isso acontecer, pode ser um fator a ser considerado.

Agora, gostaria de saber: como está a alimentação dele e os intervalos entre as mamadas? Ele parece saciado após as mamadas? E quanto tempo ele demora para adormecer depois de você iniciar a condução?

A condução deve respeitar a janela de 45 minutos a 1 hora e 15 minutos e os sinais de sono.`;
  const sig = extractSignals({ message: message49, ageBand: '30_60', ageDays: 49 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft49,
    message: message49,
    signals: sig,
    babyProfile: { babyName: 'Pedro', ageDays: 49, sex: 'm' },
  });
  assert(!/ap[oó]s esse per[ií]odo acordado.{0,80}iniciar a condu[cç][aã]o|[eé] hora de iniciar a condu[cç][aã]o para a soneca/i.test(enriched.text), 'TESTE 008 49d: no after-window start');
  assert(/dentro da janela|respeitar a janela de 45 minutos a 1 hora e 15/i.test(enriched.text), 'TESTE 008 49d: conduction within/respecting window');
  assert(/alimenta[cç][aã]o.{0,80}intervalos entre as mamadas/i.test(enriched.text), 'TESTE 008 49d: keep feeding ask');
  assert(/saciad/i.test(enriched.text), 'TESTE 008 49d: keep satiety ask');
}

console.log('\n=== Layer A: TESTE 009 enricher replay ===\n');

{
  const message30 =
    'Minha bebê de 30 dias faz sonecas de 1h às vezes mais.. quando acorda ela acorda muito brava e chora bastante e só acalma dando o peito mama bem pouco e relaxa.. como melhorar? Antes da soneca ela já mama em média 20 a 30 min';
  const draft30 = `Como ela consegue dormir por cerca de 1 hora ou até mais, eu não consideraria a duração da soneca o principal problema neste momento. O que chama mais atenção é ela acordar muito irritada e relaxar depois de sugar um pouco. Por isso, primeiro observaria como está a mamada e se existe algum desconforto depois dela.

O tempo de mamada, sozinho, não comprova saciedade — mesmo que ela tenha mamado 20 a 30 minutos antes da soneca. Observe sucção ativa, deglutição e sinais de saciedade. Sugar pouco e relaxar ao despertar não significa automaticamente que ela precise se alimentar: investigue também desconforto e se a sucção está sendo usada para relaxar.

É compreensível que você esteja preocupada com o choro da sua bebê ao acordar. Com 30 dias, é comum que os bebês apresentem variações no sono e nos despertares. O que chama atenção no seu relato é que, apesar das sonecas de cerca de 1 hora ou mais, ela acorda muito irritada e só se acalma ao mamar.

A principal hipótese aqui é que o choro pode estar relacionado à alimentação e saciedade, além de possíveis desconfortos após a mamada. Para melhorar essa situação, sugiro que você observe o que acontece entre o fim da mamada e a hora de deitar. Pergunte-se: houve arroto? Ela permaneceu em posição vertical por 20 a 30 minutos? A mamada pareceu efetiva, com sucção ativa e sinais de que ela está saciada?

Além disso, é importante garantir que a janela de vigília antes das sonecas seja respeitada, que é de 45 minutos a 1 hora e 15 minutos. Se a sua bebê estiver acordada por muito tempo antes de dormir, isso pode contribuir para a irritação.

Se você puder compartilhar mais sobre a duração da soneca da manhã e quanto tempo ela demora para adormecer após você iniciar a condução, isso pode ajudar a refinar ainda mais a orientação.

Para aprofundar no tema, recomendo que você acesse a aula sobre refluxo e alimentação.`;
  const sig = extractSignals({ message: message30, ageBand: '30_60', ageDays: 30 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft30,
    message: message30,
    signals: sig,
    babyProfile: { babyName: 'Lara', ageDays: 30, sex: 'f' },
  });
  const intentFix = applyThirtySixtyIntentOverrides({
    intent: { intent: 'sonecas_curtas', confidence: 0.8, source: 'test' },
    message: message30,
    ageDays: 30,
  });
  assert(intentFix.intent.intent === 'mamadas', 'TESTE 009 30d: intent sonecas_curtas → mamadas');
  assert(/20 a 30 minutos/i.test(enriched.text), 'TESTE 009 30d: postural 20–30');
  assert(!/posi[cç][aã]o vertical por (cerca de )?30 a 40 minutos/i.test(enriched.text), 'TESTE 009 30d: no postural 30–40');
  assert(!/janela de vig[ií]lia/i.test(enriched.text), 'TESTE 009 30d: no wake window without evidence');
  assert(!/dura[cç][aã]o da soneca da manh[aã]/i.test(enriched.text), 'TESTE 009 30d: no morning-nap ask');
  assert(!/[eé] compreens[ií]vel que voc[eê] esteja preocupada/i.test(enriched.text), 'TESTE 009 30d: no restart');
  assert(/n[aã]o consideraria a dura[cç][aã]o da soneca/i.test(enriched.text), 'TESTE 009 30d: keep 1h+ axis');
}

{
  const message31 =
    'Ola tudo bem? Meu filho tem 31 dias, sempre fez as sonecas no berço, que duravam cerca de 2 hrs/ 2 hrs e 30. Mas faz 02 dias que ele tem feito uma soneca grande pela manhã e, durante a tarde, as sonecas estão bem curtas. Um ciclo de sono. Ele desperta e eu ate tendo nina-lo no berço, mas ele nao retorna. Depois de 30 minutos ja esta com sono novamente. Outra questao eh que ele demora femais para iniciar a soneca. O ambiente esta ajustado, ele esta alimentado, tudo tranquilo, janela de sono del eh de 1 hr/1 hr 15, quando vai dando este horário, vou para o quarto; coloco ruido, quarto escuro, nino ele no colo e ainda acordado transfiro pro berço. Quando no berço, ele demora muuuito prw relaxar, quase 40/45 minutos. Nao sei como conduzir nesta situação. Faz uns 4,5 dias que esta assim.';
  const draft31 = `Olá! É compreensível que você esteja enfrentando dificuldades com o sono do seu filho de 31 dias.

A principal hipótese aqui é a vigília excessiva. Isso significa que ele pode estar ficando muito tempo acordado antes de adormecer, o que pode dificultar o relaxamento.

Recomendo fracionar a soneca da manhã para cerca de 1h30 a 2h, observando se isso melhora as sonecas da tarde. Além disso, se você perceber que ele está próximo do intervalo para mamar e demora a dormir, considere amamentá-lo para ajudar a relaxar e manter o sono.

Isso ajudará a entender melhor a situação.

Para mais orientações sobre a janela de vigília e como estruturar a rotina, você pode conferir a aula "Janela de Vigília" no aplicativo.

A vigília excessiva vem da soma — não da soneca longa da manhã: se a condução começa depois de cerca de 1h–1h15 e ele ainda leva uns 40–45 minutos para adormecer, o tempo acordado chega perto de 1h40–2h — acima da referência de 45 minutos a 1 hora e 15 minutos.

Como ele já demora cerca de 40 a 45 minutos para adormecer, antecipe o início da condução — não espere os sinais de sono — para que ele entre em sono dentro da janela de 45 minutos a 1 hora e 15 minutos.

Também é importante saber qual costuma ser o intervalo entre as mamadas: se durante a demora para adormecer ele estiver se aproximando do próximo intervalo alimentar, considere fome antes de insistir no sono.`;
  const sig = extractSignals({ message: message31, ageBand: '30_60', ageDays: 31 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft31,
    message: message31,
    signals: sig,
    babyProfile: { babyName: 'João', ageDays: 31, sex: 'm' },
  });
  assert(!/Isso ajudar[aá] a entender melhor a situa[cç][aã]o/i.test(enriched.text), 'TESTE 009 31d: no orphan ajudará');
  assert(!/amament[aá]-l[oa] para ajudar a relaxar/i.test(enriched.text), 'TESTE 009 31d: no breast-to-relax');
  const calcPos = enriched.text.search(/vig[ií]lia excessiva vem da soma|1h40/i);
  const lessonPos = enriched.text.search(/aula.{0,40}Janela/i);
  assert(calcPos >= 0 && (lessonPos < 0 || calcPos < lessonPos), 'TESTE 009 31d: calc before lesson');
  assert(/considere fome antes de insistir no sono/i.test(enriched.text), 'TESTE 009 31d: keep one feed orientation');
  assert(/antecip/i.test(enriched.text), 'TESTE 009 31d: keep anticipate');
}

{
  const message45 =
    'Bebê de 45 dias, o ritual do sono precisa começar entre 19 e 20 horas? Meu esposo gosta de dar banho nele e chega por volta das 22:00. Estou iniciando o sono noturno às 21h, porém ele está demorando para cair no sono. E o banho pode dar às 21:30?';
  const draft45 = `É compreensível que você esteja se organizando para o sono noturno do seu bebê de 45 dias. O horário recomendado para o início do sono noturno é entre 19h e 20h. Iniciar às 21h já está além dessa faixa, e O banho às 21h30 não é recomendado quando leva o início do sono noturno para ainda mais tarde. A família pode organizar conforme sua dinâmica, mas o banho às 21h30 não é recomendado quando leva o início do sono noturno para ainda mais tarde — 21h30 ou 22h não é o horário recomendado. A questão não é apenas o banho em si, mas o horário tardio que pode afetar a rotina.
Para ajudar seu bebê a adormecer mais facilmente, observe a última soneca e o tempo que ele permanece acordado antes de tentar iniciar a noite. A janela de vigília ideal é de 45 minutos a 1 hora e 15 minutos.`;
  const sig = extractSignals({ message: message45, ageBand: '30_60', ageDays: 45 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft45,
    message: message45,
    signals: sig,
    babyProfile: { babyName: 'Lara', ageDays: 45, sex: 'f' },
  });
  assert(!/\be O banho\b/.test(enriched.text), 'TESTE 009 45d: no e O banho');
  assert(((enriched.text.match(/banho [àa]s 21h30 n[aã]o [eé] recomendado/gi) || []).length === 1), 'TESTE 009 45d: bath 21h30 once');
  assert(/21h.{0,40}(al[eé]m|fora da faixa|j[aá] est[aá])/i.test(enriched.text), 'TESTE 009 45d: keep 21h already late');
}

{
  const message49 =
    'Meu bebê tem 1 mês e 19 dias, as sonecas duram uma média de 30 min, no máximo, em exceção, chega a durar 1h. No entanto, por vezes ele tem despertares durante as sonecas. Ele usa chupeta. Preciso ajustar algo?';
  const draft49 = `É compreensível que você esteja buscando ajustes nas sonecas do seu bebê de 49 dias, especialmente com a duração média de 30 minutos. Isso pode ser comum nesta faixa etária, e é importante observar como ele desperta.

A primeira orientação é respeitar a janela de vigília, que deve ser de 45 minutos a 1 hora e 15 minutos.

A condução deve ser iniciada dentro da janela de 45 minutos a 1 hora e 15 minutos, observando os sinais de sono e o tempo que ele demora para entrar em sono.`;
  const sig = extractSignals({ message: message49, ageBand: '30_60', ageDays: 49 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft49,
    message: message49,
    signals: sig,
    babyProfile: { babyName: 'Pedro', ageDays: 49, sex: 'm' },
  });
  assert(/como (ele|ela|o beb[eê]) desperta das sonecas:/i.test(enriched.text), 'TESTE 009 49d: ask how he wakes');
  assert(/dentro da janela de 45 minutos a 1 hora e 15/i.test(enriched.text), 'TESTE 009 49d: keep within-window');
}

{
  const message51 =
    'Minha neném 1 mês e 21 dias tem dificuldade de dormir durante o dia, só dorme se for no colo, e no peito, tento fazer a técnica do travesseiro, as vezes da certo e as vezes não, quanto tempo pra ela aprender?';
  const draft51 = `Antes de pensarmos em quanto tempo ela levará para aprender, precisamos entender por que ela está conseguindo entrar em sono apenas no colo ou no peito.

Isso é bastante comum e esperado.

Para ajudar a sua bebê a dormir fora do colo, siga este passo a passo: primeiro, observe a janela de vigília dela, que deve ser entre 45 minutos a 1 hora e 15 minutos. Após esse período, ofereça uma mamada efetiva, garantindo que ela esteja saciada. Se ela ainda estiver no peito após a mamada, retire-a suavemente. Em seguida, mantenha-a em posição vertical por 20 a 30 minutos antes de conduzi-la ao sono, utilizando a técnica do travesseiro que você já está aplicando. Lembre-se de que não existe um prazo fixo para ela aprender a dormir de forma independente; a evolução depende da consistência e repetição.

Você pode conferir a aula sobre a Estratégia do Travesseiro para mais orientações sobre como aplicá-la de forma eficaz.`;
  const sig = extractSignals({ message: message51, ageBand: '30_60', ageDays: 51 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft51,
    message: message51,
    signals: sig,
    babyProfile: { babyName: 'Lara', ageDays: 51, sex: 'f' },
  });
  assert(!/ap[oó]s esse per[ií]odo[^.!?]{0,80}(?:ofere[cç]a|fa[cç]a) uma mamada/i.test(enriched.text), 'TESTE 009 51d: no window-to-feed');
  assert(!/ainda estiver no peito ap[oó]s a mamada[^.!?]{0,40}retir/i.test(enriched.text), 'TESTE 009 51d: no bare retire after feed');
  assert(/saciad/i.test(enriched.text) && /retir[ae]-a do peito|retire-a do peito/i.test(enriched.text), 'TESTE 009 51d: complete satiety logic');
  assert(!/Isso [eé] (bastante )?comum e esperado/i.test(enriched.text), 'TESTE 009 51d: no colo/peito normalize');
  assert(/aula.{0,80}travesseiro/i.test(enriched.text), 'TESTE 009 51d: keep Travesseiro lesson');
}

console.log('\n=== Layer A: TESTE 010 enricher replay ===\n');

{
  const message30 =
    'Minha bebê de 30 dias faz sonecas de 1h às vezes mais.. quando acorda ela acorda muito brava e chora bastante e só acalma dando o peito mama bem pouco e relaxa.. como melhorar? Antes da soneca ela já mama em média 20 a 30 min';
  const draft30 = `Como ela consegue dormir por cerca de 1 hora ou até mais, eu não consideraria a duração da soneca o principal problema neste momento. O que chama mais atenção é ela acordar muito irritada e relaxar depois de sugar um pouco. Por isso, primeiro observaria como está a mamada e se existe algum desconforto depois dela.

O tempo de mamada, sozinho, não comprova saciedade — mesmo que ela tenha mamado 20 a 30 minutos antes da soneca. Observe sucção ativa, deglutição e sinais de saciedade. Sugar pouco e relaxar ao despertar não significa automaticamente que ela precise se alimentar: investigue também desconforto e se a sucção está sendo usada para relaxar.

É compreensível que você esteja preocupada com o despertar da sua bebê de 30 dias.

A principal hipótese aqui é que o que está acontecendo pode estar relacionado à alimentação e à saciedade. Como ela mama antes da soneca, é importante verificar se a mamada é efetiva e se ela está realmente saciada. Após a mamada, você pode tentar mantê-la em posição vertical por cerca de 20 a 30 minutos, para ajudar na digestão e evitar desconfortos. Isso pode ajudar a reduzir a irritação ao acordar.

Para entender melhor a situação, gostaria de saber: houve arroto após a mamada? Ela permaneceu em posição vertical? A mamada parece efetiva, com sucção ativa e sinais de saciedade?

Se precisar de mais orientações sobre como conduzir a alimentação e o sono, recomendo a aula sobre refluxo, que pode trazer insights úteis para o seu caso.

Depois da mamada, antes de deitar: houve arroto? Ela permaneceu em posição vertical por 30 a 40 minutos?

Há sinais de desconforto depois da mamada ou ao ser colocada no berço?`;
  const sig = extractSignals({ message: message30, ageBand: '30_60', ageDays: 30 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft30,
    message: message30,
    signals: sig,
    babyProfile: { babyName: 'Lara', ageDays: 30, sex: 'f' },
  });
  assert(/20 a 30 minutos/i.test(enriched.text), 'TESTE 010 30d: postural 20–30');
  assert(!/posi[cç][aã]o vertical por (cerca de )?30 a 40 minutos/i.test(enriched.text), 'TESTE 010 30d: no postural 30–40');
  assert(!/suc[cç][aã]o est[aá] sendo usada para relaxar/i.test(enriched.text), 'TESTE 010 30d: no suction-for-relax first');
  assert(!/[eé] compreens[ií]vel que voc[eê] esteja preocupada/i.test(enriched.text), 'TESTE 010 30d: no restart');
  assert(((enriched.text.match(/houve arroto|ela arrotou/gi) || []).length <= 1), 'TESTE 010 30d: arroto ask once');
  assert(((enriched.text.match(/posi[cç][aã]o vertical por cerca de 20 a 30 minutos/gi) || []).length <= 1), 'TESTE 010 30d: 20–30 once');
  assert(!/voc[eê] pode tentar mant[eê]-l[oa] em posi[cç][aã]o vertical/i.test(enriched.text), 'TESTE 010 30d: no 20–30 postural orientation leftover');
  assert(/n[aã]o consideraria a dura[cç][aã]o da soneca/i.test(enriched.text), 'TESTE 010 30d: keep 1h+ axis');
  assert(/refluxo/i.test(enriched.text), 'TESTE 010 30d: keep reflux');
}

{
  const message31 =
    'Ola tudo bem? Meu filho tem 31 dias, sempre fez as sonecas no berço, que duravam cerca de 2 hrs/ 2 hrs e 30. Mas faz 02 dias que ele tem feito uma soneca grande pela manhã e, durante a tarde, as sonecas estão bem curtas. Um ciclo de sono. Ele desperta e eu ate tendo nina-lo no berço, mas ele nao retorna. Depois de 30 minutos ja esta com sono novamente. Outra questao eh que ele demora femais para iniciar a soneca. O ambiente esta ajustado, ele esta alimentado, tudo tranquilo, janela de sono del eh de 1 hr/1 hr 15, quando vai dando este horário, vou para o quarto; coloco ruido, quarto escuro, nino ele no colo e ainda acordado transfiro pro berço. Quando no berço, ele demora muuuito prw relaxar, quase 40/45 minutos. Nao sei como conduzir nesta situação. Faz uns 4,5 dias que esta assim.';
  const draft31 = `Olá! É compreensível que você esteja enfrentando dificuldades com o sono do seu filho de 31 dias. Mudanças nas sonecas são comuns nessa fase, mas vamos trabalhar para melhorar isso.

Além disso, observe se ele está se alimentando adequadamente e se a mamada está sendo efetiva.

A vigília excessiva vem da soma — não da soneca longa da manhã: se a condução começa depois de cerca de 1h–1h15 e ele ainda leva uns 40–45 minutos para adormecer, o tempo acordado chega perto de 1h40–2h — acima da referência de 45 minutos a 1 hora e 15 minutos.

Como ele já demora cerca de 40 a 45 minutos para adormecer, antecipe o início da condução — não espere os sinais de sono — para que ele entre em sono dentro da janela de 45 minutos a 1 hora e 15 minutos.

A principal hipótese aqui é a vigília excessiva. Ele está fazendo uma soneca longa pela manhã (cerca de 2h a 2h30) e, em seguida, as sonecas da tarde estão curtas, com apenas um ciclo. Isso pode estar contribuindo para a dificuldade em relaxar no berço e a demora para adormecer. Para ajudar, recomendo fracionar a soneca da manhã para cerca de 1h30 a 2h. Isso pode ajudar a distribuir melhor o sono ao longo do dia e evitar que ele fique muito cansado à tarde.

Também é importante saber qual costuma ser o intervalo entre as mamadas: se durante a demora para adormecer ele estiver se aproximando do próximo intervalo alimentar, considere fome antes de insistir no sono.

Para mais informações sobre a janela de vigília e como estruturar a rotina, recomendo a aula ‘Janela de Vigília (PASSO 3)’.`;
  const sig = extractSignals({ message: message31, ageBand: '30_60', ageDays: 31 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft31,
    message: message31,
    signals: sig,
    babyProfile: { babyName: 'João', ageDays: 31, sex: 'm' },
  });
  assert(!/contribuindo para a dificuldade em relaxar/i.test(enriched.text), 'TESTE 010 31d: morning nap not delay-to-sleep');
  assert(!/alimentando adequadamente e se a mamada est[aá] sendo efetiva/i.test(enriched.text), 'TESTE 010 31d: no generic feed probe');
  assert(/vig[ií]lia excessiva vem da soma|n[aã]o da soneca longa da manh/i.test(enriched.text), 'TESTE 010 31d: keep sum-not-morning-nap');
  assert(/antecip/i.test(enriched.text), 'TESTE 010 31d: keep anticipate');
  assert(!/fracion.{0,40}1h\s*30/i.test(enriched.text), 'TESTE 010 31d: no 1h30–2h fraction');
  assert(/considere fome antes de insistir no sono/i.test(enriched.text), 'TESTE 010 31d: keep feed-interval canon');
  assert(((enriched.text.match(/[^.!?\n]*(?:intervalo entre as mamadas|considere fome)[^.!?]*[.!?]/gi) || []).length <= 1), 'TESTE 010 31d: feed orientation once');
}

{
  const message40 =
    'Olá. Meu bb tem 40 dias , tem noites que ele dorme super bem acorda entre 2:30 a 3 hrs , só que tem dia que após as 04:00 da manhã ele acorda de 1 em 1 hrs tento fazer ele continuar a dormir no berço porém sem sucesso, aí pego ele fico ninando no colo sem sucesso, aí coloco ele no peito ele mama mesmo sabendo que não é fome, ele mama e dorme. Continuo assim por ele ainda ser novinho ?';
  const draft40 = `É compreensível que você esteja preocupada com os despertares do seu bebê de 40 dias. É comum que os bebês nessa faixa etária tenham variações no padrão de sono, e os despertares frequentes podem ser desafiadores.

O primeiro passo é identificar o horário da última mamada antes das 4h da manhã. Se já transcorreram aproximadamente 2h30 a 3h desde uma mamada efetiva, ofereça mamada efetiva até a saciedade. Se ainda não completou esse intervalo após uma mamada efetiva, tente conduzi-lo novamente ao sono sem oferecer imediatamente o peito.

É importante lembrar que nem todo despertar é sinal de fome; às vezes, pode ser apenas agitação.

E como está a alimentação dele durante o dia?

Recomendo que você revise a aula sobre ‘Despertar Irritado Pós-Soneca’ para entender melhor como lidar com esses despertares e a alimentação do dia.

A percepção de que ‘não é fome’ não basta — e a decisão de oferecer o peito não se resume a ele ainda ser novinho.

Uma coisa é não acordar um bebê saudável e com bom ganho de peso só para mamar. Outra é ele acordar sozinho depois das 4h, de hora em hora, e mamar quando o peito é oferecido — e depois dormir. Nesse segundo caso, o intervalo de 3 horas não serve sozinho para decidir que a mamada não é necessária.

Antes de pensar em associação peito–sono, vale olhar a alimentação: ele mama no peito, fórmula ou complemento? Como está a rotina alimentar do dia — intervalos, efetividade das mamadas e manutenção da saciedade? Como está o ganho de peso e a produção de leite? Nesses despertares ele faz uma mamada efetiva ou só suga um pouco e adormece? Depois de mamar, houve arroto e posição vertical por 20 a 30 minutos? Há sinais de desconforto?`;
  const sig = extractSignals({ message: message40, ageBand: '30_60', ageDays: 40 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft40,
    message: message40,
    signals: sig,
    babyProfile: { babyName: 'Pedro', ageDays: 40, sex: 'm' },
  });
  assert(!/Despertar Irritado P[oó]s-?Soneca/i.test(enriched.text), 'TESTE 010 40d: no angry-wake lesson');
  assert(/sono noturno/i.test(enriched.text), 'TESTE 010 40d: night-sleep lesson');
  assert(/primeira parte da noite/i.test(enriched.text), 'TESTE 010 40d: first-night stretch');
  assert(/[uú]ltima mamada efetiva/i.test(enriched.text), 'TESTE 010 40d: last effective feed as reference');
  assert(/2h\s*30|2h30/i.test(enriched.text) && /mamada/i.test(enriched.text), 'TESTE 010 40d: keep 2h30–3h interval');
  assert(/20 a 30 minutos/i.test(enriched.text), 'TESTE 010 40d: keep postural 20–30');
  assert(!/rotina alimentar/i.test(enriched.text), 'TESTE 010 40d: no daytime-feed displacement');
  assert(!/n[aã]o acordar um beb[eê] saud[aá]vel/i.test(enriched.text), 'TESTE 010 40d: no healthy-wake comparison');
}

{
  const message51 =
    'Minha neném 1 mês e 21 dias tem dificuldade de dormir durante o dia, só dorme se for no colo, e no peito, tento fazer a técnica do travesseiro, as vezes da certo e as vezes não, quanto tempo pra ela aprender?';
  const draft51 = `Antes de pensarmos em quanto tempo ela levará para aprender, precisamos entender por que ela está conseguindo entrar em sono apenas no colo ou no peito.

Para ajudá-la, siga este passo a passo: primeiro, observe a janela de vigília dela, que deve ser de 45 minutos a 1 hora e 15 minutos. Após esse período, faça uma mamada efetiva, garantindo que ela esteja saciada. Se ela já realizou mamada efetiva, está saciada, sem sinais de fome e permanece no peito, retire-a do peito, coloque em posição vertical por 20 a 30 minutos e, depois, conduza ao sono. Depois, conduza-a ao sono, utilizando a Estratégia do Travesseiro que você já está aplicando.

Para mais detalhes sobre a Estratégia do Travesseiro, recomendo que você acesse a aula correspondente no aplicativo.

Não existe prazo fixo de dias para ela aprender: a evolução depende de repetição e consistência, com alimentação, vigília e sono organizados.

Recomendo que você revise a aula sobre a estratégia do travesseiro para obter mais orientações sobre como aplicá-la de forma eficaz.`;
  const sig = extractSignals({ message: message51, ageBand: '30_60', ageDays: 51 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft51,
    message: message51,
    signals: sig,
    babyProfile: { babyName: 'Lara', ageDays: 51, sex: 'f' },
  });
  assert(!/ap[oó]s esse per[ií]odo[^.!?]{0,100}(?:ofere[cç]a|fa[cç]a) (?:uma )?mamada/i.test(enriched.text), 'TESTE 010 51d: no window-to-feed');
  assert(((enriched.text.match(/conduza(?:-a)? ao sono/gi) || []).length <= 1), 'TESTE 010 51d: conduza once');
  assert(((enriched.text.match(/aula.{0,80}travesseiro|travesseiro.{0,80}aula/gi) || []).length === 1), 'TESTE 010 51d: Travesseiro lesson once');
  assert(/saciad/i.test(enriched.text) && /retir[ae]-a do peito|retire-a do peito/i.test(enriched.text), 'TESTE 010 51d: keep satiety conduct');
  assert(/20 a 30 minutos/i.test(enriched.text), 'TESTE 010 51d: keep vertical 20–30');
}

{
  const message55 =
    'Bom dia! Bebê de 55 dias e chupa chupeta… quando a chupeta cai da boca ele reclama… devo colocá-la logo em seguida ou devo esperar um pouco para colocá-la na boca dele novamente? Outra coisa, a janela de sono dele está maior que 1h15. Geralmente 1h30 a 1h45! Tem problema?';
  const draft55 = `Bom dia!

Se a chupeta cair e ele apenas reclamar, você não precisa recolocá-la imediatamente. Observe se ele continua dormindo. Se despertar e precisar de ajuda, você pode oferecer a chupeta novamente.

Sobre a janela de vigília: aos 55 dias, a referência é de 45 minutos a 1 hora e 15 minutos. Permanecer acordado habitualmente por 1h30 a 1h45 já ultrapassa o indicado para essa faixa etária. Procure observar os sinais de sono e iniciar a preparação para dormir antes de ultrapassar 1h15.

Para entender melhor, quanto tempo ele demora para entrar em sono após você iniciar a condução?

Ele parece tranquilo, chorando ou buscando o peito?

Você pode conferir também a aula sobre Janela de Vigília no aplicativo.`;
  const sig = extractSignals({ message: message55, ageBand: '30_60', ageDays: 55 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft55,
    message: message55,
    signals: sig,
    babyProfile: { babyName: 'Pedro', ageDays: 55, sex: 'm' },
  });
  assert(!/parece tranquilo[oa]?, chorando ou buscando o peito/i.test(enriched.text), 'TESTE 010 55d: no leaked how-wakes');
  assert(/quanto tempo ele demora para entrar em sono ap[oó]s voc[eê] iniciar a condu[cç][aã]o/i.test(enriched.text), 'TESTE 010 55d: keep enter-sleep ask');
  assert(/n[aã]o precisa recoloc/i.test(enriched.text), 'TESTE 010 55d: keep pacifier');
  assert(/aula.{0,40}Janela de Vig[ií]lia/i.test(enriched.text), 'TESTE 010 55d: keep Janela lesson');
}

{
  const message31 =
    'Ola tudo bem? Meu filho tem 31 dias, sempre fez as sonecas no berço, que duravam cerca de 2 hrs/ 2 hrs e 30. Mas faz 02 dias que ele tem feito uma soneca grande pela manhã e, durante a tarde, as sonecas estão bem curtas. Um ciclo de sono. Ele desperta e eu ate tendo nina-lo no berço, mas ele nao retorna. Depois de 30 minutos ja esta com sono novamente. Outra questao eh que ele demora femais para iniciar a soneca. O ambiente esta ajustado, ele esta alimentado, tudo tranquilo, janela de sono del eh de 1 hr/1 hr 15, quando vai dando este horário, vou para o quarto; coloco ruido, quarto escuro, nino ele no colo e ainda acordado transfiro pro berço. Quando no berço, ele demora muuuito prw relaxar, quase 40/45 minutos. Nao sei como conduzir nesta situação. Faz uns 4,5 dias que esta assim.';
  const draft31 = `Olá, mãe. É compreensível que essa situação esteja gerando preocupação. especialmente em relação à duração e ao tempo que leva para relaxar.

A principal hipótese aqui é a vigília excessiva. Quando o bebê faz uma soneca longa pela manhã e depois tem sonecas curtas à tarde, isso pode resultar em um tempo total acordado que excede a referência de 45 minutos a 1 hora e 15 minutos. Como você mencionou que ele demora cerca de 40 a 45 minutos para relaxar no berço, isso indica que o tempo total acordado pode estar em torno de 1h40 a 2h, o que é excessivo.

Para ajudar nessa situação, recomendo fracionar a soneca da manhã para cerca de 1h30 a 2h. Isso pode ajudar a distribuir melhor as sonecas ao longo do dia e evitar que ele fique muito cansado à tarde. Além disso, observe os sinais de sono e inicie a condução para a soneca assim que perceber que ele está começando a ficar sonolento.

Isso pode ajudar a avaliar se ele está se alimentando adequadamente e se a fome pode estar influenciando os despertares.

Para mais orientações sobre a rotina e a janela de vigília, você pode conferir a aula sobre "Rotina por Janelas" no aplicativo.

Também é importante saber qual costuma ser o intervalo entre as mamadas: se durante a demora para adormecer ele estiver se aproximando do próximo intervalo alimentar, considere fome antes de insistir no sono.`;
  const sig = extractSignals({ message: message31, ageBand: '30_60', ageDays: 31 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft31,
    message: message31,
    signals: sig,
    babyProfile: { babyName: 'João', ageDays: 31, sex: 'm' },
  });
  assert(
    !/soneca longa pela manh[aã].{0,220}tempo total acordado que excede/i.test(enriched.text),
    'TESTE 006 31d: long morning nap not cause of excess wake',
  );
  assert(!/fracion.{0,40}1h\s*30/i.test(enriched.text), 'TESTE 006 31d: no 1h30–2h fraction');
  assert(/1h–1h15|1h-1h15|1h–1h15|condu[cç][aã]o come[cç]a/i.test(enriched.text), 'TESTE 006 31d: wake = 1h–1h15 + 40–45');
  assert(/antecip/i.test(enriched.text), 'TESTE 006 31d: anticipate conduction');
  assert(!/observe os sinais de sono e inicie a condu/i.test(enriched.text), 'TESTE 006 31d: no sleep-sign gated start');
  assert(!/Isso pode ajudar a avaliar se ele est[aá] se alimentando adequadamente/i.test(enriched.text), 'TESTE 006 31d: drop orphan feed leftover');
  assert(/intervalo entre as mamadas/i.test(enriched.text), 'TESTE 006 31d: keep feed-interval orientation');
}

{
  const message45 =
    'Bebê de 45 dias, o ritual do sono precisa começar entre 19 e 20 horas? Meu esposo gosta de dar banho nele e chega por volta das 22:00. Estou iniciando o sono noturno às 21h, porém ele está demorando para cair no sono. E o banho pode dar às 21:30?';
  const draft45 = `É compreensível que você esteja buscando organizar o ritual do sono do seu bebê de 45 dias. O horário recomendado para o início do sono noturno é entre 19h e 20h. Iniciar às 21h já está além dessa faixa, e 21h30 não é recomendado, pois pode atrasar ainda mais o início do sono.

O banho às 21h30 pode contribuir para essa demora, mas a questão principal é o horário tardio. É importante observar também a última soneca e a janela de vigília, que deve ser de 45 minutos a 1 hora e 15 minutos. Isso ajudará a entender melhor a situação.

Para mais orientações sobre a rotina, você pode conferir a aula sobre a estruturação da rotina no aplicativo.

Sobre a pergunta objetiva: o banho às 21h30 não é recomendado quando leva o início do sono noturno para ainda mais tarde.

A família pode organizar conforme sua dinâmica, mas iniciar o sono noturno por volta de 21h30 ou 22h não é o recomendado.`;
  const sig = extractSignals({ message: message45, ageBand: '30_60', ageDays: 45 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft45,
    message: message45,
    signals: sig,
    babyProfile: { babyName: 'Lara', ageDays: 45, sex: 'f' },
  });
  assert(/19h.{0,20}20h/i.test(enriched.text), 'TESTE 006 45d: keep 19h–20h');
  assert(/21h.{0,40}(al[eé]m|fora da faixa|j[aá] est[aá])/i.test(enriched.text), 'TESTE 006 45d: 21h already late');
  assert(count2130Sentences(enriched.text) === 1, 'TESTE 006 45d: 21h30 in one sentence', String(count2130Sentences(enriched.text)));
  assert(/banho/i.test(enriched.text), 'TESTE 006 45d: still answers bath');
  assert(/fam[ií]lia pode organizar/i.test(enriched.text), 'TESTE 006 45d: keep family autonomy');
  assert(/45 minutos a 1 hora e 15/i.test(enriched.text), 'TESTE 006 45d: keep wake window');
}

function countCryCalm(text) {
  return (String(text || '').match(
    /[^.!?\n]*(?:irritar|ficar irritad|come[cç]ar a chorar)[^.!?]{0,180}(?:acalme|acalmar|se acalmar|siga a condu|continuar a condu|continue a condu)[^.!?]*[.!?]/gi,
  ) || []).length;
}

{
  const message55 =
    'Bom dia! Bebê de 55 dias e chupa chupeta… quando a chupeta cai da boca ele reclama… devo colocá-la logo em seguida ou devo esperar um pouco para colocá-la na boca dele novamente? Outra coisa, a janela de sono dele está maior que 1h15. Geralmente 1h30 a 1h45! Tem problema?';
  const draft55 = `Bom dia! É normal que o bebê de 55 dias use a chupeta e reclame quando ela cai. Se ele só reclamar, não é necessário recolocar imediatamente; observe se ele continua dormindo. Se despertar e precisar de ajuda, você pode oferecer a chupeta novamente.

Sobre a janela de sono, se está acima de 1h15, isso já está acima da referência de 45 minutos a 1 hora e 15 minutos. O ideal é que você comece a preparação para a soneca antes de passar de 1h15. Se a condução começa após 1h30 a 1h45 e ele demora cerca de 40-45 minutos para adormecer, o tempo total acordado pode estar excessivo.

Para entender melhor, quanto tempo ele demora para entrar em sono após você iniciar a condução?

Para entender melhor, como ele costuma acordar após as sonecas? Ele está mamando efetivamente e apresentando sinais de saciedade? E você percebe se os despertares coincidem com a queda da chupeta?

Se não houver essa relação, não há motivo para considerar a chupeta como causa principal dos despertares.

Você pode conferir mais sobre a janela de vigília na aula correspondente no aplicativo.`;
  const sig = extractSignals({ message: message55, ageBand: '30_60', ageDays: 55 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft55,
    message: message55,
    signals: sig,
    babyProfile: { babyName: 'Pedro', ageDays: 55, sex: 'm' },
  });
  assert(!/40.?45 minutos para adormecer/i.test(enriched.text), 'TESTE 006 55d: no invented 40-45 sleep onset');
  assert(!/tempo total acordado pode estar excessivo/i.test(enriched.text), 'TESTE 006 55d: no hypothetical excess total wake');
  assert(/entrar em sono/i.test(enriched.text), 'TESTE 006 55d: still ask time to enter sleep');
  assert(!/acordar ap[oó]s as sonecas|mamando efetivamente|despertares coincidem com a queda/i.test(enriched.text), 'TESTE 006 55d: no leaked nap/feed investigation');
  assert(/1h30|1h\s*30/i.test(enriched.text) && /acima|ultrapass/i.test(enriched.text), 'TESTE 006 55d: 1h30-1h45 is above ref');
  assert(!/fracion.{0,40}soneca da manh[aã]/i.test(enriched.text), 'TESTE 006 55d: no morning fraction');
  assert(!/Se n[aã]o houver essa rela[cç][aã]o/i.test(enriched.text), 'R16 55d: no orphan pacifier-relation leftover');
}

{
  const message56 =
    'Bebe de 56 dias. Posso colocar no berço e esperar ele dormir sozinho, se não estiver chorando? Ou preciso colocar ele em sono leve ? Ou em sono profundo?';
  const draft56 = `É esperado que, com 56 dias, o bebê comece a se adaptar melhor ao sono e à rotina. Se ele estiver tranquilo e sem chorar, você pode colocá-lo acordado no berço e dar a oportunidade de adormecer ali. Não é obrigatório esperar que ele esteja em sono leve ou profundo.

Se ele se irritar ou chorar, acalme-o e siga a condução, sem exigir que ele adormeça sozinho. Se ele adormecer mamando, pode ir já dormindo para o berço, sem acordá-lo.

Como ele está adormecendo atualmente? Você já está utilizando a Estratégia do Travesseiro?

Se ele ficar irritado ou começar a chorar, você pode ajudá-lo a se acalmar e continuar a condução do sono. Nessa fase, não precisamos exigir que ele sempre consiga adormecer sozinho, mas podemos aproveitar os momentos em que está tranquilo para favorecer o início do sono no berço.

A Estratégia do Travesseiro também pode ajudar na condução e na colocação do bebê no berço, dando mais segurança para você nesse processo.

Assista à aula sobre a Estratégia do Travesseiro no aplicativo para aprender como aplicá-la corretamente.`;
  const sig = extractSignals({ message: message56, ageBand: '30_60', ageDays: 56 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft56,
    message: message56,
    signals: sig,
    babyProfile: { babyName: 'Pedro', ageDays: 56, sex: 'm' },
  });
  assert(countCryCalm(enriched.text) === 1, 'TESTE 006 56d: cry/calm once', String(countCryCalm(enriched.text)));
  assert(/acordad/i.test(enriched.text), 'TESTE 006 56d: keep awake-ok');
  assert(/sono leve ou profundo/i.test(enriched.text), 'TESTE 006 56d: keep not required stage');
  assert(/j[aá] dormindo|adormecer mamando/i.test(enriched.text), 'TESTE 006 56d: keep feed-asleep');
  assert(/tamb[eé]m pode ajudar na condu[cç][aã]o e na coloca[cç][aã]o/i.test(enriched.text), 'TESTE 006 56d: keep travesseiro purpose');
  assert(!/dando mais seguran[cç]a/i.test(enriched.text), 'R16 56d: no unofficial mother-segurança justification');
}

{
  const message49 =
    'Meu bebê tem 1 mês e 19 dias, as sonecas duram uma média de 30 min, no máximo, em exceção, chega a durar 1h. No entanto, por vezes ele tem despertares durante as sonecas. Ele usa chupeta. Preciso ajustar algo?';
  const draft49 = `É comum que bebês de 49 dias tenham sonecas curtas, e isso pode ser esperado nesta fase. O fato de ele usar chupeta também pode influenciar os despertares durante as sonecas.

A orientação prática é observar a janela de vigília, que deve ser de 45 minutos a 1 hora e 15 minutos. Se você está iniciando a condução para a soneca após esse período, isso está correto. Além disso, sonecas de cerca de 1 hora não devem ser consideradas curtas, então não se preocupe com isso. Se ele está acordando após 30 minutos, vale a pena investigar como ele desperta e se isso coincide com a queda da chupeta.

Para isso, gostaria de saber: como ele desperta após as sonecas? Ele parece irritado ou calmo? E como está a alimentação e os intervalos entre as mamadas?

Para mais informações sobre a janela de vigília e sinais de sono, você pode conferir a aula correspondente no aplicativo.

Como ele usa chupeta, vale observar se os despertares acontecem justamente quando ela cai. Se não houver essa relação, não há motivo, pelas informações apresentadas, para considerar a chupeta como causa principal dos despertares.

Observe também quanto tempo ele permanece acordado antes das sonecas.

A duração de uma soneca de cerca de 30 minutos, sozinha, não indica que a condução precise começar mais cedo.`;
  const sig = extractSignals({ message: message49, ageBand: '30_60', ageDays: 49 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft49,
    message: message49,
    signals: sig,
    babyProfile: { babyName: 'Pedro', ageDays: 49, sex: 'm' },
  });
  assert(!/ap[oó]s esse per[ií]odo, isso est[aá] correto/i.test(enriched.text), 'TESTE 006 49d: no post-window start is correct');
  assert(/respeitar a janela/i.test(enriched.text), 'TESTE 006 49d: conduction respects the window');
  assert(!/chupeta tamb[eé]m pode influenciar os despertares/i.test(enriched.text), 'TESTE 006 49d: no premature pacifier cause');
  assert(/como ele desperta/i.test(enriched.text), 'TESTE 006 49d: keep how-he-wakes ask');
  assert(/quando ela cai/i.test(enriched.text), 'TESTE 006 49d: keep conditional pacifier');
  assert(/1 hora n[aã]o devem ser consideradas curtas|cerca de 1 hora.{0,40}n[aã]o.{0,20}curtas/i.test(enriched.text), 'TESTE 006 49d: 1h nap is not short');
}

console.log('\n=== Layer A: TESTE 011 enricher replay ===\n');

{
  const message30 =
    'Minha bebê de 30 dias faz sonecas de 1h às vezes mais.. quando acorda ela acorda muito brava e chora bastante e só acalma dando o peito mama bem pouco e relaxa.. como melhorar? Antes da soneca ela já mama em média 20 a 30 min';
  const draft30 = `Como ela consegue dormir por cerca de 1 hora ou até mais, eu não consideraria a duração da soneca o principal problema neste momento. O que chama mais atenção é ela acordar muito irritada e relaxar depois de sugar um pouco. Por isso, primeiro observaria como está a mamada e se existe algum desconforto depois dela.

O tempo de mamada, sozinho, não comprova saciedade — mesmo que ela tenha mamado 20 a 30 minutos antes da soneca. Observe sucção ativa, deglutição e sinais de saciedade. Sugar pouco e relaxar ao despertar não significa automaticamente que ela precise se alimentar.

Quando ela consegue dormir por cerca de 1 hora ou mais, a duração não é o principal ponto; o que chama atenção é acordar muito irritada e chorando.

A principal hipótese aqui é que pode haver uma questão relacionada à alimentação e saciedade, ou até mesmo desconforto após a mamada. Para melhorar essa situação, é importante investigar alguns pontos:

1. Após a mamada, você conseguiu fazer com que ela arrotasse?
2. Ela permaneceu em posição vertical por 30 a 40 minutos após mamar?
3. A mamada pareceu efetiva, com sucção ativa e sinais de saciedade?

Essas informações vão ajudar a entender melhor o que pode estar acontecendo. Além disso, se você ainda não assistiu, recomendo a aula sobre refluxo, que pode trazer insights valiosos sobre o que você está enfrentando.

Depois da mamada, antes de deitar: houve arroto?

Há sinais de desconforto depois da mamada ou ao ser colocada no berço?`;
  const sig = extractSignals({ message: message30, ageBand: '30_60', ageDays: 30 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft30,
    message: message30,
    signals: sig,
    babyProfile: { babyName: 'Lara', ageDays: 30, sex: 'f' },
  });
  assert(/arrotou e permaneceu em posi[cç][aã]o vertical por cerca de 20 a 30 minutos/i.test(enriched.text), 'TESTE 011 30d: combined 20–30 ask');
  assert(!/30 a 40 minutos/i.test(enriched.text), 'TESTE 011 30d: no postural 30–40');
  assert(countAngryWakeParas(enriched.text) === 1, 'TESTE 011 30d: nap reading once', String(countAngryWakeParas(enriched.text)));
  assert(((enriched.text.match(/arrot/gi) || []).length <= 2), 'TESTE 011 30d: arroto not repeated');
  assert(/n[aã]o comprova saciedade/i.test(enriched.text), 'TESTE 011 30d: time ≠ satiety');
  assert(/refluxo/i.test(enriched.text), 'TESTE 011 30d: keep reflux');
}

{
  const message31 =
    'Ola tudo bem? Meu filho tem 31 dias, sempre fez as sonecas no berço, que duravam cerca de 2 hrs/ 2 hrs e 30. Mas faz 02 dias que ele tem feito uma soneca grande pela manhã e, durante a tarde, as sonecas estão bem curtas. Um ciclo de sono. Ele desperta e eu ate tendo nina-lo no berço, mas ele nao retorna. Depois de 30 minutos ja esta com sono novamente. Outra questao eh que ele demora femais para iniciar a soneca. O ambiente esta ajustado, ele esta alimentado, tudo tranquilo, janela de sono del eh de 1 hr/1 hr 15, quando vai dando este horário, vou para o quarto; coloco ruido, quarto escuro, nino ele no colo e ainda acordado transfiro pro berço. Quando no berço, ele demora muuuito prw relaxar, quase 40/45 minutos. Nao sei como conduzir nesta situação. Faz uns 4,5 dias que esta assim.';
  const draft31 = `Olá! É compreensível que você esteja enfrentando dificuldades com o sono do seu filho de 31 dias. É comum que os padrões de sono mudem nessa fase, e a situação que você descreve pode ser ajustada.

A vigília excessiva vem da soma — não da soneca longa da manhã: se a condução começa depois de cerca de 1h–1h15 e ele ainda leva uns 40–45 minutos para adormecer, o tempo acordado chega perto de 1h40–2h — acima da referência de 45 minutos a 1 hora e 15 minutos.

A principal hipótese aqui é a vigília excessiva. Com a demora de 40 a 45 minutos para relaxar no berço, é importante antecipar a condução do sono.

Recomendo fracionar a soneca da manhã para cerca de 1h30 a 2h e observar se isso melhora as sonecas da tarde.

Também é importante saber qual costuma ser o intervalo entre as mamadas: se durante a demora para adormecer ele estiver se aproximando do próximo intervalo alimentar, considere fome antes de insistir no sono.

Isso nos ajudará a ajustar a rotina de forma mais eficaz.

Você pode também revisar a aula sobre a Janela de Vigília, que pode oferecer mais insights sobre como organizar os períodos de sono do seu filho.`;
  const sig = extractSignals({ message: message31, ageBand: '30_60', ageDays: 31 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft31,
    message: message31,
    signals: sig,
    babyProfile: { babyName: 'João', ageDays: 31, sex: 'm' },
  });
  const vigiliaParas = enriched.text.split(/\n{2,}/).filter((p) => /vig[ií]lia excessiva/i.test(p));
  assert(vigiliaParas.length === 1, 'TESTE 011 31d: vigília excessiva in one block', String(vigiliaParas.length));
  assert(!/Isso nos ajudar[aá] a ajustar a rotina/i.test(enriched.text), 'TESTE 011 31d: no orphan “Isso nos ajudará”');
  assert(/1h40|1h 40/i.test(enriched.text), 'TESTE 011 31d: keep 1h40–2h sum');
  assert(/antecip/i.test(enriched.text), 'TESTE 011 31d: keep anticipate');
  assert(!/fracion.{0,40}1h\s*30/i.test(enriched.text), 'TESTE 011 31d: no 1h30–2h fraction');
}

{
  const message40 =
    'Olá. Meu bb tem 40 dias , tem noites que ele dorme super bem acorda entre 2:30 a 3 hrs , só que tem dia que após as 04:00 da manhã ele acorda de 1 em 1 hrs tento fazer ele continuar a dormir no berço porém sem sucesso, aí pego ele fico ninando no colo sem sucesso, aí coloco ele no peito ele mama mesmo sabendo que não é fome, ele mama e dorme. Continuo assim por ele ainda ser novinho ?';
  const draft40 = `É compreensível que você esteja preocupada com os despertares do seu bebê de 40 dias. É normal que, nesta faixa etária, ocorram variações no padrão de sono, e os despertares noturnos podem ser comuns.

O primeiro passo é identificar o horário da última mamada antes das 4h da manhã. Se já transcorreram aproximadamente 2h30 a 3h desde uma mamada efetiva, ofereça mamada efetiva até a saciedade. Se ainda não completou esse intervalo após uma mamada efetiva, tente conduzi-lo novamente ao sono sem oferecer imediatamente o peito.

A principal orientação é investigar o horário da última mamada antes das 4h. É importante que ele não aprenda a associar cada despertar à necessidade de mamar, pois isso pode criar associações negativas. Se ele acordar antes de 3 horas, tente fazê-lo dormir novamente sem mamar.

E como está a alimentação dele durante o dia?

Recomendo que você revise a aula sobre Estratégias para o Sono Noturno, que pode oferecer mais insights sobre como lidar com esses despertares.

A percepção de que “não é fome” não basta — e a decisão de oferecer o peito não se resume a ele ainda ser novinho.

Uma coisa é não acordar um bebê saudável e com bom ganho de peso só para mamar. Outra é ele acordar sozinho depois das 4h, de hora em hora, e mamar quando o peito é oferecido — e depois dormir. Nesse segundo caso, o intervalo de 3 horas não serve sozinho para decidir que a mamada não é necessária.

Antes de pensar em associação peito–sono, vale olhar a alimentação: ele mama no peito, fórmula ou complemento? Como está a rotina alimentar do dia — intervalos, efetividade das mamadas e manutenção da saciedade? Como está o ganho de peso e a produção de leite? Nesses despertares ele faz uma mamada efetiva ou só suga um pouco e adormece? Depois de mamar, houve arroto e posição vertical por 20 a 30 minutos? Há sinais de desconforto?`;
  const sig = extractSignals({ message: message40, ageBand: '30_60', ageDays: 40 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft40,
    message: message40,
    signals: sig,
    babyProfile: { babyName: 'Pedro', ageDays: 40, sex: 'm' },
  });
  assert(/primeira parte da noite/i.test(enriched.text), 'TESTE 011 40d: first-night stretch');
  assert(/mais descansado|per[ií]odo maior de vig[ií]lia/i.test(enriched.text), 'TESTE 011 40d: rested wake period');
  assert(/2 horas a 2 horas e 30|2h a 2h\s*30/i.test(enriched.text), 'TESTE 011 40d: keep 2h–2h30 breast interval');
  assert(!/2h\s*30\s*[aàá–\-]\s*3h|2h30 a 3h/i.test(enriched.text), 'TESTE 011 40d: no obsolete 2h30–3h breast interval');
  assert(!/associa[cç][oõ]es negativas/i.test(enriched.text), 'TESTE 011 40d: no negative association');
  assert(!/n[aã]o acordar um beb[eê] saud[aá]vel/i.test(enriched.text), 'TESTE 011 40d: no healthy-wake comparison');
  assert(!/rotina alimentar/i.test(enriched.text), 'TESTE 011 40d: no daytime-feed displacement');
  assert(/sono noturno/i.test(enriched.text), 'TESTE 011 40d: keep night-sleep lesson');
  assert(/novinho/i.test(enriched.text), 'TESTE 011 40d: still answers novinho');
}

{
  const message51 =
    'Minha neném 1 mês e 21 dias tem dificuldade de dormir durante o dia, só dorme se for no colo, e no peito, tento fazer a técnica do travesseiro, as vezes da certo e as vezes não, quanto tempo pra ela aprender?';
  const draft51 = `Antes de pensarmos em quanto tempo ela levará para aprender, precisamos entender por que ela está conseguindo entrar em sono apenas no colo ou no peito.

É compreensível que você esteja enfrentando dificuldades para a sua neném de 51 dias dormir durante o dia. É comum que bebês nesta faixa etária tenham preferências por dormir no colo ou no peito, e isso não deve ser rotular o comportamento.

Para ajudar a sua bebê a dormir, siga este passo a passo: primeiro, observe a janela de vigília dela, que deve ser de 45 minutos a 1 hora e 15 minutos. Depois, verifique se ela está bem alimentada e se houve uma mamada efetiva, garantindo que ela esteja saciada. Se ela ainda demonstrar fome, mantenha a alimentação. Caso esteja saciada e permaneça no peito, você pode retirar do peito e colocá-la em posição vertical por 20 a 30 minutos. Em seguida, conduza-a ao sono, utilizando a Estratégia do Travesseiro, que você já está aplicando. É importante que a condução comece quando ela estiver calma, e não durante uma crise de choro.

Quanto ao tempo para aprender, não existe um prazo fixo; a evolução depende da repetição e consistência na organização da alimentação, vigília e sono.

Para entender melhor a situação, gostaria de saber: quanto tempo a bebê permanece acordada antes das sonecas? Quando você inicia a condução para o sono, como está sendo a execução da Estratégia do Travesseiro?

Quando ela ‘só dorme no peito’, diferencie: ainda está com fome; fez mamada efetiva e ficou saciada; ou já saciada permanece sugando enquanto adormece. Se ainda houver sinais de fome, mantenha a alimentação.

Recomendo que você revise a aula sobre a estratégia do travesseiro para obter mais orientações sobre como aplicá-la de forma eficaz.

Na condução, use contenção e presença observando a resposta da bebê — sem cronometrar o choro e sem tempo predeterminado.`;
  const sig = extractSignals({ message: message51, ageBand: '30_60', ageDays: 51 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft51,
    message: message51,
    signals: sig,
    babyProfile: { babyName: 'Lara', ageDays: 51, sex: 'f' },
  });
  assert(!/calma, e n[aã]o durante uma crise de choro|condu[cç][aã]o comece quando ela estiver calma/i.test(enriched.text), 'TESTE 011 51d: no calm-start rule');
  assert(!/prefer[eê]ncias? por dormir no colo/i.test(enriched.text), 'TESTE 011 51d: no colo/peito preference');
  assert(!/n[aã]o deve ser rotular/i.test(enriched.text), 'TESTE 011 51d: no broken rotular');
  assert(/saciad/i.test(enriched.text) && /20 a 30 minutos/i.test(enriched.text), 'TESTE 011 51d: keep satiety + 20–30');
  assert(/aula.{0,80}travesseiro/i.test(enriched.text), 'TESTE 011 51d: keep Travesseiro lesson');
}

{
  const message55 =
    'Bom dia! Bebê de 55 dias e chupa chupeta… quando a chupeta cai da boca ele reclama… devo colocá-la logo em seguida ou devo esperar um pouco para colocá-la na boca dele novamente? Outra coisa, a janela de sono dele está maior que 1h15. Geralmente 1h30 a 1h45! Tem problema?';
  const draft55 = `Bom dia!

Se a chupeta cair e ele apenas reclamar, você não precisa recolocá-la imediatamente. Observe se ele continua dormindo. Se despertar e precisar de ajuda, você pode oferecer a chupeta novamente.

Sobre a janela de vigília: aos 55 dias, a referência é de 45 minutos a 1 hora e 15 minutos. Permanecer acordado habitualmente por 1h30 a 1h45 já ultrapassa o indicado para essa faixa etária. Procure observar os sinais de sono e iniciar a preparação para dormir antes de ultrapassar 1h15.

Para entender melhor, quanto tempo ele demora para entrar em sono após você iniciar a condução?

Além disso, caprichar nas mamadas pode ajudar a garantir que ele esteja saciado e mais tranquilo para dormir.

Isso pode ajudar a entender melhor a situação.

Você pode conferir também a aula sobre Janela de Vigília no aplicativo.`;
  const sig = extractSignals({ message: message55, ageBand: '30_60', ageDays: 55 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft55,
    message: message55,
    signals: sig,
    babyProfile: { babyName: 'Pedro', ageDays: 55, sex: 'm' },
  });
  assert(!/caprichar nas mamadas/i.test(enriched.text), 'TESTE 011 55d: no unprompted feed');
  assert(!/saciad[oa].{0,40}tranquilo/i.test(enriched.text), 'TESTE 011 55d: no invented satiety');
  assert(!/Isso pode ajudar a entender melhor a situa[cç][aã]o/i.test(enriched.text), 'TESTE 011 55d: no filler');
  assert(/n[aã]o precisa recoloc/i.test(enriched.text), 'TESTE 011 55d: keep pacifier');
  assert(/quanto tempo ele demora para entrar em sono/i.test(enriched.text), 'TESTE 011 55d: keep enter-sleep ask');
  assert(/aula.{0,40}Janela de Vig[ií]lia/i.test(enriched.text), 'TESTE 011 55d: keep Janela lesson');
}

{
  const message44 =
    'Meu bebê tem 44 dias. Faz poucas sonecas. Uma soneca de 3h15 foi das 10h45 às 14h. Como organizo o dia? Às 21h45 ainda está acordado.';
  const draft44 = `É compreensível que você esteja preocupada com a organização do dia.

A soneca de 3h15 precisa ser encerrada aos 2h30.`;
  const sig = extractSignals({ message: message44, ageBand: '30_60', ageDays: 44 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft44,
    message: message44,
    signals: sig,
    babyProfile: { ageDays: 44 },
  });
  assert(!/1h30 a 1h45 acordado/i.test(enriched.text), 'R6 44d: 21h45 is not 1h45 wake');
  assert(/2 horas e 30|2h\s*30/i.test(enriched.text), 'R6 44d: keep nap cap');
}

{
  const message43 =
    'Ele tem 43 dias. Depois das 4h acorda de hora em hora. Ofereço o peito sempre?';
  const draft43 = `É compreensível que você esteja preocupada com os despertares.

Aceitar o peito ao acordar não comprova fome.`;
  const sig = extractSignals({ message: message43, ageBand: '30_60', ageDays: 43 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft43,
    message: message43,
    signals: sig,
    babyProfile: { ageDays: 43 },
  });
  assert(!/j[aá] dormiu algumas horas seguidas/i.test(enriched.text), 'R6 43d: no invented long first stretch');
  assert(!/Voc[eê] relata que ele dorme bem durante a primeira parte/i.test(enriched.text), 'R6 43d: no assumed first stretch');
  assert(/SE ele mamou efetivamente por volta das 4h|sem o hor[aá]rio e a qualidade da [uú]ltima mamada/i.test(enriched.text), 'R6 43d: conditional 4h feed');
  assert(/jejum/i.test(enriched.text), 'R6 43d: keep night fast');
}

{
  const message34 =
    'Ele tem 34 dias. Fica 1h10 acordado e ainda leva uns 38 minutos para dormir. De manhã a soneca é longa. Fraciono essa soneca?';
  const draft34 = `É normal que um bebê de 34 dias fique acordado por cerca de 1h10 e leve um tempo para adormecer. A janela de vigília ideal para essa faixa etária é de 45 minutos a 1 hora e 15 minutos.`;
  const sig = extractSignals({ message: message34, ageBand: '30_60', ageDays: 34 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft34,
    message: message34,
    signals: sig,
    babyProfile: { ageDays: 34 },
  });
  assert(!/[eé] normal que.{0,80}1h10/i.test(enriched.text), 'R6 34d: 1h10+38 is not normal');
  assert(/n[aã]o: isso n[aã]o est[aá] dentro da janela|acima da refer[eê]ncia/i.test(enriched.text), 'R6 34d: total wake above window');
  assert(/n[aã]o fracion/i.test(enriched.text), 'R6 34d: answer fraction with 2h30 cap');
}

{
  const message31 =
    'Meu bebê tem 31 dias. As sonecas ficam em 24 a 30 minutos. Ele usa chupeta e às vezes acorda no meio. Se acordar calmo, eu reconduzo ou já começo outra janela?';
  const draft31 = `É normal que, com 31 dias, o bebê tenha sonecas curtas. Como orientação prática, se ele acordar calmo, você pode iniciar a condução para a próxima soneca.`;
  const sig = extractSignals({ message: message31, ageBand: '30_60', ageDays: 31 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft31,
    message: message31,
    signals: sig,
    babyProfile: { ageDays: 31 },
  });
  assert(!/acordar calmo.{0,80}pr[oó]xima soneca/i.test(enriched.text), 'R7 31d: calm wake is not immediate next sleep');
  assert(/ainda parece cansado|despertar (for )?definitivo/i.test(enriched.text), 'R7 31d: tired vs definitive');
}

{
  const message38 =
    'Ele tem 38 dias. Quando a chupeta cai, recoloco na hora?';
  const draft38 = `É normal que, aos 38 dias, o bebê ainda dependa da chupeta para se acalmar. Quando a chupeta cai e ele apenas reclama, você não precisa recolocá-la imediatamente.`;
  const sig = extractSignals({ message: message38, ageBand: '30_60', ageDays: 38 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft38,
    message: message38,
    signals: sig,
    babyProfile: { ageDays: 38 },
  });
  assert(!/depend/i.test(enriched.text), 'R7 38d: no pacifier dependency');
  assert(/2 a 5 minutos/i.test(enriched.text), 'R7 38d: keep 2–5 min');
}

{
  const message36 =
    'Ele tem 36 dias. Fica 1h08 acordado e ainda leva uns 36 minutos para dormir. De manhã a soneca é longa. Fraciono essa soneca?';
  const draft36 = `A principal hipótese aqui é que a soneca da manhã, sendo longa, pode interferir na distribuição das sonecas.`;
  const sig = extractSignals({ message: message36, ageBand: '30_60', ageDays: 36 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft36,
    message: message36,
    signals: sig,
    babyProfile: { ageDays: 36 },
  });
  assert(/1h44|cerca de 1h44/i.test(enriched.text), 'R7 36d: 68+36 = 1h44');
  assert(!/1h35[–\-]1h40/i.test(enriched.text), 'R7 36d: do not rewrite to 1h35–1h40');
  assert(/n[aã]o fracion/i.test(enriched.text), 'R7 36d: no fraction without duration');
}

{
  const message41 =
    'Meu bebê tem 41 dias. Dormiu 15 minutos, tentei reconduzir e não voltou. O que faço agora?';
  const draft41 = `Observe se ele consegue se reorganizar e voltar a dormir. Se ele já estiver acordado por cerca de 1h30 a 1h45, isso está acima da referência.`;
  const sig = extractSignals({ message: message41, ageBand: '30_60', ageDays: 41 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft41,
    message: message41,
    signals: sig,
    babyProfile: { ageDays: 41 },
  });
  assert(/siga o dia|despertar definitivo/i.test(enriched.text), 'R7 41d: follow the day after failed reconduction');
  assert(!/1h30 a 1h45/i.test(enriched.text), 'R7 41d: no invented 1h30–1h45');
}

{
  const message33 =
    'Meu bebê tem 33 dias. As sonecas ficam em 26 a 32 minutos. Ele usa chupeta e às vezes acorda no meio. Se acordar calmo, eu reconduzo ou já começo outra janela?';
  const draft33 = `A recondução cabe sobretudo quando ele ainda parece cansado. Se o despertar for definitivo e ele estiver restabelecido, começa uma nova janela — não inicie outra condução só porque acordou calmo.

A orientação prática é que, se ele acordar calmo, você pode reconduzi-lo ao sono, respeitando a janela de vigília.

Se ele ainda parecer cansado, tente uma recondução breve. Se o despertar for definitivo, começa uma nova janela a partir daí.

Sonecas de cerca de 22 a 28 minutos, se forem recorrentes, merecem observar se a tendência cai abaixo de cerca de 20 minutos.`;
  const sig = extractSignals({ message: message33, ageBand: '30_60', ageDays: 33 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft33,
    message: message33,
    signals: sig,
    babyProfile: { ageDays: 33 },
  });
  assert(!/acordar calmo.{0,80}pode reconduzi/i.test(enriched.text), 'R8 33d: drop calm → reconduce');
  assert(!/22 a 28 minutos/i.test(enriched.text), 'R8 33d: do not leak 22–28 when mother said 26–32');
  assert(/26 a 32 minutos|ainda parece cansado|despertar (for )?definitivo/i.test(enriched.text), 'R8 33d: keep tired vs definitive with her numbers');
  assert(!/tente uma recondu[cç][aã]o breve/i.test(enriched.text), 'R14 33d: reconduction once');
  assert(/irritabilidade|comportamento ao acordar/i.test(enriched.text), 'R14 33d: irritability already directs to satiety/reflux');
}

{
  const message37 =
    'Ele tem 37 dias. Fica 1h12 acordado e ainda leva uns 32 minutos para dormir. De manhã a soneca é longa. Fraciono essa soneca?';
  const draft37 = `Com 32 minutos para adormecer, você está dentro da faixa, mas é bom ficar atenta.

A janela conta do despertar até ele efetivamente adormecer, incluindo o tempo de condução. Se ele já ficou 1h12 acordado e ainda leva 32 minutos para dormir, o total fica em cerca de 1h44 — acima da referência de 45 minutos a 1 hora e 15 minutos. Não: isso não está dentro da janela. Inicie a preparação mais cedo.

Não fraciono uma soneca só porque ela parece longa. O teto automático é 2 horas e 30 minutos. Me diga quanto tempo essa soneca da manhã durou.`;
  const sig = extractSignals({ message: message37, ageBand: '30_60', ageDays: 37 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft37,
    message: message37,
    signals: sig,
    babyProfile: { ageDays: 37 },
  });
  assert(/1h44/i.test(enriched.text), 'R8 37d: keep 1h44');
  assert(!/voc[eê] est[aá] dentro da faixa/i.test(enriched.text), 'R8 37d: drop “dentro da faixa”');
  assert(/n[aã]o: isso n[aã]o est[aá] dentro da janela/i.test(enriched.text), 'R8 37d: over the window');
}

{
  const message51n =
    'Ele tem 51 dias. Depois das 2h40 passa a ter sono mais leve e acorda. Aceita o peito. Ofereço toda vez?';
  const draft51n = `Isso é despertar no sono noturno, não vigília diurna. O relógio aqui é o jejum da idade — cerca de 3 horas aos 30 dias, aumentando até cerca de 5 horas aos 60 dias — e não o intervalo diurno de 2h a 2h30.

É compreensível que, após cerca de 2h40, ele acorda mais facilmente. Isso pode ser um sinal de que ele está se aproximando do limite da janela de vigília, que nesta faixa é de 45 minutos a 1 hora e 15 minutos.

Aceitar o peito ao acordar não comprova fome. Confira a última mamada efetiva, a saciedade e se o jejum da idade já foi atingido — cerca de 3 horas aos 30 dias, aumentando até cerca de 5 horas aos 60 dias.`;
  const sig = extractSignals({ message: message51n, ageBand: '30_60', ageDays: 51 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft51n,
    message: message51n,
    signals: sig,
    babyProfile: { ageDays: 51 },
  });
  assert(/jejum da idade|sono noturno, n[aã]o vig[ií]lia/i.test(enriched.text), 'R8 51d: night-fast clock');
  assert(!/aproximando do limite da janela de vig[ií]lia/i.test(enriched.text), 'R8 51d: night is not wake window');
}

{
  const message40f =
    'Meu bebê tem 40 dias. Dormiu 17 minutos, tentei reconduzir e não voltou. O que faço agora?';
  const draft40f = `Como a recondução já foi tentada e não funcionou, siga o dia: a nova janela começa no despertar definitivo.

Neste caso, acalme-o no colo e tente colocá-lo novamente no berço.

E o despertar coincide com a queda da chupeta?

Como a recondução já foi tentada e não funcionou, siga o dia: a nova janela começa no despertar definitivo. Se sonecas abaixo de cerca de 20 minutos forem recorrentes, investigue saciedade e sinais de refluxo.`;
  const sig = extractSignals({ message: message40f, ageBand: '30_60', ageDays: 40 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft40f,
    message: message40f,
    signals: sig,
    babyProfile: { ageDays: 40 },
  });
  assert(/siga o dia|despertar definitivo/i.test(enriched.text), 'R8 40d: stop after failed reconduction');
  assert(!/novamente no ber[cç]o/i.test(enriched.text), 'R8 40d: do not reopen crib reconduction');
  assert(!/chupeta/i.test(enriched.text), 'R8 40d: do not invent pacifier');
  assert(!/Como a recondu[cç][aã]o j[aá] foi tentada e n[aã]o funcionou,\s*Se /i.test(enriched.text), 'R12 40d: no orphan failed-reconduction prefix');
  assert(
    !(/Se o padr[aã]o for recorrente/i.test(enriched.text) && /Se sonecas abaixo de cerca de 20 minutos forem recorrentes/i.test(enriched.text)),
    'R13 40d: do not repeat the recurrence investigation',
  );
}

{
  const message44r =
    'Ele tem 44 dias. Começo o ritual às 18h20 e ele só adormece às 19h30. Está certo?';
  const draft44r = `A janela de vigília começa no último despertar, não no início do ritual. Sem o horário em que ele acordou, não dá para concluir que o intervalo do ritual foi a janela.

O horário recomendado para o início do sono noturno é entre 19h e 20h. No entanto, é importante observar que o ritual deve ser breve e não ultrapassar esse tempo acordado para evitar a hiperestimulação.

Se você começa o ritual às 18h20 e ele só adormece às 19h30, o intervalo entre o início do ritual e o adormecimento está acima do ideal, considerando a janela de vigília de 45 minutos a 1 hora e 15 minutos.`;
  const sig = extractSignals({ message: message44r, ageBand: '30_60', ageDays: 44 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft44r,
    message: message44r,
    signals: sig,
    babyProfile: { ageDays: 44 },
  });
  assert(/[uú]ltimo despertar, n[aã]o no in[ií]cio do ritual/i.test(enriched.text), 'R8 44d: ritual is not window start');
  assert(!/intervalo entre o in[ií]cio do ritual.{0,80}acima/i.test(enriched.text), 'R8 44d: do not score ritual as window');
  assert(!/intervalo.{0,40}entre o in[ií]cio do ritual.{0,80}al[eé]m/i.test(enriched.text), 'R13 44d ritual: do not score ritual duration as beyond the window');
  assert(!/hiperestimula/i.test(enriched.text), 'R11 44d: no ritual hyperstimulation causality');
  assert(/tempo de condu[cç][aã]o|efetivamente adormecer dentro da janela/i.test(enriched.text), 'R11 44d: conduction is part of the window');
  assert(/19h30 est[aá] dentro da refer[eê]ncia geral/i.test(enriched.text), 'R11 44d: 19h30 is within 19h–20h');
  assert(!/1 hora e 15 minutos;/i.test(enriched.text), 'R13 44d ritual: do not leave a truncated semicolon clause');
}

{
  const message44s =
    'Meu bebê tem 44 dias. De uma hora para outra só dorme no colo, com bastante choro. A janela fica em uns 48 minutos. Começo pelos estímulos?';
  const draft44s = `Antes de atribuir o quadro a excesso de estímulos, confirme mamada efetiva e saciedade, medidas posturais, desconforto ou refluxo e se a vigília realmente passou de 45 minutos a 1 hora e 15 minutos. Uma janela de cerca de 45 minutos, sozinha, não é vigília excessiva.

Como ela consegue dormir por cerca de 1 hora ou até mais, eu não consideraria a duração da soneca o principal problema neste momento. O que chama mais atenção é ela acordar muito irritada e relaxar depois de sugar um pouco.

A orientação prática segura é começar a adaptar o bebê ao berço durante as sonecas. Para isso, inicie pela primeira soneca da manhã e siga com todas as demais sonecas do mesmo dia no berço.`;
  const sig = extractSignals({ message: message44s, ageBand: '30_60', ageDays: 44 });
  assert(!sig.signals.some((s) => s.id === 'nap_angry_wake_30_60'), 'R8 44d: sudden cry is not angry-wake 1h');
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft44s,
    message: message44s,
    signals: sig,
    babyProfile: { ageDays: 44 },
  });
  assert(/Antes de atribuir o quadro a excesso de est[ií]mulos/i.test(enriched.text), 'R8 44d: physio before stimuli');
  assert(!/cerca de 1 hora ou at[eé] mais/i.test(enriched.text), 'R8 44d: no 1h nap carry-over');
  assert(!/todas as demais sonecas do mesmo dia no ber[cç]o/i.test(enriched.text), 'R8 44d: no unsolicited crib training');
}

{
  const message33 =
    'Meu bebê tem 33 dias. As sonecas ficam em 26 a 32 minutos. Ele usa chupeta e às vezes acorda no meio. Se acordar calmo, eu reconduzo ou já começo outra janela?';
  const draft33 = `A recondução cabe sobretudo quando ele ainda parece cansado. Se o despertar for definitivo e ele estiver restabelecido, começa uma nova janela — não inicie outra condução só porque acordou calmo.

Sonecas de cerca de 26 a 32 minutos, se forem recorrentes, merecem observar se a tendência cai abaixo de cerca de 20 minutos: aí as prioridades passam a ser saciedade e sinais de refluxo.`;
  const sig = extractSignals({ message: message33, ageBand: '30_60', ageDays: 33 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft33,
    message: message33,
    signals: sig,
    babyProfile: { ageDays: 33 },
  });
  assert(!/tend[eê]ncia cai abaixo/i.test(enriched.text), 'R9 33d: do not wait for 26–32 to fall below 20');
  assert(/irritabil|comportamento ao acordar/i.test(enriched.text), 'R9 33d: recurrent 26–32 observe wake behavior');
}

{
  const message40s =
    'Ele tem 40 dias. Fica uns 48 minutos acordado e, no sling, ainda leva 36 a 40 minutos para adormecer. Chora bastante até dormir. O sling é o que mais funciona. Isso está dentro da janela?';
  const draft40s = `Não: o tempo total, do despertar até ele efetivamente adormecer, está acima da janela de 45 minutos a 1 hora e 15 minutos.

A principal hipótese é que a dificuldade para dormir pode estar relacionada à vigília excessiva. Se sim, isso pode indicar fome, e a mamada deve ser priorizada.

Antes de atribuir o quadro só à janela, confirme mamada efetiva e saciedade, se o choro piora ao deitar, se há desconforto depois das mamadas e se a preferência pelo sling vem junto de outros sinais de refluxo. Preferência por posição vertical, sozinha, não prova refluxo.

O bebê de 40 dias está acima da janela de vigília. Isso indica que a condução para o sono deve ser antecipada para evitar que ele ultrapasse a janela de vigília e entre em hiperestimulação.`;
  const sig = extractSignals({ message: message40s, ageBand: '30_60', ageDays: 40 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft40s,
    message: message40s,
    signals: sig,
    babyProfile: { ageDays: 40 },
  });
  assert(!/principal hip[oó]tese/i.test(enriched.text), 'R9 40d sling: no main-hypothesis label');
  assert(!/pode indicar fome/i.test(enriched.text), 'R9 40d sling: approaching feed is not hunger');
  assert(/Antes de atribuir o quadro s[oó] [aà] janela/i.test(enriched.text), 'R9 40d sling: physio before window');
  assert(!/hiperestimula/i.test(enriched.text), 'R13 40d sling: exceeding the window is not auto-hyperstimulation');
  assert(/antecip|inicie a condu[cç][aã]o|condu[cç][aã]o mais cedo|condu[cç][aã]o para o sono deve/i.test(enriched.text), 'R13 40d sling: keep earlier conduction after the window is exceeded');
}

{
  const message47 =
    'Meu bebê tem 47 dias. O banho é às 20h20 e ele só dorme perto das 21h35. O ritual pode começar nesse horário?';
  const draft47 = `O horário recomendado para o início do sono noturno é entre 19h e 20h. Iniciar o ritual às 20h20 e fazer o bebê dormir apenas perto das 21h35 já está além dessa faixa.

O ritual deve ser breve, normalmente consistindo em banho, mamada e dormir.

A última soneca e o tempo acordado são fatores que influenciam a dificuldade para adormecer.

A última soneca e o tempo acordado são fatores que podem influenciar a dificuldade para adormecer.

A duração do ritual deve ser breve, e se o bebê só adormece às 21h35, é importante verificar quanto tempo ele permanece acordado antes de iniciar o ritual.

A última soneca e o tempo acordado antes de tentar iniciar a noite são informações importantes para ajustar a rotina.

Qual é o horário em que a última soneca termina? Para mais orientações sobre a rotina e o sono noturno, você pode conferir a aula "Início do Sono Noturno" no aplicativo.

Observe a que horas termina a última soneca e há quanto tempo está acordado.

Para entender melhor a situação, gostaria de saber a que horas termina a última soneca e quanto tempo costuma ficar acordado antes de tentar iniciar a noite.

A referência de 19h a 20h é para o início do sono noturno, não necessariamente para o começo do ritual. Preserve o horário que você informou e mantenha o ritual breve, com a mamada depois do banho.

A demora para adormecer não deve ser explicada apenas pelo horário, é importante também verificar a última soneca e a janela de vigília, que deve ser de 45 minutos a 1 hora e 15 minutos. Para mais informações sobre a rotina e o sono noturno, recomendo a aula "Sono Noturno" no aplicativo.

O ritual deve ser breve: banho, mamada, medidas posturais e condução ao berço.A janela de vigília é de 45 minutos a 1 hora e 15 minutos, e o ritual deve ser organizado para respeitar essa janela.

Para entender melhor a situação, a última soneca do bebê e quanto tempo ele costuma ficar acordado antes de tentar iniciar a noite são informações importantes.

A última soneca do dia também deve ser considerada para entender melhor a situação. Aconselho que você observe esses pontos e, se necessário, ajuste o horário do banho e do início do ritual para que o bebê possa dormir mais cedo.

O ritual deve ser breve: banho, mamada, medidas posturais e condução ao berço. Se o bebê só adormece às 21h35, é importante verificar quanto tempo ele permanece acordado antes de tentar iniciar a noite. A janela de vigília é de 45 minutos a 1 hora e 15 minutos, e o ritual deve ser ajustado para que o bebê não fique acordado além desse tempo.`;
  const sig = extractSignals({ message: message47, ageBand: '30_60', ageDays: 47 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft47,
    message: message47,
    signals: sig,
    babyProfile: { ageDays: 47 },
  });
  assert(!/j[aá] est[aá] al[eé]m dessa faixa/i.test(enriched.text), 'R9 47d: ritual 20h20 is not beyond 19h–20h');
  assert(/n[aã]o necessariamente para o come[cç]o do ritual/i.test(enriched.text), 'R9 47d: 19h–20h is night-sleep start');
  assert(!/Preserve o hor[aá]rio que voc[eê] informou/i.test(enriched.text), 'R10 47d: do not keep the 20h20 ritual before day facts');
  assert(/21h35.{0,80}al[eé]m|al[eé]m.{0,80}21h35/i.test(enriched.text), 'R10 47d: sleep at 21h35 is beyond 19h–20h');
  assert(/60 dias/i.test(enriched.text), 'R10 47d: late exception is not automatic at 47 days');
  assert(!/(influenciam|podem influenciar) a dificuldade para adormecer/i.test(enriched.text), 'R13 47d: last nap is not presumed cause of delay');
  assert(/precisam ser avaliados para organizar/i.test(enriched.text), 'R13 47d: last nap is evaluated to organize the night');
  assert(!/gostaria de saber a que horas termina a [uú]ltima soneca/i.test(enriched.text), 'R13 47d: do not duplicate the last-nap investigation question');
  assert((enriched.text.match(/O ritual deve ser breve/gi) || []).length <= 1, 'R13 47d: ritual-brief once');
  assert(!/verificar quanto tempo ele permanece acordado antes de iniciar o ritual/i.test(enriched.text), 'R16 47d: last-nap ask is not duplicated as verificar acordado');
  assert(!/informa[cç][oõ]es importantes para ajustar a rotina/i.test(enriched.text), 'R16 47d: no extra last-nap/awake-time opener');
  assert(/N[aã]o preserve o hor[aá]rio do ritual antes de saber/i.test(enriched.text), 'R16 47d: keep official context ask');
  assert(!/aula ['"“”']?In[ií]cio do Sono Noturno/i.test(enriched.text), 'R16 47d: no unsolicited Início do Sono Noturno aula');
  assert(!/Qual [eé] o hor[aá]rio em que a [uú]ltima soneca termina/i.test(enriched.text), 'R16 47d: last-nap clock is already in the official ask');
  assert(!/Observe a que horas termina a [uú]ltima soneca e h[aá] quanto tempo est[aá] acordado/i.test(enriched.text), 'R16 47d: last-nap observe-ask is already in the official block');
  assert(!/ber[cç]o\.A refer/i.test(enriched.text), 'R16 47d: no glued ritual-brief and night-start sentences');
  assert(!/aula ['"“”']?Sono Noturno/i.test(enriched.text), 'R16 47d: no unsolicited Sono Noturno aula');
  assert(!/A demora para adormecer n[aã]o deve ser explicada apenas pelo hor[aá]rio/i.test(enriched.text), 'R16 47d: last-nap is already in the official context ask');
  assert(!/ritual deve ser organizado para respeitar essa janela/i.test(enriched.text), 'R16 47d: no extra ritual-window organizer');
  assert(!/s[aã]o informa[cç][oõ]es importantes[.!]/i.test(enriched.text), 'R16 47d: last-nap facts are already in Não preserve');
  assert(!/ajuste o hor[aá]rio do banho/i.test(enriched.text), 'R16 47d: do not invent a bath-time change');
  assert(!/verificar quanto tempo ele permanece acordado antes de tentar iniciar a noite/i.test(enriched.text), 'R16 47d: awake-time is already in Não preserve');
  assert(!/ritual deve ser ajustado para que o beb[eê] n[aã]o fique acordado/i.test(enriched.text), 'R16 47d: ritual is not recast as a wake-window cap');
}

{
  const message51n =
    'Ele tem 51 dias. Depois das 2h40 passa a ter sono mais leve e acorda. Aceita o peito. Ofereço toda vez?';
  const draft51n = `Isso é despertar no sono noturno, não vigília diurna. O relógio aqui é o jejum da idade — cerca de 3 horas aos 30 dias, aumentando até cerca de 5 horas aos 60 dias — e não o intervalo diurno de 2h a 2h30.

Aceitar o peito ao acordar não comprova fome.`;
  const sig = extractSignals({ message: message51n, ageBand: '30_60', ageDays: 51 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft51n,
    message: message51n,
    signals: sig,
    babyProfile: { ageDays: 51 },
  });
  assert(/tente primeiro reconduzir/i.test(enriched.text), 'R9 51d: reconduce before fast if previous feed was effective');
  assert(/ofere[cç]a a mamada/i.test(enriched.text), 'R9 51d: offer after the age fast');
  assert(/volte ao intervalo da forma de alimenta[cç][aã]o/i.test(enriched.text), 'R9 51d: after the fast-ending feed, return to the feeding interval');
  assert((enriched.text.match(/cerca de 3 horas aos 30 dias/gi) || []).length <= 1, 'R13 51d night: jejum 3h@30d once');
}

{
  const message40p =
    'Meu bebê tem 40 dias. Mamou, ficou uns 18 minutos em pé no colo e ainda está acordado. Posso brincar ou já conduzo o sono?';
  const draft40p = `A janela começa quando ele acorda, não quando termina a mamada ou o tempo em pé. Sem o horário do último despertar, os minutos em posição vertical sozinhos não dizem se já é hora de conduzir o sono.

Se o bebê mamou, ficou em pé no colo por cerca de 18 minutos e ainda está acordado, você pode interagir levemente com ele, pois ele está calmo e dentro da janela de vigília.

A janela de vigília para um bebê de 40 dias é de 45 minutos a 1 hora e 15 minutos, contando desde o despertar. Como ele já ficou em pé por 18 minutos, você ainda tem tempo para interagir, mas fique atenta aos sinais de sono.`;
  const sig = extractSignals({ message: message40p, ageBand: '30_60', ageDays: 40 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft40p,
    message: message40p,
    signals: sig,
    babyProfile: { ageDays: 40 },
  });
  assert(!/pode interagir levemente/i.test(enriched.text), 'R9 40d play: do not authorize play without last wake time');
  assert(!/ainda tem tempo para interagir/i.test(enriched.text), 'R9 40d play: 18 min vertical is not leftover play time');
  assert(/18 minutos.{0,80}abaixo/i.test(enriched.text), 'R9 40d play: 18 min is short of 20–30');
}

{
  const message44c =
    'Ele tem 44 dias. Só dorme no charutinho. A mamada durou 14 minutos. O charutinho é o problema?';
  const draft44c = `Antes de tratar o charutinho como forma de condução, confirme mamada efetiva, saciedade e sinais de desconforto ou refluxo.

A principal hipótese é que a dificuldade para dormir durante o dia está relacionada à mamada efetiva e à saciedade. O charutinho, por si só, não deve ser rotulado como um problema nesta faixa etária.`;
  const sig = extractSignals({ message: message44c, ageBand: '30_60', ageDays: 44 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft44c,
    message: message44c,
    signals: sig,
    babyProfile: { ageDays: 44 },
  });
  assert(/^Nesta faixa o M[eé]todo n[aã]o define/i.test(enriched.text.trim()), 'R9 44d charutinho: undefined first');
  assert(!/principal hip[oó]tese/i.test(enriched.text), 'R9 44d charutinho: no main hypothesis');
  assert(!/n[aã]o deve ser rotulado como um problema/i.test(enriched.text), 'R9 44d charutinho: do not conclude it is not a problem');
}

{
  const message40b =
    'Meu bebê tem 40 dias. Ficou 13 minutos no peito e depois tomou 105 ml de fórmula. Esse tempo e esse volume estão adequados?';
  const draft40b = `O volume de 105 ml de fórmula está dentro da referência geral para um bebê de 40 dias, que é de 90 a 120 ml por mamada. O tempo de 13 minutos no peito, por si só, não é um critério isolado.

 Isso ajudará na adaptação do bebê à mamadeira sem garantir a ausência de desmame ou confusão de bico.

Se ele ainda demonstra fome ou irritação, pode ser necessário ajustar a alimentação.

Se você estiver pensando em como introduzir a fórmula, lembre-se que é mais fácil até cerca de 2 meses e meio.`;
  const sig = extractSignals({ message: message40b, ageBand: '30_60', ageDays: 40 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft40b,
    message: message40b,
    signals: sig,
    babyProfile: { ageDays: 40 },
  });
  assert(!/confus[aã]o de bico/i.test(enriched.text), 'R9 40d bottle: no nipple confusion');
  assert(/90 a 120 ml/i.test(enriched.text), 'R9 40d bottle: keep 90–120 ml');
  assert(!/2 meses e meio|2[,.]5 meses/i.test(enriched.text), 'R13 40d bottle: no unsolicited 2.5-month formula intro');
  assert(!/fome ou irrita[cç][aã]o.{0,80}ajustar a alimenta[cç][aã]o/i.test(enriched.text), 'R14 40d bottle: irritation does not authorize a feed change');
  assert(!/O importante [eé] verificar se houve uma retirada efetiva/i.test(enriched.text), 'R15 40d bottle: satiety criterion once');
  assert(!/Para garantir que.{0,80}alimentando adequadamente/i.test(enriched.text), 'R15 40d bottle: no extra feed-adequacy ask');
}

{
  const message37c =
    'Meu bebê tem 37 dias. Fica 2h08 acordado de dia. Teve uma soneca de 3h05. À noite já dormiu 5h10 seguidas e usa fórmula. Está tudo certo?';
  const draft37c = `Ficar cerca de 2 horas acordado já ultrapassa a janela de 45 minutos a 1 hora e 15 minutos. A soneca diurna não deve passar de 2 horas e 30 minutos. Se o bebê é saudável e dorme espontaneamente à noite, não o acorde só porque o sono passou da progressão típica do jejum.

A orientação é acordá-lo aos 2h30 para oferecer a mamada. Além disso, o fato de ele ter dormido 5h10 seguidas à noite é um bom sinal, especialmente se ele está saudável e ganhando peso.

Acordar aos 2h30 preserva alimentação, as próximas janelas e a noite. Isso não obriga mamada imediata: a mamada só entra se o intervalo desde o início da mamada anterior já tiver sido atingido.`;
  const sig = extractSignals({ message: message37c, ageBand: '30_60', ageDays: 37 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft37c,
    message: message37c,
    signals: sig,
    babyProfile: { ageDays: 37 },
  });
  assert(!/para oferecer a mamada/i.test(enriched.text), 'R9 37d combo: wake at 2h30 is not auto-feed');
  assert(!/ganhando peso/i.test(enriched.text), 'R9 37d combo: do not invent weight gain');
  assert(/n[aã]o obriga mamada imediata/i.test(enriched.text), 'R9 37d combo: keep not-auto-feed');
  assert(!/Se (ele|o beb[eê]) [eé] saud[aá]vel e dorme espontaneamente [àa] noite,\s*$/m.test(enriched.text), 'R12 37d combo: no orphan healthy-night clause');
}

{
  const message37l =
    'Ele tem 37 dias. A soneca durou 17 minutos. Por volta das 17h20 chora muito. Tem refluxo. O que vem primeiro?';
  const draft37l = `A principal hipótese é que o choro pode estar relacionado ao refluxo e à dificuldade de relaxar após sonecas breves.

Recomendo que você confira a aula sobre refluxo para entender melhor como lidar com essa situação.

Se essa soneca de cerca de 17 minutos foi isolada e ele ainda parecer cansado, tente reconduzir sem insistência prolongada. Se o padrão for recorrente, mesmo sem irritabilidade evidente, investigue saciedade e sinais de refluxo.

Se essa leitura de desconforto/refluxo se sustentar, assista às duas aulas com o pediatra no aplicativo.`;
  const sig = extractSignals({ message: message37l, ageBand: '30_60', ageDays: 37 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft37l,
    message: message37l,
    signals: sig,
    babyProfile: { ageDays: 37 },
  });
  assert(!/principal hip[oó]tese/i.test(enriched.text), 'R9 37d late afternoon: reflux is not the main hypothesis');
  assert(/cansa[cç]o e poss[ií]vel baixa produ[cç][aã]o/i.test(enriched.text), 'R9 37d late afternoon: tiredness and milk first');
  assert(/duas aulas com o pediatra/i.test(enriched.text), 'R9 37d late afternoon: two pediatrician lessons');
  assert((enriched.text.match(/padr[aã]o(?: abaixo de cerca de 20 minutos)? for recorrente/gi) || []).length <= 1, 'R13 37d late afternoon: recurrence investigation once');
}

{
  const message44h =
    'Ele tem 44 dias. Depois das 4h acorda de hora em hora. Ofereço o peito sempre?';
  const draft44h = `O primeiro passo é ver há quanto tempo foi a última mamada efetiva e se o jejum noturno da idade já foi atingido — cerca de 3 horas aos 30 dias, aumentando até cerca de 5 horas aos 60 dias. Se ainda não atingiu o jejum da idade e a mamada anterior foi efetiva, com saciedade, tente primeiro reconduzi-lo ao sono. Quando o jejum da idade já tiver sido alcançado, ofereça mamada.

Se o bebê de 44 dias acorda de hora em hora, isso pode indicar que ele não está recebendo a quantidade adequada de leite durante o dia, especialmente se você está oferecendo o peito em intervalos curtos, como menos de 2 horas.

É importante investigar a última mamada efetiva antes das 4h da manhã. Se o bebê acorda de hora em hora, isso pode indicar que ele não está completando o jejum noturno adequado para a idade, que deve ser de cerca de 3h a 5h aos 44 dias.

Primeiro, verifique se ele está mamando efetivamente e se está saciado após as mamadas. Caso contrário, pode tentar conduzir o bebê de volta ao sono sem oferecer o peito imediatamente.`;
  const sig = extractSignals({ message: message44h, ageBand: '30_60', ageDays: 44 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft44h,
    message: message44h,
    signals: sig,
    babyProfile: { ageDays: 44 },
  });
  assert(!/quantidade adequada de leite durante o dia/i.test(enriched.text), 'R9 44d hourly: no invented daytime milk cause');
  assert(!/Caso contr[aá]rio.{0,80}sem oferecer o peito/i.test(enriched.text), 'R9 44d hourly: do not reconduce if the previous feed was not effective');
  assert(/volte ao intervalo da forma de alimenta[cç][aã]o/i.test(enriched.text), 'R9 44d hourly: after the fast-ending feed, return to the feeding interval');
  assert(/hor[aá]rio, sozinho, n[aã]o explica|forma de adormecer/i.test(enriched.text), 'R10 44d hourly: multifactor 11.7 investigation');
  assert(!/ainda n[aã]o completou o jejum/i.test(enriched.text), 'R10 44d hourly: recurrence does not prove unfinished fast');
  assert(!/n[aã]o est[aá] completando o jejum/i.test(enriched.text), 'R11 44d hourly: do not recast hourly wakes as unfinished fast');
}

{
  const message44h2 =
    'Ele tem 44 dias. Depois das 4h acorda de hora em hora. Ofereço o peito sempre?';
  const draft44h2 = `O horário, sozinho, não explica despertares de hora em hora depois das 4h. Investigue a última mamada efetiva e a saciedade, as medidas posturais, a forma de adormecer, desconfortos e o comportamento nesses despertares. A recorrência horária não prova, por si, que o jejum noturno ainda não foi completado — isso se verifica pelo horário da última mamada efetiva.

O primeiro passo é ver há quanto tempo foi a última mamada efetiva e se o jejum noturno da idade já foi atingido — cerca de 3 horas aos 30 dias, aumentando até cerca de 5 horas aos 60 dias. Se ainda não atingiu o jejum da idade e a mamada anterior foi efetiva, com saciedade, tente primeiro reconduzi-lo ao sono. Quando o jejum da idade já tiver sido alcançado, ofereça mamada.

É importante investigar a última mamada efetiva antes das 4h da manhã. Se ele acorda de hora em hora, isso pode indicar que o jejum noturno ainda não foi completado. Se a última mamada foi efetiva e já se passaram cerca de 3 horas, você deve oferecer o peito novamente.`;
  const sig = extractSignals({ message: message44h2, ageBand: '30_60', ageDays: 44 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft44h2,
    message: message44h2,
    signals: sig,
    babyProfile: { ageDays: 44 },
  });
  assert(/recorr[eê]ncia hor[aá]ria n[aã]o prova/i.test(enriched.text), 'R12 44d hourly: keep 11.7 negation');
  assert(!/pode indicar que o jejum noturno ainda n[aã]o foi completado/i.test(enriched.text), 'R12 44d hourly: do not reassociate hourly with unfinished fast');
  assert(!/j[aá] se passaram cerca de 3 horas.{0,80}ofere[cç]/i.test(enriched.text), 'R12 44d hourly: do not auto-apply 3h feed');
  assert(/volte ao intervalo da forma de alimenta[cç][aã]o|jejum noturno da idade/i.test(enriched.text), 'R12 44d hourly: keep age-based fast tree');
  assert((enriched.text.match(/cerca de 3 horas aos 30 dias/gi) || []).length <= 1, 'R13 44d hourly: jejum 3h@30d once');
}

{
  const message43org =
    'Meu bebê tem 43 dias. Faz poucas sonecas. Uma soneca de 3h25 foi das 10h20 às 13h45. Como organizo o dia? Às 21h10 ainda está acordado.';
  const draft43org = `A família pode organizar conforme sua dinâmica, mas iniciar o sono noturno por volta de 21h30 ou 22h não é o recomendado.

Acordar aos 2h30 preserva alimentação, as próximas janelas e a noite. Isso não obriga mamada imediata: a mamada só entra se o intervalo desde o início da mamada anterior já tiver sido atingido.

Com relação ao início do sono noturno, a referência é entre 19h e 20h. Como ele ainda está acordado às 21h10, isso já está além da faixa recomendada. Para organizar o dia, observe a última soneca e a janela de vigília, que deve ser de 45 minutos a 1h15.

A referência geral para o início do sono noturno é 19h a 20h, sem aplicar isso de maneira rígida. Antes de definir o horário, diga a que horas o dia começou, quando terminou a última soneca, qual foi a última janela e como estava o comportamento.

A recomendação é que o início do sono noturno ocorra entre 19h e 20h. É importante observar a última soneca e a janela de vigília, que deve ser de 45 minutos a 1 hora e 15 minutos. Isso ajudará a ajustar a rotina dele. Além disso, recomendo que você consulte a aula sobre a janela de vigília para entender melhor como organizar os períodos de sono e alimentação.

Para organizar o dia, observe que a janela de vigília é de 45 minutos a 1 hora e 15 minutos. Isso significa que, após acordar, você deve conduzi-lo para a próxima soneca dentro desse intervalo. Se ele estiver acordado depois das 21h, isso pode impactar o início da noite.

Para organizar o dia, considere a janela de vigília de 45 minutos a 1 hora e 15 minutos. Após a soneca, observe os sinais de sono e conduza-o para a próxima soneca dentro dessa janela. A última soneca deve ser avaliada para garantir que não comprometa o início da noite. Isso ajudará a ajustar a rotina.

É compreensível que você esteja preocupada com a organização do dia do seu bebê de 43 dias. O ideal é que o dia do bebê de 43 dias comece com a primeira soneca, seguida por janelas de vigília de 45 minutos a 1 hora e 15 minutos. Se você já inicia a noite às 21h, isso também está além da faixa recomendada. É importante acordá-lo para oferecer a mamada e organizar a próxima janela. Para organizar o dia, você pode considerar encerrar a soneca antes de atingir 2h30 e observar a distribuição das sonecas ao longo do dia. Entendo que seu bebê fez uma soneca longa de 3h25, o que excede o teto de 2h30. ao atingir 2h30, acorde o bebê e organize a próxima janela. Se ele estiver calmo, você pode iniciar o ritual de sono agora, garantindo que ele tenha a oportunidade de adormecer no berço.`;
  const sig = extractSignals({ message: message43org, ageBand: '30_60', ageDays: 43 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft43org,
    message: message43org,
    signals: sig,
    babyProfile: { ageDays: 43 },
  });
  assert(/19h.{0,12}20h/i.test(enriched.text), 'R10 43d: state 19h–20h');
  assert(/r[ií]gid/i.test(enriched.text), 'R10 43d: 19h–20h is not rigid');
  assert(/dia come[cç]ou|[uú]ltima soneca|[uú]ltima janela|comportamento/i.test(enriched.text), 'R10 43d: ask day organization facts');
  assert(!/encerrar a soneca antes/i.test(enriched.text), 'R14 43d: do not close a morning nap before 2h30');
  assert(!/[eé] importante acorde/i.test(enriched.text), 'R14 43d: no garbled wake-cap composition');
  assert(/n[aã]o obriga mamada imediata/i.test(enriched.text), 'R14 43d: keep wake at 2h30 is not auto-feed');
  assert(!/21h30 ou 22h n[aã]o [eé] o recomendado/i.test(enriched.text), 'R15 43d: no duplicate 21h30/22h family-dynamics');
  assert(/sem aplicar isso de maneira r[ií]gida/i.test(enriched.text), 'R15 43d: keep 19h–20h without rigidity');
  assert(!/iniciar o ritual de sono agora/i.test(enriched.text), 'R15 43d: no unsolicited night ritual now');
  assert(!/oportunidade de adormecer no ber[cç]o/i.test(enriched.text), 'R15 43d: no unsolicited crib-asleep');
  assert(!/comece com a primeira soneca/i.test(enriched.text), 'R15 43d: day does not start with first nap');
  assert(!/j[aá] inicia a noite [àaá]s 21h/i.test(enriched.text), 'R15 43d: do not infer night already starts at 21h');
  assert(/24 horas em conjunto/i.test(enriched.text), 'R15 43d: keep 24h organization even if “organização do dia” fluff is present');
  assert((enriched.text.match(/19h.{0,12}20h/gi) || []).length === 1, 'R16 43d: 19h–20h once');
  assert(!/aula sobre (a )?janela de vig[ií]lia/i.test(enriched.text), 'R16 43d: no unsolicited Janela lesson');
  assert(/sem aplicar isso de maneira r[ií]gida/i.test(enriched.text), 'R16 43d: keep 19h–20h without rigidity');
  assert(!/observe que a janela de vig[ií]lia [eé] de 45/i.test(enriched.text), 'R16 43d: no generic janela intro besides 24h org');
  assert(!/Para organizar o dia, (observe|considere) a janela/i.test(enriched.text), 'R16 43d: no organize-the-day janela opener');
  assert(/ainda est[aá] acordado [àaá]s 21h10.{0,48}al[eé]m dessa refer[eê]ncia/i.test(enriched.text), 'R16 43d: keep 21h10 as beyond 19h–20h');
  assert(/[eé] compreens[ií]vel que voc[eê] esteja preocupada com a organiza[cç][aã]o do dia/i.test(enriched.text), 'R16 43d: keep day-org empathy opener');
}

{
  const message49c =
    'Meu bebê tem 49 dias. Só dorme no colo ou no peito. Já uso o travesseiro. Em quanto tempo ele aprende? Posso passar todas as sonecas para o berço?';
  const draft49c = `Você pode sim passar todas as sonecas para o berço. Comece pela primeira soneca da manhã e siga com todas as demais sonecas do mesmo dia no berço. Repita diariamente até consolidar. Se houver resistência, acalme-o no colo e volte ao berço até que ele adormeça. Não cronometre o choro. É fundamental que você observe a janela de vigília de 45 minutos a 1 hora e 15 minutos, e que ele esteja calmo ao ser colocado no berço. Se ele chorar ou ficar irritado, você pode ajudá-lo a se acalmar e seguir a condução. Sobre o tempo para aprender, não existe um prazo fixo definido nas regras; a evolução depende de consistência e repetição.

Antes de passar as sonecas para o berço, confirme mamada efetiva e saciedade, medidas posturais, desconforto ou refluxo e se a janela está entre 45 minutos e 1 hora e 15 minutos.

É fundamental que você observe a janela de vigília de 45 minutos a 1 hora e 15 minutos, e que ele esteja saciado antes de tentar colocá-lo no berço.

A janela de vigília de referência é de 45 minutos a 1 hora e 15 minutos.

É compreensível que você esteja buscando formas de ajudar seu bebê a dormir no berço, especialmente com 49 dias. A principal orientação é que, ao iniciar a adaptação ao berço, você deve trabalhar todas as sonecas do dia, não apenas uma por vez.

Entendo que seu bebê de 49 dias só dorme no colo ou no peito. É importante saber que essa dificuldade não deve ser normalizada como uma fase de adaptação. Você pode passar todas as sonecas para o berço, mas é fundamental que isso seja feito de forma gradual e compatível com a idade.

A evolução depende da consistência e repetição na condução do sono.`;
  const sig = extractSignals({ message: message49c, ageBand: '30_60', ageDays: 49 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft49c,
    message: message49c,
    signals: sig,
    babyProfile: { ageDays: 49 },
  });
  assert(!/primeira soneca da manh[aã]/i.test(enriched.text), 'R10 49d crib: no first-morning-nap protocol');
  assert(!/n[aã]o cronometr/i.test(enriched.text), 'R10 49d crib: no do-not-time-crying protocol');
  assert(/todas as sonecas/i.test(enriched.text), 'R10 49d crib: all same-day naps');
  assert(/aula.{0,80}travesseiro/i.test(enriched.text), 'R10 49d crib: how-to stays in the aula');
  assert(/n[aã]o existe prazo|n[aã]o h[aá] prazo oficial/i.test(enriched.text), 'R11 49d crib: no official learn-by date');
  assert(/Eliana Dias/i.test(enriched.text), 'R11 49d crib: methodological deadline goes to Eliana Dias');
  assert(!/calmo ao ser colocad/i.test(enriched.text), 'R12 49d crib: calm is not a crib-placement requirement');
  assert(/todas as sonecas/i.test(enriched.text), 'R12 49d crib: keep same-day naps after calm strip');
  assert(!/volte ao ber[cç]o at[eé] que ele adorme[cç]a/i.test(enriched.text), 'R14 49d crib: no colo-berço until asleep');
  assert(!/at[eé] consolidar/i.test(enriched.text), 'R14 49d crib: no até consolidar milestone');
  assert(!/Sobre o tempo para aprender/i.test(enriched.text), 'R15 49d crib: prazo is not restated as Sobre o tempo');
  assert((enriched.text.match(/n[aã]o existe prazo oficial/gi) || []).length === 1, 'R15 49d crib: official prazo once');
  assert((enriched.text.match(/consist[eê]ncia e repeti[cç][aã]o/gi) || []).length === 1, 'R15 49d crib: consistência e repetição once');
  assert(/Eliana Dias/i.test(enriched.text), 'R15 49d crib: keep Eliana Dias for methodological deadline');
  assert(!/A janela de vig[ií]lia de refer[eê]ncia [eé] de 45 minutos a 1 hora e 15 minutos/i.test(enriched.text), 'R16 49d crib: janela ref once in the investigation, not restated');
  assert(/45 minutos.{0,20}1 hora e 15/i.test(enriched.text), 'R16 49d crib: keep investigation janela');
  assert(!/[eé] compreens[ií]vel que voc[eê] esteja buscando formas de ajudar/i.test(enriched.text), 'R16 49d crib: no empathy opener');
  assert(!/n[aã]o deve ser normalizada como uma fase de adapta[cç][aã]o/i.test(enriched.text), 'R16 49d crib: no adaptation-phase normalize leftover');
  assert(!/Entendo que seu beb[eê].{0,80}s[oó] dorme no colo/i.test(enriched.text), 'R16 49d crib: no Empathy restatement of colo/peito');
  assert(!/Voc[eê] pode passar todas as sonecas para o ber[cç]o, mas [eé] fundamental/i.test(enriched.text), 'R16 49d crib: same-day is not restated as Voc\u00ea pode passar');
  assert(!/[ÉE] fundamental que voc[eê] observe a janela de vig[ií]lia/i.test(enriched.text), 'R16 49d crib: janela is not restated as É fundamental');
}

{
  const message59c =
    'Ele tem 59 dias. Quero passar as sonecas para o berço. Faço uma soneca por dia até adaptar?';
  const draft59c = `É importante repetir diariamente até que ele se adapte. A janela de vigília é de 45 minutos a 1 hora e 15 minutos, então fique atenta a isso ao iniciar a condução para o sono. Para a adaptação ao berço, você deve trabalhar TODAS as sonecas do dia, não apenas uma por vez. Repita diariamente até consolidar essa adaptação. Comece pela primeira soneca da manhã e siga com todas as demais sonecas do mesmo dia no berço. Não avance uma soneca por vez ao longo dos dias. Não cronometrar o choro. É importante não cronometrar o choro durante esse processo. Se houver resistência, você pode acalmá-lo no colo e, em seguida, voltar ao berço e repetir até que ele adormeça. Quanto tempo ele costuma permanecer acordado antes das sonecas? Use a Estratégia do Travesseiro na condução e na colocação no berço, pois isso pode ajudar bastante nesse processo. Essa técnica pode ajudar a dar mais segurança a você nesse processo.`;
  const sig = extractSignals({ message: message59c, ageBand: '30_60', ageDays: 59 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft59c,
    message: message59c,
    signals: sig,
    babyProfile: { ageDays: 59 },
  });
  assert(!/uma soneca por vez ao longo dos dias/i.test(enriched.text) || /n[aã]o [eé] avan[cç]ar uma soneca por vez/i.test(enriched.text), 'R10 59d crib: not one nap per day over days');
  assert(!/primeira soneca da manh[aã]/i.test(enriched.text), 'R10 59d crib: no first-morning-nap protocol');
  assert(/gradual|compat[ií]vel com a idade|todas as sonecas/i.test(enriched.text), 'R10 59d crib: 9.3 gradual same-day');
  assert(/gradual e compat[ií]vel com a idade/i.test(enriched.text), 'R14 59d crib: keep gradual even when all-naps is already present');
  assert(!/at[eé] consolidar/i.test(enriched.text), 'R14 59d crib: no até consolidar milestone');
  assert(!/colo.{0,80}ber[cç]o.{0,40}repet/i.test(enriched.text), 'R11 59d crib: no colo-berço loop');
  assert(!/dar mais seguran[cç]a a voc[eê]/i.test(enriched.text), 'R12 59d crib: no unofficial segurança justification');
  assert(!/n[aã]o cronometr/i.test(enriched.text), 'R12 59d crib: no do-not-time-crying protocol');
  assert(!/quanto tempo ele costuma (ficar|permanecer) acordado antes das sonecas/i.test(enriched.text), 'R15 59d crib: no leaked wake-window ask');
  assert(!/Para a adapta[cç][aã]o ao ber[cç]o.{0,80}TODAS as sonecas/i.test(enriched.text), 'R16 59d crib: same-day naps once, not restated as TODAS opener');
  assert(!/pois isso pode ajudar bastante|Essa t[eé]cnica pode ajudar bastante/i.test(enriched.text), 'R16 59d crib: no generic Travesseiro justification');
  assert(/todas as sonecas daquele mesmo dia/i.test(enriched.text), 'R16 59d crib: keep same-day naps after opener strip');
  assert(!/[ÉE] importante repetir diariamente at[eé] que ele se adapte/i.test(enriched.text), 'R16 59d crib: no daily-until-adapted leftover');
  assert(!/fique atenta a isso ao iniciar a condu[cç][aã]o/i.test(enriched.text), 'R16 59d crib: no “fique atenta” janela leftover');
}

{
  const message37f =
    'Ele tem 37 dias. Fica 1h12 acordado e ainda leva uns 32 minutos para dormir. De manhã a soneca é longa. Fraciono essa soneca?';
  const draft37f = `É compreensível que você esteja buscando organizar as sonecas do seu bebê de 37 dias. A janela de vigília para ele é de 45 minutos a 1 hora e 15 minutos.

A janela de vigília de referência para ele é de 45 minutos a 1 hora e 15 minutos.
Para entender melhor a situação, você poderia me informar quanto tempo dura a soneca da manhã e se ele se aproxima do próximo intervalo de mamada durante esses 32 minutos que leva para adormecer?

Com 37 dias, o tempo acordado de 1h12 e a demora de 32 minutos para adormecer indicam que a soma total de vigília está acima da referência de 45 minutos a 1h15.

A soneca da manhã longa pode interferir na distribuição das sonecas da tarde. Considerando que ele está acordado por 1h12 e leva cerca de 32 minutos para adormecer, isso resulta em um tempo total acordado de aproximadamente 1h44, que está acima da referência de 45 minutos a 1h15.

Não fraciono uma soneca só porque ela parece longa. O teto automático é 2 horas e 30 minutos. Me diga quanto tempo essa soneca da manhã durou.`;
  const sig = extractSignals({ message: message37f, ageBand: '30_60', ageDays: 37 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft37f,
    message: message37f,
    signals: sig,
    babyProfile: { ageDays: 37 },
  });
  assert(!/soneca da manh[aã].{0,80}(interfer|sonecas da tarde|distribui[cç][aã]o)/i.test(enriched.text), 'R11 37d: no morning-nap to afternoon causality');
  assert(/2 horas e 30|2h\s*30/i.test(enriched.text), 'R11 37d: keep 2h30 cap');
  assert(/quanto tempo essa soneca da manh[aã] durou/i.test(enriched.text), 'R11 37d: ask real morning-nap duration');
  assert(!/[eé] compreens[ií]vel que voc[eê] esteja buscando organizar as sonecas/i.test(enriched.text), 'R16 37d: no empathy opener');
  assert(!/A janela de vig[ií]lia( de refer[eê]ncia)? para ele [eé] de 45 minutos a 1 hora e 15 minutos/i.test(enriched.text), 'R16 37d: window ref is in the 1h44 calculation, not a second opener');
  assert(/1h44/i.test(enriched.text), 'R16 37d: keep 1h44 calculation');
  assert(!/soma total de vig[ií]lia est[aá] acima/i.test(enriched.text), 'R16 37d: no duplicate wake-sum opener before 1h44');
  assert(!/voc[eê] poderia me informar quanto tempo dura a soneca da manh[aã]/i.test(enriched.text), 'R16 37d: morning-nap duration is already asked after 2h30');
  assert(!/se aproxima do pr[oó]ximo intervalo de mamada/i.test(enriched.text), 'R16 37d: 32 min onset is not a feed-interval cue');
}

{
  const message40aw =
    'Ele tem 40 dias. Dorme cerca de 1h12 e acorda muito bravo, com bastante choro. Mama um pouco e relaxa. O que investigo primeiro?';
  const draft40aw = `Como ele consegue dormir por cerca de 1 hora ou até mais, eu não consideraria a duração da soneca o principal problema neste momento. O que chama mais atenção é ele acordar muito irritado e relaxar depois de sugar um pouco. Por isso, primeiro observaria como está a mamada e se existe algum desconforto depois dela.

O tempo de mamada, sozinho, não comprova saciedade. Observe sucção ativa, deglutição e sinais de saciedade. Sugar pouco e relaxar ao despertar não significa automaticamente que ele precise se alimentar.

A mamada pareceu efetiva, com sucção ativa e sinais de saciedade?

Depois da mamada, ele arrotou e permaneceu em posição vertical por cerca de 20 a 30 minutos?

Há sinais de desconforto depois da mamada ou ao ser colocado no berço?

Primeiro, investigue a efetividade da mamada: ele está mamando de forma ativa e deglutindo bem? e ele permaneceu em posição vertical por cerca de 20 a 30 minutos? Essas informações são essenciais para entender se ele está confortável e se a alimentação está adequada.

Além disso, após a mamada, é importante que ele permaneça em posição vertical por cerca de 20 a 30 minutos. Isso pode ajudar a evitar desconfortos, como refluxo, que podem contribuir para o choro ao despertar.

Ele permaneceu em posição vertical?

por esse tempo?

Primeiro, é importante investigar a efetividade da mamada. Pergunte-se se ele está mamando de forma ativa, se há deglutição e se você percebe sinais de saciedade. Além disso, observe o que acontece entre o fim da mamada e o momento de deitar: ele arrotou? Permaneceu em posição vertical por cerca de 20 a 30 minutos? Essas informações são cruciais para entender melhor a situação.

Além disso, verifique se ele apresenta sinais de saciedade após a mamada.

O primeiro passo é investigar a alimentação e a saciedade. Verifique se a mamada foi efetiva, observando a sucção ativa e a deglutição, além de sinais de saciedade. Isso pode ajudar a evitar desconfortos que possam estar contribuindo para o choro ao acordar.

Primeiro, é importante investigar a alimentação e a saciedade. Além disso, após a mamada, é fundamental que ele permaneça em posição vertical por cerca de 20 a 30 minutos para ajudar na digestão. Ele permaneceu em posição vertical por esse tempo?`;
  const sig = extractSignals({ message: message40aw, ageBand: '30_60', ageDays: 40 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft40aw,
    message: message40aw,
    signals: sig,
    babyProfile: { ageDays: 40 },
  });
  const askParas = String(enriched.text).split(/\n{2,}/).filter((p) =>
    /mamada parec(?:e|eu) efetiva|arrotou e permaneceu|sinais de desconforto depois da mamada/i.test(p)
    && p.length < 360,
  );
  assert(askParas.length <= 1, 'R15 40d angry: investigation asks in one sequence', String(askParas.length));
  assert(!/Primeiro, investigue a efetividade da mamada/i.test(enriched.text), 'R15 40d angry: no second efetividade block');
  assert(!/Primeiro,.{0,80}efetividade da mamada/i.test(enriched.text), 'R15 40d angry: no second investigar-efetividade paragraph');
  assert(!/Al[eé]m disso, ap[oó]s a mamada, [eé] importante que ele permane[cç]a/i.test(enriched.text), 'R15 40d angry: no vertical restatement after the ask');
  assert(!/^Ele permaneceu em posi[cç][aã]o vertical\??$/im.test(enriched.text), 'R15 40d angry: no orphan vertical ask');
  assert(!/^por esse tempo\??$/im.test(enriched.text), 'R15 40d angry: no orphan por esse tempo');
  assert(/arrotou e permaneceu em posi[cç][aã]o vertical/i.test(enriched.text), 'R15 40d angry: keep postural investigation ask');
  assert(!/O primeiro passo [eé] investigar a alimenta[cç][aã]o e a saciedade/i.test(enriched.text), 'R16 40d angry: no restated feed investigation paragraph');
  assert(!/Primeiro, [eé] importante investigar a alimenta[cç][aã]o e a saciedade/i.test(enriched.text), 'R16 40d angry: no “Primeiro, é importante investigar” leftover');
  assert(!/ap[oó]s a mamada, [eé] fundamental que ele permane[cç]a/i.test(enriched.text), 'R16 40d angry: no fundamental-vertical leftover');
  assert(!/Ele permaneceu em posi[cç][aã]o vertical por esse tempo/i.test(enriched.text), 'R16 40d angry: no restated vertical-time ask');
  assert(!/pode ajudar a evitar desconfortos/i.test(enriched.text), 'R16 40d angry: no preventive desconfortos leftover');
  assert(!/Al[eé]m disso, verifique se ele apresenta sinais de saciedade/i.test(enriched.text), 'R16 40d angry: satiety ask is not restated after the sequence');
}

{
  const message40s =
    'Ele tem 40 dias. Fica com sono uns 18 minutos antes da próxima mamada. Deixo dormir ou adianto a mamada?';
  const draft40s = `Você pode optar por duas abordagens: antecipar a mamada para compatibilizar a alimentação com a janela de sono, ou deixá-lo dormir e oferecer a mamada ao acordar, especialmente se as sonecas costumam ser curtas.

Para garantir que ele esteja saciado, verifique se houve uma mamada efetiva antes de deixá-lo dormir. Se ele já está saciado, pode ser mais benéfico deixá-lo descansar.

Para decidir, é importante verificar se ele fez uma mamada efetiva antes e se está saciado. Se ele já mamou bem e está apenas com sono, pode ser melhor deixá-lo dormir.

Além disso, se você notar sinais de desconforto ou refluxo, isso também pode influenciar a decisão.

Você já observou se ele arrota após as mamadas e quanto tempo permanece em posição vertical? Essas informações podem ajudar a entender melhor a situação.

Para decidir, verifique se ele está com fome ou se já fez uma mamada efetiva e está saciado. Se ele já está saciado e apenas dorme, pode ser melhor deixá-lo dormir.

Como ele está próximo do horário da mamada, você pode observar como ele reage. Se ele acordar tranquilo, pode ser uma boa oportunidade para a mamada.

Sono e alimentação são controles distintos: sinais de sono não obrigam mamada antes de cada sono.`;
  const sig = extractSignals({ message: message40s, ageBand: '30_60', ageDays: 40 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft40s,
    message: message40s,
    signals: sig,
    babyProfile: { ageDays: 40 },
  });
  assert(!/arrot[oa].{0,80}posi[cç][aã]o vertical/i.test(enriched.text), 'R15 40d sleep-before-feed: no unsolicited postural ask');
  assert(/antecipar a mamada|deix[aá]-l[oa] dormir/i.test(enriched.text), 'R15 40d sleep-before-feed: keep the two official options');
  assert(/apenas com sono/i.test(enriched.text), 'R16 40d sleep-before-feed: satiety with sleep signs, not already asleep');
  assert(!/apenas dorme/i.test(enriched.text), 'R16 40d sleep-before-feed: no “apenas dorme” leftover');
  assert(!/acordar tranquilo/i.test(enriched.text), 'R16 40d sleep-before-feed: no acordar-tranquilo leftover');
  assert(!/Para garantir que ele esteja saciado/i.test(enriched.text), 'R16 40d sleep-before-feed: no extra satiety-before-sleep leftover');
  assert(!/pode ser mais ben[eé]fico deix[aá]-l[oa] descansar/i.test(enriched.text), 'R16 40d sleep-before-feed: no “deixá-lo descansar” leftover');
  assert(/oferecer a mamada ao acordar/i.test(enriched.text), 'R16 40d sleep-before-feed: offer the feed on waking');
  assert(!/notar sinais de desconforto ou refluxo/i.test(enriched.text), 'R16 40d sleep-before-feed: no unsolicited reflux leftover');
}

{
  const message40b2 =
    'Meu bebê tem 40 dias. Ficou 13 minutos no peito e depois tomou 105 ml de fórmula. Esse tempo e esse volume estão adequados?';
  const draft40b2 = `O volume de 105 ml de fórmula está dentro da referência geral para um bebê de 40 dias, que é de 90 a 120 ml por mamada. O tempo de 13 minutos no peito, por si só, não determina se a mamada foi efetiva. O importante é verificar se houve retirada efetiva de leite e se ele apresenta sinais de saciedade após a mamada. O tempo de 13 minutos no peito, por si só, não é um critério isolado para determinar a saciedade, pois o importante é verificar se houve retirada efetiva de leite e se ele apresenta sinais de saciedade. O importante é verificar se houve uma mamada efetiva, ou seja, se ele retirou leite suficiente e apresentou sinais de saciedade após a mamada.

Para garantir que o bebê esteja se alimentando adequadamente, observe se ele parece satisfeito e relaxado após a mamada.

Além disso, como está sendo a aceitação da mamadeira por parte dele?

A mamadeira deve ser oferecida em um momento em que ele esteja calmo, preferencialmente na primeira mamada da noite ou no final da tarde.

O tempo de 13 minutos no peito pode ser considerado normal, desde que tenha havido uma retirada efetiva de leite e que o bebê apresente sinais de saciedade após a mamada.

Você já notou se ele apresenta sinais de saciedade após a mamada no peito?

O tempo isoladamente não determina o término da mamada: o parâmetro é verificar se houve retirada efetiva de leite e se o bebê apresenta sinais de saciedade.`;
  const sig = extractSignals({ message: message40b2, ageBand: '30_60', ageDays: 40 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft40b2,
    message: message40b2,
    signals: sig,
    babyProfile: { ageDays: 40 },
  });
  assert(!/O importante [eé] verificar se houve (uma )?(mamada|retirada) efetiva/i.test(enriched.text), 'R15 40d bottle leftover: drop duplicate efetiva');
  assert(!/pois o importante [eé] verificar se houve (uma )?(mamada|retirada) efetiva/i.test(enriched.text), 'R15 40d bottle leftover: drop pois-retirada clause');
  assert(!/mamadeira deve ser oferecida.{0,80}calmo/i.test(enriched.text), 'R15 40d bottle leftover: no unsolicited bottle timing');
  assert(!/Para garantir que.{0,80}alimentando adequadamente/i.test(enriched.text), 'R15 40d bottle leftover: drop extra adequacy ask');
  assert(/tempo isoladamente n[aã]o determina o t[eé]rmino da mamada: o par[aâ]metro [eé] verificar se houve retirada efetiva/i.test(enriched.text), 'R15 40d bottle leftover: keep duration-not-criterion');
  assert(!/o par[aâ]metro [eé]\s*$/im.test(enriched.text), 'R15 40d bottle leftover: do not truncate the satiety sentence');
  assert((enriched.text.match(/retirada efetiva/gi) || []).length <= 1, 'R15 40d bottle leftover: retirada efetiva once');
  assert(!/pode ser considerado normal/i.test(enriched.text), 'R15 40d bottle leftover: duration is not “normal if satiated”');
  assert(!/Voc[eê] j[aá] notou se.{0,80}sinais de saciedade/i.test(enriched.text), 'R15 40d bottle leftover: no extra satiety ask');
  assert(!/aceita[cç][aã]o da mamadeira/i.test(enriched.text), 'R16 40d bottle leftover: no unsolicited bottle-acceptance ask');
  assert(!/\n{3,}/.test(enriched.text), 'R15 40d bottle leftover: no extra blank lines');
}

{
  const message44r =
    'Ele tem 44 dias. Começo o ritual às 18h20 e ele só adormece às 19h30. Está certo?';
  const draft44r = `A janela de vigília começa no último despertar, não no início do ritual. Sem o horário em que ele acordou, não dá para concluir que o intervalo do ritual foi a janela.

O horário recomendado para o início do sono noturno é entre 19h e 20h. Portanto, iniciar o ritual às 18h20 e ele adormecer às 19h30 está dentro da faixa recomendada. No entanto, é importante observar que o ritual deve ser breve e a janela de vigília é de 45 minutos a 1 hora e 15 minutos.

Se ele está acordado por muito tempo antes do ritual, isso pode contribuir para a demora em adormecer.

Se ele está acordado por muito tempo entre o início do ritual e o adormecimento, isso pode indicar que ele está ultrapassando a janela de vigília, que é de 45 minutos a 1 hora e 15 minutos.

O ritual deve ser breve e não deve ultrapassar esse tempo acordado.

O ritual deve ser breve e que a janela de vigília deve ser respeitada para evitar que ele fique muito tempo acordado.

O ritual deve ser breve, e se ele está demorando para adormecer, é importante verificar quanto tempo ele permanece acordado antes de iniciar a condução para o sono.

O ritual deve ser breve, normalmente consistindo em banho, mamada e dormir. Se ele está demorando para adormecer, é importante verificar quanto tempo ele permanece acordado antes de iniciar o ritual e a duração da última soneca. Isso nos ajudará a encontrar a melhor abordagem para o seu caso.

O horário recomendado para o início do sono noturno é entre 19h e 20h. O ritual deve ser breve, e a janela de vigília é de 45 minutos a 1 hora e 15 minutos.`;
  const sig = extractSignals({ message: message44r, ageBand: '30_60', ageDays: 44 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft44r,
    message: message44r,
    signals: sig,
    babyProfile: { ageDays: 44 },
  });
  assert(!/iniciar o ritual.{0,80}18h20.{0,80}dentro da faixa/i.test(enriched.text), 'R15 44d ritual: 18h20 is not the 19h–20h band');
  assert(/19h30 est[aá] dentro da refer[eê]ncia geral/i.test(enriched.text), 'R15 44d ritual: keep 19h30 as night-start reference');
  assert(!/acordado por muito tempo antes do ritual/i.test(enriched.text), 'R15 44d ritual: do not invent long wake before ritual');
  assert(!/acordado por muito tempo entre o in[ií]cio do ritual/i.test(enriched.text), 'R16 44d ritual: do not recast ritual interval as long wake');
  assert(!/n[aã]o deve ultrapassar esse tempo acordado/i.test(enriched.text), 'R15 44d ritual: do not tie ritual brevity to wake time');
  assert(!/evitar que ele fique muito tempo acordado/i.test(enriched.text), 'R15 44d ritual: do not recast window as long-wake risk');
  assert(!/verificar quanto tempo ele permanece acordado antes de iniciar a condu[cç][aã]o/i.test(enriched.text), 'R16 44d ritual: last-awake ask is not needed when 19h30 is already answered');
  assert(!/verificar quanto tempo ele permanece acordado antes de iniciar o ritual/i.test(enriched.text), 'R16 44d ritual: no ritual-awake verificar leftover');
  assert(!/normalmente consistindo em banho, mamada e dormir/i.test(enriched.text), 'R16 44d ritual: no generic ritual-brief leftover');
  assert((enriched.text.match(/19h.{0,12}20h/gi) || []).length === 1, 'R16 44d ritual: 19h–20h once as 19h30 reference');
}

{
  const message52a =
    'Meu bebê tem 52 dias. Coloco no berço acordado ou espero sono leve? E se adormecer mamando?';
  const draft52a = `Se o bebê está tranquilo e sem chorar, você pode colocá-lo acordado no berço e dar a oportunidade de adormecer ali. Não é obrigatório esperar que ele esteja em sono leve ou profundo. Caso ele adormeça mamando, você pode colocá-lo no berço já dormindo, sem necessidade de acordá-lo. Se ele ficar irritado ou chorar, você pode ajudá-lo a se acalmar e seguir a condução — isso deve ser feito uma única vez, sem exigir que ele esteja calmo para ser colocado no berço. Se ele adormecer durante uma mamada efetiva, não o acorde só para colocá-lo acordado no berço.

Como você está utilizando a Estratégia do Travesseiro? Essa técnica pode ajudar na condução e na colocação no berço, dando mais segurança a você nesse processo.

Para melhor condução, como está sendo realizada a Estratégia do Travesseiro? Isso pode ajudar na sua adaptação ao berço.

Como você está realizando a condução para o sono?

Como você está realizando a Estratégia do Travesseiro?

Está utilizando a Estratégia do Travesseiro?

Além disso, se você já utiliza a Estratégia do Travesseiro, como está sendo realizada? Isso pode ajudar a organizar a condução do sono.

. Isso pode ajudar a organizar melhor a rotina.

Para entender melhor como você está realizando a condução e a Estratégia do Travesseiro, poderia me contar como está sendo essa execução?

Para entender melhor como está sendo a condução do sono, quanto tempo ele costuma ficar acordado antes das sonecas? E na condução e na colocação no berço?

E na condução e colocação no berço?

Para melhor condução, gostaria de saber: quanto tempo ele costuma permanecer acordado antes das sonecas? Isso ajudará a organizar a rotina e a condução do sono.

Para entender melhor como está sendo a execução da Estratégia do Travesseiro, como você está realizando essa técnica? Isso pode ajudar na condução e na colocação no berço, dando mais segurança a você nesse processo.

Complete o arroto e mantenha a posição vertical por cerca de 20 a 30 minutos (até ~40 minutos se houver refluxo) antes de colocá-lo no berço.

Se ele adormecer durante uma mamada efetiva, não o acorde só para colocá-lo acordado no berço: complete o arroto e a posição vertical necessária (cerca de 20 a 30 minutos; e, então, leve-o ao berço já dormindo.

A Estratégia do Travesseiro também pode ajudar na condução e na colocação do bebê no berço, dando mais segurança para você nesse processo. Isso pode ajudar a ajustar a condução do sono.

Como você já está utilizando a mamada, gostaria de saber: quanto tempo ele costuma ficar acordado antes de você iniciar a condução para o sono?`;
  const sig = extractSignals({ message: message52a, ageBand: '30_60', ageDays: 52 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft52a,
    message: message52a,
    signals: sig,
    babyProfile: { ageDays: 52 },
  });
  assert(!/Como voc[eê] est[aá] utilizando a Estrat[eé]gia do Travesseiro/i.test(enriched.text), 'R15 52d crib-awake: no extra how-are-you-using');
  assert(!/como est[aá] sendo realizada a Estrat[eé]gia do Travesseiro/i.test(enriched.text), 'R15 52d crib-awake: no how-is-it-being-done');
  assert(!/Isso pode ajudar na sua adapta[cç][aã]o ao ber[cç]o/i.test(enriched.text), 'R15 52d crib-awake: no extra adaptação ask');
  assert(!/organizar melhor a rotina/i.test(enriched.text), 'R15 52d crib-awake: no orphan rotina leftover');
  assert(!/como voc[eê] est[aá] realizando a condu[cç][aã]o e a Estrat[eé]gia do Travesseiro/i.test(enriched.text), 'R15 52d crib-awake: no how-are-you-executing');
  assert(!/Essa t[eé]cnica pode ajudar.{0,80}seguran[cç]a/i.test(enriched.text), 'R15 52d crib-awake: no duplicate Essa técnica');
  assert(!/E na condu[cç][aã]o e (na )?coloca[cç][aã]o no ber[cç]o\??/i.test(enriched.text), 'R15 52d crib-awake: no orphan condução ask');
  assert(!/quanto tempo ele costuma (ficar|permanecer) acordado antes das sonecas/i.test(enriched.text), 'R15 52d crib-awake: no leaked wake ask');
  assert(!/Isso ajudar[aá] a organizar a rotina/i.test(enriched.text), 'R15 52d crib-awake: no rotina leftover after wake ask');
  assert(!/dando mais seguran[cç]a/i.test(enriched.text), 'R16 52d crib-awake: no unofficial mother-segurança justification');
  assert(!/ajustar a condu[cç][aã]o do sono/i.test(enriched.text), 'R16 52d crib-awake: no generic “ajustar a condução” leftover');
  assert(/tamb[eé]m pode ajudar na condu[cç][aã]o e na coloca[cç][aã]o/i.test(enriched.text), 'R15 52d crib-awake: keep canonical purpose');
  assert(!/uma [uú]nica vez/i.test(enriched.text), 'R16 52d crib-awake: no operational once-limit on calming');
  assert(/se acalmar|acalme/i.test(enriched.text), 'R16 52d crib-awake: keep cry-calm conduction');
  assert(!/j[aá] utiliza a Estrat[eé]gia do Travesseiro, como est[aá] sendo realizada/i.test(enriched.text), 'R16 52d crib-awake: no how-are-you-already-using');
  assert(!/organizar a condu[cç][aã]o do sono/i.test(enriched.text), 'R16 52d crib-awake: no filler organize-conduction');
  assert(!/Como voc[eê] est[aá] realizando a condu[cç][aã]o para o sono/i.test(enriched.text), 'R16 52d crib-awake: no extra how-is-conduction');
  assert(!/Como voc[eê] est[aá] realizando a Estrat[eé]gia do Travesseiro/i.test(enriched.text), 'R16 52d crib-awake: no extra how-is-travesseiro');
  assert(!/Caso ele adorme[cç]a mamando, voc[eê] pode coloc[aá]-lo no ber[cç]o j[aá] dormindo/i.test(enriched.text), 'R16 52d crib-awake: feed-asleep once');
  assert(/n[aã]o o acorde s[oó] para coloc[aá]-lo acordado/i.test(enriched.text), 'R16 52d crib-awake: keep official feed-asleep');
  assert(!/como voc[eê] est[aá] realizando essa t[eé]cnica/i.test(enriched.text), 'R16 52d crib-awake: no how-are-you-doing-the-technique');
  assert(!/Est[aá] utilizando a Estrat[eé]gia do Travesseiro/i.test(enriched.text), 'R16 52d crib-awake: no está-utilizando leftover');
  assert(!/at[eé]\s*(cerca de |~)?40 minutos se houver refluxo/i.test(enriched.text), 'R16 52d crib-awake: no unsolicited 40-min reflux postural');
  assert(!/20 a 30 minutos;\s*e, então/i.test(enriched.text), 'R16 52d crib-awake: 40-min strip must not leave a broken sentence');
  assert(!/Como voc[eê] j[aá] est[aá] utilizando a mamada/i.test(enriched.text), 'R16 52d crib-awake: no leaked mamada/wake ask');
  assert(!/antes de voc[eê] iniciar a condu[cç][aã]o para o sono/i.test(enriched.text), 'R16 52d crib-awake: no leaked conduction-wake ask');
}

{
  const message44h3 =
    'Ele tem 44 dias. Depois das 4h acorda de hora em hora. Ofereço o peito sempre?';
  const draft44h3 = `É compreensível que você esteja preocupada com os despertares do seu bebê de 44 dias.O primeiro passo é ver há quanto tempo foi a última mamada efetiva e se o jejum noturno da idade já foi atingido — cerca de 3 horas aos 30 dias, aumentando até cerca de 5 horas aos 60 dias. Se ainda não atingiu o jejum da idade e a mamada anterior foi efetiva, com saciedade, tente primeiro reconduzi-lo ao sono. Quando o jejum da idade já tiver sido alcançado, ofereça mamada.

O horário, sozinho, não explica despertares de hora em hora depois das 4h. Investigue a última mamada efetiva e a saciedade, as medidas posturais, a forma de adormecer, desconfortos e o comportamento nesses despertares. A recorrência horária não prova, por si, que o jejum noturno ainda não foi completado — isso se verifica pelo horário da última mamada efetiva.

Além disso, considere as medidas posturais após as mamadas (como arroto e posição vertical por 20 a 30 minutos) e se há sinais de desconforto. Também verifique as medidas posturais após as mamadas (arroto e posição vertical por 20 a 30 minutos) e se há sinais de desconforto após as mamadas.

Pergunte-se também sobre as medidas posturais após as mamadas (como arroto e posição vertical por 20 a 30 minutos) e se há sinais de desconforto após as mamadas.

Você tem observado a efetividade das mamadas e sinais de saciedade? Além disso, quais medidas posturais você tem utilizado após as mamadas? Essas informações podem ajudar a entender melhor a situação.`;
  const sig = extractSignals({ message: message44h3, ageBand: '30_60', ageDays: 44 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft44h3,
    message: message44h3,
    signals: sig,
    babyProfile: { ageDays: 44 },
  });
  assert(!/Al[eé]m disso, considere as medidas posturais/i.test(enriched.text), 'R15 44d hourly: postural investigation once');
  assert(!/Tamb[eé]m verifique as medidas posturais/i.test(enriched.text), 'R15 44d hourly: no second postural paragraph');
  assert(!/Pergunte-se tamb[eé]m sobre as medidas posturais/i.test(enriched.text), 'R16 44d hourly: no third postural paragraph');
  assert(/medidas posturais/i.test(enriched.text), 'R15 44d hourly: keep 11.7 postural investigation');
  assert(!/[ÉE] compreens[ií]vel que voc[eê] esteja preocupada com os despertares/i.test(enriched.text), 'R16 44d hourly: no empathy leftover on hourly wakes');
  assert(/jejum noturno da idade j[aá] foi atingido/i.test(enriched.text), 'R16 44d hourly: keep age-based fast tree after empathy strip');
  assert(!/Voc[eê] tem observado a efetividade das mamadas/i.test(enriched.text), 'R16 44d hourly: no extra satiety/postural ask');
}

{
  const message37p =
    'Ele tem 37 dias. Quando a chupeta cai, recoloco na hora?';
  const draft37p = `Se a chupeta cair e ele apenas reclamar, você não precisa recolocá-la imediatamente. Observe alguns instantes para ver se ele consegue se reorganizar e continuar dormindo.

A janela de vigília para um bebê de 37 dias é de 45 minutos a 1 hora e 15 minutos. Se ele costuma ficar acordado por 1h30 a 1h45, esse tempo já está acima do indicado para a idade.

Como você já relatou que ele às vezes retoma sem a chupeta, observe alguns instantes no despertar e recoloque a chupeta se necessário.

Para aprofundar mais sobre a janela de vigília e sinais de sono, recomendo a aula "Janela de Vigília (PASSO 3)".`;
  const sig = extractSignals({ message: message37p, ageBand: '30_60', ageDays: 37 });
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: draft37p,
    message: message37p,
    signals: sig,
    babyProfile: { ageDays: 37 },
  });
  assert(!/1h30 a 1h45/i.test(enriched.text), 'R15 37d pacifier: do not leak 55d window numbers');
  assert(!/j[aá] relatou que.{0,80}retoma/i.test(enriched.text), 'R15 37d pacifier: do not invent resume-without-pacifier');
  assert(!/Janela de Vig[ií]lia/i.test(enriched.text), 'R15 37d pacifier: no unsolicited Janela lesson');
  assert(/2 a 5 minutos/i.test(enriched.text), 'R15 37d pacifier: keep official wait');
}

console.log(`\nLayer A: ${passed} passed, ${failed} failed`);

const RUN_LIVE = process.env.RUN_LIVE === '1';
if (!RUN_LIVE) {
  console.log('\n(Set RUN_LIVE=1 to run Layer B live chat assertions)\n');
  process.exit(failed ? 1 : 0);
}

console.log('\n=== Layer B: live processTurn on official cases ===\n');

const cases = [
  {
    id: '30d',
    ageDays: 30,
    motherName: 'Ana',
    babyName: 'Lara',
    message:
      'Minha bebê de 30 dias faz sonecas de 1h às vezes mais.. quando acorda ela acorda muito brava e chora bastante e só acalma dando o peito mama bem pouco e relaxa.. como melhorar? Antes da soneca ela já mama em média 20 a 30 min',
    must: [/alimenta|saciedad|vertical|arroto|p[oó]s-?mamada|depois da mamada/i, /20 a 30 minutos/i],
    mustNot: [/sonecas? curtas/i, /sequ[eê]ncia noturna/i, /sinais de saciedade no RN/i, /mau h[aá]bito/i, /sem evid[eê]ncia no relato|como hip[oó]tese, sem diagn[oó]stico/i, /[eé] (normal|comum) que .{0,140}acord(em|e) chorando/i, /como est[aá] o sono noturno/i, /essa situa[cç][aã]o [eé] comum/i, /dura[cç][aã]o da soneca da manh[aã]/i],
    mustLessons: ['lesson-refluxo'],
    mustNotLessons: ['lesson-30-60-sinais-sono', 'lesson-30-60-passo-3-janela'],
  },
  {
    id: '31d',
    ageDays: 31,
    motherName: 'Maria',
    babyName: 'João',
    message:
      'Meu filho tem 31 dias, sempre fez as sonecas no berço, que duravam cerca de 2 hrs/ 2 hrs e 30. Mas faz 02 dias que ele tem feito uma soneca grande pela manha e, durante a tarde, as sonecas estao bem curtas. Um ciclo de sono. Ele desperta e eu ate tendo nina-lo no berço, mas ele nao retorna. Depois de 30 minutos ja esta com sono novamente. Outra questao eh que ele demora demais para iniciar a soneca. O ambiente esta ajustado, ele esta alimentado, tudo tranquilo, janela de sono del eh de 1 hr/1 hr 15, quando vai dando este horário, vou para o quarto; coloco ruido, quarto escuro, nino ele no colo e ainda acordado transfiro pro berço. Quando no berço, ele demora muuuito pra relaxar, quase 40/45 minutos.',
    must: [/45\s*min|vig[ií]lia|1h30|1h\s*30|fracion|1h15|1 hora e 15/i, /antecip/i],
    mustNot: [/mamada noturna insuficiente|produ[cç][aã]o de leite durante a noite|mau h[aá]bito|caprichar nas mamadas.{0,40}relaxar|quanto tempo (ele|ela) (costuma )?permanecer acordad[oa] antes de iniciar|soneca longa pela manh[aã].{0,220}tempo total acordado que excede|observe os sinais de sono e inicie a condu|Isso pode ajudar a avaliar se (ele|ela) est[aá] se alimentando adequadamente|Isso ajudar[aá] a entender melhor a situa[cç][aã]o|contribuindo para a dificuldade em relaxar|alimentando adequadamente e se a mamada est[aá] sendo efetiva/i],
  },
  {
    id: '40d-bottle',
    ageDays: 40,
    motherName: 'Ana',
    babyName: 'Lara',
    message:
      'minha bebê está com 40 dias. Quanto tempo dura a amamentação dela nessa fase? Já estou tentando introduzir 1 mamadeira Tb, conforme a Eliana ensina. Quantos ml devo ofertar pra ela?',
    must: [/120\s*ml/i, /20\s*minutos/i],
    mustNot: [/60\s*a\s*90|mau h[aá]bito|sono noturno|h[aá]bito a corrigir|mamadeira,\s*\.|leitura comportamental|ponto a observar ap[oó]s checar saciedade/i],
  },
  {
    id: '40d-pacifier',
    ageDays: 40,
    motherName: 'Ana',
    babyName: 'Pedro',
    message:
      'Meu filho tem 40 dias. Dorme no berço, colocamos ele acordado e ele dorme sozinho. ele esta usando chupeta desde que saiu da maternidade. Até 05 dias atras, ele retornava a dormir com tranquilidade, fazia sonecas de 2,3 hrs. Contudo, com um ciclo de sono ele está acordando, chora e eu tenho recolocado a chupeta e ele volta a dormir no mesmo instante. Nao quero retira-la, mas nao sei como devo conduzir.',
    must: [/alimenta|saciedad|suc[cç][aã]o|mudan[cç]a recente|retoma/i],
    mustNot: [
      /\b(e|eh|é)\s+(um\s+)?mau\s+h[aá]bito\b|classific\w*\s+como\s+mau\s+h[aá]bito|desenvolvendo\s+um\s+mau\s+h[aá]bito|aula sobre maus h[aá]bitos|tirando os maus h[aá]bitos|rascunho bloqueado|s[oó] dorme no colo e no peito|principal hip[oó]tese.{0,80}vig[ií]lia excessiva/i,
    ],
  },
  {
    id: '40d-night',
    ageDays: 40,
    motherName: 'Ana',
    babyName: 'Pedro',
    message:
      'Olá. Meu bb tem 40 dias , tem noites que ele dorme super bem acorda entre 2:30 a 3 hrs , só que tem dia que após as 04:00 da manhã ele acorda de 1 em 1 hrs tento fazer ele continuar a dormir no berço porém sem sucesso, aí pego ele fico ninando no colo sem sucesso, aí coloco ele no peito ele mama mesmo sabendo que não é fome, ele mama e dorme. Continuo assim por ele ainda ser novinho ?',
    must: [/primeira parte da noite|mamada efetiva|vertical|arroto|2h\s*30|2h30/i],
    mustNot: [/n[aã]o [eé] necess[aá]rio acord[aá]-l[oa]|mau h[aá]bito|Isso pode ajudar a\s+[A-ZÁ]|Isso [eé] importante para\s+[A-ZÁ]|Despertar Irritado P[oó]s-?Soneca|associa[cç][oõ]es negativas|n[aã]o acordar um beb[eê] saud[aá]vel|rotina alimentar/i],
    mustLessons: ['lesson-30-60-sono-noturno'],
  },
  {
    id: '45d',
    ageDays: 45,
    motherName: 'Ana',
    babyName: 'Lara',
    message:
      'Qual o horário saudável para o início do sono noturno? Estou iniciando o sono noturno às 21h, porém ele está demorando para cair no sono. E o banho pode dar às 21:30?',
    must: [/19h|19\s*h|20h|20\s*h/i],
    mustNot: [/\b(e|eh|é)\s+(um\s+)?mau\s+h[aá]bito\b|classific\w*\s+como\s+mau\s+h[aá]bito|m[oó]dulos?\s*3 e 4/i],
    max2130: 1,
  },
  {
    id: '49d',
    ageDays: 49,
    motherName: 'Ana',
    babyName: 'Pedro',
    message:
      'Meu bebê tem 1 mês e 19 dias, as sonecas duram uma média de 30 min, no máximo, em exceção, chega a durar 1h. No entanto, por vezes ele tem despertares durante as sonecas. Ele usa chupeta. Preciso ajustar algo?',
    must: [/45\s*min|como (ele|ela|o beb[eê]) desperta das sonecas:|vig[ií]lia|quando ela cai/i],
    mustNot: [/m[ií]nimo de 4 a 5|30 a 40 minutos ap[oó]s todas|\b(e|eh|é)\s+(um\s+)?mau\s+h[aá]bito\b|principal hip[oó]tese.{0,80}chupeta|acordando irritad|ap[oó]s esse per[ií]odo.{0,30}est[aá] correto|chupeta tamb[eé]m pode influenciar os despertares/i],
  },
  {
    id: '51d',
    ageDays: 51,
    motherName: 'Ana',
    babyName: 'Lara',
    message:
      'Minha neném 1 mês e 21 dias tem dificuldade de dormir durante o dia, só dorme se for no colo, e no peito, tento fazer a técnica do travesseiro, as vezes da certo e as vezes nao, quanto tempo pra ela aprender?',
    must: [/n[aã]o existe prazo|sem prazo fixo|n[aã]o h[aá] prazo|consist[eê]ncia|vig[ií]lia|45\s*min/i],
    mustNot: [/\b(e|eh|é)\s+(um\s+)?mau\s+h[aá]bito\b|cerca de 10 minutos|em torno de 10 minutos|acostumad[oa]s? a dormir no colo|^[\s\S]{0,280}adapta[cç][aã]o ao ber[cç]o|mamada.{0,40}conforto.{0,80}interromper|apenas por conforto|ap[oó]s esse (tempo|per[ií]odo).{0,80}mamada efetiva|^[\s\S]{0,220}[eé] (normal|comum) que.{0,90}(colo|peito)|fase [eé] de adapta[cç][aã]o/i],
    mustLessons: ['lesson-travesseiro'],
    mustNotLessons: ['lesson-ruido-branco'],
  },
  {
    id: '48d',
    ageDays: 48,
    motherName: 'Ana',
    babyName: 'Lara',
    message:
      'Bebê de 48 dias. Estou começando a rotina do sono dela umas 18:30, até 20 horas está dormindo. Estou na dúvida se está muito cedo, precisa ser mais tarde pela idade ou não tem relevância? Outra dúvida, nos momentos da soneca, o ideal é transferir pro berço em sono profundo ou com os olhos abertos, meio acordada ainda pra ela se habituar com o berço e criar autonomia',
    must: [/18h30|18:30/i, /45\s*min|1 hora e 15|1h15/i, /j[aá] dormindo|mamar e adormecer/i],
    mustNot: [/promove a autonomia|n[aã]o encontrei orienta[cç][aã]o suficiente|n[aã]o [eé] necessariamente um problema/i],
  },
  {
    id: '55d',
    ageDays: 55,
    motherName: 'Ana',
    babyName: 'Pedro',
    message:
      'Bom dia! Bebê de 55 dias e chupa chupeta… quando a chupeta cai da boca ele reclama… devo colocá-la logo em seguida ou devo esperar um pouco para colocá-la na boca dele novamente? Outra coisa, a janela de sono dele está maior que 1h15. Geralmente 1h30 a 1h45! Tem problema?',
    must: [/n[aã]o precisa recoloc|observe um pouco/i, /45\s*min/i, /1h30|1h\s*30/i],
    mustNot: [/n[aã]o encontrei orienta[cç][aã]o suficiente|idade exata|fracion.{0,40}soneca da manh[aã]|vig[ií]lia excessiva|40.?45 minutos para adormecer|acordar ap[oó]s as sonecas|mamando efetivamente|parece tranquilo[oa]?, chorando ou buscando o peito|caprichar nas mamadas|sinais de saciedade/i],
  },
  {
    id: '56d',
    ageDays: 56,
    motherName: 'Ana',
    babyName: 'Pedro',
    message:
      'Bebe de 56 dias. Posso colocar no berço e esperar ele dormir sozinho, se não estiver chorando? Ou preciso colocar ele em sono leve ? Ou em sono profundo?',
    must: [/acordad/i, /n[aã]o [eé] necess[aá]rio esperar|sono leve/i, /j[aá] dormindo|adormecer mamando/i, /aula.{0,80}travesseiro|estrat[eé]gia do travesseiro/i],
    mustNot: [/n[aã]o encontrei orienta[cç][aã]o suficiente|idade exata|ajudar na transi[cç][aã]o/i],
    maxCryCalm: 1,
    mustLessons: ['lesson-travesseiro'],
    mustNotLessons: [
      'lesson-30-60-passo-2-estimulos',
      'lesson-30-60-passo-3-janela',
      'lesson-30-60-passo-4-rotina',
      'lesson-ruido-branco',
    ],
  },
  {
    id: '57d',
    ageDays: 57,
    motherName: 'Ana',
    babyName: 'Lara',
    message:
      'Oi! Bebê de 57 dias. Estou ensinando a adormecer direto no berço progressivamente... começo com sono da manhã e estou avançando gradativamente para as outras sonecas, até chegar no sono noturno. O indicado é ir progressivamente ou deveria tentar em todas as sonecas de uma vez? Além disso, em algumas tentativas, há choro e fico uns 10 min tentando acalmá-la. Quando não resolve, pego no colo, acalmo e refaço o processo novamente... O caminho é esse mesmo?',
    must: [/mesmo dia|daquele dia|todas as demais sonecas/i, /45\s*min|1 hora e 15|1h15/i],
    mustNot: [/n[aã]o encontrei orienta[cç][aã]o suficiente|avan[cç]ar progressivamente.{0,80}sonecas da tarde|paci[eê]ncia e respeitar a resposta|pode ser uma boa (estrat[eé]gia|ferramenta)/i],
  },
];

for (const c of cases) {
  console.log(`\n-- ${c.id} --`);
  const result = await processTurn({
    conversationId: `teste-30-60-${c.id}`,
    message: c.message,
    babyProfile: { motherName: c.motherName, babyName: c.babyName, ageDays: c.ageDays },
    conversation: [],
  });
  const text = result?.response?.text || '';
  const lessons = (result?.response?.suggestedLessons || []).map((l) => l.id || l).join(',');
  console.log('  route:', result?.route?.path, '| lessons:', lessons || '—');
  console.log('  text:', text.slice(0, 220).replace(/\s+/g, ' '), '…');

  for (const re of c.must) {
    assert(re.test(text), `${c.id} must ${re}`, text.slice(0, 120));
  }
  for (const re of c.mustNot) {
    assert(!re.test(text), `${c.id} mustNot ${re}`, text.slice(0, 120));
  }
  if (c.max2130 != null) {
    const n = (text.match(/[^.!?\n]*(?:21h30|21:30)[^.!?]*[.!?]/gi) || []).length;
    assert(n <= c.max2130, `${c.id} 21h30 sentences <= ${c.max2130}`, String(n));
  }
  if (c.maxCryCalm != null) {
    const n = countCryCalm(text);
    assert(n <= c.maxCryCalm, `${c.id} cry/calm sentences <= ${c.maxCryCalm}`, String(n));
  }
  assert(!/lesson-30-60-maus-habitos/.test(lessons), `${c.id} no maus-habitos lesson`);
  for (const id of c.mustLessons || []) {
    assert(lessons.split(',').includes(id), `${c.id} mustLesson ${id}`, lessons);
  }
  for (const id of c.mustNotLessons || []) {
    assert(!lessons.split(',').includes(id), `${c.id} mustNotLesson ${id}`, lessons);
  }
}

console.log(`\nTOTAL: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
