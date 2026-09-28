import { fold, matchNinetyOneTwenty } from './laterBandSignals.js';

const ORDER = [
  '90_120_refluxo',
  '90_120_vacina',
  '90_120_chupeta',
  '90_120_em_pe',
  '90_120_peito',
  '90_120_andando',
  '90_120_travesseiro',
  '90_120_soneca',
  '90_120_carrinho',
  '90_120_viagem',
];

function com(ageDays) {
  const n = Number(ageDays);
  return Number.isFinite(n) ? `Com ${n} dias` : 'Nesta faixa';
}

const BUILDERS = {
  '90_120_refluxo': (ageDays) =>
    `${com(ageDays)}, eu não fecho diagnóstico. Se há sinais de refluxo, assista às aulas e aos vídeos do pediatra Roberto Franklin e procure o suporte. Não encurte o tempo em pé como se esse desconforto não existisse.`,

  '90_120_travesseiro': (ageDays) =>
    `${com(ageDays)}, o travesseiro pode facilitar só o início do sono. Não é item fixo do berço e não fica a noite toda.\n\nColoque-o atravessado. O bebê entra do quadril para cima, nunca só a cabeça. Quando o sono aprofunda e ele sai de cima, você pode retirar o travesseiro.\n\nA função é o aconchego do colo, dentro do berço, para ele terminar de adormecer no próprio berço. Assista à aula Adapte a Estratégia do travesseiro antes de improvisar o passo a passo.`,

  '90_120_soneca': (ageDays) =>
    `${com(ageDays)}, um dia ou outro sem soneca pode acontecer, mesmo com a rotina em ordem. Diminua estímulos, reduza luz e interação e siga o dia. Um banho pode ajudar a reorganizar. Não insista até ele dormir naquele momento.\n\nEspere o próximo sinal de sono e tente de novo. Se a falta de soneca virar padrão, revise as janelas, o estímulo do ambiente, a organização das mamadas e possíveis desconfortos. Aula: Bebê não fez a soneca.`,

  '90_120_chupeta': (ageDays, message) => {
    const every = /toda vez|sempre que|cada vez/.test(fold(message));
    if (every) {
      return `${com(ageDays)}, se ele acorda toda vez que a chupeta cai, antes de o sono consolidar, a retirada é total e consistente. Tirar em parte e devolver reforça o padrão.\n\nSoltar depois de cerca de dez minutos, com a mandíbula relaxada, pode ser esperado quando ele segue dormindo. Outra situação, diferente desta, é acordar de uma a três vezes na noite pedindo a chupeta: aí você ajuda, porque ele ainda não consegue recolocá-la sozinho, até cerca de cinco a sete meses. Aula: Ensinando o bebê que perde a chupeta e acorda.`;
    }
    return `${com(ageDays)}, a chupeta pode soltar depois de cerca de dez minutos, quando a mandíbula relaxa e o sono aprofunda. Isso é esperado se ele continua dormindo.\n\nSe ele desperta toda vez que ela cai, antes de consolidar o sono, e não consegue retomar, a retirada é total e consistente. Tirar em parte e devolver reforça o padrão.\n\nAcordar de uma a três vezes na noite pedindo a chupeta é outra leitura: você ajuda, porque ele ainda não consegue recolocá-la sozinho, pesando o que isso facilita e o que atrapalha, até cerca de cinco a sete meses. Aula: Ensinando o bebê que perde a chupeta e acorda.`;
  },

  '90_120_em_pe': (ageDays) =>
    `${com(ageDays)}, se ele só dorme em pé no colo, avalie refluxo primeiro. Com sinais, eu não trato isso como questão só de posição: as aulas e os vídeos do pediatra Roberto Franklin e o suporte entram, sem diagnóstico.\n\nSem refluxo, dez a quinze minutos em pé bastam. Depois, volte aos poucos para a horizontal. Se ele já adormece em pé, faça essa passagem ao longo de três a quatro dias, até permanecer relaxado deitado. Espere alguns minutos na horizontal no colo antes do berço. A descida brusca pode ativar o reflexo de defesa, como se estivesse caindo.\n\nNo berço, vá devagar: primeiro os pés no colchão, depois o corpo. A aula mostra essa transição.`,

  '90_120_carrinho': (ageDays) =>
    `${com(ageDays)}, um ou dois passeios por dia cabem bem, de manhã e à tarde, no playground, na calçada ou na praça, sem estourar o sono nem a alimentação.\n\nNo carrinho, ele fica virado para a frente, com o tronco levemente elevado, não totalmente deitado. Assim observa o ambiente e pratica ficar sem colo o tempo todo. Aula: Passeando de carrinho.`,

  '90_120_peito': (ageDays) =>
    `${com(ageDays)}, adormecer durante a mamada pode acontecer. O ajuste é quando ele só consegue dormir no peito e passa a precisar mamar para voltar ao sono.\n\nOrganize o dia: ao acordar de manhã e depois das sonecas, ofereça a mamada. Cerca de uma hora depois, ofereça um reforço. A janela nesta fase gira em torno de 1 hora e 30 minutos, então ele não chega com fome na hora de dormir, e o sono pode começar sem o peito.\n\nNine no colo sem oferecer o peito. No começo ele pode chorar, porque o padrão é outro: segure com segurança, pode andar e, quando der, sentar. Se não permanecer sentada, levante de novo. Faça isso em todas as vezes. Muitos aceitam em dois a três dias; alguns levam um pouco mais. Por volta de três meses a três meses e meio, vale começar. A aula tem o vídeo.`,

  '90_120_andando': (ageDays) =>
    `${com(ageDays)}, se ele só dorme com você andando, o movimento contínuo virou condição para iniciar o sono. O colo, em si, não é o problema.\n\nReduza aos poucos: ande mais devagar, diminua o balanço e, quando ele relaxar, pare por alguns segundos. Se agitar, volte ao movimento leve e reduza de novo. Não alterne entre tirar tudo e voltar ao movimento intenso.\n\nCom consistência, a maioria responde em dois a quatro dias. Se o padrão estiver muito firme, a mudança aparece na primeira semana. A aula mostra essa redução.`,

  '90_120_vacina': (ageDays) =>
    `${com(ageDays)}, depois da vacina o sono e o humor podem mudar por cerca de 24 a 48 horas: mais sonolência, irritação ou mal-estar. Mantenha a rotina no que for possível e acolha mais enquanto ele estiver sensível. Depois desse período, volte à condução habitual. Não transforme esse acolhimento em forma permanente de adormecer.\n\nSe puder escolher o horário, vacine entre 14h e 15h, para o desconforto encontrar a soneca. Se aparecer febre ou dor no local, use somente o antitérmico que o pediatra já indicou, na dose e no intervalo que ele orientou. Eu não prescrevo. Aula: Vacinas.`,

  '90_120_viagem': (ageDays) =>
    `${com(ageDays)}, na viagem o sono fica melhor num berço próprio. Use um berço portátil desmontável. Leve o carrinho: muitas sonecas podem acontecer nele, respeitando as janelas e sem excesso de estímulo.\n\nOrganize antes a alimentação que você já escolheu, com pote térmico e alimentos adequados à idade dele. Aula: Viagem com o bebê.`,
};

