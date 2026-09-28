import { enrichSixtyNinetyOfficialAnswer } from '../services/sixtyNinetyOfficialEnricher.js';
import { enrichNinetyOneTwentyOfficialAnswer } from '../services/ninetyOneTwentyOfficialEnricher.js';
import { checkForbiddenContent, correctAgeMentions, checkAgeConsistency } from '../services/safetyValidator.js';
import { extractSignals } from '../services/signalExtractor.js';
import { decideRoute } from '../services/decisionRouter.js';

const cases = [
  {
    band: '60_90',
    age: 65,
    q: 'Meu bebê tem 65 dias. As sonecas ficam em 15 minutos e ele acorda irritado. A janela está certa?',
    must: ['65 dias', '1 hora e 15 minutos', '2 horas', '10 a 20 minutos'],
    mustNot: ['45 minutos', '2 horas e 30', 'mau hábito', 'pico glic'],
  },
  {
    band: '60_90',
    age: 88,
    q: 'Ele tem 88 dias e acorda toda hora à noite. Ofereço o peito em todo despertar?',
    must: ['88 dias', '6 horas', '3 horas', 'não acorde', 'sem outra mamada'],
    mustNot: ['45 minutos', 'pico glic', 'mau hábito', '1 hora e 15 minutos'],
  },
  {
    band: '60_90',
    age: 75,
    q: 'Posso fazer a mamada dos sonhos para ele dormir a madrugada?',
    must: ['não faz parte do método', '75 dias'],
    mustNot: ['pico glic', 'glicêm'],
  },
  {
    band: '60_90',
    age: 72,
    q: 'Disseram que é salto de desenvolvimento. Eu espero passar?',
    must: ['72 dias', 'não peço para apenas esperar'],
    mustNot: ['salto de desenvolvimento'],
  },
  {
    band: '60_90',
    age: 70,
    q: 'Uso ruído branco a noite toda perto do ouvido. Pode?',
    must: ['1 a 2 minutos', '80 cm', 'não use se ele já está calmo'],
    mustNot: ['mau hábito'],
  },
  {
    band: '60_90',
    age: 80,
    q: 'Posso fazer a mamada no meio da janela?',
    must: ['faixa seguinte'],
    mustNot: ['cerca de uma hora depois'],
  },
  {
    band: '60_90',
    age: 68,
    q: 'A mamadeira está em 120 ml. Posso subir porque ele toma tudo uma vez?',
    must: ['120 ml', 'um dia ou, no máximo, dois', 'não obrigação de terminar'],
    mustNot: ['90 a 120 ml', '90 ml no primeiro'],
  },
  {
    band: '60_90',
    age: 90,
    q: 'Ainda uso ninho e charutinho com 90 dias. Pode continuar?',
    must: ['encerrado', '75 dias'],
    mustNot: ['mau hábito'],
  },
  {
    band: '90_120',
    age: 100,
    q: 'Meu bebê de 100 dias só dorme no peito. Como começo a mudar isso?',
    must: ['100 dias', '1 hora e 30 minutos', 'cerca de uma hora depois', 'sem oferecer o peito'],
    mustNot: ['1 hora e 15 minutos', '45 minutos', 'deixar chorar'],
  },
  {
    band: '90_120',
    age: 105,
    q: 'Ele só dorme em pé no colo. O que eu faço na hora de colocar no berço?',
    must: ['refluxo', 'dez a quinze minutos', 'três a quatro dias', 'primeiro os pés', 'sem diagnóstico'],
    mustNot: ['deixar chorar'],
  },
  {
    band: '90_120',
    age: 98,
    q: 'A chupeta cai e ele acorda toda vez. Tiro de uma vez?',
    must: ['retirada é total', 'cinco a sete meses'],
    mustNot: ['prender a chupeta', 'deixar chorar'],
  },
  {
    band: '90_120',
    age: 110,
    q: 'Posso deixar o travesseiro a noite toda?',
    must: ['não fica a noite toda', 'quadril', 'nunca só a cabeça', 'aula'],
    mustNot: ['deixar chorar'],
  },
  {
    band: '90_120',
    age: 96,
    q: 'Fiz tudo certo e ele não dormiu a soneca. Insisto?',
    must: ['Não insista', 'próximo sinal de sono'],
    mustNot: ['2 horas e 30'],
  },
  {
    band: '90_120',
    age: 102,
    q: 'Ele só dorme se eu estiver andando. Como paro?',
    must: ['aos poucos', 'dois a quatro dias'],
    mustNot: ['deixar chorar'],
  },
  {
    band: '90_120',
    age: 99,
    q: 'Depois da vacina o sono desorganizou. Mantenho a rotina?',
    must: ['24 a 48 horas', 'não prescrevo', '14h e 15h'],
    mustNot: ['regressão natural do sono'],
  },
  {
    band: '90_120',
    age: 115,
    q: 'Vamos viajar de avião. Onde ele dorme?',
    must: ['berço portátil', 'carrinho'],
    mustNot: ['introdução alimentar'],
  },
];

