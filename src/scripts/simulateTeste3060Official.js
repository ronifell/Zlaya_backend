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
  rules.fixedRules.some((r) => /120 ml/i.test(r.rule)),
  'rule: bottle ~120 ml second month',
);

const janelaChunk = chunks.chunks.find((c) => c.id === '30-60-chunk-janela-sono-sonecas');
assert(janelaChunk && /45 minutos a 1 hora/i.test(janelaChunk.text), 'chunk janela text');
assert(janelaChunk && /NAO imponha um minimo|NÃO imponha um mínimo/i.test(janelaChunk.text), 'chunk rejects min naps mandate');

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
assert(/UMA vez s[oó], sem repetir o mesmo bloco/i.test(prompt), 'prompt: TESTE 006 56d cry-calm once');
assert(/iniciar a condu[cç][aã]o AP[OÓ]S esse per[ií]odo est[aá] correto/i.test(prompt), 'prompt: TESTE 006 49d no post-window start');
assert(/NÃO oriente interromper o peito/i.test(prompt), 'prompt: no comfort-feed interrupt');
assert(/mamou e dormiu/i.test(prompt) || /18h30/i.test(prompt), 'prompt: 48d early ritual');
assert(/n[aã]o [eé] necessariamente um problema/i.test(prompt) || /NÃO normalize o intervalo 18h30/i.test(prompt), 'prompt: 48d do not normalize 18h30-20h');
assert(/NÃO acrescente sintomas/i.test(prompt), 'prompt: do not invent symptoms');
assert(/NÃO vincule o fim da janela/i.test(prompt), 'prompt: 51d no window-to-feed');
assert(/NÃO fracionar a soneca da manhã/i.test(prompt), 'prompt: 55d no invented morning fraction');
assert(/NÃO diga s[oó] “ajudar na transi[cç][aã]o”/i.test(prompt) || /ajudar na transi/i.test(prompt), 'prompt: 56d travesseiro purpose');
assert(/consist[eê]ncia e repeti[cç][aã]o/i.test(prompt), 'prompt: 57d consistency not patience');

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
  forbidden.forbiddenInterpretations.some((x) => /associar soneca longa da manha/i.test(x)),
  'forbidden: TESTE 006 no long-nap → excess wake',
);
assert(
  rules.fixedRules.some((r) => /UMA vez so|UMA unica orientacao/i.test(r.rule) && /21h30/i.test(r.rule)),
  'rule: TESTE 006 21h30 once',
);

function countAngryWakeParas(text) {
  return String(text || '')
    .split(/\n{2,}/)
    .filter((p) => {
      const nap = /1 hora ou at[eé] mais|soneca de (cerca de )?1\s*h|dura[cç][aã]o da soneca/i.test(p);
      const wake = /irritad|brav[oa]|chor/i.test(p);
      const suck = /sugar|relax/i.test(p);
      const feed = /mamada|desconforto|alimenta|saciedad/i.test(p);
      return nap && wake && (suck || feed);
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
  assert(/20 a 30 minutos/i.test(enriched.text), 'TESTE 006 30d: keep vertical 20–30');
  assert(/refluxo/i.test(enriched.text), 'TESTE 006 30d: keep reflux');
  assert(!/como est[aá] o sono noturno/i.test(enriched.text), 'TESTE 006 30d: no night-sleep question');
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
  assert(/fracion/i.test(enriched.text), 'TESTE 006 31d: still fraction morning nap');
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
  assert(/1h30|1h\s*30/i.test(enriched.text) && /acima/i.test(enriched.text), 'TESTE 006 55d: 1h30-1h45 is above ref');
  assert(!/fracion.{0,40}soneca da manh[aã]/i.test(enriched.text), 'TESTE 006 55d: no morning fraction');
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
    must: [/alimenta|saciedad|vertical|arroto|p[oó]s-?mamada|depois da mamada/i],
    mustNot: [/sonecas? curtas/i, /sequ[eê]ncia noturna/i, /sinais de saciedade no RN/i, /mau h[aá]bito/i, /sem evid[eê]ncia no relato|como hip[oó]tese, sem diagn[oó]stico/i, /[eé] (normal|comum) que .{0,140}acord(em|e) chorando/i, /como est[aá] o sono noturno/i, /essa situa[cç][aã]o [eé] comum/i],
  },
  {
    id: '31d',
    ageDays: 31,
    motherName: 'Maria',
    babyName: 'João',
    message:
      'Meu filho tem 31 dias, sempre fez as sonecas no berço, que duravam cerca de 2 hrs/ 2 hrs e 30. Mas faz 02 dias que ele tem feito uma soneca grande pela manha e, durante a tarde, as sonecas estao bem curtas. Um ciclo de sono. Ele desperta e eu ate tendo nina-lo no berço, mas ele nao retorna. Depois de 30 minutos ja esta com sono novamente. Outra questao eh que ele demora demais para iniciar a soneca. O ambiente esta ajustado, ele esta alimentado, tudo tranquilo, janela de sono del eh de 1 hr/1 hr 15, quando vai dando este horário, vou para o quarto; coloco ruido, quarto escuro, nino ele no colo e ainda acordado transfiro pro berço. Quando no berço, ele demora muuuito pra relaxar, quase 40/45 minutos.',
    must: [/45\s*min|vig[ií]lia|1h30|1h\s*30|fracion|1h15|1 hora e 15/i, /antecip/i],
    mustNot: [/mamada noturna insuficiente|produ[cç][aã]o de leite durante a noite|mau h[aá]bito|caprichar nas mamadas.{0,40}relaxar|quanto tempo (ele|ela) (costuma )?permanecer acordad[oa] antes de iniciar|soneca longa pela manh[aã].{0,220}tempo total acordado que excede|observe os sinais de sono e inicie a condu|Isso pode ajudar a avaliar se (ele|ela) est[aá] se alimentando adequadamente/i],
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
    must: [/alimenta|mamada efetiva|ganho de peso|rotina alimentar|vertical|arroto/i],
    mustNot: [/n[aã]o [eé] necess[aá]rio acord[aá]-l[oa]|mau h[aá]bito|Isso pode ajudar a\s+[A-ZÁ]/i],
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
    must: [/45\s*min|como.*(acorda|desperta)|vig[ií]lia|quando ela cai/i],
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
    mustNot: [/\b(e|eh|é)\s+(um\s+)?mau\s+h[aá]bito\b|cerca de 10 minutos|em torno de 10 minutos|acostumad[oa]s? a dormir no colo|^[\s\S]{0,280}adapta[cç][aã]o ao ber[cç]o|mamada.{0,40}conforto.{0,80}interromper|apenas por conforto|ap[oó]s esse tempo.{0,40}mamada efetiva/i],
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
    mustNot: [/n[aã]o encontrei orienta[cç][aã]o suficiente|idade exata|fracion.{0,40}soneca da manh[aã]|vig[ií]lia excessiva|40.?45 minutos para adormecer|acordar ap[oó]s as sonecas|mamando efetivamente/i],
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
    mustNot: [/n[aã]o encontrei orienta[cç][aã]o suficiente|avan[cç]ar progressivamente.{0,80}sonecas da tarde|paci[eê]ncia e respeitar a resposta|pode ser uma boa estrat[eé]gia/i],
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