function pick(ids, message) {
  const folded = fold(message);
  let list = ORDER.filter((id) => ids.includes(id));
  if (list.includes('90_120_em_pe') && list.includes('90_120_refluxo')) {
    list = list.filter((id) => id !== '90_120_refluxo');
  }
  if (list.includes('90_120_viagem') && !/carrinho|passeio/.test(folded)) {
    list = list.filter((id) => id !== '90_120_carrinho');
  }
  if (!/em pe|no ombro|dorme em pe|so dorme em pe/.test(folded)) {
    list = list.filter((id) => id !== '90_120_em_pe');
  }
  return list.slice(0, 2);
}

const POISON = [
  /sinais de saciedade no rn/gi,
  /45 minutos a 1 hora e 15/gi,
  /mau h[aá]bito/gi,
  /pico glic[eê]mico/gi,
  /salto de desenvolvimento/gi,
  /deixar chorar/gi,
  /sleep training/gi,
  /cry it out/gi,
  /1 hora e 15 minutos/gi,
];

function scrub(text) {
  let out = String(text || '');
  for (const re of POISON) out = out.replace(re, '');
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

export function enrichNinetyOneTwentyOfficialAnswer({ text, message, babyProfile } = {}) {
  const ageDays = babyProfile?.ageDays;
  const ids = matchNinetyOneTwenty(message);
  const chosen = pick(ids, message);
  if (chosen.length) {
      return {
        text: chosen.map((id) => BUILDERS[id](ageDays, message)).join('\n\n'),
        notes: chosen,
      };
  }
  const folded = fold(message);
  if (/sono|soneca|mamad|noite|berco|choro|colo|chupeta/.test(folded)) {
    return {
      text: `${com(ageDays)}, nesta faixa a janela gira em torno de 1 hora e 30 minutos. Me diga se a dúvida é o travesseiro, a soneca que não aconteceu, a chupeta, dormir em pé, o carrinho, o peito, andar, a vacina ou a viagem, que eu aplico a aula correspondente.`,
      notes: ['90_120_frame'],
    };
  }
  const cleaned = scrub(text);
  if (cleaned.length < 80) {
    return {
      text: `${com(ageDays)}, me conta qual é a situação — travesseiro, soneca, chupeta, posição em pé, carrinho, peito, andar, vacina ou viagem — que eu te oriento por esta faixa.`,
      notes: ['90_120_ask'],
    };
  }
  return { text: cleaned, notes: ['90_120_scrub'] };
}
