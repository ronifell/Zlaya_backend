/**
 * Live + enricher simulation of the 19/08 official dossiers:
 * 45d TESTE 003, 48d TESTE 001, 51d TESTE 003, 55d TESTE 001.
 */
import { extractSignals } from '../services/signalExtractor.js';
import { enrichThirtySixtyOfficialAnswer } from '../services/thirtySixtyOfficialEnricher.js';
import { processTurn } from '../services/zlayaPipeline.js';

function score(criteria, text) {
  let earned = 0;
  let total = 0;
  const detail = [];
  for (const c of criteria) {
    total += c.w;
    const ok = !!c.pass(text);
    if (ok) earned += c.w;
    detail.push({ id: c.id, w: c.w, pass: ok });
  }
  return { score: total ? Math.round((earned / total) * 1000) / 10 : 0, detail };
}

const CASES = [
  {
    id: '45d TESTE 003',
    ageDays: 45,
    babyName: 'Pedro',
    sex: 'm',
    officialNote: 9.3,
    message:
      'Bebê de 45 dias, o ritual do sono precisa começar entre 19 e 20 horas? Meu esposo gosta de dar banho nele e chega por volta das 22:00. Estou iniciando o sono noturno às 21h, porém ele está demorando para cair no sono. E o banho pode dar às 21:30?',
    draft: `É compreensível que você esteja buscando uma rotina mais estruturada para o seu bebê de 45 dias. O horário recomendado para o início do sono noturno é entre 19h e 20h. Iniciar o sono noturno às 21h30 ou 22h não é o ideal, pois isso pode atrasar o início do sono e contribuir para a dificuldade que você está percebendo.

Se o banho for dado às 21h30, isso pode postergar ainda mais o início do sono noturno. A demora para adormecer pode estar relacionada não apenas ao horário, mas também à última soneca e à janela de vigília.

Para entender melhor, poderia me informar a que horas termina a última soneca do dia? E quanto tempo o bebê está acordado quando você tenta iniciar o sono noturno?

Recomendo que você revise as aulas sobre rotina e janelas de vigília no aplicativo, especialmente as do módulo 3 e 4, para ajudar a estruturar melhor o dia do seu bebê.

A família pode organizar conforme sua dinâmica, mas iniciar o sono noturno por volta de 21h30 ou 22h não é o recomendado.

A janela de vigília pode variar entre 45 minutos a 1 hora e 15 minutos.`,
    criteria: [
      { id: 'night_19_20', w: 20, pass: (t) => /19h.{0,15}20h|entre 19.{0,10}20/i.test(t) },
      { id: 'late_once', w: 15, pass: (t) => /21h30 ou 22h n[aã]o [eé]/i.test(t) && ((t.match(/21h30 ou 22h n[aã]o [eé]/gi) || []).length <= 1) },
      { id: 'bath_direct', w: 25, pass: (t) => /banho.{0,100}n[aã]o [eé] recomendado/i.test(t) },
      { id: 'no_modulos', w: 20, pass: (t) => !/m[oó]dulos?\s*3 e 4/i.test(t) },
      { id: 'wake_ref', w: 20, pass: (t) => /45\s*min/i.test(t) && /1 hora e 15|1h15/i.test(t) },
    ],
  },
  {
    id: '48d TESTE 001',
    ageDays: 48,
    babyName: 'Lara',
    sex: 'f',
    officialNote: 7.0,
    message:
      'Bebê de 48 dias. Estou começando a rotina do sono dela umas 18:30, até 20 horas está dormindo. Estou na dúvida se está muito cedo, precisa ser mais tarde pela idade ou não tem relevância? Outra dúvida, nos momentos da soneca, o ideal é transferir pro berço em sono profundo ou com os olhos abertos, meio acordada ainda pra ela se habituar com o berço e criar autonomia',
    draft: `É normal que, aos 48 dias, você esteja começando a estruturar a rotina do sono da sua bebê. O horário recomendado para o início do sono noturno é entre 19h e 20h, então iniciar por volta das 18h30 está dentro do esperado e pode ser uma boa prática. O importante é que você observe como ela responde a esse horário e ajuste conforme necessário.

Quanto à transferência para o berço, o ideal é que você coloque a bebê no berço quando ela estiver calma, mas ainda acordada. Isso ajuda a criar a associação do berço como um lugar seguro para dormir e promove a autonomia dela. Se ela estiver em sono profundo, pode ser mais difícil para ela se habituar ao berço.

Para entender melhor a sua rotina, poderia me informar a que horas termina a última soneca dela e quanto tempo ela costuma ficar acordada antes de você iniciar a condução para dormir?

Recomendo que você revise a aula sobre rotina e janelas, que pode ajudar a estruturar ainda mais esse processo.`,
    criteria: [
      { id: 'brief_ritual', w: 15, pass: (t) => /ritual.{0,40}breve|banho.{0,20}mamada/i.test(t) },
      { id: 'two_options', w: 25, pass: (t) => /18h30|18:30/i.test(t) && /soneca.{0,50}1 hora|soneca de at[eé]/i.test(t) },
      { id: 'crib_fed_asleep', w: 20, pass: (t) => /j[aá] dormindo|mamar e adormecer/i.test(t) },
      { id: 'no_autonomy_rule', w: 20, pass: (t) => !/promove a autonomia/i.test(t) },
      { id: 'wake_ref', w: 20, pass: (t) => /45\s*min/i.test(t) && /1 hora e 15|1h15/i.test(t) },
    ],
  },
  {
    id: '51d TESTE 003',
    ageDays: 51,
    babyName: 'Lara',
    sex: 'f',
    officialNote: 9.3,
    message:
      'Minha neném1 mês e 21 dias tem dificuldade de dormir durante o dia, só dorme se for no colo, e no peito, tento fazer a técnica do travesseiro, as vezes da certo e as vezes não, quanto tempo pra ela aprender?',
    draft: `É comum que bebês de 51 dias tenham dificuldades para dormir durante o dia. Essa fase é de adaptação e é importante respeitar o ritmo dela.

Para ajudar sua bebê a dormir melhor durante o dia, siga esta hierarquia: primeiro, observe a janela de vigília, que deve ser de 45 minutos a 1 hora e 15 minutos. Em seguida, verifique se ela está recebendo uma mamada efetiva e se apresenta sinais de saciedade antes de tentar a técnica do travesseiro. Se a mamada for apenas por conforto, pode ser necessário interromper e conduzir o sono com contenção e ruído branco, sem rotular isso como padrão de condução.

Quanto ao tempo para aprender, não existe um prazo fixo. A evolução depende da repetição e consistência, respeitando a maturidade e a organização da alimentação, vigília e sono.

Para entender melhor a situação, gostaria de saber: quanto tempo sua bebê permanece acordada antes das sonecas? Quando você inicia a condução para o sono? Como você está executando a técnica do travesseiro?

Você pode conferir mais detalhes na aula sobre a estratégia do travesseiro para obter orientações adicionais.

Quando ela 'só dorme no peito', diferencie: ainda está com fome; fez mamada efetiva e ficou saciada; ou já saciada permanece sugando enquanto adormece. Essa leitura vem antes de tratar o peito só como forma de adormecer.

Na condução, use contenção e presença observando a resposta da bebê — sem cronometrar o choro e sem tempo predeterminado.`,
    criteria: [
      { id: 'no_interrupt', w: 40, pass: (t) => !/mamada.{0,50}conforto.{0,80}interromper|interromper e conduzir o sono com conten/i.test(t) },
      { id: 'wake_ref', w: 20, pass: (t) => /45\s*min/i.test(t) && /1 hora e 15|1h15/i.test(t) },
      { id: 'differentiate', w: 20, pass: (t) => /fome/i.test(t) && /saciad/i.test(t) },
      { id: 'no_fixed', w: 20, pass: (t) => /prazo fixo|n[aã]o existe/i.test(t) },
    ],
  },
  {
    id: '55d TESTE 001',
    ageDays: 55,
    babyName: 'Pedro',
    sex: 'm',
    officialNote: 3.0,
    message:
      'Bom dia! Bebê de 55 dias e chupa chupeta… quando a chupeta cai da boca ele reclama… devo colocá-la logo em seguida ou devo esperar um pouco para colocá-la na boca dele novamente? Outra coisa, a janela de sono dele está maior que 1h15. Geralmente 1h30 a 1h45! Tem problema?',
    draft: `Mãe, não encontrei orientação suficiente dentro do método para te responder com segurança agora.
Posso seguir de duas formas:
 • Me contar um pouco mais de contexto (idade exata, padrão de sono, alimentação, episódios recentes), ou
 • Te encaminhar para o conteúdo mais próximo disponível e, se preferir, para o suporte humano da equipe.`,
    criteria: [
      { id: 'no_fallback', w: 25, pass: (t) => !/n[aã]o encontrei orienta[cç][aã]o suficiente/i.test(t) },
      { id: 'pacifier_wait', w: 25, pass: (t) => /n[aã]o precisa recoloc|observe um pouco|observe se ele continua/i.test(t) },
      { id: 'window_exceeded', w: 25, pass: (t) => /1h30|1h\s*30/i.test(t) && /ultrapass|acima|excede/i.test(t) },
      { id: 'wake_ref', w: 15, pass: (t) => /45\s*min/i.test(t) && /1 hora e 15|1h15/i.test(t) },
      { id: 'no_reask_age', w: 10, pass: (t) => !/idade exata/i.test(t) },
    ],
  },
];

