/**
 * Replay official TESTE 003 (and 40d-night TESTE 001) drafts through the
 * 30–60 enricher and score them with the dossier rubric.
 */
import { extractSignals } from '../services/signalExtractor.js';
import { enrichThirtySixtyOfficialAnswer } from '../services/thirtySixtyOfficialEnricher.js';
import { processTurn } from '../services/zlayaPipeline.js';

function score(criteria, text, meta = {}) {
  let earned = 0;
  let total = 0;
  const detail = [];
  for (const c of criteria) {
    total += c.w;
    const ok = !!c.pass(text, meta);
    if (ok) earned += c.w;
    detail.push({ id: c.id, w: c.w, pass: ok });
  }
  return { score: total ? Math.round((earned / total) * 1000) / 10 : 0, detail };
}

const CASES = [
  {
    id: '30d',
    ageDays: 30,
    babyName: 'Lara',
    sex: 'f',
    officialNote: 9.2,
    message:
      'Minha bebê de 30 dias faz sonecas de 1h às vezes mais.. quando acorda ela acorda muito brava e chora bastante e só acalma dando o peito mama bem pouco e relaxa.. como melhorar? Antes da soneca ela já mama em média 20 a 30 min',
    draft:
      'É comum que bebês de 30 dias tenham sonecas de cerca de 1 hora. Aqui a prioridade é alimentação/saciedade e o pós-mamada — não a duração da soneca (1h ou mais não deve ser classificada como curta) e não estímulos/janela sem evidência no relato. O padrão de acordar irritada, sugar pouco o peito e relaxar também justifica investigar desconforto digestivo/refluxo — como hipótese, sem diagnóstico.',
    criteria: [
      { id: 'no_internal_rules', w: 25, pass: (t) => !/sem evid[eê]ncia no relato|como hip[oó]tese, sem diagn[oó]stico|n[aã]o est[ií]mulos\/janela/i.test(t) },
      { id: 'natural_1h', w: 20, pass: (t) => /n[aã]o consideraria a dura[cç][aã]o da soneca|1 hora.{0,40}n[aã]o .{0,30}principal/i.test(t) },
      { id: 'feeding', w: 20, pass: (t) => /mamada|alimenta|saciedad/i.test(t) },
      { id: 'reflux', w: 15, pass: (t) => /refluxo/i.test(t) },
      { id: 'postural', w: 20, pass: (t) => /arroto|vertical|depois da mamada/i.test(t) },
    ],
  },
  {
    id: '31d',
    ageDays: 31,
    babyName: 'João',
    sex: 'm',
    officialNote: 9.2,
    message:
      'Ola tudo bem? Meu filho tem 31 dias, sempre fez as sonecas no berço, que duravam cerca de 2 hrs/ 2 hrs e 30. Mas faz 02 dias que ele tem feito uma soneca grande pela manhã e, durante a tarde, as sonecas estão bem curtas. Um ciclo de sono. Ele desperta e eu ate tendo nina-lo no berço, mas ele nao retorna. Depois de 30 minutos ja esta com sono novamente. Outra questao eh que ele demora femais para iniciar a soneca. O ambiente esta ajustado, ele esta alimentado, tudo tranquilo, janela de sono del eh de 1 hr/1 hr 15, quando vai dando este horário, vou para o quarto; coloco ruido, quarto escuro, nino ele no colo e ainda acordado transfiro pro berço. Quando no berço, ele demora muuuito prw relaxar, quase 40/45 minutos. Nao sei como conduzir nesta situação. Faz uns 4,5 dias que esta assim.',
    draft: `Olá, mãe. Com 31 dias, é normal que o bebê passe por variações nas sonecas, e a dificuldade para relaxar no berço pode ser um reflexo de uma vigília total excessiva.
A principal hipótese aqui é que a vigília total do bebê está excedendo a referência ideal de 45 minutos a 1 hora e 15 minutos. Como ele está fazendo uma soneca longa pela manhã (cerca de 2h a 2h30) e as sonecas da tarde estão mais curtas, isso pode estar contribuindo para a dificuldade em relaxar e adormecer novamente. Recomendo fracionar a soneca da manhã para cerca de 1h30 a 2h e observar se isso melhora as sonecas da tarde. Além disso, caprichar nas mamadas pode ajudar a relaxar o bebê antes da soneca.
qual é o intervalo típico entre as mamadas
Dado central: vigília excessiva. O crítico não é só o horário em que a condução começa: se ela inicia após ~1h–1h15 e o bebê ainda demora ~40–45 min para adormecer, o tempo total até ele efetivamente dormir fica perto de 1h40–2h — acima da referência de 45 minutos a 1 hora e 15 minutos. Comece a preparação um pouco antes para que o adormecimento caia dentro da janela.`,
    criteria: [
      { id: 'wake_ref_45_115', w: 20, pass: (t) => /45\s*min/i.test(t) && /1 hora e 15|1h15/i.test(t) },
      { id: 'excess_wake', w: 20, pass: (t) => /vig[ií]lia.{0,40}excess|1h40|1h\s*40/i.test(t) },
      { id: 'morning_nap_not_delay_cause', w: 20, pass: (t) => !/soneca longa pela manh[aã].{0,80}(contribuindo|explica|causa).{0,40}(relaxar|adormecer)/i.test(t) && !/Isso pode estar contribuindo para a dificuldade em relaxar/i.test(t) },
      { id: 'no_feed_to_relax', w: 20, pass: (t) => !/caprichar nas mamadas.{0,40}relaxar/i.test(t) },
      { id: 'feed_interval_explained', w: 20, pass: (t) => !/intervalo.{0,20}mamadas/i.test(t) || /porque|por que|aproxim/i.test(t) },
    ],
  },
  {
    id: '40d-bottle',
    ageDays: 40,
    babyName: 'Lara',
    sex: 'f',
    officialNote: 9.5,
    message:
      'Deixa eu ver se entendi: minha bebê está com 40 dias. Quanto tempo dura a amamentação dela nessa fase? Já estou tentando introduzir 1 mamadeira Tb, conforme a Eliana ensina. Quantos ml devo ofertar pra ela?',
    draft: `É normal que a amamentação aos 40 dias dure cerca de 20 minutos, podendo ser mais curta ou chegar a aproximadamente 30 minutos, desde que haja retirada efetiva de leite. É importante observar os sinais de saciedade da sua bebê antes de qualquer interpretação sobre o comportamento dela.

Para a mamadeira de aprendizado, a referência é de aproximadamente 120 ml. Isso ajudará na adaptação entre peito e mamadeira, .

Você já conseguiu que a sua bebê aceitasse a mamadeira? E após a mamada no peito, ela ainda está retirando leite ou apenas sugando por conforto?

Aos 40 dias estamos no segundo mês: a referência do método para a mamadeira de aprendizado é aproximadamente 120 ml (cerca de 90 ml no primeiro mês).`,
    criteria: [
      { id: 'breast_20_to_30', w: 20, pass: (t) => /20\s*minutos/i.test(t) && /30\s*minutos/i.test(t) },
      { id: 'volume_120', w: 25, pass: (t) => /120\s*ml/i.test(t) },
      { id: 'second_month', w: 15, pass: (t) => /segundo m[eê]s/i.test(t) },
      { id: '120_once', w: 15, pass: (t) => (t.match(/120\s*ml/gi) || []).length <= 1 },
      { id: 'no_truncated', w: 15, pass: (t) => !/mamadeira,\s*\./i.test(t) && !/,\s+\./.test(t) },
      { id: 'no_extra_q', w: 10, pass: (t) => !/aceitasse a mamadeira|adaptando [aà] mamadeira|ainda est[aá] retirando leite ou apenas sugando/i.test(t) },
    ],
  },
  {
    id: '40d-pacifier',
    ageDays: 40,
    babyName: 'Pedro',
    sex: 'm',
    officialNote: 8.5,
    message:
      'Oii, tudo bem? Meu filho tem 40 dias. Dorme no berço, colocamos ele acordado e ele dorme sozinho. O que acontece é: ele esta usando chupeta desde que saiu da maternidade. Até 05 dias atras,s ele retornava a dormir com tranquilidade, fazia sonecas de 2,3 hrs. Contudo, com um ciclo de sono ele está acordando, chora e eu tenho recolado a chupeta e ele volta a dormir no mesmo instante. As vezes aguardo e ele retoma a soneca sem a chupeta, mas a maioria das vezes, nao. Dai ele acorda e dps de 20 minutos dorme de novo pois nao havia dormido o suficiente. Eu perecebo que ele tem necessidade de sucção e sei que nesta idade é ate uma auto regulação. Como conduzir para que ele retome o sono sem colocar a chupeta? Nao quero retira-la, mas nao sei como devo conduzir.',
    draft: `É compreensível que você esteja enfrentando essa situação com seu filho de 40 dias. Mudanças no padrão de sono são comuns nessa faixa etária, e a necessidade de sucção é uma parte natural do desenvolvimento.

A principal hipótese aqui é que o bebê está apresentando uma vigília excessiva, já que ele estava fazendo sonecas mais longas e agora está acordando após um ciclo de sono. Para conduzir o sono dele sem a chupeta, você pode tentar observar os sinais de sono e iniciar a condução para a soneca antes que ele fique muito agitado. A janela de vigília para essa faixa etária é de 45 minutos a 1 hora e 15 minutos.

Há uma mudança recente (até cerca de 5 dias as sonecas eram longas e o retorno era tranquilo) — isso precisa ser investigado antes de qualquer leitura só pela chupeta.

Você pode manter a chupeta: vamos respeitar essa escolha e investigar alimentação, vigília, desconforto e o papel da sucção nos despertares.`,
    criteria: [
      { id: 'no_excess_wake_primary', w: 25, pass: (t) => !/principal hip[oó]tese.{0,80}vig[ií]lia excessiva/i.test(t) },
      { id: 'recent_change', w: 20, pass: (t) => /mudan[cç]a recente|5 dias/i.test(t) },
      { id: 'observe_resume', w: 25, pass: (t) => /retoma.{0,50}(sozinho|sem a chupeta)|observe.{0,40}(alguns instantes|retom)/i.test(t) },
      { id: 'keep_pacifier', w: 15, pass: (t) => /manter a chupeta|respeitar essa escolha/i.test(t) },
      { id: 'no_mau_habito', w: 15, pass: (t) => !/mau h[aá]bito/i.test(t) },
    ],
  },
  {
    id: '40d-night',
    ageDays: 40,
    babyName: 'Pedro',
    sex: 'm',
    officialNote: 5.5,
    message:
      'Olá. Meu bb tem 40 dias , tem noites que ele dorme super bem acorda entre 2:30 a 3 hrs , só que tem dia que após as 04:00 da manhã ele acorda de 1 em 1 hrs tento fazer ele continuar a dormir no berço porém sem sucesso, aí pego ele fico ninando no colo sem sucesso, aí coloco ele no peito ele mama mesmo sabendo que não é fome, ele mama e dorme. Continuo assim por ele ainda ser novinho ?',
    draft: `É compreensível que você esteja enfrentando dificuldades com os despertares noturnos do seu bebê de 40 dias. É comum que, nesta faixa etária, os bebês tenham padrões de sono variados e que acordem com frequência, especialmente após as 4:00 da manhã.
A orientação prática segura é que, se o seu bebê está saudável e ganhando peso, não é necessário acordá-lo para mamar à noite. Quando ele acorda antes de 3 horas, tente fazê-lo dormir novamente sem oferecer o peito imediatamente. Isso ajuda a evitar a associação de que toda vez que ele acorda, precisa mamar para voltar a dormir. Se ele estiver agitado, você pode tentar acalmá-lo com contenção, sem necessariamente pegá-lo no colo.`,
    criteria: [
      { id: 'offer_if_due', w: 20, pass: (t) => /2h\s*30|2h30/i.test(t) && /mamada efetiva/i.test(t) },
      { id: 'no_dont_wake_mismatch', w: 20, pass: (t) => !/n[aã]o [eé] necess[aá]rio acord[aá]-l[oa]/i.test(t) },
      { id: 'spontaneous_vs_wake', w: 20, pass: (t) => /acord(a|ar) (sozinho|espont)|diferente de .{0,40}acord/i.test(t) },
      { id: 'feed_first', w: 20, pass: (t) => /mamada efetiva|ganho de peso|peito.{0,20}f[oó]rmula|complemento/i.test(t) },
      { id: 'no_association_open', w: 20, pass: (t) => !/^[\s\S]{0,280}associa[cç][aã]o/i.test(t) },
    ],
  },
  {
    id: '45d-t003',
    ageDays: 45,
    babyName: 'Lara',
    sex: 'f',
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
      { id: 'late_once', w: 10, pass: (t) => ((t.match(/21h30 ou 22h n[aã]o [eé]/gi) || []).length <= 1) },
      { id: 'late_2130_sentences_once', w: 15, pass: (t) => ((t.match(/[^.!?\n]*(?:21h30|21:30)[^.!?]*[.!?]/gi) || []).length <= 1) },
      { id: 'bath_direct', w: 20, pass: (t) => /banho.{0,100}n[aã]o [eé] recomendado/i.test(t) },
      { id: 'no_modulos', w: 20, pass: (t) => !/m[oó]dulos?\s*3 e 4/i.test(t) },
      { id: 'wake_ref', w: 15, pass: (t) => /45\s*min/i.test(t) && /1 hora e 15|1h15/i.test(t) },
    ],
  },
  {
    id: '30d-t004',
    ageDays: 30,
    babyName: 'Lara',
    sex: 'f',
    officialNote: 9.4,
    message:
      'Minha bebê de 30 dias faz sonecas de 1h às vezes mais.. quando acorda ela acorda muito brava e chora bastante e só acalma dando o peito mama bem pouco e relaxa.. como melhorar? Antes da soneca ela já mama em média 20 a 30 min',
    draft:
      'É normal que bebês de 30 dias acordem irritados após sonecas, especialmente se estão se adaptando ao sono. Como ela consegue dormir por cerca de 1 hora ou até mais, eu não consideraria a duração da soneca o principal problema neste momento. O que chama mais atenção é ela acordar muito irritada e relaxar depois de sugar um pouco. Por isso, primeiro observaria como está a mamada e se existe algum desconforto depois dela. Verifique sucção ativa e deglutição. Depois da mamada, mantenha em posição vertical por 20 a 30 minutos e observe se houve arroto. Esse padrão também pode apontar para algum desconforto depois da mamada, inclusive refluxo.',
    criteria: [
      { id: 'no_normalize_open', w: 25, pass: (t) => !/[eé] (normal|comum) que .{0,90}acord(em|e) irritad/i.test(t) },
      { id: 'no_adaptacao_sono', w: 15, pass: (t) => !/se adaptando ao sono/i.test(t) },
      { id: 'open_with_1h', w: 20, pass: (t) => /^[\s\S]{0,80}Como ela consegue dormir/i.test(t) },
      { id: 'feeding', w: 15, pass: (t) => /mamada|alimenta|suc[cç][aã]o/i.test(t) },
      { id: 'reflux', w: 10, pass: (t) => /refluxo/i.test(t) },
      { id: 'postural', w: 15, pass: (t) => /arroto|vertical/i.test(t) },
    ],
  },
  {
    id: '31d-t004',
    ageDays: 31,
    babyName: 'João',
    sex: 'm',
    officialNote: 9.2,
    message:
      'Ola tudo bem? Meu filho tem 31 dias, sempre fez as sonecas no berço, que duravam cerca de 2 hrs/ 2 hrs e 30. Mas faz 02 dias que ele tem feito uma soneca grande pela manhã e, durante a tarde, as sonecas estão bem curtas. Um ciclo de sono. Ele desperta e eu ate tendo nina-lo no berço, mas ele nao retorna. Depois de 30 minutos ja esta com sono novamente. Outra questao eh que ele demora femais para iniciar a soneca. O ambiente esta ajustado, ele esta alimentado, tudo tranquilo, janela de sono del eh de 1 hr/1 hr 15, quando vai dando este horário, vou para o quarto; coloco ruido, quarto escuro, nino ele no colo e ainda acordado transfiro pro berço. Quando no berço, ele demora muuuito prw relaxar, quase 40/45 minutos. Nao sei como conduzir nesta situação. Faz uns 4,5 dias que esta assim.',
    draft: `Olá, mãe! É normal que o bebê de 31 dias passe por variações nas sonecas, especialmente nesta fase em que ele está se adaptando ao ritmo do dia. A situação que você descreveu, com uma soneca longa pela manhã e sonecas mais curtas à tarde, pode indicar uma vigília total excessiva, já que ele está demorando cerca de 40 a 45 minutos para relaxar no berço.

Para ajudar nessa situação, recomendo fracionar a soneca da manhã para cerca de 1h30 a 2h. Isso pode ajudar a equilibrar as sonecas da tarde. Além disso, observe se ele está próximo do intervalo para mamar quando você inicia a condução para dormir; se sim, oferecer uma mamada pode ajudar a relaxá-lo e facilitar o sono.

Agora, gostaria de saber: Também é importante saber qual costuma ser o intervalo entre as mamadas, porque, se durante essa demora para adormecer ele estiver se aproximando do próximo intervalo alimentar, a fome também precisa ser considerada. e quanto tempo ele permanece acordado antes das sonecas? Isso pode nos ajudar a entender melhor a situação.

Para mais detalhes sobre a condução do sono e a janela de vigília, você pode revisar a aula sobre "Janela de Sono e Sonecas" no aplicativo.

O ponto central é a vigília total: se a condução começa depois de cerca de 1h–1h15 e ele ainda leva uns 40–45 minutos para adormecer, o tempo acordado chega perto de 1h40–2h — acima da referência de 45 minutos a 1 hora e 15 minutos. Comece a preparação um pouco antes para que o adormecimento, e não só o início da condução, caia dentro da janela.`,
    criteria: [
      { id: 'wake_ref_45_115', w: 15, pass: (t) => /45\s*min/i.test(t) && /1 hora e 15|1h15/i.test(t) },
      { id: 'excess_wake', w: 15, pass: (t) => /vig[ií]lia.{0,40}excess|1h40|1h\s*40/i.test(t) },
      { id: 'no_reask_wake', w: 20, pass: (t) => !/quanto tempo (ele|ela) permanece acordad[oa] antes das sonecas/i.test(t) },
      { id: 'no_broken_concat', w: 15, pass: (t) => !/gostaria de saber:\s*Tamb[eé]m/i.test(t) },
      { id: 'no_generic_open', w: 15, pass: (t) => !/[eé] normal que.{0,80}varia[cç][oõ]es nas sonecas/i.test(t) && !/se adaptando ao ritmo do dia/i.test(t) },
      { id: 'no_feed_to_relax', w: 10, pass: (t) => !/oferecer uma mamada pode ajudar a relax/i.test(t) },
      { id: 'fraction_morning', w: 10, pass: (t) => /fracion/i.test(t) && /1h30|1h\s*30/i.test(t) },
    ],
  },
  {
    id: '40d-night-t005',
    ageDays: 40,
    babyName: 'Pedro',
    sex: 'm',
    officialNote: 8.8,
    message:
      'Olá. Meu bb tem 40 dias , tem noites que ele dorme super bem acorda entre 2:30 a 3 hrs , só que tem dia que após as 04:00 da manhã ele acorda de 1 em 1 hrs tento fazer ele continuar a dormir no berço porém sem sucesso, aí pego ele fico ninando no colo sem sucesso, aí coloco ele no peito ele mama mesmo sabendo que não é fome, ele mama e dorme. Continuo assim por ele ainda ser novinho ?',
    draft: `É compreensível que você esteja enfrentando dificuldades com os despertares do seu bebê de 40 dias. É comum que, nesta faixa etária, os bebês apresentem padrões de sono variados, e os despertares frequentes podem ser frustrantes.
A orientação prática é que, se o seu bebê acorda após 4 horas de sono e, em seguida, começa a acordar de hora em hora, é importante investigar a alimentação e a efetividade das mamadas. Isso ajuda a evitar que ele associe o despertar à necessidade de mamar. Verifique também se ele está mamando efetivamente e se há sinais de saciedade após as mamadas.
Para entender melhor a situação, gostaria de saber: quanto tempo durou o primeiro sono da noite? Quando ele acorda antes de 3 horas, você oferece o peito automaticamente? Há sinais claros de fome ou apenas agitação breve?
Recomendo que você revise a aula sobre sono noturno no módulo 3, que pode oferecer mais insights sobre como lidar com esses despertares.`,
    criteria: [
      { id: 'clock_not_duration', w: 15, pass: (t) => !/ap[oó]s 4 horas de sono/i.test(t) },
      { id: 'last_feed_before_4', w: 20, pass: (t) => /[uú]ltima mamada antes das 4h|antes das 4h.{0,50}mam/i.test(t) },
      { id: 'no_association_avoid', w: 10, pass: (t) => !/evitar que (ele|ela) associe o despertar/i.test(t) },
      { id: 'no_first_sleep_lead', w: 10, pass: (t) => !/quanto tempo durou o primeiro sono da noite/i.test(t) },
      { id: 'answers_novinho', w: 10, pass: (t) => /novinho|n[aã]o [eé] fome|n[aã]o se resume/i.test(t) },
      { id: 'feed_first', w: 10, pass: (t) => /mamada efetiva|2h30|saciedade/i.test(t) },
      { id: 'daytime_feeding', w: 10, pass: (t) => /mamadas do dia|rotina alimentar/i.test(t) },
      { id: 'postural', w: 10, pass: (t) => /vertical|arroto|postur/i.test(t) },
      { id: 'no_truncated', w: 5, pass: (t) => !/Isso pode ajudar a\s+(?=[A-ZÁ])|Isso pode ajudar a\s*$/m.test(t) },
    ],
  },
  {
    id: '45d-t004',
    ageDays: 45,
    babyName: 'Lara',
    sex: 'f',
    officialNote: 9.7,
    message:
      'Bebê de 45 dias, o ritual do sono precisa começar entre 19 e 20 horas? Meu esposo gosta de dar banho nele e chega por volta das 22:00. Estou iniciando o sono noturno às 21h, porém ele está demorando para cair no sono. E o banho pode dar às 21:30?',
    draft: `É compreensível que você esteja buscando organizar o ritual do sono do seu bebê de 45 dias. O horário recomendado para o início do sono noturno é entre 19h e 20h.

O banho às 21h30 não é recomendado quando leva o início do sono noturno para ainda mais tarde. É importante observar também a última soneca do dia e a janela de vigília, que deve ser entre 45 minutos e 1 hora e 15 minutos. Isso ajudará a entender melhor a situação.

A família pode organizar conforme sua dinâmica, mas iniciar o sono noturno por volta de 21h30 ou 22h não é o recomendado.`,
    criteria: [
      { id: 'night_19_20', w: 20, pass: (t) => /19h.{0,15}20h|entre 19.{0,10}20/i.test(t) },
      { id: 'start_21h_beyond', w: 20, pass: (t) => /[àa]s 21h(?!\s*30).{0,80}(al[eé]m|fora da faixa|n[aã]o [eé] o hor[aá]rio recomendado)/i.test(t) },
      { id: 'bath_direct', w: 20, pass: (t) => /banho.{0,100}n[aã]o [eé] recomendado/i.test(t) },
      { id: 'late_once', w: 10, pass: (t) => ((t.match(/21h30 ou 22h n[aã]o [eé]/gi) || []).length <= 1) },
      { id: 'late_2130_sentences_once', w: 15, pass: (t) => ((t.match(/[^.!?\n]*(?:21h30|21:30)[^.!?]*[.!?]/gi) || []).length <= 1) },
      { id: 'wake_ref', w: 15, pass: (t) => /45\s*min/i.test(t) && /1 hora e 15|1h15/i.test(t) },
    ],
  },
  {
    id: '48d-t001',
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
    id: '48d-t002',
    ageDays: 48,
    babyName: 'Lara',
    sex: 'f',
    officialNote: 9.5,
    message:
      'Bebê de 48 dias. Estou começando a rotina do sono dela umas 18:30, até 20 horas está dormindo. Estou na dúvida se está muito cedo, precisa ser mais tarde pela idade ou não tem relevância? Outra dúvida, nos momentos da soneca, o ideal é transferir pro berço em sono profundo ou com os olhos abertos, meio acordada ainda pra ela se habituar com o berço e criar autonomia',
    draft: `É normal que você esteja se perguntando sobre a rotina do sono da sua bebê de 48 dias. A partir dessa idade, já é possível ter uma rotina mais estruturada, mas é importante respeitar as janelas de vigília.

Recomendo que você inicie a rotina do sono entre 19h e 20h. Se você está começando às 18h30 e ela só adormece às 20h, isso pode indicar uma vigília excessiva, já que o ideal é que o tempo acordado fique entre 45 minutos e 1 hora e 15 minutos. Você pode optar por iniciar a noite por volta das 18h30 se ela estiver pronta, ou permitir uma soneca de até 1 hora antes de iniciar a rotina noturna.

Quanto à transferência para o berço, se ela estiver tranquila e sem chorar, você pode colocá-la acordada e dar a oportunidade de adormecer ali. Não é necessário esperar que ela esteja em sono profundo. Se ela se irritar ou chorar, acalme-a e siga a condução, sem exigir que ela adormeça sozinha.

O ritual noturno deve ser breve — normalmente banho, mamada e condução para dormir.

Na transferência para o berço, diferencie: se ela mamar e adormecer, pode ir já dormindo. Quando for dormir sem mamada, você pode conduzir o adormecimento no berço com ela inicialmente acordada. Colocar acordada no berço é uma possibilidade de condução, não uma exigência para autonomia.`,
    criteria: [
      { id: 'no_force_19_20_routine', w: 25, pass: (t) => !/inicie a rotina do sono entre 19h e 20h/i.test(t) && !/recomendo que voc[eê] inicie.{0,40}entre 19h e 20h/i.test(t) },
      { id: 'no_normalize_1830_20', w: 15, pass: (t) => !/n[aã]o [eé] necessariamente um problema/i.test(t) },
      { id: 'excess_wake_1830_20', w: 15, pass: (t) => /18h30|18:30/i.test(t) && /20h|20 horas/i.test(t) && /(vig[ií]lia|permaneceu acordad|tempo acordado)/i.test(t) },
      { id: 'two_options', w: 20, pass: (t) => /18h30|18:30/i.test(t) && /soneca.{0,50}1 hora|soneca de at[eé]/i.test(t) },
      { id: 'wake_ref', w: 15, pass: (t) => /45\s*min/i.test(t) && /1 hora e 15|1h15/i.test(t) },
      { id: 'crib_fed_asleep', w: 15, pass: (t) => /j[aá] dormindo|mamar e adormecer/i.test(t) },
      { id: 'no_autonomy_rule', w: 10, pass: (t) => /possibilidade de condu[cç][aã]o|n[aã]o uma exig[eê]ncia/i.test(t) && !/promove a autonomia/i.test(t) },
    ],
  },
  {
    id: '51d-t003',
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
      { id: 'no_interrupt', w: 40, pass: (t) => !/mamada.{0,50}conforto.{0,80}interromper|interromper e conduzir o sono com conten|peito.{0,40}conforto.{0,80}interromper|apenas por conforto.{0,80}interromper/i.test(t) },
      { id: 'wake_ref', w: 20, pass: (t) => /45\s*min/i.test(t) && /1 hora e 15|1h15/i.test(t) },
      { id: 'differentiate', w: 20, pass: (t) => /fome/i.test(t) && /saciad/i.test(t) },
      { id: 'no_fixed', w: 20, pass: (t) => /prazo fixo|n[aã]o existe/i.test(t) },
    ],
  },
  {
    id: '51d-t004',
    ageDays: 51,
    babyName: 'Lara',
    sex: 'f',
    officialNote: 9.2,
    message:
      'Minha neném1 mês e 21 dias tem dificuldade de dormir durante o dia, só dorme se for no colo, e no peito, tento fazer a técnica do travesseiro, as vezes da certo e as vezes não, quanto tempo pra ela aprender?',
    draft: `É comum que bebês de 51 dias tenham dificuldade para dormir durante o dia. Essa fase é de adaptação e é esperado que a bebê precise de suporte para adormecer.

Para ajudar a bebê a dormir, é importante seguir uma hierarquia: primeiro, observe a janela de vigília dela, que deve ser de 45 minutos a 1 hora e 15 minutos. Em seguida, verifique se ela está bem alimentada e se houve uma mamada efetiva, garantindo que ela esteja saciada. Se ela ainda estiver sugando ao adormecer, isso pode indicar que ela ainda tem fome ou que está buscando conforto. A técnica do travesseiro pode ser utilizada, mas é fundamental que você a inicie quando a bebê estiver calma.

Não existe um prazo fixo para que ela aprenda a dormir de forma mais independente; isso depende da repetição e consistência na abordagem, respeitando a maturidade dela.

Para entender melhor a situação, gostaria de saber: quanto tempo a bebê permanece acordada antes das sonecas? Quando você inicia a condução para o sono? E como você está executando a estratégia do travesseiro?

Recomendo que você revise a aula sobre a estratégia do travesseiro para obter mais orientações sobre como aplicá-la de forma eficaz.

Quando ela 'só dorme no peito', diferencie: ainda está com fome; fez mamada efetiva e ficou saciada; ou já saciada permanece sugando enquanto adormece. Essa leitura vem antes de tratar o peito só como forma de adormecer.

Se você já está utilizando a técnica do travesseiro, investigue como está sendo a execução e em que momento da vigília você a inicia.

Na condução, use contenção e presença observando a resposta da bebê — sem cronometrar o choro e sem tempo predeterminado.`,
    criteria: [
      { id: 'passo_a_passo', w: 15, pass: (t) => /passo a passo/i.test(t) && !/seguir uma hierarquia|siga esta hierarquia/i.test(t) },
      { id: 'satiety_conduct', w: 20, pass: (t) => /retir.{0,25}peito|retire-a do peito/i.test(t) && /vertical/i.test(t) },
      { id: 'no_conforto_shortcut', w: 10, pass: (t) => !/buscando conforto|apenas por conforto/i.test(t) },
      { id: 'no_window_to_feed', w: 10, pass: (t) => !/ap[oó]s esse tempo.{0,50}mamada efetiva|final da janela.{0,40}mamada/i.test(t) },
      { id: 'no_travesseiro_calma', w: 10, pass: (t) => !/inicie.{0,50}quando (ela|a beb[eê]) estiver calma/i.test(t) },
      { id: 'travesseiro_lesson', w: 15, pass: (t) => /aula.{0,60}travesseiro/i.test(t) },
      { id: 'travesseiro_exec_once', w: 10, pass: (t) => ((t.match(/execu[cç][aã]o.{0,40}travesseiro|travesseiro.{0,40}execu|executando.{0,40}travesseiro/gi) || []).length <= 1) },
      { id: 'wake_ref', w: 10, pass: (t) => /45\s*min/i.test(t) && /1 hora e 15|1h15/i.test(t) },
      { id: 'no_fixed', w: 10, pass: (t) => /prazo fixo|n[aã]o existe/i.test(t) },
    ],
  },
  {
    id: '55d-t001',
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
      { id: 'pacifier_wait', w: 25, pass: (t) => /n[aã]o precisa recoloc|observe um pouco/i.test(t) },
      { id: 'window_exceeded', w: 25, pass: (t) => /1h30|1h\s*30/i.test(t) && /ultrapass|acima|excede/i.test(t) },
      { id: 'wake_ref', w: 15, pass: (t) => /45\s*min/i.test(t) && /1 hora e 15|1h15/i.test(t) },
      { id: 'no_reask_age', w: 10, pass: (t) => !/idade exata/i.test(t) },
    ],
  },
  {
    id: '55d-t002',
    ageDays: 55,
    babyName: 'Pedro',
    sex: 'm',
    officialNote: 9.3,
    message:
      'Bom dia! Bebê de 55 dias e chupa chupeta… quando a chupeta cai da boca ele reclama… devo colocá-la logo em seguida ou devo esperar um pouco para colocá-la na boca dele novamente? Outra coisa, a janela de sono dele está maior que 1h15. Geralmente 1h30 a 1h45! Tem problema?',
    draft: `Bom dia! É normal que o bebê de 55 dias reclame quando a chupeta cai. Se ele só está reclamando, não é necessário recolocar imediatamente. Observe se ele continua dormindo; se despertar e precisar de ajuda, você pode oferecer a chupeta novamente.
Sobre a janela de sono, a referência para essa faixa etária é de 45 minutos a 1 hora e 15 minutos. Quando você menciona que a janela está entre 1h30 e 1h45, isso já ultrapassa o ideal. A principal hipótese aqui é que ele pode estar experimentando vigília excessiva. Para ajudar, é importante que você comece a observar os sinais de sono e prepare o bebê para dormir antes de ultrapassar 1h15.
Seria útil saber quanto tempo ele demora para adormecer depois de deitar e a duração da soneca da manhã. Isso pode ajudar a ajustar a rotina dele.
Recomendo que você confira a aula sobre 'Janela de Vigília' para entender melhor como ajustar esses intervalos.
Quando a chupeta cair e ele apenas reclamar, você não precisa recolocá-la imediatamente. Observe um pouco para ver se ele consegue continuar dormindo sem a chupeta. Se ele despertar e precisar de ajuda para retomar o sono, você pode oferecê-la novamente.`,
    criteria: [
      { id: 'pacifier_once', w: 20, pass: (t) => ((t.match(/recoloc/gi) || []).length <= 1) },
      { id: 'no_deitar', w: 15, pass: (t) => !/depois de deitar/i.test(t) },
      { id: 'entrar_em_sono', w: 15, pass: (t) => /entrar em sono/i.test(t) },
      { id: 'no_morning_nap_q', w: 10, pass: (t) => !/dura[cç][aã]o da soneca da manh[aã]/i.test(t) },
      { id: 'no_hipotese', w: 15, pass: (t) => !/principal hip[oó]tese.{0,50}vig[ií]lia excessiva|vig[ií]lia excessiva/i.test(t) },
      { id: 'no_morning_fraction', w: 10, pass: (t) => !/fracion.{0,50}soneca da manh[aã]/i.test(t) },
      { id: 'window_above', w: 15, pass: (t) => /1h30|1h\s*30/i.test(t) && /acima|ultrapass/i.test(t) },
      { id: 'wake_ref', w: 10, pass: (t) => /45\s*min/i.test(t) && /1 hora e 15|1h15/i.test(t) },
    ],
  },
  {
    id: '49d-t003',
    ageDays: 49,
    babyName: 'Pedro',
    sex: 'm',
    officialNote: 9.2,
    message:
      'Meu bebê tem 1 mês e 19 dias, as sonecas duram uma média de 30 min, no máximo, em exceção, chega a durar 1h. No entanto, por vezes ele tem despertares durante as sonecas. Ele usa chupeta. Preciso ajustar algo?',
    draft: `É comum que bebês de 49 dias tenham sonecas que variam em duração, e sonecas de cerca de 30 minutos podem ocorrer nesta faixa etária. É importante observar que a duração das sonecas pode ser influenciada por fatores como a janela de vigília e a alimentação.

Para ajustar a situação, recomendo que você observe a janela de vigília do seu bebê, que deve ser de 45 minutos a 1 hora e 15 minutos. Se você perceber que ele está acordando após 30 minutos, pode ser útil iniciar a condução do sono um pouco antes, respeitando essa janela. Além disso, observe se os despertares coincidem com a queda da chupeta. Se não houver essa relação, a chupeta pode não ser a causa principal dos despertares.

Gostaria de saber como está a alimentação dele e os intervalos entre as mamadas. Além disso, quanto tempo ele costuma demorar para adormecer depois de ser colocado no berço?

Como ele usa chupeta, vale observar se os despertares acontecem justamente quando ela cai. Antes disso, observe como o bebê acorda da soneca: tranquilo, chorando, buscando peito ou com desconforto. Avalie alimentação/saciedade e só então, se a queda da chupeta coincidir com o despertar, ajuste a condução da sucção.`,
    criteria: [
      { id: 'pacifier_not_primary', w: 25, pass: (t) => !/principal hip[oó]tese.{0,120}chupeta/i.test(t) },
      { id: 'no_invented_irritado', w: 20, pass: (t) => !/acordando irritad|acorda irritad/i.test(t) },
      { id: 'no_early_from_30min', w: 20, pass: (t) => !/acordando ap[oó]s 30 minutos.{0,80}iniciar a condu[cç][aã]o.{0,40}antes/i.test(t) },
      { id: 'investigate_wake', w: 25, pass: (t) => /acordad[oa] antes das sonecas|tempo .{0,20}vig[ií]lia|permanece acordad/i.test(t) },
      { id: 'wake_ref', w: 20, pass: (t) => /45\s*min/i.test(t) && /1 hora e 15|1h15/i.test(t) },
    ],
  },
  {
    id: '56d-t001',
    ageDays: 56,
    babyName: 'Pedro',
    sex: 'm',
    officialNote: 3.0,
    message:
      'Bebe de 56 dias. Posso colocar no berço e esperar ele dormir sozinho, se não estiver chorando? Ou preciso colocar ele em sono leve ? Ou em sono profundo?',
    draft: `Mãe, não encontrei orientação suficiente dentro do método para te responder com segurança agora.
Posso seguir de duas formas:
 • Me contar um pouco mais de contexto (idade exata, padrão de sono, alimentação, episódios recentes), ou
 • Te encaminhar para o conteúdo mais próximo disponível e, se preferir, para o suporte humano da equipe.`,
    criteria: [
      { id: 'no_fallback', w: 15, pass: (t) => !/n[aã]o encontrei orienta[cç][aã]o suficiente/i.test(t) },
      { id: 'awake_ok', w: 20, pass: (t) => /acordad/i.test(t) && /ber[cç]o/i.test(t) },
      { id: 'not_required_stage', w: 20, pass: (t) => /n[aã]o [eé] necess[aá]rio esperar|sono leve ou profundo/i.test(t) },
      { id: 'feed_asleep', w: 20, pass: (t) => /j[aá] dormindo|adormecer mamando/i.test(t) },
      { id: 'travesseiro_aula', w: 15, pass: (t) => /aula.{0,80}travesseiro|estrat[eé]gia do travesseiro/i.test(t) },
      { id: 'no_reask_age', w: 10, pass: (t) => !/idade exata/i.test(t) },
    ],
  },
  {
    id: '56d-t002',
    ageDays: 56,
    babyName: 'Pedro',
    sex: 'm',
    officialNote: 9.5,
    message:
      'Bebe de 56 dias. Posso colocar no berço e esperar ele dormir sozinho, se não estiver chorando? Ou preciso colocar ele em sono leve ? Ou em sono profundo?',
    draft: `É normal que, aos 56 dias, você tenha dúvidas sobre como colocar o bebê para dormir. A boa notícia é que, se ele estiver tranquilo e sem chorar, você pode colocá-lo acordado no berço e dar a oportunidade de adormecer ali. Não é necessário esperar que ele esteja em sono leve ou profundo.

Se ele começar a ficar irritado ou chorar, você pode acalmá-lo e seguir a condução do sono, sem exigir que ele adormeça sozinho nesse momento. Se ele adormecer mamando, pode ir já dormindo para o berço, sem a necessidade de acordá-lo.

Para entender melhor a situação, gostaria de saber como você tem realizado a condução do sono e se já está utilizando a estratégia do travesseiro. Isso pode ajudar a ajustar a abordagem.

Para mais informações sobre a adaptação ao berço, você pode conferir a aula sobre a estratégia do travesseiro no aplicativo.`,
    criteria: [
      { id: 'awake_ok', w: 20, pass: (t) => /acordad/i.test(t) && /ber[cç]o/i.test(t) },
      { id: 'not_required_stage', w: 20, pass: (t) => /n[aã]o [eé] necess[aá]rio esperar|sono leve ou profundo/i.test(t) },
      { id: 'feed_asleep', w: 20, pass: (t) => /j[aá] dormindo|adormecer mamando/i.test(t) },
      { id: 'travesseiro_aula', w: 15, pass: (t) => /aula.{0,80}travesseiro/i.test(t) },
      { id: 'keep_travesseiro', w: 10, pass: (t) => /estrat[eé]gia do travesseiro/i.test(t) },
      { id: 'no_transicao_generica', w: 10, pass: (t) => !/ajudar na transi[cç][aã]o/i.test(t) },
      { id: 'travesseiro_purpose', w: 10, pass: (t) => /tamb[eé]m pode ajudar na condu[cç][aã]o e na coloca[cç][aã]o do beb[eê] no ber[cç]o/i.test(t) && /seguran[cç]a/i.test(t) },
      { id: 'aula_once', w: 10, pass: (t) => ((t.match(/aula.{0,80}(travesseiro|estrat[eé]gia)|aula correspondente|confira a aula|assista [àa] aula|revise a aula/gi) || []).length <= 1) },
    ],
  },
  {
    id: '57d-t001',
    ageDays: 57,
    babyName: 'Lara',
    sex: 'f',
    officialNote: 6.5,
    message:
      'Oi! Bebê de 57 dias. Estou ensinando a adormecer direto no berço progressivamente... começo com sono da manhã e estou avançando gradativamente para as outras sonecas, até chegar no sono noturno. O indicado é ir progressivamente ou deveria tentar em todas as sonecas de uma vez? Além disso, em algumas tentativas, há choro e fico uns 10 min tentando acalmá-la. Quando não resolve, pego no colo, acalmo e refaço o processo novamente... O caminho é esse mesmo?',
    draft: `É normal que, aos 57 dias, você esteja ensinando seu bebê a adormecer no berço. Essa adaptação é um processo gradual e respeitar o ritmo do bebê é fundamental.
A orientação prática segura é que você pode avançar progressivamente, começando pelas sonecas diurnas e, conforme o bebê se adapta, ir para as sonecas da tarde e, por fim, para o sono noturno. Quando houver choro, utilize a contenção firme e aguarde a resposta do bebê sem cronometrar o tempo. Se o choro persistir e você precisar pegá-lo no colo para acalmá-lo, isso é aceitável. O importante é que ele se sinta seguro e confortável.
Para refinar sua abordagem, gostaria de saber: quanto tempo seu bebê permanece acordado antes das sonecas? E como você está realizando a estratégia do travesseiro?
O horário saudável e recomendado para o início do sono noturno é entre 19h e 20h.
A família pode organizar conforme sua dinâmica, mas iniciar o sono noturno por volta de 21h30 ou 22h não é o recomendado.
A janela de vigília pode variar entre 45 minutos a 1 hora e 15 minutos. Observe a que horas termina a última soneca e há quanto tempo está acordado.`,
    criteria: [
      { id: 'same_day', w: 30, pass: (t) => /mesmo dia|daquele dia|todas as demais sonecas/i.test(t) },
      { id: 'not_progressive_days', w: 20, pass: (t) => !/avan[cç]ar progressivamente.{0,80}sonecas da tarde/i.test(t) },
      { id: 'no_night_start_leak', w: 15, pass: (t) => !/21h30 ou 22h n[aã]o [eé] o recomendado/i.test(t) },
      { id: 'no_timer', w: 15, pass: (t) => /n[aã]o cronometr|sem cronometrar|sem tempo predeterminado/i.test(t) },
      { id: 'wake_ref', w: 15, pass: (t) => /45\s*min/i.test(t) && /1 hora e 15|1h15/i.test(t) },
      { id: 'no_paciencia_vaga', w: 10, pass: (t) => !/paci[eê]ncia e respeitar a resposta/i.test(t) },
      { id: 'consistency', w: 10, pass: (t) => /mantenha o processo com consist[eê]ncia e repeti[cç][aã]o/i.test(t) && /acolhendo o choro/i.test(t) },
      { id: 'no_boa_estrategia', w: 10, pass: (t) => !/pode ser uma boa (estrat[eé]gia|ferramenta)/i.test(t) },
    ],
  },
  {
    id: '30d-t005',
    ageDays: 30,
    babyName: 'Lara',
    sex: 'f',
    officialNote: 9.4,
    message:
      'Minha bebê de 30 dias faz sonecas de 1h às vezes mais.. quando acorda ela acorda muito brava e chora bastante e só acalma dando o peito mama bem pouco e relaxa.. como melhorar? Antes da soneca ela já mama em média 20 a 30 min',
    draft: `É comum que os bebês nessa faixa etária acordem chorando, especialmente se a soneca foi adequada, como no caso de 1 hora ou mais. Como ela consegue dormir por cerca de 1 hora ou até mais, eu não consideraria a duração da soneca o principal problema neste momento. O que chama mais atenção é ela acordar muito irritada e relaxar depois de sugar um pouco. Por isso, primeiro observaria como está a mamada e se existe algum desconforto depois dela.
Depois da mamada, antes de deitar: houve arroto? Ela ficou em posição vertical, e por quanto tempo?
Esse padrão também pode apontar para algum desconforto depois da mamada, inclusive refluxo.
E como está o sono noturno da bebê?
Recomendo a aula 'O que é o refluxo?'.`,
    criteria: [
      { id: 'no_normalize_crying', w: 25, pass: (t) => !/[eé] (normal|comum) que .{0,140}acord(em|e) chorando/i.test(t) },
      { id: 'no_situacao_comum', w: 15, pass: (t) => !/essa situa[cç][aã]o [eé] comum/i.test(t) },
      { id: 'no_night_sleep_ask', w: 20, pass: (t) => !/como est[aá] o sono noturno/i.test(t) },
      { id: 'open_with_1h', w: 15, pass: (t) => /Como ela consegue dormir|n[aã]o consideraria a dura[cç][aã]o/i.test(t) },
      { id: 'feeding', w: 15, pass: (t) => /mamada|alimenta|saciedad/i.test(t) },
      { id: 'reflux', w: 10, pass: (t) => /refluxo/i.test(t) },
      { id: 'postural', w: 10, pass: (t) => /arroto|vertical/i.test(t) },
    ],
  },
  {
    id: '31d-t005',
    ageDays: 31,
    babyName: 'João',
    sex: 'm',
    officialNote: 9.2,
    message:
      'Ola tudo bem? Meu filho tem 31 dias, sempre fez as sonecas no berço, que duravam cerca de 2 hrs/ 2 hrs e 30. Mas faz 02 dias que ele tem feito uma soneca grande pela manhã e, durante a tarde, as sonecas estão bem curtas. Um ciclo de sono. Ele desperta e eu ate tendo nina-lo no berço, mas ele nao retorna. Depois de 30 minutos ja esta com sono novamente. Outra questao eh que ele demora femais para iniciar a soneca. O ambiente esta ajustado, ele esta alimentado, tudo tranquilo, janela de sono del eh de 1 hr/1 hr 15, quando vai dando este horário, vou para o quarto; coloco ruido, quarto escuro, nino ele no colo e ainda acordado transfiro pro berço. Quando no berço, ele demora muuuito prw relaxar, quase 40/45 minutos. Nao sei como conduzir nesta situação. Faz uns 4,5 dias que esta assim.',
    draft: `Olá! É compreensível que você esteja enfrentando dificuldades com as sonecas do seu filho de 31 dias. Mudanças no padrão de sono são comuns nessa fase, e é importante observar como ele está se adaptando.
A principal hipótese aqui é a vigília excessiva. A soneca longa da manhã pode ser fracionada para cerca de 1h30 a 2h, observando a distribuição da tarde. A demora de 40–45 minutos para relaxar no berço se explica sobretudo pela vigília total — não pela soneca da manhã em si. Quando a condução começa após 1h–1h15 e ele ainda demora cerca de 40–45 minutos para adormecer, o tempo total acordado pode estar excedendo a referência ideal de 45 minutos a 1 hora e 15 minutos.
Uma orientação prática segura é fracionar a soneca da manhã para cerca de 1h30 a 2h. Isso pode ajudar a melhorar a distribuição das sonecas durante a tarde. Além disso, observe se ele está próximo do intervalo para mamar quando você inicia a condução; se sim, se a demora para adormecer estiver aproximando o próximo intervalo de mamada, considere fome antes de insistir no sono.
Para entender melhor a situação, gostaria de saber: qual é o intervalo aproximado entre as mamadas? E quanto tempo ele costuma permanecer acordado antes de iniciar a condução para a soneca?
Recomendo também que você revise a aula sobre a janela de vigília e a rotina por janelas para ajudar a estruturar melhor o dia dele.
Também é importante saber qual costuma ser o intervalo entre as mamadas, porque, se durante essa demora para adormecer ele estiver se aproximando do próximo intervalo alimentar, a fome também precisa ser considerada.`,
    criteria: [
      { id: 'wake_ref_45_115', w: 15, pass: (t) => /45\s*min/i.test(t) && /1 hora e 15|1h15/i.test(t) },
      { id: 'excess_wake', w: 15, pass: (t) => /vig[ií]lia.{0,40}excess|1h40|1h\s*40|tempo total acordado/i.test(t) },
      { id: 'fraction_once', w: 15, pass: (t) => ((t.match(/fracion\w*[^.!?\n]{0,50}soneca (?:longa )?da manh|soneca (?:longa )?da manh[^.!?\n]{0,50}fracion/gi) || []).length <= 1) },
      { id: 'no_long_nap_as_excess', w: 15, pass: (t) => !/soneca longa pela manh[aã].{0,220}tempo total acordado que excede/i.test(t) },
      { id: 'anticipate', w: 10, pass: (t) => /antecip/i.test(t) },
      { id: 'no_sleep_sign_gate', w: 10, pass: (t) => !/observe os sinais de sono e inicie a condu/i.test(t) },
      { id: 'no_reask_wake', w: 15, pass: (t) => !/quanto tempo (ele|ela) (costuma )?permanecer acordad[oa] antes de iniciar/i.test(t) },
      { id: 'feed_interval_once', w: 15, pass: (t) => ((t.match(/intervalo.{0,30}mamadas/gi) || []).length <= 1) },
      { id: 'fraction_morning', w: 15, pass: (t) => /fracion/i.test(t) && /1h30|1h\s*30/i.test(t) },
    ],
  },
  {
    id: '40d-bottle-t005',
    ageDays: 40,
    babyName: 'Lara',
    sex: 'f',
    officialNote: 9.2,
    message:
      'Deixa eu ver se entendi: minha bebê está com 40 dias. Quanto tempo dura a amamentação dela nessa fase? Já estou tentando introduzir 1 mamadeira Tb, conforme a Eliana ensina. Quantos ml devo ofertar pra ela?',
    draft: `É normal que a amamentação nesta fase, com 40 dias, dure cerca de 20 minutos, podendo ser mais curta ou chegar a aproximadamente 30 minutos, desde que haja retirada efetiva de leite. É importante observar sinais de saciedade antes de qualquer leitura comportamental, evitando interpretar a sucção após esse tempo como um ponto a observar após checar saciedade.
Para a mamadeira de aprendizado, a referência do método é de aproximadamente 120 ml, já que sua bebê está no segundo mês. Uma mamadeira de aprendizado tem finalidade de aprendizado, sem garantir ausência de dificuldades na alternância peito e mamadeira, então você pode introduzir essa quantidade observando a alimentação e a resposta dela.`,
    criteria: [
      { id: 'breast_20_to_30', w: 15, pass: (t) => /20\s*minutos/i.test(t) && /30\s*minutos/i.test(t) },
      { id: 'volume_120', w: 20, pass: (t) => /120\s*ml/i.test(t) },
      { id: 'second_month', w: 10, pass: (t) => /segundo m[eê]s/i.test(t) },
      { id: 'no_behavioral', w: 25, pass: (t) => !/leitura comportamental|suc[cç][aã]o ap[oó]s esse tempo|ponto a observar ap[oó]s checar saciedade/i.test(t) },
      { id: 'satiety_and_transfer', w: 20, pass: (t) => /retirada efetiva/i.test(t) && /saciedad/i.test(t) },
      { id: 'no_habit', w: 10, pass: (t) => !/h[aá]bito a corrigir|h[aá]bito que pode ser corrigido|mau h[aá]bito/i.test(t) },
    ],
  },
  {
    id: '40d-night-t005b',
    ageDays: 40,
    babyName: 'Pedro',
    sex: 'm',
    officialNote: 9.4,
    message:
      'Olá. Meu bb tem 40 dias , tem noites que ele dorme super bem acorda entre 2:30 a 3 hrs , só que tem dia que após as 04:00 da manhã ele acorda de 1 em 1 hrs tento fazer ele continuar a dormir no berço porém sem sucesso, aí pego ele fico ninando no colo sem sucesso, aí coloco ele no peito ele mama mesmo sabendo que não é fome, ele mama e dorme. Continuo assim por ele ainda ser novinho ?',
    draft: `É compreensível que você esteja enfrentando dificuldades com os despertares do seu bebê de 40 dias. É comum que os bebês nesta faixa etária tenham variações no padrão de sono, e os despertares frequentes podem ser desafiadores.
A orientação prática segura é a seguinte: se o seu bebê acorda após as 4h da manhã, é importante investigar o horário da última mamada antes desse despertar. Se já passaram cerca de 2h30 a 3h desde a última mamada, tente oferecer uma mamada efetiva até a saciedade, mas evite oferecer o peito automaticamente em cada despertar. Isso pode ajudar a Se ele acordar antes de 3h, tente fazê-lo dormir novamente sem oferecer o peito.
qual foi o horário da última mamada antes das 4h da manhã? Você percebe sinais claros de fome quando ele acorda ou é mais agitação breve?
Recomendo que você revise a aula sobre ‘Sono Noturno’ no módulo 3, que pode oferecer mais insights sobre como lidar com esses despertares.
Uma coisa é não acordar um bebê saudável e com bom ganho de peso só para mamar. Outra é ele acordar sozinho depois das 4h, de hora em hora, e mamar quando o peito é oferecido — e depois dormir. Nesse segundo caso, o intervalo de 3 horas não serve sozinho para decidir que a mamada não é necessária.
Antes de pensar em associação peito–sono, vale olhar a alimentação: ele mama no peito, fórmula ou complemento? As mamadas do dia e da noite estão efetivas? Como está o ganho de peso? Nesses despertares ele faz uma mamada efetiva ou só suga um pouco e adormece? Há sinais de desconforto depois de mamar?`,
    criteria: [
      { id: 'no_truncated', w: 20, pass: (t) => !/Isso pode ajudar a\s+(?=[A-ZÁ])|Isso pode ajudar a\s*$/m.test(t) },
      { id: 'last_feed_before_4', w: 15, pass: (t) => /[uú]ltima mamada antes das 4h|antes das 4h.{0,50}mam/i.test(t) },
      { id: 'offer_if_due', w: 15, pass: (t) => /2h\s*30|2h30/i.test(t) && /mamada efetiva/i.test(t) },
      { id: 'daytime_feeding', w: 15, pass: (t) => /mamadas do dia|rotina alimentar/i.test(t) },
      { id: 'postural', w: 15, pass: (t) => /vertical|arroto|postur/i.test(t) },
      { id: 'clock_not_duration', w: 10, pass: (t) => !/ap[oó]s 4 horas de sono/i.test(t) },
      { id: 'no_dont_wake_mismatch', w: 10, pass: (t) => !/n[aã]o [eé] necess[aá]rio acord[aá]-l[oa]/i.test(t) },
    ],
  },
  {
    id: '48d-t005',
    ageDays: 48,
    babyName: 'Lara',
    sex: 'f',
    officialNote: 9.3,
    message:
      'Bebê de 48 dias. Estou começando a rotina do sono dela umas 18:30, até 20 horas está dormindo. Estou na dúvida se está muito cedo, precisa ser mais tarde pela idade ou não tem relevância? Outra dúvida, nos momentos da soneca, o ideal é transferir pro berço em sono profundo ou com os olhos abertos, meio acordada ainda pra ela se habituar com o berço e criar autonomia',
    draft: `É normal que você esteja se organizando para a rotina do sono da sua bebê de 48 dias. Iniciar a rotina às 18h30 e ela adormecer às 20h não é necessariamente um problema, mas é importante que o ritual noturno seja breve (banho, mamada, dormir). Se ela estiver pronta, pode continuar iniciando a noite por volta das 18h30. Caso contrário, considere uma soneca de até 1 hora antes de começar a noite.

Sobre a transferência para o berço, se ela estiver tranquila e sem chorar, você pode colocá-la acordada e dar a oportunidade de adormecer ali. Não é obrigatório esperar que ela esteja em sono profundo. Se ela chorar, acalme-a e siga a condução, sem exigir que ela adormeça sozinha.

Para entender melhor a situação, poderia me informar quanto tempo ela costuma ficar acordada antes de você iniciar a condução para o sono? E qual é a duração típica das sonecas dela durante o dia?

Para mais detalhes sobre a rotina e a condução do sono, recomendo a aula ‘Passo 4: Rotina’ no aplicativo.

Aos 48 dias a janela de vigília de referência é de 45 minutos a 1 hora e 15 minutos.

Na transferência para o berço, diferencie: se ela mamar e adormecer, pode ir já dormindo. Quando for dormir sem mamada, você pode conduzir o adormecimento no berço com ela inicialmente acordada. Colocar acordada no berço é uma possibilidade de condução, não uma exigência para autonomia.`,
    criteria: [
      { id: 'no_normalize_1830_20', w: 25, pass: (t) => !/n[aã]o [eé] necessariamente um problema/i.test(t) },
      { id: 'check_awake_time', w: 20, pass: (t) => /permaneceu acordad|verificar quanto tempo|vale checar se o tempo acordado/i.test(t) },
      { id: 'two_options', w: 15, pass: (t) => /18h30|18:30/i.test(t) && /soneca.{0,50}1 hora|soneca de at[eé]/i.test(t) },
      { id: 'brief_ritual', w: 10, pass: (t) => /ritual.{0,40}breve|banho.{0,20}mamada/i.test(t) },
      { id: 'wake_ref', w: 10, pass: (t) => /45\s*min/i.test(t) && /1 hora e 15|1h15/i.test(t) },
      { id: 'crib_fed_asleep', w: 10, pass: (t) => /j[aá] dormindo|mamar e adormecer/i.test(t) },
      { id: 'awake_not_required', w: 10, pass: (t) => /possibilidade de condu[cç][aã]o|n[aã]o uma exig[eê]ncia/i.test(t) },
    ],
  },
  {
    id: '49d-t005',
    ageDays: 49,
    babyName: 'Pedro',
    sex: 'm',
    officialNote: 9.3,
    message:
      'Meu bebê tem 1 mês e 19 dias, as sonecas duram uma média de 30 min, no máximo, em exceção, chega a durar 1h. No entanto, por vezes ele tem despertares durante as sonecas. Ele usa chupeta. Preciso ajustar algo?',
    draft: `É comum que bebês de 49 dias tenham sonecas de cerca de 30 minutos nesta faixa etária. A janela de vigília de referência é de 45 minutos a 1 hora e 15 minutos.

Se você está iniciando a condução do sono após esse tempo e ele ainda está acordando irritado, vale revisar a janela de vigília.

Como ele usa chupeta, vale observar se os despertares acontecem justamente quando ela cai. Se não houver essa relação, não há motivo para considerar a chupeta como causa principal dos despertares.

Observe como o bebê acorda da soneca: tranquilo, chorando, buscando peito ou com desconforto. Avalie alimentação e saciedade.

A janela de vigília fica entre 45 minutos e 1 hora e 15 minutos. Como ele usa chupeta, vale observar se os despertares acontecem justamente quando ela cai.`,
    criteria: [
      { id: 'no_invented_irritado', w: 30, pass: (t) => !/acordando irritad|acorda irritad/i.test(t) },
      { id: 'how_wakes', w: 20, pass: (t) => /como o beb[eê] acorda|acorda da soneca:\s*tranquil|como ele desperta/i.test(t) },
      { id: 'pacifier_not_primary', w: 15, pass: (t) => !/principal hip[oó]tese.{0,120}chupeta/i.test(t) },
      { id: 'no_post_window_ok', w: 10, pass: (t) => !/ap[oó]s esse per[ií]odo.{0,30}est[aá] correto/i.test(t) },
      { id: 'no_premature_pacifier', w: 10, pass: (t) => !/chupeta tamb[eé]m pode influenciar/i.test(t) },
      { id: 'wake_ref', w: 10, pass: (t) => /45\s*min/i.test(t) && /1 hora e 15|1h15/i.test(t) },
      { id: 'no_early_from_30min', w: 10, pass: (t) => !/acordando ap[oó]s 30 minutos.{0,80}iniciar a condu[cç][aã]o.{0,40}antes/i.test(t) },
      { id: 'pacifier_once', w: 10, pass: (t) => ((t.match(/despertares acontecem justamente quando ela cai/gi) || []).length <= 1) },
    ],
  },
  {
    id: '51d-t005',
    ageDays: 51,
    babyName: 'Lara',
    sex: 'f',
    officialNote: 9.4,
    message:
      'Minha neném1 mês e 21 dias tem dificuldade de dormir durante o dia, só dorme se for no colo, e no peito, tento fazer a técnica do travesseiro, as vezes da certo e as vezes não, quanto tempo pra ela aprender?',
    draft: `É comum que bebês de 51 dias tenham dificuldade para dormir durante o dia. Essa fase é de adaptação e é esperado que a bebê precise de suporte para adormecer.

Para ajudar a bebê a dormir, é importante seguir uma hierarquia: primeiro, observe a janela de vigília dela, que deve ser de 45 minutos a 1 hora e 15 minutos. Após esse tempo, ofereça uma mamada efetiva e observe os sinais de saciedade. Se ela ainda estiver no peito apenas por conforto, você pode interromper a mamada e conduzir ao sono. A técnica do travesseiro pode ser utilizada depois disso.

Não existe um prazo fixo para que ela aprenda; isso depende da repetição e consistência na abordagem.

Para entender melhor a situação, gostaria de saber: quanto tempo a bebê permanece acordada antes das sonecas? Quando você inicia a condução para o sono? E como você está executando a estratégia do travesseiro?

Recomendo que você revise a aula sobre a estratégia do travesseiro para obter mais orientações sobre como aplicá-la de forma eficaz.

Quando ela 'só dorme no peito', diferencie: ainda está com fome; fez mamada efetiva e ficou saciada; ou já saciada permanece sugando enquanto adormece. Essa leitura vem antes de tratar o peito só como forma de adormecer.

Se você já está utilizando a técnica do travesseiro, investigue como está sendo a execução e em que momento da vigília você a inicia.

Na condução, use contenção e presença observando a resposta da bebê — sem cronometrar o choro e sem tempo predeterminado.`,
    criteria: [
      { id: 'passo_a_passo', w: 10, pass: (t) => /passo a passo/i.test(t) && !/seguir uma hierarquia|siga esta hierarquia/i.test(t) },
      { id: 'no_window_to_feed', w: 20, pass: (t) => !/ap[oó]s esse tempo.{0,50}mamada efetiva/i.test(t) },
      { id: 'no_conforto_interrupt', w: 20, pass: (t) => !/apenas por conforto|peito.{0,40}conforto.{0,80}interromper/i.test(t) },
      { id: 'satiety_conduct', w: 15, pass: (t) => /retir.{0,25}peito|retire-a do peito/i.test(t) && /vertical/i.test(t) },
      { id: 'travesseiro_lesson', w: 10, pass: (t) => /aula.{0,60}travesseiro/i.test(t) },
      { id: 'travesseiro_exec_once', w: 10, pass: (t) => ((t.match(/execu[cç][aã]o.{0,40}travesseiro|travesseiro.{0,40}execu|executando.{0,40}travesseiro/gi) || []).length <= 1) },
      { id: 'wake_ref', w: 10, pass: (t) => /45\s*min/i.test(t) && /1 hora e 15|1h15/i.test(t) },
      { id: 'no_fixed', w: 5, pass: (t) => /prazo fixo|n[aã]o existe/i.test(t) },
    ],
  },
  {
    id: '55d-t005',
    ageDays: 55,
    babyName: 'Pedro',
    sex: 'm',
    officialNote: 9.0,
    message:
      'Bom dia! Bebê de 55 dias e chupa chupeta… quando a chupeta cai da boca ele reclama… devo colocá-la logo em seguida ou devo esperar um pouco para colocá-la na boca dele novamente? Outra coisa, a janela de sono dele está maior que 1h15. Geralmente 1h30 a 1h45! Tem problema?',
    draft: `Bom dia! É normal que o bebê de 55 dias use a chupeta e reclame quando ela cai. Se ele só reclamar, você não precisa recolocá-la imediatamente. Observe se ele continua dormindo; se despertar e precisar de ajuda, aí sim, ofereça de novo.

Sobre a janela de sono, 1h30 a 1h45 já está acima da referência de 45 minutos a 1 hora e 15 minutos. Isso pode indicar uma vigília excessiva. O ideal é preparar para a soneca antes de passar de 1h15. Uma sugestão é fracionar a soneca da manhã, se ela estiver longa, para cerca de 1h30 a 2h e observar se isso melhora as sonecas da tarde.

Para entender melhor, quanto tempo ele demora para entrar em sono após iniciar a condução?

Você pode revisar a aula sobre a janela de vigília para mais orientações.`,
    criteria: [
      { id: 'no_morning_fraction', w: 25, pass: (t) => !/fracion.{0,50}soneca da manh[aã]/i.test(t) },
      { id: 'no_invented_afternoon', w: 15, pass: (t) => !/sonecas da tarde/i.test(t) },
      { id: 'no_vigilia_excessiva_label', w: 15, pass: (t) => !/vig[ií]lia excessiva/i.test(t) },
      { id: 'window_above', w: 15, pass: (t) => /1h30|1h\s*30/i.test(t) && /acima|ultrapass/i.test(t) },
      { id: 'pacifier_wait', w: 10, pass: (t) => /n[aã]o precisa recoloc|n[aã]o [eé] necess[aá]rio recoloc/i.test(t) },
      { id: 'entrar_em_sono', w: 10, pass: (t) => /entrar em sono/i.test(t) },
      { id: 'no_invented_4045', w: 10, pass: (t) => !/40.?45 minutos para adormecer/i.test(t) },
      { id: 'wake_ref', w: 10, pass: (t) => /45\s*min/i.test(t) && /1 hora e 15|1h15/i.test(t) },
    ],
  },
  {
    id: '56d-t005',
    ageDays: 56,
    babyName: 'Pedro',
    sex: 'm',
    officialNote: 9.3,
    message:
      'Bebe de 56 dias. Posso colocar no berço e esperar ele dormir sozinho, se não estiver chorando? Ou preciso colocar ele em sono leve ? Ou em sono profundo?',
    draft: `Mãe, com 56 dias, se ele estiver tranquilo e sem chorar, você pode colocá-lo acordado no berço e dar a oportunidade para que adormeça ali. Não é necessário esperar que esteja em sono leve ou profundo.

Se ele começar a chorar, você pode acalmá-lo e continuar a condução, sem exigir que adormeça sozinho. Se adormecer mamando, pode colocá-lo no berço já dormindo; não precisa acordá-lo.

A Estratégia do Travesseiro pode ser indicada para ajudar na transição, mesmo que ele não esteja resistindo ao berço. Para mais detalhes, recomendo revisar a aula correspondente no aplicativo.

Assista à aula sobre a Estratégia do Travesseiro no aplicativo para aprender como aplicá-la corretamente.`,
    criteria: [
      { id: 'no_transicao_generica', w: 25, pass: (t) => !/ajudar na transi[cç][aã]o/i.test(t) },
      { id: 'travesseiro_purpose', w: 20, pass: (t) => /tamb[eé]m pode ajudar na condu[cç][aã]o e na coloca[cç][aã]o do beb[eê] no ber[cç]o/i.test(t) && /seguran[cç]a/i.test(t) },
      { id: 'cry_calm_once', w: 15, pass: (t) => ((t.match(/[^.!?\n]*(?:irritar|ficar irritad|come[cç]ar a chorar)[^.!?]{0,180}(?:acalme|acalmar|se acalmar|siga a condu|continuar a condu|continue a condu)[^.!?]*[.!?]/gi) || []).length <= 1) },
      { id: 'aula_once', w: 15, pass: (t) => ((t.match(/aula.{0,80}(travesseiro|estrat[eé]gia)|aula correspondente|confira a aula|assista [àa] aula|revise a aula/gi) || []).length <= 1) },
      { id: 'aula_present', w: 10, pass: (t) => /aula.{0,80}travesseiro/i.test(t) },
      { id: 'awake_ok', w: 10, pass: (t) => /acordad/i.test(t) && /ber[cç]o/i.test(t) },
      { id: 'feed_asleep', w: 10, pass: (t) => /j[aá] dormindo|adormecer mamando/i.test(t) },
      { id: 'no_unrelated', w: 5, pass: (t) => !/excesso de est[ií]mulos|ru[ií]do branco/i.test(t) },
    ],
  },
  {
    id: '57d-t005',
    ageDays: 57,
    babyName: 'Lara',
    sex: 'f',
    officialNote: 9.3,
    message:
      'Oi! Bebê de 57 dias. Estou ensinando a adormecer direto no berço progressivamente... começo com sono da manhã e estou avançando gradativamente para as outras sonecas, até chegar no sono noturno. O indicado é ir progressivamente ou deveria tentar em todas as sonecas de uma vez? Além disso, em algumas tentativas, há choro e fico uns 10 min tentando acalmá-la. Quando não resolve, pego no colo, acalmo e refaço o processo novamente... O caminho é esse mesmo?',
    draft: `Comece pela primeira soneca da manhã e siga com todas as demais sonecas daquele mesmo dia no berço. Isso deve ser repetido diariamente até que o bebê se acostume.

É importante ter paciência e respeitar a resposta do bebê durante esse processo.

Se houver choro, acalme no colo, volte ao berço e repita até adormecer. Não cronometre o choro.

A janela de vigília é de 45 minutos a 1 hora e 15 minutos.

O uso do travesseiro pode ser uma boa estratégia para ajudar na adaptação. Assista à aula sobre a Estratégia do Travesseiro no aplicativo para aprender como aplicá-la corretamente.`,
    criteria: [
      { id: 'no_paciencia_vaga', w: 20, pass: (t) => !/paci[eê]ncia e respeitar a resposta/i.test(t) },
      { id: 'consistency', w: 20, pass: (t) => /mantenha o processo com consist[eê]ncia e repeti[cç][aã]o/i.test(t) && /acolhendo o choro/i.test(t) },
      { id: 'no_boa_estrategia', w: 20, pass: (t) => !/pode ser uma boa (estrat[eé]gia|ferramenta)/i.test(t) },
      { id: 'travesseiro_direct', w: 10, pass: (t) => /use a estrat[eé]gia do travesseiro|estrat[eé]gia do travesseiro/i.test(t) },
      { id: 'aula', w: 10, pass: (t) => /aula.{0,80}travesseiro/i.test(t) },
      { id: 'same_day', w: 10, pass: (t) => /mesmo dia|daquele dia|todas as demais sonecas/i.test(t) },
      { id: 'no_timer', w: 10, pass: (t) => /n[aã]o cronometr|sem cronometrar/i.test(t) },
    ],
  },
  {
    id: '30d-t006',
    ageDays: 30,
    babyName: 'Lara',
    sex: 'f',
    officialNote: 9.4,
    message:
      'Minha bebê de 30 dias faz sonecas de 1h às vezes mais.. quando acorda ela acorda muito brava e chora bastante e só acalma dando o peito mama bem pouco e relaxa.. como melhorar? Antes da soneca ela já mama em média 20 a 30 min',
    draft: `Como ela consegue dormir por cerca de 1 hora ou até mais, eu não consideraria a duração da soneca o principal problema neste momento. O que chama mais atenção é ela acordar muito irritada e relaxar depois de sugar um pouco. Por isso, primeiro observaria como está a mamada e se existe algum desconforto depois dela.

Essa situação é comum e pode ser ajustada com algumas orientações.

Depois da mamada, antes de deitar: houve arroto? Ela ficou em posição vertical, e por quanto tempo? A referência é permanecer 20 a 30 minutos em posição vertical.

Como a soneca dura 1 hora ou mais e ela acorda irritada, chorando bastante, e relaxa após sugar, vale investigar a alimentação, a efetividade da mamada e o desconforto depois dela.

Esse padrão também pode apontar para algum desconforto depois da mamada, inclusive refluxo. Você pode conferir a aula 'O que é o refluxo?' no aplicativo.`,
    criteria: [
      { id: 'no_situacao_comum', w: 25, pass: (t) => !/essa situa[cç][aã]o [eé] comum/i.test(t) },
      { id: 'reading_once', w: 20, pass: (t) => t.split(/\n{2,}/).filter((p) => {
        const nap = /1 hora ou at[eé] mais|soneca de (cerca de )?1\s*h|dura[cç][aã]o da soneca/i.test(p);
        const wake = /irritad|brav[oa]|chor/i.test(p);
        const suckOrFeed = /sugar|relax|mamada|desconforto|alimenta|saciedad/i.test(p);
        return nap && wake && suckOrFeed;
      }).length === 1 },
      { id: 'keep_axis', w: 15, pass: (t) => /n[aã]o consideraria a dura[cç][aã]o da soneca|1 hora.{0,40}n[aã]o .{0,30}principal/i.test(t) },
      { id: 'feeding', w: 10, pass: (t) => /mamada|alimenta|saciedad/i.test(t) },
      { id: 'reflux', w: 10, pass: (t) => /refluxo/i.test(t) },
      { id: 'vertical', w: 10, pass: (t) => /20 a 30 minutos/i.test(t) },
      { id: 'no_night_sleep_ask', w: 5, pass: (t) => !/como est[aá] o sono noturno/i.test(t) },
      { id: 'no_ajustando_sono', w: 5, pass: (t) => !/se ajustando ao sono|se adaptando ao sono/i.test(t) },
    ],
  },
  {
    id: '31d-t006',
    ageDays: 31,
    babyName: 'João',
    sex: 'm',
    officialNote: 9.3,
    message:
      'Ola tudo bem? Meu filho tem 31 dias, sempre fez as sonecas no berço, que duravam cerca de 2 hrs/ 2 hrs e 30. Mas faz 02 dias que ele tem feito uma soneca grande pela manhã e, durante a tarde, as sonecas estão bem curtas. Um ciclo de sono. Ele desperta e eu ate tendo nina-lo no berço, mas ele nao retorna. Depois de 30 minutos ja esta com sono novamente. Outra questao eh que ele demora femais para iniciar a soneca. O ambiente esta ajustado, ele esta alimentado, tudo tranquilo, janela de sono del eh de 1 hr/1 hr 15, quando vai dando este horário, vou para o quarto; coloco ruido, quarto escuro, nino ele no colo e ainda acordado transfiro pro berço. Quando no berço, ele demora muuuito prw relaxar, quase 40/45 minutos. Nao sei como conduzir nesta situação. Faz uns 4,5 dias que esta assim.',
    draft: `Olá, mãe. É compreensível que essa situação esteja gerando preocupação. especialmente em relação à duração e ao tempo que leva para relaxar.

A principal hipótese aqui é a vigília excessiva. Quando o bebê faz uma soneca longa pela manhã e depois tem sonecas curtas à tarde, isso pode resultar em um tempo total acordado que excede a referência de 45 minutos a 1 hora e 15 minutos. Como você mencionou que ele demora cerca de 40 a 45 minutos para relaxar no berço, isso indica que o tempo total acordado pode estar em torno de 1h40 a 2h, o que é excessivo.

Para ajudar nessa situação, recomendo fracionar a soneca da manhã para cerca de 1h30 a 2h. Isso pode ajudar a distribuir melhor as sonecas ao longo do dia e evitar que ele fique muito cansado à tarde. Além disso, observe os sinais de sono e inicie a condução para a soneca assim que perceber que ele está começando a ficar sonolento.

Isso pode ajudar a avaliar se ele está se alimentando adequadamente e se a fome pode estar influenciando os despertares.

Para mais orientações sobre a rotina e a janela de vigília, você pode conferir a aula sobre "Rotina por Janelas" no aplicativo.

Também é importante saber qual costuma ser o intervalo entre as mamadas: se durante a demora para adormecer ele estiver se aproximando do próximo intervalo alimentar, considere fome antes de insistir no sono.`,
    criteria: [
      { id: 'no_long_nap_as_excess', w: 20, pass: (t) => !/soneca longa pela manh[aã].{0,220}tempo total acordado que excede/i.test(t) },
      { id: 'separate_wake_math', w: 15, pass: (t) => /1h–1h15|1h-1h15|condu[cç][aã]o come[cç]a|1h40/i.test(t) },
      { id: 'anticipate', w: 15, pass: (t) => /antecip/i.test(t) },
      { id: 'no_sleep_sign_gate', w: 15, pass: (t) => !/observe os sinais de sono e inicie a condu/i.test(t) },
      { id: 'no_orphan_feed', w: 10, pass: (t) => !/Isso pode ajudar a avaliar se ele est[aá] se alimentando adequadamente/i.test(t) },
      { id: 'keep_feed_interval', w: 10, pass: (t) => /intervalo entre as mamadas/i.test(t) },
      { id: 'fraction_morning', w: 15, pass: (t) => /fracion/i.test(t) && /1h30|1h\s*30/i.test(t) },
    ],
  },
  {
    id: '45d-t006',
    ageDays: 45,
    babyName: 'Lara',
    sex: 'f',
    officialNote: 9.5,
    message:
      'Bebê de 45 dias, o ritual do sono precisa começar entre 19 e 20 horas? Meu esposo gosta de dar banho nele e chega por volta das 22:00. Estou iniciando o sono noturno às 21h, porém ele está demorando para cair no sono. E o banho pode dar às 21:30?',
    draft: `É compreensível que você esteja buscando organizar o ritual do sono do seu bebê de 45 dias. O horário recomendado para o início do sono noturno é entre 19h e 20h. Iniciar às 21h já está além dessa faixa, e 21h30 não é recomendado, pois pode atrasar ainda mais o início do sono.

O banho às 21h30 pode contribuir para essa demora, mas a questão principal é o horário tardio. É importante observar também a última soneca e a janela de vigília, que deve ser de 45 minutos a 1 hora e 15 minutos. Isso ajudará a entender melhor a situação.

Para mais orientações sobre a rotina, você pode conferir a aula sobre a estruturação da rotina no aplicativo.

Sobre a pergunta objetiva: o banho às 21h30 não é recomendado quando leva o início do sono noturno para ainda mais tarde.

A família pode organizar conforme sua dinâmica, mas iniciar o sono noturno por volta de 21h30 ou 22h não é o recomendado.`,
    criteria: [
      { id: 'night_19_20', w: 15, pass: (t) => /19h.{0,15}20h|entre 19.{0,10}20/i.test(t) },
      { id: 'start_21h_beyond', w: 20, pass: (t) => /21h.{0,40}(al[eé]m|fora da faixa|j[aá] est[aá])/i.test(t) },
      { id: 'late_2130_sentences_once', w: 25, pass: (t) => ((t.match(/[^.!?\n]*(?:21h30|21:30)[^.!?]*[.!?]/gi) || []).length <= 1) },
      { id: 'bath_direct', w: 15, pass: (t) => /banho/i.test(t) && /n[aã]o [eé] recomendado/i.test(t) },
      { id: 'family_autonomy', w: 10, pass: (t) => /fam[ií]lia pode organizar/i.test(t) },
      { id: 'wake_ref', w: 15, pass: (t) => /45\s*min/i.test(t) && /1 hora e 15|1h15/i.test(t) },
    ],
  },
  {
    id: '55d-t006',
    ageDays: 55,
    babyName: 'Pedro',
    sex: 'm',
    officialNote: 9.2,
    message:
      'Bom dia! Bebê de 55 dias e chupa chupeta… quando a chupeta cai da boca ele reclama… devo colocá-la logo em seguida ou devo esperar um pouco para colocá-la na boca dele novamente? Outra coisa, a janela de sono dele está maior que 1h15. Geralmente 1h30 a 1h45! Tem problema?',
    draft: `Bom dia! É normal que o bebê de 55 dias use a chupeta e reclame quando ela cai. Se ele só reclamar, não é necessário recolocar imediatamente; observe se ele continua dormindo. Se despertar e precisar de ajuda, você pode oferecer a chupeta novamente.

Sobre a janela de sono, se está acima de 1h15, isso já está acima da referência de 45 minutos a 1 hora e 15 minutos. O ideal é que você comece a preparação para a soneca antes de passar de 1h15. Se a condução começa após 1h30 a 1h45 e ele demora cerca de 40-45 minutos para adormecer, o tempo total acordado pode estar excessivo.

Para entender melhor, quanto tempo ele demora para entrar em sono após você iniciar a condução?

Você pode conferir mais sobre a janela de vigília na aula correspondente no aplicativo.`,
    criteria: [
      { id: 'no_invented_4045', w: 25, pass: (t) => !/40.{0,4}45 minutos para adormecer/i.test(t) },
      { id: 'no_hypothetical_excess', w: 15, pass: (t) => !/tempo total acordado pode estar excessivo/i.test(t) },
      { id: 'no_conduction_starts_130', w: 15, pass: (t) => !/condu[cç][aã]o come[cç]a ap[oó]s 1h30 a 1h45/i.test(t) },
      { id: 'entrar_em_sono', w: 15, pass: (t) => /entrar em sono/i.test(t) },
      { id: 'window_above', w: 15, pass: (t) => /1h30|1h\s*30/i.test(t) && /acima|ultrapass/i.test(t) },
      { id: 'pacifier_wait', w: 10, pass: (t) => /n[aã]o precisa recoloc|n[aã]o [eé] necess[aá]rio recoloc/i.test(t) },
      { id: 'no_leaked_nap_wake', w: 10, pass: (t) => !/acordar ap[oó]s as sonecas|mamando efetivamente|despertares coincidem com a queda/i.test(t) },
      { id: 'no_morning_fraction', w: 5, pass: (t) => !/fracion.{0,50}soneca da manh[aã]/i.test(t) },
    ],
  },
  {
    id: '56d-t006',
    ageDays: 56,
    babyName: 'Pedro',
    sex: 'm',
    officialNote: 9.4,
    message:
      'Bebe de 56 dias. Posso colocar no berço e esperar ele dormir sozinho, se não estiver chorando? Ou preciso colocar ele em sono leve ? Ou em sono profundo?',
    draft: `É esperado que, com 56 dias, o bebê comece a se adaptar melhor ao sono e à rotina. Se ele estiver tranquilo e sem chorar, você pode colocá-lo acordado no berço e dar a oportunidade de adormecer ali. Não é obrigatório esperar que ele esteja em sono leve ou profundo.

Se ele se irritar ou chorar, acalme-o e siga a condução, sem exigir que ele adormeça sozinho. Se ele adormecer mamando, pode ir já dormindo para o berço, sem acordá-lo.

Como ele está adormecendo atualmente? Você já está utilizando a Estratégia do Travesseiro?

Se ele ficar irritado ou começar a chorar, você pode ajudá-lo a se acalmar e continuar a condução do sono. Nessa fase, não precisamos exigir que ele sempre consiga adormecer sozinho, mas podemos aproveitar os momentos em que está tranquilo para favorecer o início do sono no berço.

A Estratégia do Travesseiro também pode ajudar na condução e na colocação do bebê no berço, dando mais segurança para você nesse processo.

Assista à aula sobre a Estratégia do Travesseiro no aplicativo para aprender como aplicá-la corretamente.`,
    criteria: [
      { id: 'cry_calm_once', w: 30, pass: (t) => ((t.match(/[^.!?\n]*(?:irritar|ficar irritad|come[cç]ar a chorar)[^.!?]{0,200}(?:acalme|acalm[aá]|se acalmar|siga a condu|continuar a condu|continue a condu)[^.!?]*[.!?]/gi) || []).length === 1) },
      { id: 'travesseiro_purpose', w: 15, pass: (t) => /tamb[eé]m pode ajudar na condu[cç][aã]o e na coloca[cç][aã]o/i.test(t) },
      { id: 'aula_once', w: 15, pass: (t) => ((t.match(/aula.{0,80}(travesseiro|estrat[eé]gia)|aula correspondente|assista [àa] aula/gi) || []).length <= 1) },
      { id: 'awake_ok', w: 15, pass: (t) => /acordad/i.test(t) && /ber[cç]o/i.test(t) },
      { id: 'not_required_stage', w: 15, pass: (t) => /sono leve ou profundo/i.test(t) },
      { id: 'feed_asleep', w: 10, pass: (t) => /j[aá] dormindo|adormecer mamando/i.test(t) },
    ],
  },
  {
    id: '49d-t006',
    ageDays: 49,
    babyName: 'Pedro',
    sex: 'm',
    officialNote: 9.2,
    message:
      'Meu bebê tem 1 mês e 19 dias, as sonecas duram uma média de 30 min, no máximo, em exceção, chega a durar 1h. No entanto, por vezes ele tem despertares durante as sonecas. Ele usa chupeta. Preciso ajustar algo?',
    draft: `É comum que bebês de 49 dias tenham sonecas curtas, e isso pode ser esperado nesta fase. O fato de ele usar chupeta também pode influenciar os despertares durante as sonecas.

A orientação prática é observar a janela de vigília, que deve ser de 45 minutos a 1 hora e 15 minutos. Se você está iniciando a condução para a soneca após esse período, isso está correto. Além disso, sonecas de cerca de 1 hora não devem ser consideradas curtas, então não se preocupe com isso. Se ele está acordando após 30 minutos, vale a pena investigar como ele desperta e se isso coincide com a queda da chupeta.

Para isso, gostaria de saber: como ele desperta após as sonecas? Ele parece irritado ou calmo? E como está a alimentação e os intervalos entre as mamadas?

Para mais informações sobre a janela de vigília e sinais de sono, você pode conferir a aula correspondente no aplicativo.

Como ele usa chupeta, vale observar se os despertares acontecem justamente quando ela cai. Se não houver essa relação, não há motivo, pelas informações apresentadas, para considerar a chupeta como causa principal dos despertares.

Observe também quanto tempo ele permanece acordado antes das sonecas.

A duração de uma soneca de cerca de 30 minutos, sozinha, não indica que a condução precise começar mais cedo.`,
    criteria: [
      { id: 'no_post_window_ok', w: 25, pass: (t) => !/ap[oó]s esse per[ií]odo.{0,30}est[aá] correto/i.test(t) },
      { id: 'respect_window', w: 20, pass: (t) => /respeitar a janela/i.test(t) },
      { id: 'no_premature_pacifier', w: 20, pass: (t) => !/chupeta tamb[eé]m pode influenciar/i.test(t) },
      { id: 'how_wakes', w: 15, pass: (t) => /como ele desperta/i.test(t) },
      { id: 'conditional_pacifier', w: 10, pass: (t) => /quando ela cai|quando a chupeta cai/i.test(t) },
      { id: 'one_hour_not_short', w: 10, pass: (t) => /1 hora n[aã]o devem ser consideradas curtas|cerca de 1 hora.{0,40}n[aã]o.{0,20}curtas/i.test(t) },
      { id: 'no_invented_irritado', w: 10, pass: (t) => !/ainda est[aá] acordando irritad/i.test(t) },
    ],
  },
  {
    id: '30d-t007',
    ageDays: 30,
    babyName: 'Lara',
    sex: 'f',
    officialNote: 9.4,
    message:
      'Minha bebê de 30 dias faz sonecas de 1h às vezes mais.. quando acorda ela acorda muito brava e chora bastante e só acalma dando o peito mama bem pouco e relaxa.. como melhorar? Antes da soneca ela já mama em média 20 a 30 min',
    draft: `Como ela consegue dormir por cerca de 1 hora ou até mais, eu não consideraria a duração da soneca o principal problema neste momento. O que chama mais atenção é ela acordar muito irritada e relaxar depois de sugar um pouco. Por isso, primeiro observaria como está a mamada e se existe algum desconforto depois dela.

A soneca de 1h ou mais não é o problema principal. O despertar irritado merece atenção.

Como ela mama 20 a 30 minutos antes da soneca e, ao despertar, suga pouco e relaxa, isso indica que ela precisa se alimentar.

Depois da mamada, antes de deitar: houve arroto? Ela ficou em posição vertical, e por quanto tempo? A referência é permanecer 20 a 30 minutos em posição vertical.

Esse padrão também pode apontar para algum desconforto depois da mamada, inclusive refluxo. Você pode conferir a aula 'O que é o refluxo?' no aplicativo.`,
    criteria: [
      { id: 'reading_once', w: 25, pass: (t) => t.split(/\n{2,}/).filter((p) => {
        const nap = /1 hora ou at[eé] mais|soneca de (cerca de )?1\s*h|dura[cç][aã]o da soneca|n[aã]o (consideraria|parece ser) .{0,40}(principal )?(problema|ponto)/i.test(p);
        const wake = /irritad|brav[oa]|chor|despertar .{0,30}aten[cç]/i.test(p);
        return nap && wake;
      }).length === 1 },
      { id: 'no_auto_hunger', w: 20, pass: (t) => !/indica que ela precisa se alimentar/i.test(t) },
      { id: 'time_not_satiety', w: 15, pass: (t) => /n[aã]o comprova saciedade|n[aã]o significa automaticamente/i.test(t) },
      { id: 'keep_axis', w: 10, pass: (t) => /n[aã]o consideraria a dura[cç][aã]o da soneca|1 hora.{0,40}n[aã]o .{0,30}principal/i.test(t) },
      { id: 'feeding', w: 10, pass: (t) => /mamada|alimenta|saciedad/i.test(t) },
      { id: 'reflux', w: 10, pass: (t) => /refluxo/i.test(t) },
      { id: 'vertical', w: 10, pass: (t) => /20 a 30 minutos/i.test(t) },
    ],
  },
  {
    id: '40d-night-t007',
    ageDays: 40,
    babyName: 'Pedro',
    sex: 'm',
    officialNote: 9.0,
    message:
      'Olá. Meu bb tem 40 dias , tem noites que ele dorme super bem acorda entre 2:30 a 3 hrs , só que tem dia que após as 04:00 da manhã ele acorda de 1 em 1 hrs tento fazer ele continuar a dormir no berço porém sem sucesso, aí pego ele fico ninando no colo sem sucesso, aí coloco ele no peito ele mama mesmo sabendo que não é fome, ele mama e dorme. Continuo assim por ele ainda ser novinho ?',
    draft: `É compreensível que você esteja enfrentando dificuldades com os despertares noturnos do seu bebê de 40 dias. É comum que, nesta faixa etária, os bebês tenham variações no padrão de sono, e isso pode ser desafiador.

A orientação prática segura é que, após as 4h da manhã, se ele acordar de hora em hora, você deve tentar fazê-lo dormir novamente sem oferecer o peito imediatamente. Isso é importante para Verifique também o horário da última mamada antes das 4h e a rotina alimentar do dia, pois isso pode influenciar os despertares. Se já passaram cerca de 2h30 a 3h desde a última mamada efetiva, você pode oferecer o peito até a saciedade.

Você costuma oferecer peito ou mamadeira automaticamente quando ele acorda antes de 3h?

Recomendo que você revise a aula sobre sono noturno no módulo 3, que pode ajudar a entender melhor como lidar com esses despertares.

Uma coisa é não acordar um bebê saudável e com bom ganho de peso só para mamar. Outra é ele acordar sozinho depois das 4h, de hora em hora, e mamar quando o peito é oferecido — e depois dormir. Nesse segundo caso, o intervalo de 3 horas não serve sozinho para decidir que a mamada não é necessária.

Antes de pensar em associação peito–sono, vale olhar a alimentação: ele mama no peito, fórmula ou complemento? Como está a rotina alimentar do dia — intervalos, efetividade das mamadas e manutenção da saciedade? Como está o ganho de peso e a produção de leite? Nesses despertares ele faz uma mamada efetiva ou só suga um pouco e adormece? Depois de mamar, houve arroto e posição vertical por 20 a 30 minutos? Há sinais de desconforto?`,
    criteria: [
      { id: 'last_feed_first', w: 25, pass: (t) => {
        const feedPos = t.search(/[uú]ltima mamada/i);
        const sleepPos = t.search(/sem oferecer (imediatamente o peito|o peito imediatamente)/i);
        return feedPos >= 0 && (sleepPos < 0 || feedPos < sleepPos);
      } },
      { id: 'no_truncated', w: 20, pass: (t) => !/Isso [eé] importante para/i.test(t) && !/Isso pode ajudar a\s+(?=[A-ZÁ])/m.test(t) },
      { id: 'offer_if_due', w: 15, pass: (t) => /2h\s*30|2h30/i.test(t) && /mamada efetiva/i.test(t) },
      { id: 'daytime_feeding', w: 15, pass: (t) => /rotina alimentar/i.test(t) },
      { id: 'postural', w: 15, pass: (t) => /vertical|arroto/i.test(t) },
      { id: 'no_auto_offer_q', w: 10, pass: (t) => !/oferecer peito ou mamadeira automaticamente/i.test(t) },
    ],
  },
  {
    id: '51d-t007',
    ageDays: 51,
    babyName: 'Lara',
    sex: 'f',
    officialNote: 8.8,
    message:
      'Minha neném1 mês e 21 dias tem dificuldade de dormir durante o dia, só dorme se for no colo, e no peito, tento fazer a técnica do travesseiro, as vezes da certo e as vezes não, quanto tempo pra ela aprender?',
    draft: `É normal que a bebê de 51 dias tenha dificuldade para dormir durante o dia, especialmente se ela só consegue adormecer no colo ou no peito. Essa fase é de adaptação e é esperado que haja variações no sono.

Para ajudar a bebê a dormir, siga este passo a passo: primeiro, observe a janela de vigília de 45 minutos a 1 hora e 15 minutos e conduza a mamada efetiva, garantindo que ela esteja saciada. Se ela ainda estiver no peito, retire-a e mantenha-a em posição vertical por 20 a 30 minutos. Depois, inicie a condução do sono, utilizando a técnica do travesseiro que você já está aplicando. É importante que a transferência para o berço ou outra superfície ocorra quando ela estiver calma, não durante uma crise de choro.

Não existe um prazo fixo para que ela aprenda a dormir de forma mais independente; a evolução depende da repetição e consistência nas práticas, respeitando a maturidade dela.

Para entender melhor, gostaria de saber: quanto tempo a bebê permanece acordada antes das sonecas? Como você está realizando a Estratégia do Travesseiro?

Recomendo que você confira a aula sobre a Estratégia do Travesseiro para mais orientações práticas.

Quando ela ‘só dorme no peito’, diferencie: ainda está com fome; fez mamada efetiva e ficou saciada; ou já saciada permanece sugando enquanto adormece. Se ainda houver sinais de fome, mantenha a alimentação. Se ela já estiver saciada e continuar no peito, retire-a do peito, coloque em posição vertical e, depois, conduza ao sono.

Se você já está utilizando a técnica do travesseiro, investigue como está sendo a execução e em que momento da vigília você a inicia.

Na condução, use contenção e presença observando a resposta da bebê — sem cronometrar o choro e sem tempo predeterminado.`,
    criteria: [
      { id: 'no_normalize_open', w: 25, pass: (t) => !/[eé] (normal|comum) que a beb[eê] de 51 dias/i.test(t) && !/fase [eé] de adapta[cç][aã]o/i.test(t) },
      { id: 'investigate_first', w: 20, pass: (t) => /por que ela est[aá] conseguindo entrar em sono apenas no colo/i.test(t) },
      { id: 'satiety_once', w: 15, pass: (t) => ((t.match(/retir[ae]-a(?: do peito)?|retire-a do peito/gi) || []).length <= 1) },
      { id: 'travesseiro_once', w: 10, pass: (t) => ((t.match(/execu[cç][aã]o.{0,40}travesseiro|travesseiro.{0,40}execu|executando.{0,40}travesseiro|realizando.{0,40}travesseiro/gi) || []).length <= 1) },
      { id: 'no_ruido', w: 10, pass: (t) => !/ru[ií]do branco/i.test(t) },
      { id: 'travesseiro_lesson', w: 10, pass: (t) => /aula.{0,80}travesseiro/i.test(t) },
      { id: 'wake_ref', w: 5, pass: (t) => /45\s*min/i.test(t) && /1 hora e 15|1h15/i.test(t) },
      { id: 'no_fixed', w: 5, pass: (t) => /prazo fixo|n[aã]o existe/i.test(t) },
    ],
  },
  {
    id: '31d-t007',
    ageDays: 31,
    babyName: 'João',
    sex: 'm',
    officialNote: 9.5,
    message:
      'Ola tudo bem? Meu filho tem 31 dias, sempre fez as sonecas no berço, que duravam cerca de 2 hrs/ 2 hrs e 30. Mas faz 02 dias que ele tem feito uma soneca grande pela manhã e, durante a tarde, as sonecas estão bem curtas. Um ciclo de sono. Ele desperta e eu ate tendo nina-lo no berço, mas ele nao retorna. Depois de 30 minutos ja esta com sono novamente. Outra questao eh que ele demora femais para iniciar a soneca. O ambiente esta ajustado, ele esta alimentado, tudo tranquilo, janela de sono del eh de 1 hr/1 hr 15, quando vai dando este horário, vou para o quarto; coloco ruido, quarto escuro, nino ele no colo e ainda acordado transfiro pro berço. Quando no berço, ele demora muuuito prw relaxar, quase 40/45 minutos. Nao sei como conduzir nesta situação. Faz uns 4,5 dias que esta assim.',
    draft: `Olá! É compreensível que você esteja enfrentando dificuldades com as sonecas do seu filho de 31 dias. Mudanças no padrão de sono são comuns nessa fase, e é importante ajustar a rotina para ajudar na condução do sono.

A principal hipótese aqui é a vigília excessiva. Como ele demora cerca de 40 a 45 minutos para relaxar no berço, o tempo total acordado pode estar em torno de 1h40 a 2h, o que é excessivo.

Para ajudar, recomendo fracionar a soneca da manhã para cerca de 1h30 a 2h. Isso pode ajudar a distribuir melhor as sonecas ao longo do dia e evitar que ele fique muito cansado. Se a mamada estiver se aproximando, oferecer o peito pode ajudar a relaxá-lo e facilitar a transição para o sono.

Para mais orientações sobre como estruturar a rotina e conduzir o sono, você pode conferir a aula sobre ‘Rotina por Janelas’ no aplicativo.

A vigília excessiva vem da soma — não da soneca longa da manhã: se a condução começa depois de cerca de 1h–1h15 e ele ainda leva uns 40–45 minutos para adormecer, o tempo acordado chega perto de 1h40–2h — acima da referência de 45 minutos a 1 hora e 15 minutos.

Como ele já demora cerca de 40 a 45 minutos para adormecer, antecipe o início da condução — não espere os sinais de sono — para que ele entre em sono dentro da janela de 45 minutos a 1 hora e 15 minutos.

Também é importante saber qual costuma ser o intervalo entre as mamadas: se durante a demora para adormecer ele estiver se aproximando do próximo intervalo alimentar, considere fome antes de insistir no sono.`,
    criteria: [
      { id: 'no_peito_relax', w: 25, pass: (t) => !/oferecer o peito pode ajudar a relax|facilitar a transi[cç][aã]o para o sono/i.test(t) },
      { id: 'keep_hunger_interval', w: 20, pass: (t) => /considere fome antes de insistir no sono/i.test(t) },
      { id: 'wake_from_sum', w: 15, pass: (t) => /vig[ií]lia excessiva vem da soma|n[aã]o da soneca longa da manh/i.test(t) },
      { id: 'anticipate', w: 15, pass: (t) => /antecip/i.test(t) && /n[aã]o espere os sinais de sono/i.test(t) },
      { id: 'fraction_morning', w: 10, pass: (t) => /fracion/i.test(t) && /1h30|1h\s*30/i.test(t) },
      { id: 'wake_ref', w: 15, pass: (t) => /45\s*min/i.test(t) && /1 hora e 15|1h15/i.test(t) },
    ],
  },
  {
    id: '55d-t007',
    ageDays: 55,
    babyName: 'Pedro',
    sex: 'm',
    officialNote: 9.0,
    message:
      'Bom dia! Bebê de 55 dias e chupa chupeta… quando a chupeta cai da boca ele reclama… devo colocá-la logo em seguida ou devo esperar um pouco para colocá-la na boca dele novamente? Outra coisa, a janela de sono dele está maior que 1h15. Geralmente 1h30 a 1h45! Tem problema?',
    draft: `Bom dia! É normal que o bebê de 55 dias use a chupeta e reclame quando ela cai. Se ele só reclama, você pode observar por um momento se ele continua dormindo. Se despertar e precisar, ofereça a chupeta novamente.

Sobre a janela de sono, se está acima de 1h15, O ideal é que a janela de vigília fique entre 45 minutos e 1h15.

E quanto tempo ele demora para adormecer depois de você iniciar a condução?

Recomendo que você confira a aula sobre ‘Sinais de Sono’ para mais orientações sobre como conduzir o sono do seu bebê.

Para entender melhor, quanto tempo ele demora para entrar em sono após você iniciar a condução?

Quando a chupeta cair e ele apenas reclamar, você não precisa recolocá-la imediatamente. Observe um pouco para ver se ele consegue continuar dormindo sem a chupeta. Se ele despertar e precisar de ajuda para retomar o sono, você pode oferecê-la novamente.

Sobre o tempo acordado: a referência de janela de vigília é de 45 minutos a 1 hora e 15 minutos. Permanecer acordado habitualmente por 1h30 a 1h45 já ultrapassa o esperado para essa faixa etária. Procure observar os sinais de sono e iniciar a preparação para dormir antes de ultrapassar repetidamente 1h15.`,
    criteria: [
      { id: 'pacifier_once', w: 15, pass: (t) => ((t.match(/n[aã]o precisa recoloc|n[aã]o [eé] necess[aá]rio recoloc/gi) || []).length === 1) },
      { id: 'window_once', w: 15, pass: (t) => ((t.match(/Permanecer acordado habitualmente por 1h30 a 1h45/gi) || []).length === 1) },
      { id: 'ask_once', w: 15, pass: (t) => ((t.match(/quanto tempo (ele|ela) demora para (entrar em sono|adormecer)/gi) || []).length === 1) },
      { id: 'ask_formulation', w: 15, pass: (t) => /quanto tempo ele demora para entrar em sono ap[oó]s voc[eê] iniciar a condu[cç][aã]o/i.test(t) },
      { id: 'no_adormecer_depois', w: 10, pass: (t) => !/adormecer depois de voc[eê] iniciar a condu[cç][aã]o/i.test(t) },
      { id: 'janela_lesson', w: 15, pass: (t) => /aula.{0,40}Janela de Vig[ií]lia/i.test(t) },
      { id: 'no_sinais_primary', w: 10, pass: (t) => !/aula sobre ['‘’“”']?Sinais de Sono/i.test(t) },
      { id: 'window_above', w: 5, pass: (t) => /1h30|1h\s*30/i.test(t) && /acima|ultrapass/i.test(t) },
    ],
  },
  {
    id: '57d-t007',
    ageDays: 57,
    babyName: 'Lara',
    sex: 'f',
    officialNote: 9.3,
    message:
      'Oi! Bebê de 57 dias. Estou ensinando a adormecer direto no berço progressivamente... começo com sono da manhã e estou avançando gradativamente para as outras sonecas, até chegar no sono noturno. O indicado é ir progressivamente ou deveria tentar em todas as sonecas de uma vez? Além disso, em algumas tentativas, há choro e fico uns 10 min tentando acalmá-la. Quando não resolve, pego no colo, acalmo e refaço o processo novamente... O caminho é esse mesmo?',
    draft: `É normal que a adaptação ao berço traga desafios, especialmente aos 57 dias. O que você está fazendo é um passo importante para ajudar seu bebê a se acostumar a dormir no berço.

A orientação prática segura é começar pela primeira soneca da manhã e seguir com todas as demais sonecas daquele mesmo dia no berço. Repita esse processo diariamente até consolidar. Quando houver choro, acalme seu bebê no colo e, em seguida, retorne ao berço, repetindo até que ele adormeça. Não é necessário cronometrar o choro; o foco deve ser na consistência e na repetição, acolhendo o choro e ajudando no colo quando necessário. A Estratégia do Travesseiro pode ser uma boa ferramenta para auxiliar nesse processo, então, se você já a utiliza, observe como está sendo feita.

Para refinar sua abordagem, gostaria de saber: quanto tempo seu bebê permanece acordado antes das sonecas? Quando você inicia a condução para o sono, como está sendo a mamada efetiva e os sinais de saciedade?

Se houver muita resistência, acalme no colo, volte ao berço e repita até adormecer. Não cronometre o choro.

A janela de vigília de referência é de 45 minutos a 1 hora e 15 minutos.

Mantenha o processo com consistência e repetição, acolhendo o choro e ajudando no colo sempre que necessário.

Use a Estratégia do Travesseiro na condução e na colocação no berço.

Assista à aula sobre a Estratégia do Travesseiro no aplicativo para aprender como aplicá-la corretamente.`,
    criteria: [
      { id: 'no_boa_ferramenta', w: 25, pass: (t) => !/pode ser uma boa (ferramenta|estrat[eé]gia)/i.test(t) },
      { id: 'travesseiro_direct', w: 20, pass: (t) => /Use a Estrat[eé]gia do Travesseiro na condu[cç][aã]o e na coloca[cç][aã]o no ber[cç]o/i.test(t) },
      { id: 'direct_once', w: 15, pass: (t) => ((t.match(/Use a Estrat[eé]gia do Travesseiro na condu[cç][aã]o e na coloca[cç][aã]o no ber[cç]o/gi) || []).length === 1) },
      { id: 'aula', w: 15, pass: (t) => /aula.{0,80}travesseiro/i.test(t) },
      { id: 'same_day', w: 10, pass: (t) => /mesmo dia|daquele dia|todas as demais sonecas/i.test(t) },
      { id: 'no_timer', w: 10, pass: (t) => /n[aã]o cronometr|sem cronometrar/i.test(t) },
      { id: 'consistency', w: 5, pass: (t) => /consist[eê]ncia e repeti[cç][aã]o/i.test(t) },
    ],
  },
  {
    id: '30d-t008',
    ageDays: 30,
    babyName: 'Lara',
    sex: 'f',
    officialNote: 9.2,
    message:
      'Minha bebê de 30 dias faz sonecas de 1h às vezes mais.. quando acorda ela acorda muito brava e chora bastante e só acalma dando o peito mama bem pouco e relaxa.. como melhorar? Antes da soneca ela já mama em média 20 a 30 min',
    draft: `Como ela consegue dormir por cerca de 1 hora ou até mais, eu não consideraria a duração da soneca o principal problema neste momento. O que chama mais atenção é ela acordar muito irritada e relaxar depois de sugar um pouco. Por isso, primeiro observaria como está a mamada e se existe algum desconforto depois dela.

O tempo de mamada, sozinho, não comprova saciedade — mesmo que ela tenha mamado 20 a 30 minutos antes da soneca. Observe sucção ativa, deglutição e sinais de saciedade. Sugar pouco e relaxar ao despertar não significa automaticamente que ela precise se alimentar: investigue também desconforto e se a sucção está sendo usada para relaxar.

É compreensível que a sua bebê de 30 dias acorde muito irritada após sonecas de cerca de 1 hora ou mais. O que chama atenção aqui é esse despertar bravo e o fato de ela só se acalmar ao mamar, mesmo que por pouco tempo.

A principal hipótese é que isso pode estar relacionado à alimentação e à saciedade, além de possíveis desconfortos após a mamada. É importante investigar se a mamada foi efetiva, ou seja, se houve sucção ativa e deglutição, e se ela apresentou sinais de saciedade. Além disso, observe o que acontece entre o fim da mamada e o momento de deitar: houve arroto? Ela permaneceu em posição vertical por 20 a 30 minutos após a mamada?

Para melhorar essa situação, considere reforçar as mamadas antes das sonecas, garantindo que ela esteja bem alimentada. Também é fundamental respeitar a janela de vigília de 45 minutos a 1 hora e 15 minutos, evitando que ela fique acordada por muito tempo, o que pode levar à hiperestimulação.

Por fim, você pode revisar a aula sobre refluxo, que pode ajudar a entender melhor a situação dela.`,
    criteria: [
      { id: 'no_reinforce_feeds', w: 20, pass: (t) => !/refor[cç]ar as mamadas/i.test(t) },
      { id: 'no_wake_hyper', w: 20, pass: (t) => !/hiperestimula/i.test(t) && !/respeitar a janela de vig[ií]lia/i.test(t) },
      { id: 'reading_once', w: 15, pass: (t) => t.split(/\n{2,}/).filter((p) => {
        const nap = /1 hora ou at[eé] mais|soneca de (cerca de )?1\s*h|dura[cç][aã]o da soneca/i.test(p);
        const wake = /irritad|brav[oa]|chor/i.test(p);
        return nap && wake;
      }).length === 1 },
      { id: 'time_not_satiety', w: 10, pass: (t) => /n[aã]o comprova saciedade/i.test(t) },
      { id: 'no_auto_hunger', w: 10, pass: (t) => /n[aã]o significa automaticamente/i.test(t) },
      { id: 'postural', w: 10, pass: (t) => /arroto/i.test(t) && /30 a 40 minutos/i.test(t) },
      { id: 'reflux', w: 10, pass: (t) => /refluxo/i.test(t) },
      { id: 'keep_axis', w: 5, pass: (t) => /n[aã]o consideraria a dura[cç][aã]o da soneca/i.test(t) },
    ],
  },
  {
    id: '40d-night-t008',
    ageDays: 40,
    babyName: 'Pedro',
    sex: 'm',
    officialNote: 8.8,
    message:
      'Olá. Meu bb tem 40 dias , tem noites que ele dorme super bem acorda entre 2:30 a 3 hrs , só que tem dia que após as 04:00 da manhã ele acorda de 1 em 1 hrs tento fazer ele continuar a dormir no berço porém sem sucesso, aí pego ele fico ninando no colo sem sucesso, aí coloco ele no peito ele mama mesmo sabendo que não é fome, ele mama e dorme. Continuo assim por ele ainda ser novinho ?',
    draft: `É compreensível que você esteja enfrentando dificuldades com os despertares do seu bebê de 40 dias. É comum que, nesta faixa etária, os bebês apresentem variações no padrão de sono, e isso pode ser desafiador para as mães.

O primeiro passo é identificar o horário da última mamada antes das 4h da manhã. Se já transcorreram aproximadamente 2h30 a 3h desde uma mamada efetiva, ofereça mamada efetiva até a saciedade. Se ainda não completou esse intervalo após uma mamada efetiva, tente conduzi-lo novamente ao sono sem oferecer imediatamente o peito.

Se já se passaram ~2h30–3h desde a mamada efetiva, você pode tentar conduzir o bebê de volta ao sono sem oferecer o peito imediatamente. É importante lembrar que nem todo despertar é sinal de fome; pode ser apenas agitação. Isso ajuda a evitar associações negativas entre acordar e mamar.

E como está a alimentação dele durante o dia?

Recomendo que você revise a aula sobre o sono noturno, que pode oferecer mais insights sobre como lidar com esses despertares.

A percepção de que ‘não é fome’ não basta — e a decisão de oferecer o peito não se resume a ele ainda ser novinho.

Uma coisa é não acordar um bebê saudável e com bom ganho de peso só para mamar. Outra é ele acordar sozinho depois das 4h, de hora em hora, e mamar quando o peito é oferecido — e depois dormir. Nesse segundo caso, o intervalo de 3 horas não serve sozinho para decidir que a mamada não é necessária.

Antes de pensar em associação peito–sono, vale olhar a alimentação: ele mama no peito, fórmula ou complemento? Como está a rotina alimentar do dia — intervalos, efetividade das mamadas e manutenção da saciedade? Como está o ganho de peso e a produção de leite? Nesses despertares ele faz uma mamada efetiva ou só suga um pouco e adormece? Depois de mamar, houve arroto e posição vertical por 20 a 30 minutos? Há sinais de desconforto?`,
    criteria: [
      { id: 'no_interval_contradiction', w: 25, pass: (t) => !/j[aá] se passaram.{0,80}2h\s*30.{0,160}sem oferecer/i.test(t) },
      { id: 'no_negative_assoc', w: 20, pass: (t) => !/associa[cç][oõ]es negativas entre acordar e mamar/i.test(t) },
      { id: 'feed_if_due', w: 15, pass: (t) => /j[aá] transcorreram.{0,80}2h\s*30.{0,80}mamada efetiva at[eé] a saciedade|ofere[cç]a mamada efetiva at[eé] a saciedade/i.test(t) },
      { id: 'last_feed_first', w: 15, pass: (t) => {
        const feedPos = t.search(/[uú]ltima mamada/i);
        const sleepPos = t.search(/sem oferecer (imediatamente o peito|o peito imediatamente)/i);
        return feedPos >= 0 && (sleepPos < 0 || feedPos < sleepPos);
      } },
      { id: 'daytime_feeding', w: 10, pass: (t) => /rotina alimentar/i.test(t) },
      { id: 'postural', w: 10, pass: (t) => /vertical|arroto/i.test(t) },
      { id: 'not_just_young', w: 5, pass: (t) => /n[aã]o [eé] fome.{0,80}novinho|n[aã]o se resume/i.test(t) },
    ],
  },
  {
    id: '51d-t008',
    ageDays: 51,
    babyName: 'Lara',
    sex: 'f',
    officialNote: 9.2,
    message:
      'Minha neném1 mês e 21 dias tem dificuldade de dormir durante o dia, só dorme se for no colo, e no peito, tento fazer a técnica do travesseiro, as vezes da certo e as vezes não, quanto tempo pra ela aprender?',
    draft: `Antes de pensarmos em quanto tempo ela levará para aprender, precisamos entender por que ela está conseguindo entrar em sono apenas no colo ou no peito.

É compreensível que a sua bebê de 51 dias tenha dificuldade para dormir durante o dia, especialmente nessa faixa etária, onde muitos bebês preferem o colo ou o peito para adormecer. Isso é comum e esperado.

Para ajudá-la a dormir, siga este passo a passo: primeiro, observe a janela de vigília dela, que deve ser de 45 minutos a 1 hora e 15 minutos. Se ela ainda estiver com fome, mantenha a alimentação. Se estiver saciada e permanecer no peito, você pode retirar do peito e colocá-la em posição vertical por 20 a 30 minutos. Depois, conduza-a ao sono, utilizando a técnica do travesseiro que você já está aplicando. É importante que você inicie essa condução quando ela estiver calma, e não durante uma crise de choro.

Quanto ao tempo para aprender, não existe um prazo fixo — a evolução depende da consistência e repetição na organização da alimentação, vigília e sono.

Para entender melhor, poderia me informar quanto tempo a bebê permanece acordada antes das sonecas e como a Estratégia do Travesseiro está sendo realizada?

Recomendo também revisar a aula sobre a Estratégia do Travesseiro para garantir que você está aplicando da melhor forma possível.

Quando ela ‘só dorme no peito’, diferencie: ainda está com fome; fez mamada efetiva e ficou saciada; ou já saciada permanece sugando enquanto adormece. Se ainda houver sinais de fome, mantenha a alimentação. Se ela já estiver saciada e continuar no peito, retire-a do peito, coloque em posição vertical e, depois, conduza ao sono.

Na condução, use contenção e presença observando a resposta da bebê — sem cronometrar o choro e sem tempo predeterminado.`,
    criteria: [
      { id: 'no_calma_start', w: 25, pass: (t) => !/inicie.{0,50}quando (ela|a beb[eê]) estiver calma/i.test(t) },
      { id: 'satiety_once', w: 20, pass: (t) => ((t.match(/retir[ae]-a(?: do peito)?|retire-a do peito|retirar do peito/gi) || []).length <= 1) },
      { id: 'complete_conduct', w: 15, pass: (t) => /diferencie:\s*ainda est[aá] com fome/i.test(t) && /retire-a do peito|retir[ae]-a do peito/i.test(t) },
      { id: 'travesseiro_lesson', w: 15, pass: (t) => /aula.{0,80}travesseiro/i.test(t) },
      { id: 'investigate_first', w: 10, pass: (t) => /por que ela est[aá] conseguindo entrar em sono apenas no colo/i.test(t) },
      { id: 'no_fixed', w: 5, pass: (t) => /prazo fixo|n[aã]o existe/i.test(t) },
      { id: 'wake_ref', w: 5, pass: (t) => /45\s*min/i.test(t) && /1 hora e 15|1h15/i.test(t) },
      { id: 'no_ruido', w: 5, pass: (t) => !/ru[ií]do branco/i.test(t) },
    ],
  },
  {
    id: '55d-t008',
    ageDays: 55,
    babyName: 'Pedro',
    sex: 'm',
    officialNote: 9.4,
    message:
      'Bom dia! Bebê de 55 dias e chupa chupeta… quando a chupeta cai da boca ele reclama… devo colocá-la logo em seguida ou devo esperar um pouco para colocá-la na boca dele novamente? Outra coisa, a janela de sono dele está maior que 1h15. Geralmente 1h30 a 1h45! Tem problema?',
    draft: `Bom dia!

Se a chupeta cair e ele apenas reclamar, você não precisa recolocá-la imediatamente. Observe se ele continua dormindo. Se despertar e precisar de ajuda, você pode oferecer a chupeta novamente.

Sobre a janela de vigília: aos 55 dias, a referência é de 45 minutos a 1 hora e 15 minutos. Permanecer acordado habitualmente por 1h30 a 1h45 já ultrapassa o indicado para essa faixa etária. Procure observar os sinais de sono e iniciar a preparação para dormir antes de ultrapassar 1h15.

Para entender melhor, quanto tempo ele demora para entrar em sono após você iniciar a condução?

Ele apresenta sinais de saciedade após as mamadas?

Você pode conferir também a aula sobre Janela de Vigília no aplicativo.`,
    criteria: [
      { id: 'no_satiety_ask', w: 25, pass: (t) => !/sinais de saciedade ap[oó]s as mamadas/i.test(t) },
      { id: 'pacifier_once', w: 15, pass: (t) => ((t.match(/n[aã]o precisa recoloc|n[aã]o [eé] necess[aá]rio recoloc/gi) || []).length === 1) },
      { id: 'window_above', w: 15, pass: (t) => /1h30|1h\s*30/i.test(t) && /acima|ultrapass/i.test(t) },
      { id: 'ask_once', w: 15, pass: (t) => ((t.match(/quanto tempo (ele|ela) demora para (entrar em sono|adormecer)/gi) || []).length === 1) },
      { id: 'ask_formulation', w: 10, pass: (t) => /quanto tempo ele demora para entrar em sono ap[oó]s voc[eê] iniciar a condu[cç][aã]o/i.test(t) },
      { id: 'janela_lesson', w: 10, pass: (t) => /aula.{0,40}Janela de Vig[ií]lia/i.test(t) },
      { id: 'wake_ref', w: 5, pass: (t) => /45\s*min/i.test(t) && /1 hora e 15|1h15/i.test(t) },
      { id: 'keep_prepare', w: 5, pass: (t) => /antes de ultrapassar 1h15/i.test(t) },
    ],
  },
  {
    id: '57d-t008',
    ageDays: 57,
    babyName: 'Lara',
    sex: 'f',
    officialNote: 9.3,
    message:
      'Oi! Bebê de 57 dias. Estou ensinando a adormecer direto no berço progressivamente... começo com sono da manhã e estou avançando gradativamente para as outras sonecas, até chegar no sono noturno. O indicado é ir progressivamente ou deveria tentar em todas as sonecas de uma vez? Além disso, em algumas tentativas, há choro e fico uns 10 min tentando acalmá-la. Quando não resolve, pego no colo, acalmo e refaço o processo novamente... O caminho é esse mesmo?',
    draft: `É normal que a adaptação ao berço traga desafios, especialmente aos 57 dias. O que você está fazendo é um passo importante para ajudar seu bebê a se acostumar a dormir no berço.

A orientação prática segura é começar pela primeira soneca da manhã e seguir com todas as demais sonecas daquele mesmo dia no berço. Repita esse processo diariamente até consolidar. Quando houver choro, acalme seu bebê no colo e, em seguida, retorne ao berço, repetindo até que ele adormeça. Não é necessário cronometrar o choro; o foco deve ser na consistência e na repetição, acolhendo o choro e ajudando no colo quando necessário. A Estratégia do Travesseiro pode ser uma boa ferramenta para auxiliar nesse processo, então, se você já a utiliza, observe como está sendo feita.

Para refinar sua abordagem, gostaria de saber: quanto tempo seu bebê permanece acordado antes das sonecas? Quando você inicia a condução para o sono, como está sendo a mamada efetiva e os sinais de saciedade?

Se houver muita resistência, acalme no colo, volte ao berço e repita até adormecer. Não cronometre o choro.

A janela de vigília de referência é de 45 minutos a 1 hora e 15 minutos.

Mantenha o processo com consistência e repetição, acolhendo o choro e ajudando no colo sempre que necessário.

Use a Estratégia do Travesseiro na condução e na colocação no berço.

Assista à aula sobre a Estratégia do Travesseiro no aplicativo para aprender como aplicá-la corretamente.`,
    criteria: [
      { id: 'no_boa_ferramenta', w: 25, pass: (t) => !/pode ser uma boa (ferramenta|estrat[eé]gia)/i.test(t) },
      { id: 'travesseiro_direct', w: 20, pass: (t) => /Use a Estrat[eé]gia do Travesseiro na condu[cç][aã]o e na coloca[cç][aã]o no ber[cç]o/i.test(t) },
      { id: 'direct_once', w: 15, pass: (t) => ((t.match(/Use a Estrat[eé]gia do Travesseiro na condu[cç][aã]o e na coloca[cç][aã]o no ber[cç]o/gi) || []).length === 1) },
      { id: 'aula', w: 15, pass: (t) => /aula.{0,80}travesseiro/i.test(t) },
      { id: 'same_day', w: 10, pass: (t) => /mesmo dia|daquele dia|todas as demais sonecas/i.test(t) },
      { id: 'no_timer', w: 10, pass: (t) => /n[aã]o cronometr|sem cronometrar/i.test(t) },
      { id: 'consistency', w: 5, pass: (t) => /consist[eê]ncia e repeti[cç][aã]o/i.test(t) },
    ],
  },
  {
    id: '49d-t008',
    ageDays: 49,
    babyName: 'Pedro',
    sex: 'm',
    officialNote: 9.2,
    message:
      'Meu bebê tem 1 mês e 19 dias, as sonecas duram uma média de 30 min, no máximo, em exceção, chega a durar 1h. No entanto, por vezes ele tem despertares durante as sonecas. Ele usa chupeta. Preciso ajustar algo?',
    draft: `É compreensível que você esteja buscando ajustes nas sonecas do seu bebê de 49 dias. Sonecas de cerca de 30 minutos podem ocorrer nessa faixa etária, e é importante observar como ele desperta.

Para ajudar a melhorar a situação, recomendo que você respeite a janela de vigília, que é de 45 minutos a 1 hora e 15 minutos. Isso significa que, após esse período acordado, é hora de iniciar a condução para a soneca. Além disso, observe se os despertares coincidem com a queda da chupeta. Se isso acontecer, pode ser um fator a ser considerado.

Agora, gostaria de saber: como está a alimentação dele e os intervalos entre as mamadas? Ele parece saciado após as mamadas? E quanto tempo ele demora para adormecer depois de você iniciar a condução?

Para mais informações sobre a janela de vigília e como conduzir as sonecas, você pode conferir a aula ‘Janela de Vigília’ no aplicativo.

Como ele usa chupeta, vale observar se os despertares acontecem justamente quando ela cai. Se não houver essa relação, não há motivo, pelas informações apresentadas, para considerar a chupeta como causa principal dos despertares.

Observe também quanto tempo ele permanece acordado antes das sonecas.

A duração de uma soneca de cerca de 30 minutos, sozinha, não indica que a condução precise começar mais cedo.

A condução deve respeitar a janela de 45 minutos a 1 hora e 15 minutos e os sinais de sono.

Sonecas de cerca de 1 hora não devem ser consideradas curtas.`,
    criteria: [
      { id: 'no_after_window_start', w: 25, pass: (t) => !/ap[oó]s esse per[ií]odo acordado.{0,80}iniciar a condu[cç][aã]o|[eé] hora de iniciar a condu[cç][aã]o para a soneca/i.test(t) },
      { id: 'within_or_respect', w: 15, pass: (t) => /dentro da janela|respeitar a janela de 45 minutos a 1 hora e 15/i.test(t) },
      { id: 'keep_feed', w: 15, pass: (t) => /alimenta[cç][aã]o.{0,80}intervalos entre as mamadas/i.test(t) },
      { id: 'keep_satiety', w: 10, pass: (t) => /saciad/i.test(t) },
      { id: 'conditional_pacifier', w: 10, pass: (t) => /quando ela cai/i.test(t) },
      { id: 'no_premature_pacifier', w: 10, pass: (t) => !/chupeta tamb[eé]m pode influenciar/i.test(t) },
      { id: 'one_hour_not_short', w: 5, pass: (t) => /1 hora n[aã]o devem ser consideradas curtas/i.test(t) },
      { id: 'no_early_from_30min', w: 5, pass: (t) => /30 minutos, sozinha/i.test(t) },
      { id: 'wake_ref', w: 5, pass: (t) => /45\s*min/i.test(t) && /1 hora e 15|1h15/i.test(t) },
    ],
  },
  {
    id: '30d-t009',
    ageDays: 30,
    babyName: 'Lara',
    sex: 'f',
    officialNote: 8.8,
    message:
      'Minha bebê de 30 dias faz sonecas de 1h às vezes mais.. quando acorda ela acorda muito brava e chora bastante e só acalma dando o peito mama bem pouco e relaxa.. como melhorar? Antes da soneca ela já mama em média 20 a 30 min',
    draft: `Como ela consegue dormir por cerca de 1 hora ou até mais, eu não consideraria a duração da soneca o principal problema neste momento. O que chama mais atenção é ela acordar muito irritada e relaxar depois de sugar um pouco. Por isso, primeiro observaria como está a mamada e se existe algum desconforto depois dela.

O tempo de mamada, sozinho, não comprova saciedade — mesmo que ela tenha mamado 20 a 30 minutos antes da soneca. Observe sucção ativa, deglutição e sinais de saciedade. Sugar pouco e relaxar ao despertar não significa automaticamente que ela precise se alimentar: investigue também desconforto e se a sucção está sendo usada para relaxar.

É compreensível que você esteja preocupada com o choro da sua bebê ao acordar. Com 30 dias, é comum que os bebês apresentem variações no sono e nos despertares. O que chama atenção no seu relato é que, apesar das sonecas de cerca de 1 hora ou mais, ela acorda muito irritada e só se acalma ao mamar.

A principal hipótese aqui é que o choro pode estar relacionado à alimentação e saciedade, além de possíveis desconfortos após a mamada. Para melhorar essa situação, sugiro que você observe o que acontece entre o fim da mamada e a hora de deitar. Pergunte-se: houve arroto? Ela permaneceu em posição vertical por 20 a 30 minutos? A mamada pareceu efetiva, com sucção ativa e sinais de que ela está saciada? Essas informações podem ajudar a entender melhor o que está acontecendo.

Além disso, é importante garantir que a janela de vigília antes das sonecas seja respeitada, que é de 45 minutos a 1 hora e 15 minutos. Se a sua bebê estiver acordada por muito tempo antes de dormir, isso pode contribuir para a irritação.

Se você puder compartilhar mais sobre a duração da soneca da manhã e quanto tempo ela demora para adormecer após você iniciar a condução, isso pode ajudar a refinar ainda mais a orientação.

Para aprofundar no tema, recomendo que você acesse a aula sobre refluxo e alimentação, que pode trazer insights valiosos para a sua situação.`,
    criteria: [
      { id: 'postural_30_40', w: 20, pass: (t) => /arroto/i.test(t) && /30 a 40 minutos/i.test(t) },
      { id: 'no_postural_20_30', w: 10, pass: (t) => !/posi[cç][aã]o vertical por 20 a 30 minutos/i.test(t) },
      { id: 'no_wake_without_evidence', w: 20, pass: (t) => !/janela de vig[ií]lia/i.test(t) && !/acordada por muito tempo/i.test(t) },
      { id: 'no_morning_nap_ask', w: 15, pass: (t) => !/dura[cç][aã]o da soneca da manh[aã]/i.test(t) },
      { id: 'no_restart', w: 15, pass: (t) => !/[eé] compreens[ií]vel que voc[eê] esteja preocupada/i.test(t) },
      { id: 'reading_once', w: 10, pass: (t) => t.split(/\n{2,}/).filter((p) => {
        const nap = /1 hora ou at[eé] mais|soneca de (cerca de )?1\s*h|dura[cç][aã]o da soneca/i.test(p);
        const wake = /irritad|brav[oa]|chor/i.test(p);
        return nap && wake;
      }).length === 1 },
      { id: 'keep_axis', w: 5, pass: (t) => /n[aã]o consideraria a dura[cç][aã]o da soneca/i.test(t) },
      { id: 'reflux', w: 5, pass: (t) => /refluxo/i.test(t) },
    ],
  },
  {
    id: '31d-t009',
    ageDays: 31,
    babyName: 'João',
    sex: 'm',
    officialNote: 9.5,
    message:
      'Ola tudo bem? Meu filho tem 31 dias, sempre fez as sonecas no berço, que duravam cerca de 2 hrs/ 2 hrs e 30. Mas faz 02 dias que ele tem feito uma soneca grande pela manhã e, durante a tarde, as sonecas estão bem curtas. Um ciclo de sono. Ele desperta e eu ate tendo nina-lo no berço, mas ele nao retorna. Depois de 30 minutos ja esta com sono novamente. Outra questao eh que ele demora femais para iniciar a soneca. O ambiente esta ajustado, ele esta alimentado, tudo tranquilo, janela de sono del eh de 1 hr/1 hr 15, quando vai dando este horário, vou para o quarto; coloco ruido, quarto escuro, nino ele no colo e ainda acordado transfiro pro berço. Quando no berço, ele demora muuuito prw relaxar, quase 40/45 minutos. Nao sei como conduzir nesta situação. Faz uns 4,5 dias que esta assim.',
    draft: `Olá! É compreensível que você esteja enfrentando dificuldades com o sono do seu filho de 31 dias. Mudanças no padrão de sono são comuns nessa fase, e é importante ajustar a rotina para ajudar nesse processo.

A principal hipótese aqui é a vigília excessiva. Isso significa que ele pode estar ficando muito tempo acordado antes de adormecer, o que pode dificultar o relaxamento.

Recomendo fracionar a soneca da manhã para cerca de 1h30 a 2h, observando se isso melhora as sonecas da tarde. Além disso, se você perceber que ele está próximo do intervalo para mamar e demora a dormir, considere amamentá-lo para ajudar a relaxar e manter o sono.

Isso ajudará a entender melhor a situação.

Para mais orientações sobre a janela de vigília e como estruturar a rotina, você pode conferir a aula "Janela de Vigília" no aplicativo.

A vigília excessiva vem da soma — não da soneca longa da manhã: se a condução começa depois de cerca de 1h–1h15 e ele ainda leva uns 40–45 minutos para adormecer, o tempo acordado chega perto de 1h40–2h — acima da referência de 45 minutos a 1 hora e 15 minutos.

Como ele já demora cerca de 40 a 45 minutos para adormecer, antecipe o início da condução — não espere os sinais de sono — para que ele entre em sono dentro da janela de 45 minutos a 1 hora e 15 minutos.

Também é importante saber qual costuma ser o intervalo entre as mamadas: se durante a demora para adormecer ele estiver se aproximando do próximo intervalo alimentar, considere fome antes de insistir no sono.`,
    criteria: [
      { id: 'no_orphan_ajudara', w: 20, pass: (t) => !/Isso ajudar[aá] a entender melhor a situa[cç][aã]o/i.test(t) },
      { id: 'feed_once', w: 20, pass: (t) => ((t.match(/[^.!?\n]*(?:intervalo entre as mamadas|considere fome|amament[aá]-l[oa])[^.!?]*[.!?]/gi) || []).length <= 1) },
      { id: 'no_breast_relax', w: 15, pass: (t) => !/amament[aá]-l[oa] para ajudar a relaxar/i.test(t) },
      { id: 'lesson_after_calc', w: 15, pass: (t) => {
        const calc = t.search(/vig[ií]lia excessiva vem da soma|1h40/i);
        const lesson = t.search(/aula.{0,40}Janela/i);
        return calc >= 0 && (lesson < 0 || calc < lesson);
      } },
      { id: 'keep_sum', w: 10, pass: (t) => /vig[ií]lia excessiva vem da soma|n[aã]o da soneca longa da manh/i.test(t) },
      { id: 'anticipate', w: 10, pass: (t) => /antecip/i.test(t) },
      { id: 'fraction', w: 10, pass: (t) => /fracion/i.test(t) },
    ],
  },
  {
    id: '30d-t010',
    ageDays: 30,
    babyName: 'Lara',
    sex: 'f',
    officialNote: 9.2,
    message:
      'Minha bebê de 30 dias faz sonecas de 1h às vezes mais.. quando acorda ela acorda muito brava e chora bastante e só acalma dando o peito mama bem pouco e relaxa.. como melhorar? Antes da soneca ela já mama em média 20 a 30 min',
    draft: `Como ela consegue dormir por cerca de 1 hora ou até mais, eu não consideraria a duração da soneca o principal problema neste momento. O que chama mais atenção é ela acordar muito irritada e relaxar depois de sugar um pouco. Por isso, primeiro observaria como está a mamada e se existe algum desconforto depois dela.

O tempo de mamada, sozinho, não comprova saciedade — mesmo que ela tenha mamado 20 a 30 minutos antes da soneca. Observe sucção ativa, deglutição e sinais de saciedade. Sugar pouco e relaxar ao despertar não significa automaticamente que ela precise se alimentar: investigue também desconforto e se a sucção está sendo usada para relaxar.

É compreensível que você esteja preocupada com o despertar da sua bebê de 30 dias.

A principal hipótese aqui é que o que está acontecendo pode estar relacionado à alimentação e à saciedade. Como ela mama antes da soneca, é importante verificar se a mamada é efetiva e se ela está realmente saciada. Após a mamada, você pode tentar mantê-la em posição vertical por cerca de 20 a 30 minutos, para ajudar na digestão e evitar desconfortos. Isso pode ajudar a reduzir a irritação ao acordar.

Para entender melhor a situação, gostaria de saber: houve arroto após a mamada? Ela permaneceu em posição vertical? A mamada parece efetiva, com sucção ativa e sinais de saciedade?

Se precisar de mais orientações sobre como conduzir a alimentação e o sono, recomendo a aula sobre refluxo, que pode trazer insights úteis para o seu caso.

Depois da mamada, antes de deitar: houve arroto? Ela permaneceu em posição vertical por 30 a 40 minutos?

Há sinais de desconforto depois da mamada ou ao ser colocada no berço?`,
    criteria: [
      { id: 'postural_30_40', w: 20, pass: (t) => /arroto/i.test(t) && /30 a 40 minutos/i.test(t) },
      { id: 'no_postural_20_30', w: 15, pass: (t) => !/posi[cç][aã]o vertical por (cerca de )?20 a 30 minutos/i.test(t) },
      { id: 'no_succao_relax', w: 15, pass: (t) => !/suc[cç][aã]o est[aá] sendo usada para relaxar/i.test(t) },
      { id: 'no_restart', w: 15, pass: (t) => !/[eé] compreens[ií]vel que voc[eê] esteja preocupada/i.test(t) },
      { id: 'arroto_once', w: 15, pass: (t) => (t.match(/houve arroto/gi) || []).length <= 1 },
      { id: 'keep_axis', w: 10, pass: (t) => /n[aã]o consideraria a dura[cç][aã]o da soneca/i.test(t) },
      { id: 'reflux', w: 10, pass: (t) => /refluxo/i.test(t) },
    ],
  },
  {
    id: '31d-t010',
    ageDays: 31,
    babyName: 'João',
    sex: 'm',
    officialNote: 9.4,
    message:
      'Ola tudo bem? Meu filho tem 31 dias, sempre fez as sonecas no berço, que duravam cerca de 2 hrs/ 2 hrs e 30. Mas faz 02 dias que ele tem feito uma soneca grande pela manhã e, durante a tarde, as sonecas estão bem curtas. Um ciclo de sono. Ele desperta e eu ate tendo nina-lo no berço, mas ele nao retorna. Depois de 30 minutos ja esta com sono novamente. Outra questao eh que ele demora femais para iniciar a soneca. O ambiente esta ajustado, ele esta alimentado, tudo tranquilo, janela de sono del eh de 1 hr/1 hr 15, quando vai dando este horário, vou para o quarto; coloco ruido, quarto escuro, nino ele no colo e ainda acordado transfiro pro berço. Quando no berço, ele demora muuuito prw relaxar, quase 40/45 minutos. Nao sei como conduzir nesta situação. Faz uns 4,5 dias que esta assim.',
    draft: `Olá! É compreensível que você esteja enfrentando dificuldades com o sono do seu filho de 31 dias. Mudanças nas sonecas são comuns nessa fase, mas vamos trabalhar para melhorar isso.

Além disso, observe se ele está se alimentando adequadamente e se a mamada está sendo efetiva.

A vigília excessiva vem da soma — não da soneca longa da manhã: se a condução começa depois de cerca de 1h–1h15 e ele ainda leva uns 40–45 minutos para adormecer, o tempo acordado chega perto de 1h40–2h — acima da referência de 45 minutos a 1 hora e 15 minutos.

Como ele já demora cerca de 40 a 45 minutos para adormecer, antecipe o início da condução — não espere os sinais de sono — para que ele entre em sono dentro da janela de 45 minutos a 1 hora e 15 minutos.

A principal hipótese aqui é a vigília excessiva. Ele está fazendo uma soneca longa pela manhã (cerca de 2h a 2h30) e, em seguida, as sonecas da tarde estão curtas, com apenas um ciclo. Isso pode estar contribuindo para a dificuldade em relaxar no berço e a demora para adormecer. Para ajudar, recomendo fracionar a soneca da manhã para cerca de 1h30 a 2h. Isso pode ajudar a distribuir melhor o sono ao longo do dia e evitar que ele fique muito cansado à tarde.

Também é importante saber qual costuma ser o intervalo entre as mamadas: se durante a demora para adormecer ele estiver se aproximando do próximo intervalo alimentar, considere fome antes de insistir no sono.

Para mais informações sobre a janela de vigília e como estruturar a rotina, recomendo a aula ‘Janela de Vigília (PASSO 3)’.`,
    criteria: [
      { id: 'no_morning_nap_delay', w: 25, pass: (t) => !/contribuindo para a dificuldade em relaxar/i.test(t) },
      { id: 'no_generic_feed', w: 20, pass: (t) => !/alimentando adequadamente e se a mamada est[aá] sendo efetiva/i.test(t) },
      { id: 'keep_sum', w: 15, pass: (t) => /vig[ií]lia excessiva vem da soma|n[aã]o da soneca longa da manh/i.test(t) },
      { id: 'anticipate', w: 15, pass: (t) => /antecip/i.test(t) },
      { id: 'fraction', w: 15, pass: (t) => /fracion/i.test(t) },
      { id: 'feed_once', w: 10, pass: (t) => ((t.match(/[^.!?\n]*(?:intervalo entre as mamadas|considere fome)[^.!?]*[.!?]/gi) || []).length <= 1) },
    ],
  },
  {
    id: '45d-t009',
    ageDays: 45,
    babyName: 'Lara',
    sex: 'f',
    officialNote: 9.3,
    message:
      'Bebê de 45 dias, o ritual do sono precisa começar entre 19 e 20 horas? Meu esposo gosta de dar banho nele e chega por volta das 22:00. Estou iniciando o sono noturno às 21h, porém ele está demorando para cair no sono. E o banho pode dar às 21:30?',
    draft: `É compreensível que você esteja se organizando para o sono noturno do seu bebê de 45 dias. O horário recomendado para o início do sono noturno é entre 19h e 20h. Iniciar às 21h já está além dessa faixa, e O banho às 21h30 não é recomendado quando leva o início do sono noturno para ainda mais tarde. A família pode organizar conforme sua dinâmica, mas o banho às 21h30 não é recomendado quando leva o início do sono noturno para ainda mais tarde — 21h30 ou 22h não é o horário recomendado. A questão não é apenas o banho em si, mas o horário tardio que pode afetar a rotina.
Para ajudar seu bebê a adormecer mais facilmente, observe a última soneca e o tempo que ele permanece acordado antes de tentar iniciar a noite. A janela de vigília ideal é de 45 minutos a 1 hora e 15 minutos. Se ele está demorando para adormecer, pode ser útil ajustar esses intervalos. Isso ajudará a entender melhor a situação.
Para mais orientações sobre a rotina, recomendo a aula ‘Rotina por Janelas’ no aplicativo.`,
    criteria: [
      { id: 'no_e_O_banho', w: 25, pass: (t) => !/\be O banho\b/.test(t) },
      { id: 'bath_once', w: 25, pass: (t) => ((t.match(/banho [àa]s 21h30 n[aã]o [eé] recomendado/gi) || []).length === 1) },
      { id: 'night_19_20', w: 15, pass: (t) => /19h.{0,15}20h|entre 19.{0,10}20/i.test(t) },
      { id: '21h_late', w: 15, pass: (t) => /21h.{0,40}(al[eé]m|fora da faixa|j[aá] est[aá])/i.test(t) },
      { id: 'wake_ref', w: 10, pass: (t) => /45\s*min/i.test(t) && /1 hora e 15|1h15/i.test(t) },
      { id: 'keep_family', w: 10, pass: (t) => /fam[ií]lia pode organizar/i.test(t) },
    ],
  },
  {
    id: '49d-t009',
    ageDays: 49,
    babyName: 'Pedro',
    sex: 'm',
    officialNote: 9.3,
    message:
      'Meu bebê tem 1 mês e 19 dias, as sonecas duram uma média de 30 min, no máximo, em exceção, chega a durar 1h. No entanto, por vezes ele tem despertares durante as sonecas. Ele usa chupeta. Preciso ajustar algo?',
    draft: `É compreensível que você esteja buscando ajustes nas sonecas do seu bebê de 49 dias, especialmente com a duração média de 30 minutos. Isso pode ser comum nesta faixa etária, e é importante observar como ele desperta.

A primeira orientação é respeitar a janela de vigília, que deve ser de 45 minutos a 1 hora e 15 minutos. Além disso, sonecas de cerca de 1 hora não devem ser consideradas curtas, então não se preocupe se ele conseguir dormir um pouco mais.

Como ele usa chupeta, vale observar se os despertares acontecem justamente quando ela cai. Se não houver essa relação, não há motivo para considerá-la como a causa principal dos despertares.

Para entender melhor a situação, gostaria de saber: como está a alimentação dele e os intervalos entre as mamadas? Ele parece saciado após as mamadas? E quanto tempo ele permanece acordado antes de iniciar a condução para a soneca?

Para aprofundar no tema, recomendo a aula sobre ‘Janela de Vigília’ para entender melhor como organizar as sonecas e a rotina do dia.

A duração de uma soneca de cerca de 30 minutos, sozinha, não indica que a condução precise começar mais cedo.

A condução deve respeitar a janela de 45 minutos a 1 hora e 15 minutos e os sinais de sono.

A condução deve ser iniciada dentro da janela de 45 minutos a 1 hora e 15 minutos, observando os sinais de sono e o tempo que ele demora para entrar em sono.`,
    criteria: [
      { id: 'how_wakes_ask', w: 25, pass: (t) => /como (ele|ela|o beb[eê]) desperta das sonecas:/i.test(t) },
      { id: 'keep_within', w: 20, pass: (t) => /dentro da janela de 45 minutos a 1 hora e 15/i.test(t) },
      { id: 'no_after_window', w: 15, pass: (t) => !/ap[oó]s esse per[ií]odo acordado.{0,80}iniciar a condu[cç][aã]o|[eé] hora de iniciar a condu[cç][aã]o para a soneca/i.test(t) },
      { id: 'keep_feed', w: 15, pass: (t) => /alimenta[cç][aã]o.{0,80}intervalos entre as mamadas/i.test(t) },
      { id: 'conditional_pacifier', w: 15, pass: (t) => /quando ela cai/i.test(t) },
      { id: 'keep_satiety', w: 10, pass: (t) => /saciad/i.test(t) },
    ],
  },
  {
    id: '51d-t009',
    ageDays: 51,
    babyName: 'Lara',
    sex: 'f',
    officialNote: 9.2,
    message:
      'Minha neném 1 mês e 21 dias tem dificuldade de dormir durante o dia, só dorme se for no colo, e no peito, tento fazer a técnica do travesseiro, as vezes da certo e as vezes não, quanto tempo pra ela aprender?',
    draft: `Antes de pensarmos em quanto tempo ela levará para aprender, precisamos entender por que ela está conseguindo entrar em sono apenas no colo ou no peito.

Isso é bastante comum e esperado.

Para ajudar a sua bebê a dormir fora do colo, siga este passo a passo: primeiro, observe a janela de vigília dela, que deve ser entre 45 minutos a 1 hora e 15 minutos. Após esse período, ofereça uma mamada efetiva, garantindo que ela esteja saciada. Se ela ainda estiver no peito após a mamada, retire-a suavemente. Em seguida, mantenha-a em posição vertical por 20 a 30 minutos antes de conduzi-la ao sono, utilizando a técnica do travesseiro que você já está aplicando. Lembre-se de que não existe um prazo fixo para ela aprender a dormir de forma independente; a evolução depende da consistência e repetição.

Para entender melhor, poderia me informar quanto tempo a sua bebê permanece acordada antes das sonecas? E como você está realizando a técnica do travesseiro?

Você pode conferir a aula sobre a Estratégia do Travesseiro para mais orientações sobre como aplicá-la de forma eficaz.

Na condução, use contenção e presença observando a resposta da bebê — sem cronometrar o choro e sem tempo predeterminado.`,
    criteria: [
      { id: 'no_window_to_feed', w: 25, pass: (t) => !/ap[oó]s esse per[ií]odo[^.!?]{0,80}(?:ofere[cç]a|fa[cç]a) uma mamada/i.test(t) },
      { id: 'no_bare_retire', w: 20, pass: (t) => !/ainda estiver no peito ap[oó]s a mamada[^.!?]{0,40}retir/i.test(t) },
      { id: 'complete_logic', w: 15, pass: (t) => /saciad/i.test(t) && /retir[ae]-a do peito|retire-a do peito/i.test(t) },
      { id: 'keep_vertical_20_30', w: 10, pass: (t) => /20 a 30 minutos/i.test(t) },
      { id: 'no_normalize', w: 10, pass: (t) => !/Isso [eé] (bastante )?comum e esperado/i.test(t) },
      { id: 'travesseiro_lesson', w: 10, pass: (t) => /aula.{0,80}travesseiro/i.test(t) },
      { id: 'no_fixed', w: 5, pass: (t) => /prazo fixo|n[aã]o existe/i.test(t) },
      { id: 'wake_ref', w: 5, pass: (t) => /45\s*min/i.test(t) && /1 hora e 15|1h15/i.test(t) },
    ],
  },
  {
    id: '40d-night-t010',
    ageDays: 40,
    babyName: 'Pedro',
    sex: 'm',
    officialNote: 9.4,
    message:
      'Olá. Meu bb tem 40 dias , tem noites que ele dorme super bem acorda entre 2:30 a 3 hrs , só que tem dia que após as 04:00 da manhã ele acorda de 1 em 1 hrs tento fazer ele continuar a dormir no berço porém sem sucesso, aí pego ele fico ninando no colo sem sucesso, aí coloco ele no peito ele mama mesmo sabendo que não é fome, ele mama e dorme. Continuo assim por ele ainda ser novinho ?',
    draft: `É compreensível que você esteja preocupada com os despertares do seu bebê de 40 dias. É comum que os bebês nessa faixa etária tenham variações no padrão de sono, e os despertares frequentes podem ser desafiadores.

O primeiro passo é identificar o horário da última mamada antes das 4h da manhã. Se já transcorreram aproximadamente 2h30 a 3h desde uma mamada efetiva, ofereça mamada efetiva até a saciedade. Se ainda não completou esse intervalo após uma mamada efetiva, tente conduzi-lo novamente ao sono sem oferecer imediatamente o peito.

É importante lembrar que nem todo despertar é sinal de fome; às vezes, pode ser apenas agitação.

E como está a alimentação dele durante o dia?

Recomendo que você revise a aula sobre ‘Despertar Irritado Pós-Soneca’ para entender melhor como lidar com esses despertares e a alimentação do dia.

A percepção de que ‘não é fome’ não basta — e a decisão de oferecer o peito não se resume a ele ainda ser novinho.

Uma coisa é não acordar um bebê saudável e com bom ganho de peso só para mamar. Outra é ele acordar sozinho depois das 4h, de hora em hora, e mamar quando o peito é oferecido — e depois dormir. Nesse segundo caso, o intervalo de 3 horas não serve sozinho para decidir que a mamada não é necessária.

Antes de pensar em associação peito–sono, vale olhar a alimentação: ele mama no peito, fórmula ou complemento? Como está a rotina alimentar do dia — intervalos, efetividade das mamadas e manutenção da saciedade? Como está o ganho de peso e a produção de leite? Nesses despertares ele faz uma mamada efetiva ou só suga um pouco e adormece? Depois de mamar, houve arroto e posição vertical por 20 a 30 minutos? Há sinais de desconforto?`,
    criteria: [
      { id: 'no_angry_wake_lesson', w: 25, pass: (t) => !/Despertar Irritado P[oó]s-?Soneca/i.test(t) },
      { id: 'night_sleep_lesson', w: 15, pass: (t) => /sono noturno/i.test(t) },
      { id: 'last_feed_first', w: 15, pass: (t) => {
        const feedPos = t.search(/[uú]ltima mamada/i);
        const sleepPos = t.search(/sem oferecer (imediatamente o peito|o peito imediatamente)/i);
        return feedPos >= 0 && (sleepPos < 0 || feedPos < sleepPos);
      } },
      { id: 'feed_if_due', w: 15, pass: (t) => /2h\s*30.{0,40}3h.{0,80}mamada efetiva at[eé] a saciedade|ofere[cç]a mamada efetiva at[eé] a saciedade/i.test(t) },
      { id: 'daytime_feeding', w: 10, pass: (t) => /rotina alimentar/i.test(t) },
      { id: 'postural_20_30', w: 10, pass: (t) => /20 a 30 minutos/i.test(t) },
      { id: 'not_just_young', w: 10, pass: (t) => /n[aã]o se resume/i.test(t) },
    ],
  },
  {
    id: '51d-t010',
    ageDays: 51,
    babyName: 'Lara',
    sex: 'f',
    officialNote: 9.2,
    message:
      'Minha neném 1 mês e 21 dias tem dificuldade de dormir durante o dia, só dorme se for no colo, e no peito, tento fazer a técnica do travesseiro, as vezes da certo e as vezes não, quanto tempo pra ela aprender?',
    draft: `Antes de pensarmos em quanto tempo ela levará para aprender, precisamos entender por que ela está conseguindo entrar em sono apenas no colo ou no peito.

É compreensível que você esteja enfrentando dificuldades para fazer sua neném de 51 dias dormir durante o dia. Essa fase é desafiadora, e muitos bebês nessa idade precisam de apoio extra para se acomodar no sono.

Para ajudá-la, siga este passo a passo: primeiro, observe a janela de vigília dela, que deve ser de 45 minutos a 1 hora e 15 minutos. Após esse período, faça uma mamada efetiva, garantindo que ela esteja saciada. Se ela já realizou mamada efetiva, está saciada, sem sinais de fome e permanece no peito, retire-a do peito, coloque em posição vertical por 20 a 30 minutos e, depois, conduza ao sono. Depois, conduza-a ao sono, utilizando a Estratégia do Travesseiro que você já está aplicando.

Para entender melhor a situação, gostaria de saber: quanto tempo a bebê permanece acordada antes das sonecas? Como você está realizando a Estratégia do Travesseiro? E quando você vai ao peito, ela realiza uma mamada efetiva e apresenta sinais de saciedade?

Para mais detalhes sobre a Estratégia do Travesseiro, recomendo que você acesse a aula correspondente no aplicativo.

Não existe prazo fixo de dias para ela aprender: a evolução depende de repetição e consistência, com alimentação, vigília e sono organizados.

Recomendo que você revise a aula sobre a estratégia do travesseiro para obter mais orientações sobre como aplicá-la de forma eficaz.

Na condução, use contenção e presença observando a resposta da bebê — sem cronometrar o choro e sem tempo predeterminado.`,
    criteria: [
      { id: 'no_window_to_feed', w: 25, pass: (t) => !/ap[oó]s esse per[ií]odo[^.!?]{0,100}(?:ofere[cç]a|fa[cç]a|fazer) (?:uma )?mamada/i.test(t) },
      { id: 'conduza_once', w: 15, pass: (t) => ((t.match(/conduza(?:-a)? ao sono/gi) || []).length <= 1) },
      { id: 'lesson_once', w: 15, pass: (t) => ((t.match(/aula.{0,80}travesseiro|travesseiro.{0,80}aula/gi) || []).length === 1) },
      { id: 'complete_logic', w: 15, pass: (t) => /saciad/i.test(t) && /retir[ae]-a do peito|retire-a do peito/i.test(t) },
      { id: 'keep_vertical_20_30', w: 10, pass: (t) => /20 a 30 minutos/i.test(t) },
      { id: 'no_fixed', w: 10, pass: (t) => /prazo fixo|n[aã]o existe/i.test(t) },
      { id: 'wake_ref', w: 10, pass: (t) => /45\s*min/i.test(t) && /1 hora e 15|1h15/i.test(t) },
    ],
  },
  {
    id: '55d-t010',
    ageDays: 55,
    babyName: 'Pedro',
    sex: 'm',
    officialNote: 9.4,
    message:
      'Bom dia! Bebê de 55 dias e chupa chupeta… quando a chupeta cai da boca ele reclama… devo colocá-la logo em seguida ou devo esperar um pouco para colocá-la na boca dele novamente? Outra coisa, a janela de sono dele está maior que 1h15. Geralmente 1h30 a 1h45! Tem problema?',
    draft: `Bom dia!

Se a chupeta cair e ele apenas reclamar, você não precisa recolocá-la imediatamente. Observe se ele continua dormindo. Se despertar e precisar de ajuda, você pode oferecer a chupeta novamente.

Sobre a janela de vigília: aos 55 dias, a referência é de 45 minutos a 1 hora e 15 minutos. Permanecer acordado habitualmente por 1h30 a 1h45 já ultrapassa o indicado para essa faixa etária. Procure observar os sinais de sono e iniciar a preparação para dormir antes de ultrapassar 1h15.

Para entender melhor, quanto tempo ele demora para entrar em sono após você iniciar a condução?

Ele parece tranquilo, chorando ou buscando o peito?

Você pode conferir também a aula sobre Janela de Vigília no aplicativo.`,
    criteria: [
      { id: 'no_leaked_how_wakes', w: 30, pass: (t) => !/parece tranquilo[oa]?, chorando ou buscando o peito/i.test(t) },
      { id: 'keep_enter_sleep', w: 20, pass: (t) => /quanto tempo ele demora para entrar em sono ap[oó]s voc[eê] iniciar a condu[cç][aã]o/i.test(t) },
      { id: 'keep_pacifier', w: 15, pass: (t) => /n[aã]o precisa recoloc/i.test(t) },
      { id: 'window_above', w: 15, pass: (t) => /1h30|1h\s*30/i.test(t) && /acima|ultrapass/i.test(t) },
      { id: 'janela_lesson', w: 10, pass: (t) => /aula.{0,40}Janela de Vig[ií]lia/i.test(t) },
      { id: 'ask_once', w: 10, pass: (t) => ((t.match(/quanto tempo (ele|ela) demora para (entrar em sono|adormecer)/gi) || []).length === 1) },
    ],
  },
];

