import assert from 'node:assert/strict';
import { extractSignals, looksLikeSleepingThroughNightAsk } from '../services/signalExtractor.js';
import { enrichThirtySixtyOfficialAnswer } from '../services/thirtySixtyOfficialEnricher.js';
import { applyThirtySixtyIntentOverrides } from '../services/intentClassifier.js';

const question =
  'meu bebê tem 53 dias e não está acordando para mamar na madrugada. Eu preciso acordar?';

assert.equal(looksLikeSleepingThroughNightAsk(question), true);
assert.equal(looksLikeSleepingThroughNightAsk('Meu bebê de 16 dias dormiu 4 horas de soneca à tarde, preciso acordar para mamar?'), false);

const signals = extractSignals({
  message: question,
  ageBand: '30_60',
  ageDays: 53,
});
const ids = new Set(signals.signals.map((s) => s.id));
assert.equal(ids.has('sleeping_through_night_30_60'), true);
assert.equal(ids.has('long_daytime_nap'), false);

const intent = applyThirtySixtyIntentOverrides({
  intent: { intent: 'intervalo_mamada_diurna', confidence: 0.8, source: 'keyword' },
  message: question,
  ageDays: 53,
});
assert.equal(intent.intent.intent, 'despertares_noturnos');

const mixedDraft = `À noite, o bebê pode aumentar o primeiro intervalo de sono para cerca de 3 a 4 horas seguidas. Se ele dorme bem e não apresenta sinais claros de fome, você pode deixá-lo dormir.

É importante observar se ele está se alimentando bem durante o dia. Se ele não acorda antes de 3 horas, tente reconduzi-lo ao sono sem oferecer mamada. Despertares ainda são comuns, mas nem sempre são fome.`;

const enriched = enrichThirtySixtyOfficialAnswer({
  text: mixedDraft,
  message: question,
  signals,
  babyProfile: { ageDays: 53, babyName: 'Rodolfo' },
});

assert.match(enriched.text, /N[aã]o [eé] necess[aá]rio acordar o beb[eê] automaticamente/i);
assert.match(enriched.text, /Aos 53 dias/i);
assert.match(enriched.text, /3 a 5 horas/i);
assert.match(enriched.text, /adormece/i);
assert.match(enriched.text, /peso do nascimento/i);
assert.match(enriched.text, /Estrat[eé]gias para o Sono Noturno/i);
assert.doesNotMatch(enriched.text, /3 a 4 horas/i);
assert.doesNotMatch(enriched.text, /tente reconduzi/i);
assert.doesNotMatch(enriched.text, /intervalo diurn/i);
assert.ok(enriched.notes.includes('sleeping_through_night_fast'));
assert.doesNotMatch(enriched.text, /Para orientar você com mais precisão/i);
assert.doesNotMatch(enriched.text, /Quantas horas ele permanece/i);

const tooLong =
  'Meu bebê está dormindo demais 19h ate 4 horas da manhã sem acordar pra mamar. Tem algum problema?';
assert.equal(looksLikeSleepingThroughNightAsk(tooLong), true);
const tooLongSignals = extractSignals({
  message: tooLong,
  ageBand: '30_60',
  ageDays: 50,
});
assert.equal(
  tooLongSignals.signals.some((s) => s.id === 'sleeping_through_night_30_60'),
  true,
);
assert.equal(
  tooLongSignals.signals.some((s) => s.id === 'night_start_19_20_30_60'),
  false,
);
const tooLongAnswer = enrichThirtySixtyOfficialAnswer({
  text: 'Não: o tempo total, do despertar até ele efetivamente adormecer, está acima da janela de 45 minutos a 1 hora e 15 minutos.\n\nPara um bebê de 50 dias, dormir das 19h até as 4h da manhã sem acordar para mamar não é um problema. Esse padrão de sono noturno é saudável e esperado nessa faixa etária.',
  message: tooLong,
  signals: tooLongSignals,
  babyProfile: { ageDays: 50, babyName: 'Rodolfo' },
});
assert.ok(tooLongAnswer.notes.includes('sleeping_through_night_fast'));
assert.match(tooLongAnswer.text, /^N[aã]o [eé] necess[aá]rio acordar o beb[eê] automaticamente para mamar/i);
assert.match(tooLongAnswer.text, /Aos 50 dias, se ele j[aá] recuperou o peso do nascimento/i);
assert.match(tooLongAnswer.text, /3 a 5 horas/i);
assert.doesNotMatch(tooLongAnswer.text, /tempo total, do despertar/i);
assert.doesNotMatch(tooLongAnswer.text, /padr[aã]o de sono noturno [eé] saud[aá]vel/i);
assert.doesNotMatch(tooLongAnswer.text, /n[aã]o [eé] um problema/i);

