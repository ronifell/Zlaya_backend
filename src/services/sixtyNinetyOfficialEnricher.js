import { fold, matchSixtyNinety, phase60 } from './laterBandSignals.js';

const ORDER = [
  '60_90_refluxo',
  '60_90_mamada_sonhos',
  '60_90_saltos',
  '60_90_ruido',
  '60_90_recursos',
  '60_90_meio_janela',
  '60_90_ritual',
  '60_90_inicio_noite',
  '60_90_noite',
  '60_90_chupeta',
  '60_90_sonecas',
  '60_90_adormecer',
  '60_90_formula',
  '60_90_intervalo',
  '60_90_temperatura',
  '60_90_prematuro',
  '60_90_fralda',
];

function com(ageDays) {
  const n = Number(ageDays);
  return Number.isFinite(n) ? `Com ${n} dias` : 'Nesta faixa';
}

function windowLine(ageDays) {
  const phase = phase60(ageDays);
  const head = com(ageDays);
  if (phase === 'start') {
    return `${head}, a janela vai do despertar até ele efetivamente adormecer e fica em torno de 1 hora e 15 minutos. Mamada, cuidados, interação e a condução entram nessa conta.`;
  }
  if (phase === 'end') {
    return `${head}, perto do fim da faixa, a janela fica em torno de 1 hora e 30 minutos, do despertar até o sono efetivo. Mamada, cuidados, interação e a condução entram nessa conta.`;
  }
  return `${head}, a janela ainda está evoluindo: no início da faixa fica em torno de 1 hora e 15 minutos e, perto dos 90 dias, em torno de 1 hora e 30 minutos. Não pule direto para o fim da faixa. Conte do despertar até o sono efetivo.`;
}

function fastLine(ageDays) {
  const phase = phase60(ageDays);
  if (phase === 'start') {
    return 'O jejum noturno, no início da faixa, fica em torno de 4 horas, contadas de quando ele efetivamente dorme, não do horário da última mamada.';
  }
  if (phase === 'end') {
    return 'Perto dos 90 dias, o jejum noturno fica em torno de 6 horas, contadas de quando ele efetivamente dorme, não do horário da última mamada.';
  }
  return 'O jejum noturno evolui de cerca de 4 horas no início da faixa para cerca de 6 horas perto dos 90 dias. A contagem começa quando ele dorme. Nesta idade, não trate nem o piso nem o teto como regra já fechada.';
}

function napCountLine(ageDays) {
  const phase = phase60(ageDays);
  if (phase === 'start') return 'No início da faixa, a referência é cerca de 5 sonecas, sem retirar uma só para bater esse número.';
  if (phase === 'end') return 'Perto dos 90 dias, a referência é cerca de 4 sonecas. A redução é gradual.';
  return 'O número de sonecas vai de cerca de 5 no início da faixa para cerca de 4 perto dos 90 dias, aos poucos. Não retire uma soneca só para atingir a conta.';
}

function formulaLine(ageDays) {
  const phase = phase60(ageDays);
  const head = com(ageDays);
  if (phase === 'start') {
    return `${head}, a referência de fórmula no início da faixa é cerca de 120 ml por mamada, a cada cerca de 3 horas.`;
  }
  if (phase === 'end') {
    return `${head}, perto do fim da faixa a referência de fórmula fica em torno de 150 ml por mamada, a cada cerca de 3 horas.`;
  }
  return `${head}, a fórmula evolui aos poucos entre cerca de 120 ml no início da faixa e cerca de 150 ml perto dos 90 dias, sempre a cada cerca de 3 horas. Não escolha um dos extremos como se já fosse a regra desta idade.`;
}