function printCase(label, c, before, after, signals) {
  const failB = before.detail.filter((d) => !d.pass).map((d) => d.id);
  const failA = after.detail.filter((d) => !d.pass).map((d) => d.id);
  const mark = after.score >= 95 && failA.length === 0 ? 'PASS' : after.score >= 95 ? 'PASS≥95' : 'FAIL';
  console.log(`\n-- ${c.id}  official ${c.officialNote}/10  [${label}] ${mark}`);
  console.log(`  signals: ${(signals.signals || []).map((s) => s.id).join(', ') || '—'}`);
  console.log(`  before enricher: ${before.score}/100  fail: ${failB.join(', ') || 'none'}`);
  console.log(`  after  enricher: ${after.score}/100  fail: ${failA.join(', ') || 'none'}`);
  return failA.length === 0;
}

console.log('\n=== TESTE 003 replay: official drafts → enricher ===\n');

let failed = 0;
for (const c of CASES) {
  const signals = extractSignals({ message: c.message, ageBand: '30_60', ageDays: c.ageDays });
  const before = score(c.criteria, c.draft);
  const enriched = enrichThirtySixtyOfficialAnswer({
    text: c.draft,
    message: c.message,
    signals,
    babyProfile: { babyName: c.babyName, ageDays: c.ageDays, sex: c.sex },
  });
  const after = score(c.criteria, enriched.text);
  const ok = printCase('enricher', c, before, after, signals);
  if (!ok) {
    failed += 1;
    console.log('  snippet:', enriched.text.slice(0, 280).replace(/\s+/g, ' '));
  }
}

