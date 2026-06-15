#!/usr/bin/env node
/**
 * Reproduce the exact real-user case from the screenshot dated 15/06/2026
 * 15:53 where the mother typed "Minha bb tem 16 dias" and Zlaya replied
 * "para a idade de 14 dias".
 *
 * Goal: confirm that the new age-correction layer rewrites any divergent
 * "<N> dias" mention in the draft to the profile age (16) BEFORE the
 * response reaches the mother. If the LLM still drafts "14 dias", we show
 * the auto-correction kicking in.
 */
import { processTurn } from '../services/zlayaPipeline.js';

const profile = {
  motherName: '—',
  babyName: 'bb',
  ageDays: 16,
};

const message = [
  'Oi, bom dia! Minha bb tem 16 dias. Ela teve que fazer o procedimento na linguinha e teve tbm icterícia.',
  'Agora ela está mamando bem e estou complementando das duas mamadas da noite (22h e madrugada) com 60 ml com a sonda.',
  'Mas mesmo assim, nessa última madrugada, por exemplo, após fazer bastante xixi, cocó, arrotar e soluçar, ficou procurando o peito no intervalo menor que 2h.',
  'Na verdade, esse comportamento dela, de procurar o peito no intervalo menor que 2h iniciou já no finalzinho da tarde.',
  'Em vista disso, as madrugadas tem sido difíceis e as manhãs mais tranquilas.',
  'Como devo ajustar?',
].join(' ');

console.log('═════════════════════════════════════════════════════════════');
console.log('REPRO — caso real 15/06/2026 15:53 (bebê de 16 dias)');
console.log('═════════════════════════════════════════════════════════════');
console.log('PERFIL :', JSON.stringify(profile));
console.log('MENSAGEM (mãe):');
console.log(message);
console.log('-------------------------------------------------------------');

const result = await processTurn({
  message,
  babyProfile: profile,
  conversation: [],
  conversationId: 'repro-16d',
});

console.log('idadeBand    :', result.ageBand?.label, `(${result.ageDays} dias)`);
console.log('intent       :', `${result.intent?.intent} (conf=${result.intent?.confidence})`);
console.log('rota         :', result.route);
console.log('safety       :', `safe=${result.safety?.safe} viol=${(result.safety?.violations || []).length}`);
console.log('-------------------------------------------------------------');
console.log('RESPOSTA FINAL (o que a mãe veria):');
console.log(result.response?.text);
console.log('-------------------------------------------------------------');

// Verdict
const text = result.response?.text || '';
const hasCorrectAge = /\b16\s*dias?\b/.test(text);

// Scan for any "<N> dias" mention that is NOT 16 and NOT part of the RN
// range "0–28 dias" / "0-28 dias".
const textForScan = text.replace(/0\s*[–\-]\s*28\s*dias?/gi, '');
const wrongAgeMatches = [];
const wrongAgeRe = /\b(\d{1,2})\s*dias?\b/gi;
let mm;
while ((mm = wrongAgeRe.exec(textForScan)) !== null) {
  const n = Number(mm[1]);
  if (Number.isFinite(n) && n !== 16 && n <= 60) wrongAgeMatches.push(mm[0]);
}
const hasWrongAge = wrongAgeMatches.length > 0;
const ageMismatchCount = (result.safety?.violations || [])
  .filter((v) => v.kind === 'age_mismatch').length;

console.log('-------------------------------------------------------------');
console.log('VERIFICAÇÕES OBJETIVAS');
console.log(' - menciona "16 dias" ?            ', hasCorrectAge);
console.log(' - menciona OUTRA idade (≠16,≠0-28)?', hasWrongAge, wrongAgeMatches);
console.log(' - safety viol age_mismatch        :', ageMismatchCount);

// PASS criteria: no divergent age mention reaches the mother.
//   (a) response says "16 dias"  → PASS
//   (b) response says no specific age → PASS (objective data preserved)
//   (c) response says any other age in the RN window → FAIL
if (!hasWrongAge && ageMismatchCount === 0) {
  if (hasCorrectAge) {
    console.log('\nSTATUS: ✅ PASS — idade preservada explicitamente como 16 dias.');
  } else {
    console.log('\nSTATUS: ✅ PASS — nenhuma idade incorreta vazou (LLM evitou citar número de dias, dado objetivo preservado).');
  }
  process.exit(0);
}

console.log('\nSTATUS: ❌ FAIL — vazou idade incorreta:', wrongAgeMatches);
process.exit(1);
