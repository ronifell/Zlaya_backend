import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { enrichThirtySixtyOfficialAnswer } from '../services/thirtySixtyOfficialEnricher.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'knowledge', '30_60');
const rules = JSON.parse(readFileSync(path.join(root, 'rules.json'), 'utf8'));
const rule = rules.fixedRules.find((item) => item.id === '30-60-duracao-sonecas');
assert.ok(rule);
assert.match(rule.rule, /30 a 40 minutos/);
assert.match(rule.rule, /NAO devem ser classificadas como sonecas curtas/);

const calm = enrichThirtySixtyOfficialAnswer({
  text: 'Sonecas de 30 minutos são sonecas curtas nesta idade.',
  message: 'As sonecas duram cerca de 30 a 40 minutos e ele acorda bem.',
  signals: { signals: [] },
  babyProfile: { ageDays: 45 },
});
assert.match(calm.text, /30 a 40 minutos não devem ser classificadas como curtas/);
assert.match(calm.text, /siga a vigília/);
assert.match(calm.text, /tente reconduzir uma vez/);
assert.match(calm.text, /despertar definitivo/);
assert.doesNotMatch(calm.text, /2 horas e 30/);
assert.ok(calm.notes.includes('nap_duration_63'));

const asked = enrichThirtySixtyOfficialAnswer({
  text: `Não: o tempo total, do despertar até ele efetivamente adormecer, está acima da janela de 45 minutos a 1 hora e 15 minutos.

Para um bebê de 52 dias, sonecas de 30 a 40 minutos não devem ser classificadas como curtas e não estão erradas. Essa duração é esperada e pode ser normal nessa fase.

O horário saudável e recomendado para o início do sono noturno é entre 19h e 20h. A referência geral de fórmula nesta faixa é de 90 a 120 ml. Antes de atribuir o quadro só à janela, confirme a preferência pelo sling.

Sonecas de 30 a 40 minutos não devem ser classificadas como sonecas curtas.`,
  message: 'As sonecas do Rodolfo estão curtas, duram de 30 a 40 minutos. Tem como melhorar?',
  signals: {
    signals: [
      { id: 'short_naps_pacifier_mention_30_60' },
      { id: 'night_start_19_20_30_60' },
      { id: 'sling_cry_physio_30_60' },
      { id: 'bottle_volume_30_60' },
    ],
  },
  babyProfile: { ageDays: 52, babyName: 'Rodolfo' },
});
assert.match(asked.text, /Para um bebê de 52 dias, sonecas de 30 a 40 minutos não devem ser classificadas como curtas/);
assert.match(asked.text, /Observe como ele desperta/);
assert.match(asked.text, /siga a vigília/);
assert.match(asked.text, /tente reconduzir uma vez/);
assert.match(asked.text, /sem insistir para completar uma duração/);
assert.match(asked.text, /despertar definitivo/);
assert.equal((asked.text.match(/30 a 40 minutos não devem ser classificadas como curtas/gi) || []).length, 1);
assert.doesNotMatch(asked.text, /tempo total, do despertar/);
assert.doesNotMatch(asked.text, /90 a 120 ml/);
assert.doesNotMatch(asked.text, /21h30 ou 22h/);
assert.doesNotMatch(asked.text, /sling/);
assert.doesNotMatch(asked.text, /solta o peito/);
assert.doesNotMatch(asked.text, /não são consideradas ideais/);
assert.ok(asked.notes.includes('nap_duration_63'));

console.log('nap duration 6.3 tests passed');