function printScore(label, s) {
  const fail = s.detail.filter((d) => !d.pass).map((d) => d.id);
  const mark = fail.length === 0 ? 'PASS' : 'FAIL';
  console.log(`  ${label}: ${mark}  ${s.score}/100  ${fail.length ? `fail: ${fail.join(', ')}` : 'all criteria ok'}`);
}

console.log('\n=== Simulation: official 19/08 dossiers ===\n');

let failed = 0;
for (const c of CASES) {
  console.log(`\n========== ${c.id}  (nota oficial ${c.officialNote}/10) ==========`);
  const signals = extractSignals({ message: c.message, ageBand: '30_60', ageDays: c.ageDays });
  console.log('signals:', (signals.signals || []).map((s) => s.id).join(', ') || '—');

  const before = score(c.criteria, c.draft);
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: c.draft,
    message: c.message,
    signals,
    babyProfile: { babyName: c.babyName, ageDays: c.ageDays, sex: c.sex, motherName: 'Ana' },
  });
  const after = score(c.criteria, enriched.text);
  printScore('official draft → enricher', after);
  if (after.detail.some((d) => !d.pass)) failed += 1;

  console.log('\n--- ENRICHED DRAFT ---\n');
  console.log(enriched.text.trim());
  console.log('\n--- LIVE processTurn ---');

  const result = await processTurn({
    conversationId: `sim-aug19-${c.id}`,
    message: c.message,
    babyProfile: {
      motherName: 'Ana',
      babyName: c.babyName,
      ageDays: c.ageDays,
      sex: c.sex,
    },
    conversation: [],
  });
  const liveText = result?.response?.text || '';
  const liveScore = score(c.criteria, liveText);
  printScore(`live route=${result?.route || '—'}`, liveScore);
  if (liveScore.detail.some((d) => !d.pass)) failed += 1;
  console.log('\n' + liveText.trim());
  console.log('\nlessons:', (result?.response?.suggestedLessons || []).map((l) => l.id || l.title || l).join(', ') || '—');
}

console.log(`\n\nRESULT: ${CASES.length * 2 - failed}/${CASES.length * 2} checks passing (enricher + live × 4 cases)\n`);
process.exit(failed ? 1 : 0);
