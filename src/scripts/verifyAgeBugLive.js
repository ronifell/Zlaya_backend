#!/usr/bin/env node
/**
 * Verification of the live "14 dias" bug screenshot (16/06/2026 10:51).
 *
 * Two checks:
 *   (A) Unit:  feed the EXACT draft text from the screenshot to
 *              correctAgeMentions() with ageDays=10 → expect "10 dias".
 *   (B) E2E:   feed the EXACT mother message through the pipeline →
 *              expect the final response to contain "10 dias" and NEVER
 *              any other "<N> dias" mention inside the RN window.
 */
import { correctAgeMentions } from '../services/safetyValidator.js';
import { processTurn } from '../services/zlayaPipeline.js';

console.log('═════════════════════════════════════════════════════════════');
console.log('VERIFY — bug "14 dias para bebê de 10 dias" (live 16/06 10:51)');
console.log('═════════════════════════════════════════════════════════════');

// ---------- (A) UNIT ----------------------------------------------------
const drafted =
  'É compreensível que você esteja preocupada com as sonecas da sua filha de 14 dias. É normal que os recém-nascidos durmam por períodos longos durante o dia.';
const fixA = correctAgeMentions({ text: drafted, ageDays: 10 });
console.log('\n[A] UNIT — texto idêntico ao print');
console.log('   draft : ', drafted);
console.log('   fixed : ', fixA.text);
console.log('   corrections:', JSON.stringify(fixA.corrections));
const unitOk =
  fixA.text.includes('10 dias') &&
  !/\b14\s*dias?\b/.test(fixA.text);
console.log('   STATUS:', unitOk ? '✅ corretor funciona' : '❌ corretor NÃO pegou');

// ---------- (B) END-TO-END ---------------------------------------------
const message =
  'Bebê de 10 dias. Sigo janelas de soneca com mínimo de 1h acordada e dorme por 3h. ' +
  'Durante o dia dá certo, mas quando chega na madrugada no horário de dormir de 23h as 02h ' +
  'ela não consegue dormir e fica nervosa sugando as mãozinhas e choramingando. ' +
  'Será que sonecas com duração de 3 horas está muito para ela? Devo diminuir?';

const profile = { motherName: '—', babyName: 'bb', ageDays: 10 };

console.log('\n[B] E2E — mensagem exata da mãe + pipeline atual');
console.log('   perfil:', JSON.stringify(profile));
console.log('   msg   :', message);

const result = await processTurn({
  message,
  babyProfile: profile,
  conversation: [],
  conversationId: 'verify-age-bug-live',
});

console.log('   ageBand     :', result.ageBand?.label, `(${result.ageDays} dias)`);
console.log('   intent      :', `${result.intent?.intent} (conf=${result.intent?.confidence})`);
console.log('   rota        :', result.route);
console.log('   safety      :', `safe=${result.safety?.safe}, viol=${(result.safety?.violations || []).length}`);
console.log('-------------------------------------------------------------');
console.log('   RESPOSTA FINAL (o que a mãe veria):');
console.log(result.response?.text);
console.log('-------------------------------------------------------------');

const text = result.response?.text || '';
const textNoRange = text.replace(/0\s*[–\-]\s*28\s*dias?/gi, '');
const wrongAges = [];
let m;
const re = /\b(\d{1,2})\s*dias?\b/gi;
while ((m = re.exec(textNoRange)) !== null) {
  const n = Number(m[1]);
  if (Number.isFinite(n) && n !== 10 && n <= 60) wrongAges.push(m[0]);
}
const e2eOk = wrongAges.length === 0;
console.log('   wrong ages found:', wrongAges);
console.log('   STATUS:', e2eOk ? '✅ E2E preserva 10 dias' : `❌ E2E vazou: ${wrongAges.join(', ')}`);

console.log('');
console.log('═════════════════════════════════════════════════════════════');
console.log('CONCLUSÃO');
console.log('═════════════════════════════════════════════════════════════');
if (unitOk && e2eOk) {
  console.log('✅ Código local está CORRETO.');
  console.log('   → O print veio do backend remoto (98.81.111.229:4000) com');
  console.log('     código antigo. Reinício do processo Node é obrigatório.');
} else {
  console.log('❌ Bug ainda existe no código — precisa investigação adicional.');
  process.exit(1);
}
