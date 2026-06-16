#!/usr/bin/env node
/**
 * Focused regression for "responda diretamente à pergunta da mãe".
 *
 * Test feedback 001 (RN 9d): the mother asked "Isso é normal para a
 * idade?" and the IA opened with "É compreensível que você esteja
 * preocupada…" — buried the direct answer. The rubric grades that as a
 * clarity error.
 *
 * Standard: whenever the mother explicitly asks if the behaviour is
 * normal/expected/common, the FIRST sentence of the response must carry
 * a direct affirmation. If the LLM opens with an empathic line instead,
 * the pipeline prepends a method-aligned direct answer.
 */
import { ensureDirectNormalityAnswer } from '../services/safetyValidator.js';

const cases = [
  {
    name: 'TEST 001 — mãe pergunta "isso é normal pra idade?", LLM abre com "É compreensível…" → must prepend',
    userMessage:
      'Bebê de 9 dias. Tenho medo dessa associação negativa. Isso é normal pra idade? Como posso melhorar?',
    draft:
      'É compreensível que você esteja preocupada com a dificuldade de manter o bebê no berço, especialmente à noite. O padrão de piora após as 18h é comum em recém-nascidos e pode ser desafiador.',
    mustPrepend: true,
    mustContainAll: ['Sim', 'questão alimentar'],
  },
  {
    name: 'mãe pergunta "é normal nessa fase?", LLM abre com "Entendo a sua preocupação" → must prepend',
    userMessage: 'Meu bebê de 14 dias acorda toda hora. Isso é normal nessa fase?',
    draft:
      'Entendo a sua preocupação, mãe. Despertares frequentes no RN são comuns nessa fase e estão ligados à imaturidade.',
    mustPrepend: true,
  },
  {
    name: 'mãe pergunta "é normal", LLM já abre com "Sim, esse padrão é esperado" → must NOT prepend',
    userMessage: 'Bebê de 10 dias. Sonecas de 3h são normais?',
    draft:
      'Sim, sonecas de até 3 horas podem ocorrer no RN, mas merecem investigação alimentar.',
    mustPrepend: false,
  },
  {
    name: 'mãe pergunta "é normal", LLM abre com "Esse padrão pode ocorrer" → must NOT prepend',
    userMessage: 'Bebê de 12 dias fica nervoso à noite. Isso é normal?',
    draft:
      'Esse padrão pode ocorrer no RN nessa fase e tem causa alimentar.',
    mustPrepend: false,
  },
  {
    name: 'mãe NÃO pergunta sobre normalidade → must NOT prepend nem para "é compreensível"',
    userMessage: 'Como posso melhorar o sono do meu bebê de 16 dias?',
    draft:
      'É compreensível que você queira melhorar o sono. A principal hipótese é alimentar.',
    mustPrepend: false,
  },
  {
    name: 'mãe pergunta "isso é esperado?", LLM abre com "Para um bebê de X dias…" → must prepend',
    userMessage: 'Meu bebê busca o peito a cada 1h. Isso é esperado nessa idade?',
    draft:
      'Para um bebê de 9 dias, essa busca frequente pelo peito é comum e geralmente está ligada à alimentação.',
    mustPrepend: true,
  },
  {
    name: 'mãe pergunta "é comum nessa idade?" → must prepend se a primeira frase não responde direto',
    userMessage: 'É comum nessa idade ele só dormir no peito?',
    draft:
      'A principal hipótese é que ele esteja regulando a sucção e buscando saciedade.',
    mustPrepend: true,
  },
];

let pass = 0;
let fail = 0;

for (const c of cases) {
  const r = ensureDirectNormalityAnswer({ text: c.draft, userMessage: c.userMessage });
  let ok = true;
  const errs = [];

  if (c.mustPrepend && !r.prepended) {
    ok = false;
    errs.push(`expected prepend, none happened. output: ${r.text}`);
  }
  if (!c.mustPrepend && r.prepended) {
    ok = false;
    errs.push(`expected NO prepend, but a prefix was added. output:\n${r.text}`);
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
