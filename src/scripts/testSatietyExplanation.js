#!/usr/bin/env node
/**
 * Focused regression for the "sinais de saciedade" rule.
 *
 * Test feedback (caso bebê 16 dias, 15/06/2026): the IA wrote "observe
 * sinais de saciedade" without listing the actual signs. For a RN mother
 * this is incomplete and downgraded the response (6,5/10).
 *
 * Standard from now on: whenever the response mentions satiety, it MUST
 * carry the official enumeration (≥3 of the 6 signs). The pipeline
 * auto-appends the canonical list when the LLM doesn't already include it.
 */
import { ensureSatietySignsExplained } from '../services/safetyValidator.js';

const cases = [
  {
    name: 'vague "observe sinais de saciedade" → must be expanded',
    input: 'Mãe, observe sinais de saciedade após a mamada.',
    mustExpand: true,
    mustContainAll: ['solta o peito', 'relaxa o corpo', 'mãozinhas', 'sucção'],
  },
  {
    name: 'vague "se ela está saciada" → must be expanded',
    input: 'Verifique se ela está saciada depois de mamar.',
    mustExpand: true,
    mustContainAll: ['solta o peito', 'relaxa o corpo'],
  },
  {
    name: 'vague "se ficou satisfeita" → must be expanded',
    input: 'Observe se ficou satisfeita após a mamada.',
    mustExpand: true,
    mustContainAll: ['solta o peito', 'sucção'],
  },
  {
    name: 'vague "observar a saciedade" → must be expanded',
    input: 'Vale observar a saciedade da bebê nesse período.',
    mustExpand: true,
    mustContainAll: ['solta o peito'],
  },
  {
    name: 'already explains signs (≥3) → must NOT duplicate',
    input:
      'Observe sinais de saciedade: o bebê solta o peito espontaneamente, relaxa o corpo, abre as mãozinhas e reduz o ritmo da sucção.',
    mustExpand: false,
  },
  {
    name: 'explains 4 signs in a different order → must NOT duplicate',
    input:
      'Sinais de saciedade incluem o bebê relaxar o corpo, soltar o peito, reduzir o ritmo da sucção e ficar tranquilo após a mamada.',
    mustExpand: false,
  },
  {
    name: 'mentions "sucção ativa" only (about feeding, NOT satiety) → must NOT trigger',
    input: 'Observe se há sucção ativa e deglutição durante a mamada.',
    mustExpand: false,
  },
  {
    name: 'no mention of satiety at all → must NOT trigger',
    input: 'Para o RN, oferecer o peito em livre demanda nesse período.',
    mustExpand: false,
  },
  {
    name: 'mentions "sinais de saciedade" inside a longer paragraph → must expand',
    input:
      'A principal hipótese é baixa transferência de leite. É importante avaliar se ela está mamando de forma efetiva, observando sinais como sucção ativa e deglutição, e também os sinais de saciedade.',
    mustExpand: true,
    mustContainAll: ['solta o peito', 'mãozinhas'],
  },
];

let pass = 0;
let fail = 0;

for (const c of cases) {
  const r = ensureSatietySignsExplained({ text: c.input });
  let ok = true;
  const errs = [];
  if (c.mustExpand && !r.expanded) {
    ok = false;
    errs.push(`expected expansion, none happened. output: ${r.text}`);
  }
  if (!c.mustExpand && r.expanded) {
    ok = false;
    errs.push(`expected NO expansion, but it expanded. output: ${r.text}`);
  }
  for (const ph of c.mustContainAll || []) {
    if (!r.text.includes(ph)) {
      ok = false;
      errs.push(`expected phrase "${ph}" in final text, got: ${r.text}`);
    }
  }
  if (ok) {
    pass += 1;
    console.log(`✔ ${c.name}`);
  } else {
    fail += 1;
    console.log(`✘ ${c.name}`);
    for (const e of errs) console.log(`    - ${e}`);
  }
}

console.log('');
console.log(`SUMMARY: ${pass} passed, ${fail} failed (of ${pass + fail})`);
process.exit(fail === 0 ? 0 : 1);
