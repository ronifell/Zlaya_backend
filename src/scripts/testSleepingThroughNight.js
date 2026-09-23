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
assert.equal(intent.intent.intent, 'comportamento_esperado');

const mixedDraft = `À noite, o bebê pode aumentar o primeiro intervalo de sono para cerca de 3 a 4 horas seguidas. Se ele dorme bem e não apresenta sinais claros de fome, você pode deixá-lo dormir.

É importante observar se ele está se alimentando bem durante o dia. Se ele não acorda antes de 3 horas, tente reconduzi-lo ao sono sem oferecer mamada. Despertares ainda são comuns, mas nem sempre são fome.

Para garantir que ele está se alimentando adequadamente, você poderia me informar se ele tem mamadas efetivas durante o dia e se está apresentando sinais de saciedade?`;

const enriched = enrichThirtySixtyOfficialAnswer({
  text: mixedDraft,
  message: question,
  signals,
  babyProfile: { ageDays: 53, babyName: 'Rodolfo' },
});

assert.match(enriched.text, /n[aã]o precisa acord/i);
assert.match(enriched.text, /quando ele ACORDA/i);
assert.doesNotMatch(enriched.text, /primeiro intervalo/i);
assert.doesNotMatch(enriched.text, /n[aã]o acorda antes de 3 horas/i);
assert.doesNotMatch(enriched.text, /tente reconduzi/i);
assert.doesNotMatch(enriched.text, /sinais claros de fome/i);
assert.ok(enriched.notes.includes('sleeping_through_night_not_fast'));

console.log('sleeping-through-night tests passed');
