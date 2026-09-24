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
assert.match(calm.text, /30 a 40 minutos não devem ser classificadas como sonecas curtas/);
assert.match(calm.text, /segue a vigília/);
assert.ok(calm.notes.includes('nap_duration_63'));

const asked = enrichThirtySixtyOfficialAnswer({
  text: 'Para um bebê de 45 dias, sonecas de 30 a 40 minutos não são consideradas ideais, pois o teto para as sonecas nesta faixa etária é de 2 horas a no máximo 2 horas e 30 minutos. Se as sonecas estão sendo curtas, pode ser que ele precise de uma organização melhor na rotina. Qual é a duração típica das sonecas?',
  message: 'As sonecas do Rodolfo sao de 30 a 40 minutos. Está errado?',
  signals: { signals: [] },
  babyProfile: { ageDays: 45 },
});
assert.match(asked.text, /^Não\./);
assert.match(asked.text, /não devem ser classificadas como sonecas curtas/);
assert.match(asked.text, /não significa que 30 a 40 minutos estejam errados/);
assert.match(asked.text, /Quando ele acorda dessas sonecas/);
assert.doesNotMatch(asked.text, /não são consideradas ideais/);
assert.doesNotMatch(asked.text, /sendo curtas/);
assert.doesNotMatch(asked.text, /duração típica/);
assert.ok(asked.notes.includes('nap_duration_63'));

console.log('nap duration 6.3 tests passed');