const BUILDERS = {
  '60_90_refluxo': (ageDays) =>
    `${com(ageDays)}, eu não fecho diagnóstico. Se a suspeita é refluxo ou APLV, assista às aulas e aos vídeos do pediatra Roberto Franklin e procure o suporte das consultoras.\n\nEnquanto observa, o arroto continua e a posição vertical de referência é 20 a 30 minutos. Use 40 minutos quando houver sinais de refluxo. Não conclua baixa produção por um comportamento isolado. Se essa suspeita se sustentar, a ordenha serve para medir a produção. O curso de amamentação só entra depois, se ainda faltar aprofundar.`,

  '60_90_mamada_sonhos': (ageDays) =>
    `${com(ageDays)}, a mamada dos sonhos não faz parte do método. Não acorde o bebê e não ofereça peito ou mamadeira de forma preventiva, antes de vocês irem dormir, para tentar alongar a madrugada.\n\n${fastLine(ageDays)} Se ele já estiver nesse período e continuar dormindo, deixe dormir. A aula é Elimine a mamada dos sonhos.`,

  '60_90_saltos': (ageDays) =>
    `${com(ageDays)}, eu não uso essa teoria como explicação do sono, da alimentação ou do comportamento. Também não peço para apenas esperar passar, nem prevejo duração.\n\nMarcos são aquisições graduais. Se algo mudou, olhe a rotina, as sonecas, as mamadas, a forma de adormecer, os estímulos e os desconfortos. Aula: Desmistifique os chamados saltos de desenvolvimento.`,

  '60_90_ruido': () =>
    `O ruído branco é pontual: use quando ele estiver agitado ou choroso depois da mamada e não conseguir relaxar. Não use se ele já está calmo.\n\nNesta faixa, o som de secador costuma chamar mais a atenção no choro. Deixe perto e mais alto só no começo, com ele na horizontal levemente inclinada, como na aula. Se em 1 a 2 minutos não houver resposta, pare e investigue outra causa. Não insista.\n\nQuando ele adormecer, baixe o volume e afaste o aparelho para cerca de 80 cm do berço. Não deixe o volume alto colado no ouvido a noite toda. Aula: Use o ruído branco.`,

  '60_90_recursos': (ageDays) => {
    const age = Number(ageDays);
    const charuto = Number.isFinite(age) && age > 75
      ? `${com(ageDays)}, o charutinho só vale até cerca de 75 dias, então nesta idade ele já deve ter sido encerrado.`
      : `${com(ageDays)}, o charutinho só vale até cerca de 2 meses e meio, cerca de 75 dias.`;
    const ninho = Number.isFinite(age) && age >= 88
      ? 'O ninho, aos 90 dias, deve ser encerrado.'
      : 'O ninho pode ir até os 3 meses, no máximo, e precisa ser encerrado aos 90 dias.';
    return `${charuto} ${ninho}`;
  },

  '60_90_meio_janela': (ageDays) =>
    `${com(ageDays)}, a mamada no meio da janela pertence à faixa seguinte. Eu não antecipo essa conduta aqui.`,

  '60_90_ritual': (ageDays) =>
    `${com(ageDays)}, o ritual noturno é uma sequência previsível no quarto, não um apagão da casa. A casa pode seguir; o quarto é que fica mais calmo.\n\nA ordem é: banho, vestir, diminuir a luminosidade, mamada com pouca luz e pouca interação, arroto e posição vertical, condução ao sono e ao berço. O banho precisa caber antes de a janela acabar e antes da próxima mamada, não quando ele já está exausto.\n\n${windowLine(ageDays)} A vertical de referência é 20 a 30 minutos; com sinais de refluxo, 40 minutos.\n\nNão existe tempo obrigatório de 5 ou 10 minutos para a transferência. Observe o relaxamento e transfira aos poucos. Colocar acordado no berço pode ajudar, e não é obrigação em todas as sonecas. Depois que a noite começa, o ambiente fica escuro e com poucos estímulos. Aula: Crie um ritual para o sono noturno.`,

  '60_90_inicio_noite': (ageDays) => {
    const phase = phase60(ageDays);
    const extra = phase === 'end'
      ? 'Perto dos 90 dias, comece a antecipar aos poucos em direção a 19h–20h.'
      : phase === 'start'
        ? 'No início da faixa, se ele estiver tranquilo, confortável e sem sinal de cansaço, pode permanecer acordado até perto das 22h. Não force o sono.'
        : 'No início da faixa, um bebê tranquilo pode ir até perto das 22h. Perto dos 90 dias, a noite volta aos poucos para 19h–20h. Nesta idade, não force nem um extremo nem o outro.';
    return `${com(ageDays)}, a referência de início da noite é 19h a 20h, sem rigidez. Considere o começo do dia, as sonecas, a última janela, a última mamada, os sinais de sono e o comportamento.\n\n${extra}`;
  },

  '60_90_noite': (ageDays) =>
    `${com(ageDays)}, despertar à noite não se resolve oferecendo mamada em todo despertar, e eu não prometo noite inteira.\n\n${fastLine(ageDays)} Se ele continuar dormindo depois desse período, não acorde para mamar.\n\nQuando despertar depois desse primeiro tempo, pode mamar, com o quarto escuro e com poucos estímulos. Depois, arroto e posição vertical antes de voltar ao sono. A vertical de referência é 20 a 30 minutos; com sinais de refluxo, 40 minutos.\n\nDepois dessa primeira mamada noturna, o intervalo seguinte é de cerca de 3 horas ou mais, também para quem mama no peito, contado do início da mamada. Se ele seguir dormindo, não acorde. Se despertar antes, tente primeiro reconduzir ao sono sem outra mamada. Se a mamada anterior foi efetiva, houve saciedade, as medidas posturais foram feitas e não há sinal de refluxo ou desconforto, a tendência é voltar a dormir. Se ele insistir em mamar, alimente e investigue déficit alimentar.\n\nDespertares frequentes não são para normalizar: revise as mamadas do dia, a forma de adormecer e os desconfortos. À noite, troque a fralda só se houver cocô, vazamento ou outra necessidade objetiva. Aulas: Estratégia para o sono noturno e O que fazer nos despertares noturnos.`,

  '60_90_chupeta': (ageDays) =>
    `${com(ageDays)}, se a chupeta cair e ele continuar dormindo, não recoloque. Se reclamar, observe brevemente e recoloque só se ainda precisar. A recolocação não é automática.`,

  '60_90_sonecas': (ageDays) =>
    `${windowLine(ageDays)}\n\n${napCountLine(ageDays)} A soneca vai até 2 horas, contadas de quando ele adormece. Se adormecer durante as medidas posturais, esse tempo já entra na soneca. Ao completar 2 horas, se seguir dormindo, acorde.\n\nMenos de 2 horas não é inadequado só por isso. Se acordar calmo e descansado, siga a rotina. Se acordar irritado, choroso ou cansado, investigue. Sonecas recorrentes de 10 a 20 minutos, principalmente com irritabilidade ou dificuldade de permanecer acordado, pedem essa investigação: alimentação, estímulos e desconforto. A rotina parte da hora real em que ele acorda, sem horário fixo.\n\nAntes de atribuir a soneca à forma de adormecer, confirme mamada efetiva e saciedade. De dia, não deixe mais de 3 horas sem alimentação, exceto se estiver dormindo. Acordar da soneca antes da hora de mamar não zera o intervalo.`,

  '60_90_adormecer': (ageDays) =>
    `${com(ageDays)}, mamar e colo não são o problema. O que passa a importar é quando uma única forma de adormecer se repete o tempo todo.\n\nPrimeiro, a mamada: se foi efetiva e houve saciedade, e ele continua no peito só para adormecer, retire, faça o arroto e mantenha a posição vertical por 20 a 30 minutos. Com sinais de refluxo, 40 minutos. Se ele adormecer mamando ou durante essas medidas, não acorde. Se continuar acordado, conduza o sono com um recurso adequado à faixa.\n\nAdormecer na mamada ainda pode acontecer e não é erro automático. Se mamar virar a única forma de iniciar ou retomar o sono, amplie as conduções aos poucos, sem retirada brusca. Colocar acordado no berço pode ajudar, e não é obrigação em todas as sonecas. Se houver choro, você permanece e acolhe. O colo continua quando há necessidade.\n\nQuando a Técnica do Travesseiro entrar, assista à aula. Eu não substituo essa aula por um passo a passo incompleto. As aulas de colo e peito e de forma de adormecer mostram a transição.`,

  '60_90_formula': (ageDays) =>
    `${formulaLine(ageDays)} Uma mamadeira terminada, isolada, não manda aumentar na hora. Se ele consumir todo o volume de forma repetida por um dia ou, no máximo, dois, a oferta pode subir 30 ml. Isso é quantidade disponível, não obrigação de terminar. Respeite a saciedade. Não prometa uma noite mais longa só por causa do volume.`,

  '60_90_intervalo': (ageDays) =>
    `${com(ageDays)}, organize o dia antes de julgar a noite. No peito, o intervalo fica em torno de 2 horas e 30 minutos; na mamadeira, em torno de 3 horas. Os dois contam do início da mamada anterior.\n\nDe dia, ele não deve ficar mais de 3 horas sem alimentação, exceto se estiver dormindo. Lanchinhos curtos e repetidos, sobretudo perto dos 90 dias, atrapalham a reserva da noite. Acordar da soneca antes da hora de mamar não significa fome: você pode aguardar o intervalo. Se ele insistir em mamar antes, alimente e investigue déficit.\n\nNão existe tempo obrigatório de 20 minutos para trocar de peito. Se agitar na mamada, arrote e ofereça de novo o mesmo peito. Se demonstrar saciedade, não force. Duração ou frequência, sozinhas, não provam que a mamada foi adequada. Não prometa sono longo só porque a mamada durou certo tempo. O curso de amamentação só entra se, depois dessa organização, ainda faltar aprofundar.`,

  '60_90_temperatura': (ageDays) =>
    `${com(ageDays)}, a temperatura de conforto para o sono fica em torno de 24 °C. Olhe também as roupas e se ele mostra desconforto térmico.`,

  '60_90_prematuro': (ageDays) =>
    `${com(ageDays)}, no prematuro eu uso a idade cronológica, em dias, para escolher a regra desta faixa. Não uso a idade corrigida no lugar dela.`,

  '60_90_fralda': (ageDays) =>
    `${com(ageDays)}, à noite a fralda só é trocada se houver cocô, vazamento ou outra necessidade objetiva. Fora isso, evite estímulo.`,
};