const followUp = 'Ele dorme as 19:30 e acorda as 4:30. Eu amamento e ele dorme novamente ate 6:30';
const followSignals = extractSignals({
  message: followUp,
  conversation: [{ role: 'user', content: question }],
  ageBand: '30_60',
  ageDays: 49,
});
const follow = enrichThirtySixtyOfficialAnswer({
  text: 'Não: o tempo total, do despertar até ele efetivamente adormecer, está acima da janela de 45 minutos a 1 hora e 15 minutos.\n\nRodolfo, com 49 dias, apresenta um padrão de sono noturno saudável.',
  message: followUp,
  signals: followSignals,
  babyProfile: { ageDays: 49, babyName: 'Rodolfo' },
});
assert.ok(follow.notes.includes('night_stretch_schedule'));
assert.match(follow.text, /não se aplica/i);
assert.match(follow.text, /19h30/);
assert.match(follow.text, /4h30/);
assert.match(follow.text, /6h30/);
assert.match(follow.text, /não precisa acordá-lo/i);
assert.doesNotMatch(follow.text, /tempo total, do despertar/i);
assert.doesNotMatch(follow.text, /padrão de sono noturno saudável/i);
assert.doesNotMatch(follow.text, /21h30 ou 22h/i);

const naps = 'Meu bebê tem 1 mês e 19 dias, as sonecas duram uma média de 30 min, no máximo, em exceção, chega a durar 1h. No entanto, por vezes ele tem despertares durante as sonecas. Ele usa chupeta. Preciso ajustar algo?';
const napSignals = extractSignals({ message: naps, ageBand: '30_60', ageDays: 49 });
const nap = enrichThirtySixtyOfficialAnswer({
  text: 'Não: o tempo total, do despertar até ele efetivamente adormecer, está acima da janela de 45 minutos a 1 hora e 15 minutos. A referência geral de fórmula nesta faixa é de 90 a 120 ml. A família pode organizar conforme sua dinâmica, mas iniciar o sono noturno por volta de 21h30 ou 22h não é o recomendado. Antes de atribuir o quadro só à janela, confirme a preferência pelo sling.',
  message: naps,
  signals: napSignals,
  babyProfile: { ageDays: 49, babyName: 'Rodolfo' },
});
assert.ok(nap.notes.includes('thirty_min_nap_pacifier_closed'));
assert.match(nap.text, /não são sonecas curtas/i);
assert.match(nap.text, /recondução cabe/i);
assert.match(nap.text, /quando ela cai/i);
assert.match(nap.text, /respeitar a janela de 45 minutos a 1 hora e 15/i);
assert.doesNotMatch(nap.text, /tempo total, do despertar/i);
assert.doesNotMatch(nap.text, /90 a 120 ml/i);
assert.doesNotMatch(nap.text, /21h30 ou 22h/i);
assert.doesNotMatch(nap.text, /sling/i);
assert.doesNotMatch(nap.text, /22 a 28/i);
assert.doesNotMatch(nap.text, /2 a 5 minutos/i);

console.log('sleeping-through-night tests passed');
