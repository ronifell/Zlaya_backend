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
      { id: 'morning_nap_not_delay_cause', w: 20, pass: (t) => !/soneca longa pela manh[aã].{0,80}(contribuindo|explica|causa).{0,40}(relaxar|adormecer)/i.test(t) },
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
      { id: 'no_3h_withhold', w: 20, pass: (t) => !/antes de 3 horas.{0,40}sem (oferecer|mamar)|sem oferecer o peito imediatamente/i.test(t) },
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
      { id: 'late_once', w: 15, pass: (t) => ((t.match(/21h30 ou 22h n[aã]o [eé]/gi) || []).length <= 1) },
      { id: 'bath_direct', w: 25, pass: (t) => /banho.{0,100}n[aã]o [eé] recomendado/i.test(t) },
      { id: 'no_modulos', w: 20, pass: (t) => !/m[oó]dulos?\s*3 e 4/i.test(t) },
      { id: 'wake_ref', w: 20, pass: (t) => /45\s*min/i.test(t) && /1 hora e 15|1h15/i.test(t) },
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
      { id: 'no_interrupt', w: 40, pass: (t) => !/mamada.{0,50}conforto.{0,80}interromper|interromper e conduzir o sono com conten/i.test(t) },
      { id: 'wake_ref', w: 20, pass: (t) => /45\s*min/i.test(t) && /1 hora e 15|1h15/i.test(t) },
      { id: 'differentiate', w: 20, pass: (t) => /fome/i.test(t) && /saciad/i.test(t) },
      { id: 'no_fixed', w: 20, pass: (t) => /prazo fixo|n[aã]o existe/i.test(t) },
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
      { id: 'no_early_from_30min', w: 30, pass: (t) => !/acordando ap[oó]s 30 minutos.{0,80}iniciar a condu[cç][aã]o.{0,40}antes/i.test(t) },
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
      { id: 'no_fallback', w: 20, pass: (t) => !/n[aã]o encontrei orienta[cç][aã]o suficiente/i.test(t) },
      { id: 'awake_ok', w: 25, pass: (t) => /acordad/i.test(t) && /ber[cç]o/i.test(t) },
      { id: 'not_required_stage', w: 20, pass: (t) => /n[aã]o [eé] necess[aá]rio esperar|sono leve ou profundo/i.test(t) },
      { id: 'feed_asleep', w: 20, pass: (t) => /j[aá] dormindo|adormecer mamando/i.test(t) },
      { id: 'no_reask_age', w: 15, pass: (t) => !/idade exata/i.test(t) },
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
      { id: 'wake_ref', w: 20, pass: (t) => /45\s*min/i.test(t) && /1 hora e 15|1h15/i.test(t) },
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
