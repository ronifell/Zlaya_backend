function fold(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function phase60(ageDays) {
  const age = Number(ageDays);
  if (!Number.isFinite(age) || age <= 70) return 'start';
  if (age >= 85) return 'end';
  return 'mid';
}

const CATALOG_60 = [
  {
    id: '60_90_refluxo',
    label: 'Suspeita de refluxo ou APLV',
    re: /refluxo|aplv|arque|regurgit|vomit|ronquinh|ruido na garganta|engasg/,
    themes: ['refluxo_aplv_60_90'],
    priorityText: () =>
      'Não diga à mãe que você não fecha diagnóstico. Suspeita de refluxo ou APLV: aulas e vídeos do pediatra Roberto Franklin e suporte das consultoras, em linguagem acolhedora. Vertical de 20 a 30 minutos; 40 minutos só com sinais de refluxo. Se ela informar diagnóstico de APLV e uso de fórmula, a primeira frase é: Qual fórmula ele está usando atualmente? Com fórmula à base de aminoácidos, de dia cerca de 1 hora e 30 minutos a 2 horas pode ser normal. À noite, depois do primeiro jejum, tente chegar às 3 horas; se não chegar, o mínimo é 2 horas. Não aplique 1 hora e 30 minutos à noite. Se a alimentação é só fórmula, não fale em baixa produção, ordenha nem curso de amamentação.',
  },
  {
    id: '60_90_mamada_sonhos',
    label: 'Mamada dos sonhos',
    re: /mamada dos sonhos|acordar .{0,40}dormindo para (mamar|alimentar)|alimentar .{0,20}dormindo|oferec\w+ .{0,30}enquanto .{0,15}dorm/,
    themes: ['sono_noturno_60_90'],
    priorityText: () =>
      'A mamada dos sonhos não faz parte do método. Não acorde nem alimente de forma preventiva para alongar a madrugada.',
  },
  {
    id: '60_90_saltos',
    label: 'Teoria de salto',
    re: /\bsaltos?\b|marco de desenvolvimento|leap/,
    themes: ['saltos_60_90'],
    priorityText: () =>
      'Não explique a mudança por essa teoria, não preveja duração e não mande só esperar. Investigue rotina, sonecas, mamadas, forma de adormecer, estímulos e desconfortos.',
  },
  {
    id: '60_90_ruido',
    label: 'Ruído branco',
    re: /ruido branco|secador|barulho branco/,
    themes: ['recursos_idade_60_90'],
    priorityText: () =>
      'Ruído branco só se estiver agitado. Se não responder em 1 a 2 minutos, pare. Depois do sono, volume mais baixo e aparelho a cerca de 80 cm.',
  },
  {
    id: '60_90_recursos',
    label: 'Charutinho ou ninho',
    re: /charutinho|charuto|\bninho\b/,
    themes: ['recursos_idade_60_90'],
    priorityText: (ageDays) =>
      Number(ageDays) > 75
        ? 'Charutinho só até cerca de 75 dias: nesta idade já deve ter sido encerrado. Ninho encerra no máximo aos 90 dias. Se o ninho apareceu só como falha de transferência, não responda com esses limites.'
        : 'Charutinho somente até cerca de 75 dias. Ninho até 3 meses, no máximo, e encerrado aos 90 dias. Se o ninho apareceu só como falha de transferência, não responda com esses limites.',
  },
  {
    id: '60_90_meio_janela',
    label: 'Mamada no meio da janela',
    re: /meio da janela|reforco de mamada|mamada de reforco/,
    themes: ['alimentacao_saciedade_60_90'],
    priorityText: () =>
      'A mamada no meio da janela é da faixa seguinte. Não antecipe.',
  },
  {
    id: '60_90_ritual',
    label: 'Ritual noturno',
    re: /ritual|escurecer a casa|apagar a casa|casa toda escura|banho .{0,50}(noite|ritual)/,
    themes: ['ritual_noturno_60_90'],
    priorityText: () =>
      'Ritual: banho, vestir, menos luz, mamada, arroto e vertical, condução. Sem apagar a casa. Sem tempo obrigatório de 5 ou 10 minutos para transferir. Berço acordado não é obrigação em toda soneca.',
  },
  {
    id: '60_90_noite',
    label: 'Sono noturno e jejum',
    re: /madrugada|noturn|a noite|de noite|jejum|dormir a noite|noite inteira|primeira mamada/,
    themes: ['sono_noturno_60_90'],
    priorityText: () =>
      'Responda ao que ela perguntou, sem advertência. Jejum noturno conta de quando ele dorme: cerca de 4 horas no início da faixa e cerca de 6 horas perto dos 90 dias. Não acorde se seguir dormindo. Depois da primeira mamada noturna, cerca de 3 horas ou mais. Se despertar antes, tente reconduzir sem outra mamada. Se faltam mamada efetiva, saciedade, forma de adormecer e desconforto, pergunte antes de orientar. Não diga que não promete noite inteira. Não fale de fralda se ela não perguntou.',
  },
  {
    id: '60_90_chupeta',
    label: 'Chupeta',
    re: /chupeta/,
    themes: ['recursos_idade_60_90'],
    priorityText: () =>
      'Se a chupeta cair e ele continuar dormindo, não recoloque. Se reclamar, observe brevemente e recoloque só se ainda precisar.',
  },
  {
    id: '60_90_sonecas',
    label: 'Janela e sonecas',
    re: /soneca|janela|vigilia|quantas sonecas|hora acordad|tempo acordad/,
    themes: ['janela_sonecas_60_90'],
    priorityText: () =>
      'Janela: cerca de 1 hora e 15 minutos no início da faixa e cerca de 1 hora e 30 minutos perto dos 90 dias, do despertar ao sono efetivo. Soneca até 2 horas. Menos de 2 horas, se acordar bem, segue. Recorrente de 10 a 20 minutos com irritação: investigue.',
  },
  {
    id: '60_90_adormecer',
    label: 'Forma de adormecer',
    re: /so dorme|somente no colo|somente no peito|no peito para dormir|berco acordado|colo para dormir|unica forma|s[oó] no colo|s[oó] no peito/,
    themes: ['forma_adormecer_60_90'],
    priorityText: () =>
      'Mamada efetiva e saciedade antes da forma de adormecer. Se continua no peito só para dormir, retire, arrote e vertical. Não acorde se já dormiu. Amplie aos poucos. Berço acordado não é obrigação em toda soneca.',
  },
  {
    id: '60_90_formula',
    label: 'Volume de fórmula',
    re: /\d+\s*ml|formula|mamadeira/,
    themes: ['alimentacao_saciedade_60_90'],
    priorityText: () =>
      'Fórmula: cerca de 120 ml no início da faixa, evolução gradual, cerca de 150 ml perto dos 90 dias, a cada cerca de 3 horas. Suba 30 ml só se terminar o volume por um dia ou, no máximo, dois. Não obrigue a terminar.',
  },
  {
    id: '60_90_intervalo',
    label: 'Intervalo das mamadas',
    re: /lanchinho|toda hora|intervalo da mamada|intervalo alimentar|mama quase|mamadas curtas|mamada efetiva/,
    themes: ['alimentacao_saciedade_60_90'],
    priorityText: () =>
      'Regra 5.3: se a dúvida é oferecer o peito ao acordar da soneca antes do intervalo, responda só isso. No peito, cerca de 2 horas e 30 minutos desde o início da última mamada. Acordar da soneca não abre nova mamada. Não despeje janela nem forma de adormecer.',
  },
  {
    id: '60_90_inicio_noite',
    label: 'Horário de início da noite',
    re: /19h|20h|21h|22h|inicio da noite|comecar a noite|hora de dormir/,
    themes: ['sono_noturno_60_90', 'ritual_noturno_60_90'],
    priorityText: () =>
      'Referência 19h a 20h, sem rigidez. No início da faixa, tranquilo, pode ir até perto das 22h. Perto dos 90 dias, antecipe aos poucos para 19h–20h.',
  },
  {
    id: '60_90_temperatura',
    label: 'Temperatura',
    re: /temperatura|graus|calor |frio /,
    themes: ['ritual_noturno_60_90'],
    priorityText: () => 'Temperatura de conforto em torno de 24 °C, junto com roupas e sinais de desconforto térmico.',
  },
  {
    id: '60_90_prematuro',
    label: 'Prematuro',
    re: /prematur|idade corrigida|idade gestacional/,
    themes: ['janela_sonecas_60_90'],
    priorityText: () => 'Para prematuro, use a idade cronológica em dias, não a idade corrigida.',
  },
  {
    id: '60_90_fralda',
    label: 'Fralda à noite',
    re: /fralda/,
    themes: ['sono_noturno_60_90'],
    priorityText: () => 'À noite, troque a fralda só se houver cocô, vazamento ou outra necessidade objetiva.',
  },
];

const CATALOG_90 = [
  {
    id: '90_120_refluxo',
    label: 'Refluxo antes da posição',
    re: /refluxo|aplv|arque|regurgit|vomit/,
    themes: ['dormir_em_pe_90_120'],
    priorityText: () =>
      'Não diagnostique. Com sinais de refluxo, indique as aulas e os vídeos do pediatra Roberto Franklin e o suporte. Não reduza a posição em pé como se não houvesse desconforto.',
  },
  {
    id: '90_120_travesseiro',
    label: 'Travesseiro',
    re: /travesseiro/,
    themes: ['travesseiro_90_120'],
    priorityText: () =>
      'Travesseiro só no início do sono, atravessado, do quadril para cima, nunca só a cabeça. Não fica a noite toda. Mande assistir à aula.',
  },
  {
    id: '90_120_soneca',
    label: 'Soneca que não aconteceu',
    re: /nao dormiu a soneca|nao fez a soneca|sem soneca|nao quis dormir a soneca|nao conseguiu dormir a soneca|soneca nao/,
    themes: ['soneca_perdida_90_120'],
    priorityText: () =>
      'Um dia sem soneca pode acontecer. Não insista naquele momento. Reduza estímulos. Se virar padrão, revise janela, estímulo, mamadas e desconforto.',
  },
  {
    id: '90_120_chupeta',
    label: 'Chupeta',
    re: /chupeta/,
    themes: ['chupeta_90_120'],
    priorityText: () =>
      'Cair depois de cerca de dez minutos pode ser esperado. Se acorda toda vez que cai, antes de consolidar, a retirada é total e consistente. Um a três despertares pedindo a chupeta: a mãe ajuda até ele conseguir pegá-la, por volta de cinco a sete meses.',
  },
  {
    id: '90_120_em_pe',
    label: 'Dorme em pé no colo',
    re: /em pe|no ombro|posicao vertical|so dorme em pe|dorme em pe/,
    themes: ['dormir_em_pe_90_120'],
    priorityText: () =>
      'Avalie refluxo primeiro. Sem refluxo, dez a quinze minutos em pé bastam; volte à horizontal ao longo de três a quatro dias; pés primeiro no colchão.',
  },
  {
    id: '90_120_carrinho',
    label: 'Carrinho e passeio',
    re: /carrinho|passeio|passear|playground|calcada/,
    themes: ['carrinho_90_120'],
    priorityText: () =>
      'Um ou dois passeios por dia. No carrinho, virado para a frente, tronco levemente elevado, respeitando sono e alimentação.',
  },
  {
    id: '90_120_peito',
    label: 'Dormir no peito',
    re: /dorme no peito|dormir no peito|so no peito|mama para dormir|peito para dormir|reforco/,
    themes: ['dormir_peito_90_120'],
    priorityText: () =>
      'Mamada ao acordar e reforço cerca de uma hora depois. Janela em torno de 1 hora e 30 minutos. Conduza o sono no colo sem o peito, em todas as vezes.',
  },
  {
    id: '90_120_andando',
    label: 'Só dorme andando',
    re: /andando|balanco|so dorme se eu and|caminhando com ele|so se eu estiver andando/,
    themes: ['dormir_andando_90_120'],
    priorityText: () =>
      'Reduza o movimento aos poucos. Não alterne retirada total e movimento intenso. A maioria responde em dois a quatro dias.',
  },
  {
    id: '90_120_vacina',
    label: 'Vacina',
    re: /vacina/,
    themes: ['vacina_90_120'],
    priorityText: () =>
      'Mudança de sono por cerca de 24 a 48 horas. Acolha e depois retome a condução. Não crie forma permanente de adormecer. Se puder, vacine entre 14h e 15h. Não prescreva dose.',
  },
  {
    id: '90_120_viagem',
    label: 'Viagem',
    re: /viagem|viajar|berco portatil|aviao|hotel/,
    themes: ['viagem_90_120'],
    priorityText: () =>
      'Berço próprio portátil, carrinho para as sonecas e a alimentação que a família já escolheu, em pote térmico.',
  },
];

function matchCatalog(catalog, text) {
  const folded = fold(text);
  return catalog.filter((item) => item.re.test(folded));
}

export function matchSixtyNinety(text) {
  return matchCatalog(CATALOG_60, text).map((item) => item.id);
}

export function matchNinetyOneTwenty(text) {
  return matchCatalog(CATALOG_90, text).map((item) => item.id);
}

export function collectLaterBandSignals({ text, ageDays, band }) {
  const catalog = band === '90_120' ? CATALOG_90 : CATALOG_60;
  const hits = matchCatalog(catalog, text);
  return {
    signals: hits.map((item) => ({ id: item.id, label: item.label, matched: [item.id] })),
    boostThemes: [...new Set(hits.flatMap((item) => item.themes))],
    priorities: hits.map((item) => item.priorityText(ageDays)),
    hasDirectiveSignal: hits.length > 0,
  };
}

export { fold, phase60 };
