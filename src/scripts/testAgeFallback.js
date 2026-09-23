import assert from 'node:assert/strict';
import {
  extractAgeFromText,
  resolveAge,
  resolveAgeWithFallback,
} from '../services/ageService.js';

function daysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { date: d, iso, br: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` };
}

assert.equal(resolveAge({ ageDays: '45' }).days, 45);
assert.equal(resolveAge({ ageDays: 45 }).band.id, '30_60');
assert.equal(resolveAge({}).days, null);
assert.equal(resolveAge({ ageDays: 2000 }).band, null);

const born45 = daysAgo(45);
assert.equal(resolveAge({ birthDate: born45.iso }).days, 45);
assert.equal(resolveAge({ birthDate: born45.br }).days, 45);

assert.equal(extractAgeFromText('olá Zlayaa'), null);
assert.equal(extractAgeFromText('a cada 3 dias eu acordo'), null);
assert.equal(extractAgeFromText('tem 45 dias').ageDays, 45);
assert.equal(extractAgeFromText('meu bebê tem 16 dias').ageDays, 16);
assert.equal(extractAgeFromText('45 dias').ageDays, 45);
assert.equal(extractAgeFromText('45').ageDays, 45);
assert.equal(extractAgeFromText(`nasceu em ${born45.br}`).ageDays, 45);
assert.equal(extractAgeFromText('tem 2 meses').ageDays, 60);

const missing = resolveAgeWithFallback({}, ['olá Zlayaa']);
assert.equal(missing.days, null);

const fromChat = resolveAgeWithFallback({}, ['tem 40 dias']);
assert.equal(fromChat.days, 40);
assert.equal(fromChat.band.id, '30_60');

const profileWins = resolveAgeWithFallback({ ageDays: 16 }, ['tem 40 dias']);
assert.equal(profileWins.days, 16);
assert.equal(profileWins.source, 'profile');

const { processTurn } = await import('../services/zlayaPipeline.js');
const missingTurn = await processTurn({ message: 'olá Zlayaa', babyProfile: {} });
assert.equal(missingTurn.response.kind, 'missing_profile');

const oldTurn = await processTurn({ message: 'olá', babyProfile: { ageDays: 2000 } });
assert.equal(oldTurn.response.kind, 'age_out_of_range');

console.log('age fallback tests passed');