let failed = 0;
for (const item of cases) {
  const enriched = item.band === '60_90'
    ? enrichSixtyNinetyOfficialAnswer({
      text: 'rascunho',
      message: item.q,
      babyProfile: { ageDays: item.age },
    })
    : enrichNinetyOneTwentyOfficialAnswer({
      text: 'rascunho',
      message: item.q,
      babyProfile: { ageDays: item.age },
    });
  const safety = checkForbiddenContent({
    text: enriched.text,
    namespace: item.band,
    ageDays: item.age,
  });
  const missing = item.must.filter((part) => !enriched.text.toLowerCase().includes(part.toLowerCase()));
  const present = item.mustNot.filter((part) => enriched.text.toLowerCase().includes(part.toLowerCase()));
  const signals = extractSignals({ message: item.q, ageBand: item.band, ageDays: item.age });
  const route = decideRoute({
    intent: 'fora_da_base',
    intentConfidence: 0.2,
    retrieval: { status: 'no_results', confidence: 0, chunks: [] },
    clinical: { hasRedFlag: false, redFlags: [] },
    babyContext: { hasMinimumContext: true },
    namespace: item.band,
    signals,
  });
  const ok = missing.length === 0 && present.length === 0 && safety.safe && route.path === 'answer_directly';
  if (!ok) {
    failed += 1;
    console.log('\nFAIL', item.age, item.q.slice(0, 70));
    if (missing.length) console.log('  missing', missing);
    if (present.length) console.log('  forbidden-present', present);
    if (!safety.safe) console.log('  safety', safety.violations);
    console.log('  route', route.path, route.details?.reason);
    console.log('  notes', enriched.notes);
    console.log(enriched.text.slice(0, 400));
  } else {
    console.log('OK', item.age, enriched.notes.join(','));
  }
}

const age40 = correctAgeMentions({ text: 'em 2 dias ele melhora', ageDays: 40 });
const age75 = correctAgeMentions({ text: 'em 2 dias ele melhora', ageDays: 75 });
const shortRange = checkAgeConsistency({ text: 'a mudança leva 3 a 4 dias', ageDays: 100 });
const wrongAge = checkAgeConsistency({ text: 'seu bebê de 10 dias', ageDays: 100 });
const anchor40 = checkAgeConsistency({ text: 'aos 60 dias o jejum muda', ageDays: 40 });
if (!/40 dias/.test(age40.text)) {
  failed += 1;
  console.log('FAIL age rewrite 40', age40.text);
}
if (/75 dias/.test(age75.text)) {
  failed += 1;
  console.log('FAIL age rewrite 75 should keep 2 dias', age75.text);
}
if (shortRange.length) {
  failed += 1;
  console.log('FAIL short range flagged', shortRange);
}
if (!wrongAge.length) {
  failed += 1;
  console.log('FAIL 10 dias should still flag at 100');
}
if (anchor40.length) {
  failed += 1;
  console.log('FAIL 30-60 anchor 60 dias was flagged', anchor40);
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