function pick(ids, message) {
  const folded = fold(message);
  let list = ORDER.filter((id) => ids.includes(id));
  if (list.includes('60_90_ritual') && !/jejum|despert|madrugada/.test(folded)) {
    list = list.filter((id) => id !== '60_90_noite');
  }
  if (list.includes('60_90_meio_janela')) {
    list = list.filter((id) => id !== '60_90_sonecas' && id !== '60_90_intervalo');
  }
  if (list.includes('60_90_mamada_sonhos')) {
    list = list.filter((id) => id !== '60_90_noite');
  }
  return list.slice(0, 2);
}

function frame(ageDays) {
  return [
    windowLine(ageDays),
    napCountLine(ageDays),
    'A soneca vai até 2 horas. No peito, o intervalo fica em torno de 2 horas e 30 minutos; na mamadeira, em torno de 3 horas. De dia, no máximo 3 horas sem alimentação, salvo se estiver dormindo.',
    fastLine(ageDays),
    'Me diga o ponto concreto — soneca, noite, mamada, choro ou forma de adormecer — que eu fecho a conduta.',
  ].join(' ');
}

const POISON = [
  /sinais de saciedade no rn/gi,
  /45 minutos a 1 hora e 15/gi,
  /mau h[aá]bito/gi,
  /maus h[aá]bitos/gi,
  /pico glic[eê]mico/gi,
  /salto de desenvolvimento/gi,
  /deixar chorar/gi,
  /sleep training/gi,
  /cry it out/gi,
  /exterogesta[cç][aã]o/gi,
  /press[aã]o de sono/gi,
];

function scrub(text) {
  let out = String(text || '');
  for (const re of POISON) out = out.replace(re, '');
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

export function enrichSixtyNinetyOfficialAnswer({ text, message, babyProfile } = {}) {
  const ageDays = babyProfile?.ageDays;
  const ids = matchSixtyNinety(message);
  const chosen = pick(ids, message);
  if (chosen.length) {
    const body = chosen.map((id) => BUILDERS[id](ageDays)).join('\n\n');
    return { text: body, notes: chosen };
  }
  const folded = fold(message);
  if (/sono|soneca|mamad|noite|berco|choro|janela/.test(folded)) {
    return { text: frame(ageDays), notes: ['60_90_frame'] };
  }
  const cleaned = scrub(text);
  if (cleaned.length < 80) {
    return {
      text: `${com(ageDays)}, me conta se a dúvida é a soneca, a noite, a mamada, o choro ou a forma de adormecer, que eu aplico a regra desta faixa.`,
      notes: ['60_90_ask'],
    };
  }
  return { text: cleaned, notes: ['60_90_scrub'] };
}
