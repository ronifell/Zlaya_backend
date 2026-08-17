/**
 * Official 30–60 dossiers regression (Layer A + optional Layer B).
 * Does not touch RN knowledge.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSystemPrompt } from '../prompts/systemPrompt.js';
import { extractSignals } from '../services/signalExtractor.js';
import { processTurn } from '../services/zlayaPipeline.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const K = path.join(__dirname, '..', 'knowledge', '30_60');

const rules = JSON.parse(readFileSync(path.join(K, 'rules.json'), 'utf8'));
const chunks = JSON.parse(readFileSync(path.join(K, 'chunks.json'), 'utf8'));
const forbidden = JSON.parse(readFileSync(path.join(K, 'forbidden.json'), 'utf8'));

let passed = 0;
let failed = 0;
function pass(name) {
  passed += 1;
  console.log(`  PASS  ${name}`);
}
function fail(name, detail) {
  failed += 1;
  console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}
function assert(cond, name, detail) {
  if (cond) pass(name);
  else fail(name, detail);
}

function strip(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

console.log('\n=== Layer A: knowledge + prompt + signals ===\n');

assert(
  rules.fixedRules.some((r) => /45 minutos a 1 hora/i.test(r.rule)),
  'rule: janela 45min–1h',
);
assert(
  !rules.fixedRules.some((r) => /minimo de 4 a 5 sonecas|mínimo de 4 a 5 sonecas/i.test(r.rule) && !/NAO imponha|NÃO imponha/i.test(r.rule)),
  'rule: no hard min 4–5 naps',
);
assert(
  rules.fixedRules.some((r) => /20 a 30 minutos/i.test(r.rule)),
  'rule: vertical 20–30',
);
assert(
  rules.fixedRules.some((r) => /NAO classifica|NÃO classifica/i.test(r.rule) && /mau habito|mau hábito/i.test(r.rule)),
  'rule: no mau hábito 0–3m',
);
assert(
  rules.fixedRules.some((r) => /19h e 20h|19h a 20h/i.test(r.rule)),
  'rule: night start 19–20h',
);
assert(
  rules.fixedRules.some((r) => /120 ml/i.test(r.rule)),
  'rule: bottle ~120 ml second month',
);

const janelaChunk = chunks.chunks.find((c) => c.id === '30-60-chunk-janela-sono-sonecas');
assert(janelaChunk && /45 minutos a 1 hora/i.test(janelaChunk.text), 'chunk janela text');
assert(janelaChunk && /NAO imponha um minimo|NÃO imponha um mínimo/i.test(janelaChunk.text), 'chunk rejects min naps mandate');

const prompt = buildSystemPrompt({
  namespace: '30_60',
  band: { id: '30_60', label: '30 a 60 dias', minDays: 29, maxDays: 60 },
});
assert(/45 minutos a 1 hora/i.test(prompt), 'prompt has 45min–1h');
assert(/20 a 30 minutos/i.test(prompt), 'prompt has vertical 20–30');
assert(/MAU H[AÁ]BITO PROIBIDO/i.test(prompt), 'prompt bans mau hábito');
assert(!/m[ií]nimo 4–5 sonecas|m[ií]nimo 4-5 sonecas/i.test(prompt), 'prompt no min naps');
assert(!/FOCO ALIMENTAR antes de sono/i.test(prompt), 'prompt does not include RN block');
assert(/usa chupeta, isso NÃO a torna hipótese principal/i.test(prompt), 'prompt: pacifier not auto-primary');
assert(/NÃO “adaptação ao berço” nem “acostumada ao colo/i.test(prompt) || /NÃO “adaptação ao berço”/i.test(prompt), 'prompt: 51d hierarchy');

const sig49 = extractSignals({
  message: 'sonecas duram 30 min, usa chupeta. Preciso ajustar algo?',
  ageBand: '30_60',
  ageDays: 49,
});
assert(!sig49.signals.some((s) => s.id === 'pacifier_in_rn'), '49d: pacifier_in_rn blocked');
assert(!sig49.signals.some((s) => s.id === 'asks_how_to_improve'), '49d: asks_how_to_improve blocked');
assert(
  sig49.signals.some((s) => s.id === 'short_naps_pacifier_mention_30_60'),
  '49d: short naps + pacifier mention signal',
);
assert(
  sig49.priorities.some((p) => /NÃO autoriza hipótese principal|nao autoriza hipotese principal|NÃO autoriza/i.test(p) || /quando ela cai/i.test(p)),
  '49d: pacifier is conditional, not primary',
);
assert(
  sig49.priorities.some((p) => /45 minutos a 1 hora/i.test(p) || /20 a 30/i.test(p) || /mau hábito|mau habito/i.test(p)),
  '49d: 30_60 priorities present',
);

const sig30 = extractSignals({
  message: 'quando acorda ela acorda muito brava e chora bastante e só acalma dando o peito mama bem pouco e relaxa',
  ageBand: '30_60',
  ageDays: 30,
});
assert(sig30.signals.some((s) => s.id === 'nap_angry_wake_30_60'), '30d: angry wake signal');
assert(!sig30.signals.some((s) => s.id === 'asks_how_to_improve'), '30d: no RN how-to-improve');

const rnPrompt = buildSystemPrompt({
  namespace: 'RN',
  band: { id: 'RN', label: 'RN (0–28 dias)', minDays: 0, maxDays: 28 },
});
assert(/FOCO ALIMENTAR antes de sono/i.test(rnPrompt), 'RN prompt still has RN rules');

assert(
  forbidden.forbiddenInterpretations.some((x) => /mau habito|mau hábito/i.test(x)),
  'forbidden interpretation bans mau hábito class',
);

console.log(`\nLayer A: ${passed} passed, ${failed} failed`);

const RUN_LIVE = process.env.RUN_LIVE === '1';
if (!RUN_LIVE) {
  console.log('\n(Set RUN_LIVE=1 to run Layer B live chat assertions)\n');
  process.exit(failed ? 1 : 0);
}

console.log('\n=== Layer B: live processTurn on official cases ===\n');

const cases = [
  {
    id: '30d',
    ageDays: 30,
    motherName: 'Ana',
    babyName: 'Lara',
    message:
      'Minha bebê de 30 dias faz sonecas de 1h às vezes mais.. quando acorda ela acorda muito brava e chora bastante e só acalma dando o peito mama bem pouco e relaxa.. como melhorar? Antes da soneca ela já mama em média 20 a 30 min',
    must: [/alimenta|saciedad|vertical|arroto|p[oó]s-?mamada|depois da mamada/i],
    mustNot: [/sonecas? curtas/i, /sequ[eê]ncia noturna/i, /sinais de saciedade no RN/i, /mau h[aá]bito/i],
  },
  {
    id: '31d',
    ageDays: 31,
    motherName: 'Maria',
    babyName: 'João',
    message:
      'Meu filho tem 31 dias, sempre fez as sonecas no berço, que duravam cerca de 2 hrs/ 2 hrs e 30. Mas faz 02 dias que ele tem feito uma soneca grande pela manha e, durante a tarde, as sonecas estao bem curtas. Um ciclo de sono. Ele desperta e eu ate tendo nina-lo no berço, mas ele nao retorna. Depois de 30 minutos ja esta com sono novamente. Outra questao eh que ele demora demais para iniciar a soneca. O ambiente esta ajustado, ele esta alimentado, tudo tranquilo, janela de sono del eh de 1 hr/1 hr 15, quando vai dando este horário, vou para o quarto; coloco ruido, quarto escuro, nino ele no colo e ainda acordado transfiro pro berço. Quando no berço, ele demora muuuito pra relaxar, quase 40/45 minutos.',
    must: [/45\s*min|vig[ií]lia|1h30|1h\s*30|fracion|1h15|1 hora e 15/i],
    mustNot: [/mamada noturna insuficiente|produ[cç][aã]o de leite durante a noite|mau h[aá]bito/i],
  },
  {
    id: '40d-bottle',
    ageDays: 40,
    motherName: 'Ana',
    babyName: 'Lara',
    message:
      'minha bebê está com 40 dias. Quanto tempo dura a amamentação dela nessa fase? Já estou tentando introduzir 1 mamadeira Tb, conforme a Eliana ensina. Quantos ml devo ofertar pra ela?',
    must: [/120\s*ml/i, /20\s*minutos/i],
    mustNot: [/60\s*a\s*90|mau h[aá]bito|sono noturno|h[aá]bito a corrigir/i],
  },
  {
    id: '40d-pacifier',
    ageDays: 40,
    motherName: 'Ana',
    babyName: 'Pedro',
    message:
      'Meu filho tem 40 dias. Dorme no berço, colocamos ele acordado e ele dorme sozinho. ele esta usando chupeta desde que saiu da maternidade. Até 05 dias atras, ele retornava a dormir com tranquilidade, fazia sonecas de 2,3 hrs. Contudo, com um ciclo de sono ele está acordando, chora e eu tenho recolocado a chupeta e ele volta a dormir no mesmo instante. Nao quero retira-la, mas nao sei como devo conduzir.',
    must: [/alimenta|saciedad|vig[ií]lia|suc[cç][aã]o|mudan[cç]a recente/i],
    mustNot: [
      /\b(e|eh|é)\s+(um\s+)?mau\s+h[aá]bito\b|classific\w*\s+como\s+mau\s+h[aá]bito|desenvolvendo\s+um\s+mau\s+h[aá]bito|aula sobre maus h[aá]bitos|tirando os maus h[aá]bitos|rascunho bloqueado|s[oó] dorme no colo e no peito/i,
    ],
  },
  {
    id: '45d',
    ageDays: 45,
    motherName: 'Ana',
    babyName: 'Lara',
    message:
      'Qual o horário saudável para o início do sono noturno? Estou iniciando o sono noturno às 21h, porém ele está demorando para cair no sono. E o banho pode dar às 21:30?',
    must: [/19h|19\s*h|20h|20\s*h/i],
    mustNot: [/\b(e|eh|é)\s+(um\s+)?mau\s+h[aá]bito\b|classific\w*\s+como\s+mau\s+h[aá]bito|m[oó]dulos?\s*3 e 4/i],
  },
  {
    id: '49d',
    ageDays: 49,
    motherName: 'Ana',
    babyName: 'Pedro',
    message:
      'Meu bebê tem 1 mês e 19 dias, as sonecas duram uma média de 30 min, no máximo, em exceção, chega a durar 1h. No entanto, por vezes ele tem despertares durante as sonecas. Ele usa chupeta. Preciso ajustar algo?',
    must: [/45\s*min|como.*(acorda|desperta)|vig[ií]lia|quando ela cai/i],
    mustNot: [/m[ií]nimo de 4 a 5|30 a 40 minutos ap[oó]s todas|\b(e|eh|é)\s+(um\s+)?mau\s+h[aá]bito\b|principal hip[oó]tese.{0,80}chupeta/i],
  },
  {
    id: '51d',
    ageDays: 51,
    motherName: 'Ana',
    babyName: 'Lara',
    message:
      'Minha neném 1 mês e 21 dias tem dificuldade de dormir durante o dia, só dorme se for no colo, e no peito, tento fazer a técnica do travesseiro, as vezes da certo e as vezes nao, quanto tempo pra ela aprender?',
    must: [/n[aã]o existe prazo|sem prazo fixo|n[aã]o h[aá] prazo|consist[eê]ncia|vig[ií]lia|45\s*min/i],
    mustNot: [/\b(e|eh|é)\s+(um\s+)?mau\s+h[aá]bito\b|cerca de 10 minutos|em torno de 10 minutos|acostumad[oa]s? a dormir no colo|^[\s\S]{0,280}adapta[cç][aã]o ao ber[cç]o/i],
  },
];

for (const c of cases) {
  console.log(`\n-- ${c.id} --`);
  const result = await processTurn({
    conversationId: `teste-30-60-${c.id}`,
    message: c.message,
    babyProfile: { motherName: c.motherName, babyName: c.babyName, ageDays: c.ageDays },
    conversation: [],
  });
  const text = result?.response?.text || '';
  const lessons = (result?.response?.suggestedLessons || []).map((l) => l.id || l).join(',');
  console.log('  route:', result?.route?.path, '| lessons:', lessons || '—');
  console.log('  text:', text.slice(0, 220).replace(/\s+/g, ' '), '…');

  for (const re of c.must) {
    assert(re.test(text), `${c.id} must ${re}`, text.slice(0, 120));
  }
  for (const re of c.mustNot) {
    assert(!re.test(text), `${c.id} mustNot ${re}`, text.slice(0, 120));
  }
  assert(!/lesson-30-60-maus-habitos/.test(lessons), `${c.id} no maus-habitos lesson`);
}

console.log(`\nTOTAL: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