const RUN_LIVE = process.env.RUN_LIVE === '1';
if (RUN_LIVE) {
  console.log('\n=== Layer B: live processTurn ===\n');
  for (const c of CASES) {
    try {
      const result = await processTurn({
        conversationId: `teste-003-${c.id}`,
        message: c.message,
        babyProfile: { motherName: 'Ana', babyName: c.babyName, ageDays: c.ageDays, sex: c.sex },
        conversation: [],
      });
      const text = result?.response?.text || '';
      const after = score(c.criteria, text, { draftBlocked: result?.response?.draftBlocked });
      const failA = after.detail.filter((d) => !d.pass).map((d) => d.id);
      const mark = failA.length === 0 ? 'PASS' : 'FAIL';
      console.log(`-- ${c.id} live ${mark}  ${after.score}/100  fail: ${failA.join(', ') || 'none'}`);
      console.log('  route:', result?.route?.path);
      console.log('  text:', text.slice(0, 220).replace(/\s+/g, ' '), '…');
      if (failA.length) failed += 1;
    } catch (err) {
      failed += 1;
      console.log(`-- ${c.id} live ERROR: ${err.message}`);
    }
  }
} else {
  console.log('\n(Set RUN_LIVE=1 to also generate live answers via processTurn)\n');
}

console.log(`\nSUMMARY: ${CASES.length - failed}/${CASES.length} enricher cases fully passing dossier checks\n`);
process.exit(failed ? 1 : 0);
