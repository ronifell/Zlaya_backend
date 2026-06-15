#!/usr/bin/env node
/**
 * Focused regression for age preservation.
 *
 * Test feedback explicitly requires that the IA NEVER alters the baby's age
 * informed by the mother (e.g. mãe diz 16 dias, Zlaya responde 14 dias).
 *
 * This script exercises two layers:
 *   1) Unit-level: correctAgeMentions() rewrites every divergent age to the
 *      profile age across a battery of phrasings.
 *   2) Integration-level: a draft containing a wrong age, fed through the
 *      checkForbiddenContent → correctAgeMentions wiring, must come out with
 *      the correct age and zero age_mismatch violations.
 */
import { checkForbiddenContent, correctAgeMentions } from '../services/safetyValidator.js';

const unitCases = [
  {
    name: '10d profile, draft says "14 dias"',
    ageDays: 10,
    input: 'Para um bebê de 14 dias é comum essa busca pelo peito.',
    expectFinalNumbers: [10],
    forbiddenNumbers: [14],
  },
  {
    name: '22d profile, draft says "14 dias" mid-sentence',
    ageDays: 22,
    input: 'Com 14 dias, isso pode ser associação. Hoje, 14 dias após o nascimento, é normal.',
    expectFinalNumbers: [22],
    forbiddenNumbers: [14],
  },
  {
    name: '16d profile, draft says "duas semanas"',
    ageDays: 16,
    input: 'Bebês com duas semanas costumam variar o padrão.',
    expectFinalNumbers: [16],
    forbiddenNumbers: [14],
  },
  {
    name: '22d profile, draft says "3 semanas" — must rewrite to exact age',
    ageDays: 22,
    input: 'Com 3 semanas alguns bebês já mostram esse padrão.',
    expectFinalNumbers: [22],
    forbiddenPhrases: ['3 semanas'],
  },
  {
    name: '14d profile, draft says "duas semanas" — equivalent, must keep',
    ageDays: 14,
    input: 'Bebês com duas semanas costumam variar o padrão.',
    keepPhrases: ['duas semanas'],
    expectNoCorrections: true,
  },
  {
    name: '10d profile, range "0-28 dias" inside RN — must NOT touch',
    ageDays: 10,
    input: 'No RN (0–28 dias), adormecer no colo é fisiológico.',
    keepPhrases: ['0–28 dias'],
  },
  {
    name: '10d profile, recommendation "a cada 2h" — must NOT touch (hours, not days)',
    ageDays: 10,
    input: 'Acordar para mamar a cada 2h é o critério durante o dia.',
    keepPhrases: ['cada 2h'],
  },
  {
    name: '12d profile, "30 a 40 minutos" — must NOT touch (minutes, not days)',
    ageDays: 12,
    input: 'Mantenha em posição vertical por 30 a 40 minutos após a mamada.',
    keepPhrases: ['30 a 40 minutos'],
  },
  {
    name: '20d profile, draft says "1 dia" (typo / hallucination)',
    ageDays: 20,
    input: 'Bebês com 1 dia precisam de mais atenção, então com 20 dias o cenário é outro.',
    expectFinalNumbers: [20],
    forbiddenNumbers: [1],
  },
  {
    name: '16d profile, draft says "16 dias" (already correct)',
    ageDays: 16,
    input: 'Para sua bebê de 16 dias, a hipótese principal é alimentar.',
    keepPhrases: ['16 dias'],
    expectNoCorrections: true,
  },
];

let pass = 0;
let fail = 0;
const failures = [];

for (const c of unitCases) {
  const { text, corrections } = correctAgeMentions({ text: c.input, ageDays: c.ageDays });
  let ok = true;
  const errors = [];

  if (c.expectNoCorrections && corrections.length !== 0) {
    ok = false;
    errors.push(`expected no corrections, got ${corrections.length}: ${JSON.stringify(corrections)}`);
  }
  for (const ph of c.keepPhrases || []) {
    if (!text.includes(ph)) {
      ok = false;
      errors.push(`expected to keep phrase "${ph}", final text: ${text}`);
    }
  }
  for (const n of c.expectFinalNumbers || []) {
    const re = new RegExp(`\\b${n}\\s*dias?\\b`);
    if (!re.test(text)) {
      ok = false;
      errors.push(`expected "${n} dias" in final text, got: ${text}`);
    }
  }
  for (const n of c.forbiddenNumbers || []) {
    // Forbidden only when it appears as a standalone "N dias" mention.
    const re = new RegExp(`\\b${n}\\s*dias?\\b`);
    if (re.test(text)) {
      ok = false;
      errors.push(`forbidden "${n} dias" still present in final text: ${text}`);
    }
  }
  for (const ph of c.forbiddenPhrases || []) {
    if (text.includes(ph)) {
      ok = false;
      errors.push(`forbidden phrase "${ph}" still present in final text: ${text}`);
    }
  }

  // After correction the safety net must report zero age_mismatch violations.
  const safety = checkForbiddenContent({ text, namespace: 'RN', ageDays: c.ageDays });
  const residualAge = (safety.violations || []).filter((v) => v.kind === 'age_mismatch');
  if (residualAge.length > 0) {
    ok = false;
    errors.push(`safety net STILL reports age_mismatch after auto-correct: ${JSON.stringify(residualAge)}`);
  }

  if (ok) {
    pass += 1;
    console.log(`✔ ${c.name}`);
  } else {
    fail += 1;
    failures.push({ name: c.name, errors, finalText: text, corrections });
    console.log(`✘ ${c.name}`);
    for (const e of errors) console.log(`    - ${e}`);
    console.log(`    final  : ${text}`);
    console.log(`    fixes  : ${JSON.stringify(corrections)}`);
  }
}

console.log('');
console.log(`SUMMARY: ${pass} passed, ${fail} failed (of ${pass + fail})`);
process.exit(fail === 0 ? 0 : 1);
