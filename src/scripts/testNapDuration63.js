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

const enriched = enrichThirtySixtyOfficialAnswer({
  text: 'Sonecas de 30 minutos são sonecas curtas nesta idade.',
  message: 'As sonecas duram cerca de 30 a 40 minutos e ele acorda bem.',
  signals: { signals: [] },
  babyProfile: { ageDays: 45 },
});
assert.match(enriched.text, /30 a 40 minutos não devem ser classificadas como sonecas curtas/);
assert.ok(enriched.notes.includes('nap_duration_63'));

console.log('nap duration 6.3 tests passed');
