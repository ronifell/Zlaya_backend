/**
 * Contextual signal extractor.
 *
 * Reads the mother's message (and recent conversation) and surfaces the
 * high-weight methodological signals that the test feedback asked us to give
 * extra importance to. Its output is consumed by:
 *   - retrieval (to boost chunks whose theme matches a detected signal)
 *   - the decision router (to know when context is already rich)
 *   - the prompt builder (to inject "SINAIS RELEVANTES", "CONTEXTO JÁ
 *     FORNECIDO" and "JÁ EM USO PELA MÃE" blocks so the LLM stops asking
 *     for things the mother already answered and stops re-suggesting things
 *     she already does).
 *
 * Everything here is deterministic keyword matching — no LLM call — so it is
 * cheap, auditable and runs on every turn.
 */

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * High-weight conversational signals. Each one:
 *   - matches one or more phrases the mother might use
 *   - boosts a set of chunk THEMES during retrieval
 *   - injects a methodological PRIORITY line into the prompt
 */
const SIGNAL_DEFS = [
  {
    id: 'asks_if_normal',
    label: 'Mãe pergunta diretamente se o comportamento é normal para a idade',
    directive: true,
    phrases: [
      'isso e normal', 'isso é normal', 'e normal pra idade', 'é normal pra idade',
      'e normal para a idade', 'é normal para a idade', 'e normal nessa idade',
      'é normal nessa idade', 'e normal nessa fase', 'é normal nessa fase',
      'isso e esperado', 'isso é esperado', 'isso e comum', 'isso é comum',
      'e comum nessa idade', 'é comum nessa idade',
    ],
    boostThemes: [],
    priority:
      'TESTE 001 — A mãe perguntou EXPLICITAMENTE se o comportamento é normal pra idade. A PRIMEIRA FRASE da sua resposta DEVE responder essa pergunta de forma direta e metodológica, antes de qualquer acolhimento. PROIBIDO abrir com "É compreensível que você esteja preocupada", "Entendo a sua preocupação", "Imagino o quanto isso é desafiador" ou similares — esses recursos podem entrar DEPOIS da resposta direta, jamais antes. Formatos aceitos para a primeira frase (escolha o mais adequado ao caso): "Sim — esse padrão pode ocorrer no RN nessa fase e o método trata como questão alimentar, não comportamental." | "Em parte sim — é comum no RN, mas merece investigação alimentar (transferência e produção de leite no fim do dia/noite)." | "Sim, é esperado nessa fase, e a leitura metodológica é alimentar — não associação negativa." Só DEPOIS dessa frase direta vêm: (a) acolhimento/validação se necessário, (b) hipótese principal nomeada, (c) conduta prática, (d) investigação complementar. Começar com "É compreensível..." antes da resposta direta é erro de clareza pela rubrica oficial.',
  },
  {
    id: 'asks_how_to_improve',
    label: 'Mãe pergunta como melhorar / como ajustar',
    directive: true,
    phrases: [
      'como posso melhorar', 'como devo ajustar', 'como ajustar', 'como melhorar',
      'o que posso fazer', 'como devo proceder', 'como resolver', 'como consigo resolver',
      'como faço para melhorar', 'como posso ajustar',
    ],
    boostThemes: ['padrao_vespertino', 'dificuldade_berco', 'acorda_ao_deitar', 'mamadas_ineficientes'],
    priority:
      'A mãe pediu conduta prática ("como melhorar/ajustar"). NÃO responda só com investigação — entregue na ORIENTAÇÃO PRÁTICA a SEQUÊNCIA NOTURNA OFICIAL: (1) mamada o mais efetiva possível; (2) oferecer o segundo peito se necessário; (3) observar sinais de saciedade (listar os 6); (4) colocar para arrotar; (5) manter em posição vertical 30 a 40 minutos; (6) ambiente escuro, calmo e com baixa estimulação; (7) charutinho se houver reflexo de Moro ou desorganização corporal; (8) só então tentar a transferência para o berço. Se houver desconforto ao deitar (choro na transferência, dificuldade de arrotar), verbalize explicitamente a hipótese de desconforto leve pós-mamada ao deitar.',
  },
  {
    id: 'evening_pattern',
    label: 'Piora no final do dia / após as 18h',
    directive: true,
    phrases: [
      'depois das 18', 'apos as 18', 'apos 18', 'após 18', 'a partir das 18',
      '18h', '18 horas', 'das 18', 'final do dia', 'fim do dia',
      'final da tarde', 'fim da tarde', 'no fim da tarde', 'fim de tarde',
      'a noite piora', 'piora a noite', 'piora de noite', 'piora a tarde',
      'comeca a noite', 'comeca de noite', 'entardecer', 'anoitecer',
      'hora da bruxa', 'final do dia ele', 'no final do dia',
    ],
    boostThemes: [
      'padrao_vespertino',
      'busca_excessiva_peito',
      'mamadas_ineficientes',
      'baixa_producao_leite',
      'irritabilidade_final_tarde',
    ],
    priority:
      'A piora no final do dia (após as 18h) é um padrão vespertino típico no RN. NOMEIE a hipótese principal de forma direta: "A principal hipótese é baixa transferência de leite ou menor produção materna no final do dia/noite." Use o ENQUADRAMENTO METODOLÓGICO OFICIAL em SEIS pontos: (1) produção de leite da mãe no fim da tarde/noite; (2) efetividade da transferência (sucção ativa, deglutição, sinais de saciedade); (3) necessidade de sucção do RN; (4) tempo em posição vertical após a mamada (30 a 40 min); (5) motivo do despertar imediato ao ser transferido para o berço, se houver — incluindo desconforto leve pós-mamada ao deitar quando houver dificuldade de arrotar e choro na transferência; (6) tranquilizar explicitamente a mãe sobre o receio de associação negativa (no RN essa leitura não se aplica). Se a mãe perguntou "como melhorar", entregue a SEQUÊNCIA PRÁTICA NOTURNA (mamada efetiva → segundo peito → saciedade → arroto → vertical 30-40 min → ambiente calmo → charutinho se Moro → transferência). A Estratégia do Travesseiro só como apoio secundário — NÃO como eixo principal quando alimentação/arroto/desconforto forem prioritários. APROFUNDAR a investigação da produção noturna com pergunta concreta — escolha uma: (i) "No fim da tarde/noite, você percebe os seios mais flácidos ou com menor enchimento? Durante a mamada, ele faz sucção ativa e você escuta deglutição, ou adormece rapidamente? Depois que solta o peito, relaxa e permanece tranquilo, ou volta a procurar o peito em pouco tempo?"; (ii) "Nas mamadas após as 18h, você consegue ouvir a deglutição?"; (iii) ordenha de avaliação no fim do dia vs. manhã; (iv) quando houver complemento: "O complemento foi orientado apenas para as mamadas da noite, ou já foi avaliada a necessidade de suporte também no final da tarde, quando o comportamento começa?".',
  },
  {
    id: 'night_production_drop',
    label: 'Piora à noite/madrugada e manhã melhor (queda de produção no fim do dia/noite)',
    directive: true,
    phrases: [
      'piora na madrugada', 'piora de madrugada', 'madrugada dificil', 'madrugada difícil',
      'na madrugada', 'de madrugada', 'a noite procura mais', 'a noite quer mais',
      'de manha melhora', 'de manhã melhora', 'manha mais tranquila', 'manhã mais tranquila',
      'manhas tranquilas', 'manhãs tranquilas', 'madrugadas dificeis', 'madrugadas difíceis',
      'manha e mais tranquila', 'manhã é mais tranquila', 'de manha e tranquila', 'pela manha melhora',
      'comeca no fim da tarde e piora a noite', 'a tarde e a noite procura mais',
    ],
    boostThemes: [
      'baixa_producao_leite',
      'baixa_producao_fim_dia',
      'mamadas_ineficientes',
      'busca_excessiva_peito',
      'padrao_vespertino',
    ],
    priority:
      'NOMEIE a hipótese principal de forma direta, com esta leitura: "Pelo horário em que isso começa — final da tarde, madrugada difícil e manhã mais tranquila — a principal hipótese é baixa produção OU menor transferência de leite no período final do dia/noite, mesmo com complemento." Não leia como desorganização do sono. Se houver complemento com sonda, dê peso a isso: oriente reavaliar com quem acompanha a amamentação e o pediatra se o complemento precisa ser ajustado também no FINAL DA TARDE (não só 22h/madrugada). Inclua suporte à produção: oferta dos dois seios, ordenha como ferramenta de avaliação (nunca solução isolada) e acompanhamento de amamentação. APROFUNDE a investigação da produção de leite especificamente no PERÍODO NOTURNO — pergunte concretamente: (a) como os seios ficam ao final da tarde; (b) deglutição audível na mamada após as 18h; (c) volume de ordenha de avaliação no fim do dia vs. manhã; (d) "O complemento foi orientado apenas para as mamadas da noite, ou já foi avaliada a necessidade de suporte também no final da tarde, quando o comportamento começa?". Investigue transferência efetiva e produção materna nesse período. Nessa fase, NÃO force intervalo de 2h se houver sinais de fome/saciedade insuficiente — prioridade é garantir a ingestão (livre demanda).',
  },
  {
    id: 'short_feeding_interval',
    label: 'Procura o peito em intervalo curto (< 2h)',
    directive: true,
    phrases: [
      'antes de 2 horas', 'antes de duas horas', 'menos de 2 horas', 'menos de duas horas',
      'a cada 1 hora', 'a cada uma hora', 'a cada hora', 'de hora em hora',
      'quer mamar toda hora', 'quer mamar o tempo todo', 'mama de hora em hora',
      'procura o peito antes de', 'logo apos mamar quer de novo', 'logo após mamar quer de novo',
      'quer mamar de novo logo', 'volta a querer mamar logo',
    ],
    boostThemes: ['baixa_producao_leite', 'baixa_producao_fim_dia', 'mamadas_ineficientes', 'busca_excessiva_peito'],
    priority:
      'Procurar o peito em intervalo menor que 2h, especialmente à tarde/noite, sugere INGESTÃO/SACIEDADE insuficiente: investigue PRIMEIRO a transferência de leite (mamada efetiva) e a produção materna, antes de qualquer leitura comportamental. Não force intervalo de 2h se o bebê estiver com sinais de necessidade.',
  },
  {
    id: 'feeding_clinical_context',
    label: 'Contexto que afeta a transferência de leite (icterícia, linguinha, sonda, complemento)',
    directive: true,
    phrases: [
      'ictericia', 'icterícia', 'amarelao', 'amarelão', 'amarelinho', 'fototerapia',
      'linguinha', 'lingua presa', 'língua presa', 'frenulo', 'frênulo', 'freio lingual', 'frenotomia',
      'sonda', 'translactacao', 'translactação', 'relactacao', 'relactação',
      'complemento', 'complementa', 'formula complementar', 'fórmula complementar', 'complementacao', 'complementação',
      'prematuro', 'baixo peso', 'nao ganha peso', 'não ganha peso', 'pouco ganho de peso',
    ],
    boostThemes: ['mamadas_ineficientes', 'baixa_producao_leite', 'baixa_producao_fim_dia'],
    priority:
      'Há contexto de icterícia, linguinha/frênulo, sonda ou complemento. REGRA CRÍTICA: se a mãe informou que o bebê AGORA mama bem, é PROIBIDO citar icterícia ou linguinha como fator que impacta a transferência ou a mamada no contexto ATUAL — trate APENAS como histórico do início. NÃO abra a resposta explicando icterícia/linguinha como causa do comportamento atual. COMPLEMENTO COM SONDA é, por si só, indicador de BAIXA PRODUÇÃO MATERNA ou necessidade de suporte de produção — NOMEIE explicitamente: "Como sua bebê já recebe complemento com sonda, isso indica baixa produção materna ou necessidade de suporte de produção". O déficit pode ocorrer também DURANTE O DIA (não só à noite) e gerar madrugada mais instável. Oriente: (a) avaliar complemento também durante o dia; (b) avaliar suporte no final da tarde quando o comportamento começa; (c) ORDENHAS como estratégia para estimular a produção materna; (d) oferta dos dois seios; (e) livre demanda quando houver sinais de fome; (f) posição vertical 30 a 40 min; (g) acompanhamento de amamentação. PERGUNTAS OBRIGATÓRIAS: "O complemento foi orientado apenas para as mamadas da noite, ou já foi avaliada a necessidade de suporte também no final da tarde e durante o dia?" e "Você está fazendo ordenhas para estimular a produção?" e "Durante o dia, ela também apresenta sinais de buscar peito em menos de 2h ou dificuldade de sustentar as mamadas?". Não oriente alteração de complemento por conta própria.',
  },
  {
    id: 'prolonged_awake_after_feed',
    label: 'Período acordado prolongado após a mamada (ex.: após a mamada da noite/21h)',
    directive: true,
    phrases: [
      'fica acordado', 'acordado por 2', 'acordado 2 a 3', 'acordado por 3', 'acordado depois da mamada',
      'acordado apos a mamada', 'acordado após a mamada', 'acordado depois de mamar', 'nao dorme depois de mamar',
      'não dorme depois de mamar', 'depois de mamar fica acordado', 'continua acordado depois de mamar',
      'mamada das 21', 'mamada das 22', 'mamada das 20', 'mamada da noite', 'mamada do fim da noite',
      'horas acordado', 'fica desperto depois', 'nao relaxa depois de mamar', 'não relaxa depois de mamar',
    ],
    boostThemes: ['baixa_producao_fim_dia', 'mamadas_ineficientes', 'busca_excessiva_peito', 'baixa_producao_leite'],
    priority:
      'Período acordado prolongado após a mamada da noite (ex.: 21h) no RN NÃO deve ser normalizado como "esperado". Investigue PRIMEIRO a eficácia da mamada e a saciedade — o bebê pode seguir acordado por não ter ficado saciado (RN nem sempre demonstra fome com choro) e pela queda de produção/transferência no período noturno. Oriente observar se ele relaxa e solta o peito após mamar ou continua procurando. Só tranquilize depois de investigar e na ausência de sinais de necessidade/desconforto.',
  },
  {
    id: 'rn_night_waking',
    label: 'RN acorda à noite / pergunta sobre intervalo noturno',
    directive: true,
    phrases: [
      // explicit night-waking phrases
      'acorda a noite', 'acorda à noite', 'acorda de noite', 'acorda de madrugada',
      'desperta a noite', 'desperta à noite', 'desperta de noite', 'desperta de madrugada',
      'acordou a noite', 'acordou à noite', 'acordou de madrugada', 'acordou de noite',
      'fica acordado de noite', 'fica acordada de noite',
      // specific clock times that anchor a night-waking scenario
      'acorda as 23', 'acordou as 23', 'acorda as 22', 'acordou as 22',
      'acorda as 00', 'acordou as 00', 'acorda as 01', 'acordou as 01',
      'acorda as 02', 'acordou as 02', 'acorda as 03', 'acordou as 03',
      'acorda 23h', 'acordou 23h', 'acorda 22h', 'acordou 22h',
      // canonical pattern: "dormiu de Xh e acordou às Yh" (the 12d case)
      'dormiu de 19', 'dormiu de 20', 'dormiu desde as 19', 'dormiu desde as 20',
      'dormiu por volta de 19', 'dormiu por volta de 20',
      'pegou no sono as 19', 'pegou no sono as 20',
      'comecou a dormir as 19', 'comecou a dormir as 20',
      // night intervals doubt
      'intervalo noturno', 'intervalo da noite', 'acordar para mamar a noite',
      'acordar de madrugada para mamar', 'pode dormir mais de 3 horas a noite',
      'pode ficar 3 horas sem mamar a noite', 'fica 4 horas sem mamar a noite',
      'a noite ele dorme mais', 'a noite ela dorme mais', 'a noite dorme mais',
    ],
    boostThemes: [
      'despertar_noturno_investigar_fome',
      'intervalos_alimentacao',
      'acordar_para_mamar_dia',
      'mamadas_ineficientes',
      'baixa_producao_leite',
    ],
    priority:
      'À NOITE, o intervalo NÃO é rígido: se o RN está dormindo bem, intervalos maiores são aceitáveis. MAS quando o RN ACORDA à noite, é INDISPENSÁVEL investigar fome. Entregue a SEQUÊNCIA PRÁTICA OFICIAL: (1) oferecer a mamada quando ele acorda; (2) observar se mama com sinais de fome — sucção ativa, deglutição, busca avida pelo peito; (3) se houver fome, alimentar (livre demanda); (4) manter em POSIÇÃO VERTICAL POR 30 A 40 MINUTOS após a mamada para evitar volta do leite/refluxo; (5) só então transferir para o berço. PERGUNTAS OBRIGATÓRIAS quando ainda não respondidas: "Quando ele/ela acorda à noite, você oferece a mamada?" e "Ele/ela mama como se estivesse com fome (sucção ativa, deglutição)?". NÃO oriente a mãe a "segurar" ou "aguardar" o próximo horário se o bebê acordou. NÃO repita a regra rígida diurna ("a cada 2h-2h30") como se valesse para a noite.',
  },
  {
    id: 'long_daytime_nap',
    label: 'Soneca diurna longa / dúvida sobre acordar para mamar',
    directive: true,
    phrases: [
      'soneca de 4', 'soneca de 3', 'dormiu 4 horas', 'dormiu 3 horas', 'dorme 4 horas',
      'dorme 3 horas', 'dormindo ha 4', 'dormindo há 4', 'dorme muito de dia', 'dorme demais de dia',
      'soneca longa', 'soneca muito longa', '4 horas de soneca', '3 horas de soneca',
      'devo acordar', 'preciso acordar', 'posso acordar', 'tenho que acordar', 'acordar para mamar',
      'deixar dormir', 'quanto tempo pode ficar sem mamar', 'pode ficar sem mamar',
      '4 horas sem mamar', '3 horas sem mamar', 'intervalo de mamada durante o dia',
    ],
    boostThemes: ['acordar_para_mamar_dia', 'intervalos_alimentacao'],
    priority:
      'Para dúvida de soneca diurna no RN: sonecas de 2h30 a 3h podem ser ESPERADAS nessa fase — RESPONDA DIRETAMENTE que não é necessário diminuir automaticamente. Acima disso (3h30/4h) DURANTE O DIA, oriente acordar para oferecer a mamada (peito ~2h-2h30 a 3h; fórmula ~3h). À noite a regra é outra e depende de idade, peso, ganho e orientação do pediatra. NÃO use "afetar o sono noturno" como critério principal e NÃO investigue berço, arroto ou posição vertical se a mãe não relatou desconforto/refluxo.',
  },
  {
    id: 'crib_ok_day_problem_night',
    label: 'Aceita o berço durante o dia, problema só à noite (foco em mamada noturna, não em berço)',
    directive: true,
    phrases: [
      'sonecas no berco', 'sonecas todas no berco', 'todas as sonecas no berco',
      'faz as sonecas no berco', 'dorme no berco de dia', 'aceita o berco de dia',
      'aceita berco no dia', 'durante o dia dorme no berco', 'de dia fica no berco',
      'a noite nao quer ficar no berco', 'a noite nao fica no berco',
      'noite nao quer o berco', 'a noite nao aceita o berco',
      'so nao aceita o berco a noite', 'so a noite nao quer o berco',
      'leva-lo para o meu quarto', 'levo para o meu quarto', 'leva para o quarto',
      'tenho que pegar a noite', 'tenho que pega-lo', 'tenho que pega lo',
    ],
    boostThemes: [
      'baixa_producao_fim_dia',
      'baixa_producao_leite',
      'mamadas_ineficientes',
      'padrao_vespertino',
      'busca_excessiva_peito',
    ],
    priority:
      'PADRÃO DIAGNÓSTICO CRÍTICO: bebê faz sonecas no berço DURANTE O DIA mas NÃO permanece no berço à NOITE. Isso significa que o berço NÃO é o problema central — a hipótese prioritária é MAMADA NOTURNA INSUFICIENTE OU BAIXA PRODUÇÃO MATERNA NO PERÍODO DA NOITE. A IA NÃO deve abrir por adaptação ao berço, Moisés, Estratégia do Travesseiro ou reflexo de Moro. NOMEIE diretamente: "Como ele/ela aceita o berço durante o dia, o problema não é adaptação ao berço — a primeira coisa a investigar é a mamada noturna e a produção de leite nesse período." HIERARQUIA OBRIGATÓRIA: (1) mamada noturna — pergunte EXPLICITAMENTE: "Antes de tentar colocá-lo no berço à noite, ele mama? Como é essa mamada? Ele parece ficar satisfeito ou continua procurando o peito?"; (2) possível baixa produção de leite no período da noite; (3) sinais de saciedade; (4) tempo em posição vertical (30 a 40 min); (5) arroto; (6) refluxo/desconforto; (7) reflexo de Moro; (8) só por último berço/Travesseiro. PERGUNTA OBRIGATÓRIA também: "Ele mama no peito, fórmula ou os dois?".',
  },
  {
    id: 'night_hunger_signs_rn',
    label: 'Sinais clássicos de fome no RN à noite (suga mãozinhas, fica nervoso, choraminga)',
    directive: true,
    phrases: [
      'suga as mãozinhas', 'suga as maozinhas', 'sugando as maozinhas', 'sugando as mãozinhas',
      'suga a mao', 'suga a mão', 'leva a mao a boca', 'leva a mão à boca',
      'chupa a maozinha', 'chupa a mãozinha', 'chupa as mãos', 'chupa as maos',
      'fica nervosa', 'fica nervoso', 'muito nervosa', 'muito nervoso',
      'chorammingando', 'choramingando', 'choraminga', 'choraminga e nervos',
      'nervosa sugando', 'nervoso sugando', 'agitada sugando', 'agitado sugando',
      'inquieta sugando', 'inquieto sugando',
      '23h as 02h', '23h às 02h', '23 as 02', '23 às 02',
      '23h as 2h', '23h às 2h', 'das 23 ate as 2', 'das 23 às 2',
      'meia noite as 2', 'meia-noite as 2',
    ],
    boostThemes: [
      'baixa_producao_leite',
      'baixa_producao_fim_dia',
      'mamadas_ineficientes',
      'busca_excessiva_peito',
      'despertar_noturno_investigar_fome',
    ],
    priority:
      'SINAIS CLÁSSICOS DE FOME NO RN detectados (sugar mãozinhas + nervoso/agitado + choramingo, especialmente entre 23h e 02h). Esse conjunto é SINAL CLARO DE FOME, não desorganização do sono nem agitação genérica. PERGUNTAS INDISPENSÁVEIS (faça antes de qualquer outra hipótese): "Nesse horário, ela já mamou?" e "Esse comportamento de ficar nervosa, sugar as mãozinhas e choramingar acontece ANTES ou DEPOIS da mamada?". Use esta árvore: (a) se ANTES da mamada → prioridade é alimentar imediatamente (livre demanda); (b) se DEPOIS da mamada → investigar se a mamada foi efetiva (sucção ativa, deglutição), produção de leite no período, sinais de saciedade, conforto após arroto, posição vertical por 30 a 40 minutos. NÃO presuma ordenha nem complemento se a mãe não informou — só sugira de forma CONDICIONAL ("se confirmar baixa produção, pode-se considerar ordenha como ferramenta de avaliação"). NÃO normalize o comportamento como "comum no RN" sem antes investigar fome.',
  },
  {
    id: 'asks_nap_duration_rn',
    label: 'Mãe pergunta se a soneca está longa demais / se deve diminuir',
    directive: true,
    phrases: [
      'soneca de 3 horas esta muito', 'soneca de 3 horas está muito',
      'sonecas de 3 horas esta muito', 'sonecas de 3 horas está muito',
      'sonecas com duracao de 3 horas', 'sonecas com duração de 3 horas',
      'devo diminuir', 'tenho que diminuir', 'preciso diminuir',
      'soneca esta longa demais', 'soneca está longa demais',
      'sonecas estao longas demais', 'sonecas estão longas demais',
      'soneca muito longa', 'esta dormindo demais', 'está dormindo demais',
      'duracao da soneca', 'duração da soneca',
      'janela de 1h acordada', 'janela de 1 hora acordada', '1h acordada',
      'segue janelas', 'sigo janelas', 'janelas de sono',
    ],
    boostThemes: ['intervalos_alimentacao', 'acordar_para_mamar_dia'],
    priority:
      'A mãe perguntou DIRETAMENTE se a soneca de 3h está longa demais e se deve diminuir. RESPONDA DIRETAMENTE na PRIMEIRA frase do bloco prático: "Para um RN nessa fase, sonecas de 2h30 a 3h podem ser esperadas — não é necessário diminuir automaticamente." Só DEPOIS conduza a investigação do comportamento que está incomodando (ex.: nervosismo entre 23h e 02h, que é sinal de fome). NÃO transforme a dúvida sobre duração da soneca em desvio para outra hipótese sem antes responder diretamente. Para o RN, "janelas de sono" rígidas não são o eixo do método — o ritmo é livre demanda e observação dos sinais da bebê.',
  },
  {
    id: 'breast_soothing',
    label: 'Só se acalma / só dorme no peito',
    phrases: [
      'so se acalma no peito', 'so acalma no peito', 'so dorme no peito',
      'so dorme mamando', 'so se acalma mamando', 'so acalma mamando',
      'volta pro peito', 'volta para o peito', 'retornar ao peito',
      'voltar ao peito', 'retorna ao peito', 'volta ao peito',
      'so consigo acalmar no peito', 'so para de chorar no peito',
      'so relaxa no peito', 'so fica bem no peito', 'precisa do peito o tempo todo',
      'quer mamar o tempo todo', 'so quer o peito',
    ],
    boostThemes: ['busca_excessiva_peito', 'mamadas_ineficientes', 'baixa_producao_leite'],
    priority:
      'A necessidade constante de retornar ao peito para se acalmar exige investigar PRIMEIRO a eficácia alimentar (mamada efetiva, saciedade, produção de leite) antes de qualquer leitura comportamental. No RN, isso NÃO é associação negativa de sono.',
  },
  {
    id: 'late_crib_placement',
    label: 'Só consegue colocar no berço de madrugada',
    directive: true,
    phrases: [
      'depois da 1h', 'depois da uma', 'depois da meia noite', 'depois da meia-noite',
      'so consigo colocar no berco depois', 'so coloco no berco depois',
      'so vai pro berco depois', 'apos a 1h da manha', 'depois da 1 da manha',
      '1h da manha', 'uma da manha', 'so dorme no berco de madrugada',
      'so vai pro berco de madrugada', 'so coloco no moises depois', 'so vai pro moises depois',
      'so consigo colocar no moises depois',
    ],
    boostThemes: [
      'dificuldade_berco',
      'acorda_ao_deitar',
      'reflexo_moro',
      'baixa_producao_fim_dia',
      'mamadas_ineficientes',
      'baixa_producao_leite',
    ],
    priority:
      'Conseguir colocar o bebê no berço/Moisés apenas na madrugada NÃO é "normal da idade" — é sinal para investigação obrigatória, em duas camadas: (a) ALIMENTAÇÃO no fim do dia/noite — eficácia/transferência da mamada e produção materna nesse período; (b) MEDIDAS POSTURAIS pós-mamada — oriente EXPLICITAMENTE manter o bebê em POSIÇÃO VERTICAL POR 30 A 40 MINUTOS após a mamada antes de tentar colocá-lo no berço, com arroto estimulado, transição calma e contida. NÃO resolva apenas recolocando chupeta nem ajustando berço. NÃO oriente "manter a chupeta presa".',
  },
  {
    id: 'wakes_on_transfer',
    label: 'Desperta ao ser colocado no berço',
    directive: true,
    phrases: [
      'desperta ao ser colocado', 'acorda quando coloco', 'acorda ao ser colocado',
      'acorda ao deitar', 'acorda quando deito', 'desperta ao deitar',
      'acorda ao colocar no berco', 'acorda assim que coloco', 'desperta assim que coloco',
      'acorda na transferencia', 'acorda ao colocar', 'desperta quando coloco',
      'acorda assim que deito', 'acorda no berco',
      'coloco no berco desperta', 'coloco no berco e desperta', 'assim que coloco no berco',
      'nao deixa colocar para arrotar', 'nao deixa colocar pra arrotar',
      'dificuldade para arrotar', 'dificuldade de arrotar',
    ],
    boostThemes: ['acorda_ao_deitar', 'dificuldade_berco', 'reflexo_moro'],
    priority:
      'O despertar na transferência para o berço segue a hierarquia: (1) tempo vertical após a mamada, (2) arroto, (3) reflexo de Moro, (4) adaptação à superfície, (5) refluxo/desconforto pós-mamada ao deitar. VERBALIZAÇÃO OBRIGATÓRIA: quando houver dificuldade de arrotar, choro logo ao colocar no berço ou melhora ao voltar ao peito/colo, a resposta DEVE conter uma frase explícita do tipo "isso pode indicar desconforto leve pós-mamada ao deitar" ou "o bebê pode estar sentindo desconforto ao deitar após a mamada" — não basta orientar a posição vertical, é preciso NOMEAR a hipótese de desconforto ao deitar. Oriente EXPLICITAMENTE manter em POSIÇÃO VERTICAL POR 30 A 40 MINUTOS após a mamada antes da transição. Se a mãe perguntou "como melhorar", inclua a sequência prática noturna completa. A Estratégia do Travesseiro só como apoio secundário, não eixo principal.',
  },
  {
    id: 'mama_bem_with_concurrent_symptoms',
    label: '"Mama bem" relatado + sinais concorrentes (não considerar mamada resolvida)',
    directive: true,
    // Matched in a second pass (see post-processing below); this entry is
    // here only for prompt/metadata symmetry.
    phrases: [],
    boostThemes: ['mamadas_ineficientes', 'baixa_producao_leite', 'baixa_producao_fim_dia'],
    priority:
      '"Mama bem" foi relatado pela mãe MAS existem sinais concorrentes no caso (sonecas curtas, despertar ao deitar, irritabilidade pós-mamada, busca pelo peito antes de 2h, piora no fim do dia/madrugada). NÃO considere a alimentação resolvida. Acione DUAS CAMADAS obrigatórias na resposta: (1) avaliação de mamada efetiva e produção materna no período (sucção ativa, deglutição, sinais de saciedade, comportamento após soltar o peito); (2) medidas posturais pós-mamada (POSIÇÃO VERTICAL 30 A 40 MIN, arroto, transição calma para o berço).',
  },
  {
    id: 'pacifier_in_rn',
    label: 'Queixa envolvendo chupeta no RN',
    directive: true,
    phrases: [
      'chupeta cai', 'a chupeta cai', 'chupeta sai', 'chupeta solta', 'cuspir a chupeta',
      'cospe a chupeta', 'perde a chupeta', 'acorda quando a chupeta cai',
      'recoloco a chupeta', 'reponho a chupeta', 'fico recolocando a chupeta',
      'precisa da chupeta para dormir', 'so dorme com a chupeta', 'so dorme com chupeta',
      'usa chupeta', 'damos chupeta', 'dou chupeta', 'oferecemos chupeta',
    ],
    boostThemes: [
      'busca_excessiva_peito',
      'mamadas_ineficientes',
      'baixa_producao_leite',
      'baixa_producao_fim_dia',
      'acorda_ao_deitar',
      'dificuldade_berco',
      'reflexo_moro',
    ],
    priority:
      'Queixa envolvendo chupeta no RN (0–28 dias) é REFLEXO DE SUCÇÃO e NECESSIDADE DE REGULAÇÃO — use esses termos explicitamente na resposta. PERGUNTA OBRIGATÓRIA sobre forma de alimentação se a mãe não informou: "Ela mama no peito, usa fórmula ou recebe complemento?" — é proibido orientar "ofereça o peito" antes dessa confirmação. MANEJO PRÁTICO: se a chupeta cair e o bebê continuar dormindo, não precisa recolocar; se acordar logo que cai, diferencie fome, desconforto pós-mamada, sucção e transição para o berço. POSIÇÃO VERTICAL 30 A 40 MIN após mamada. Mantenha o gênero gramatical que a mãe usa (ela/dele) — não alterne para "ele" se a mãe fala "minha bebê/ela". NUNCA oriente prender a chupeta.',
  },
  {
    id: 'fear_negative_association_rn',
    label: 'Mãe verbaliza MEDO de associação negativa / vício / mau hábito no RN',
    directive: true,
    phrases: [
      'associacao negativa', 'associação negativa', 'medo de associacao', 'medo de associação',
      'medo de criar associacao', 'medo de criar associação', 'medo de criar vicio', 'medo de criar vício',
      'criar vicio', 'criar vício', 'estou criando vicio', 'estou criando vício',
      'criar mau habito', 'criar mau hábito', 'mau habito', 'mau hábito', 'manha',
      'esta acostumando mal', 'está acostumando mal', 'acostumando mal',
      'medo de acostumar mal', 'medo de viciar', 'estou viciando',
      'mal habito', 'mal hábito', 'medo dessa associacao', 'medo dessa associação',
    ],
    boostThemes: ['busca_excessiva_peito', 'mamadas_ineficientes'],
    priority:
      'A mãe VERBALIZOU MEDO de associação negativa / vício / mau hábito. NO RN (0–28 dias) ESSA PREOCUPAÇÃO PRECISA SER AFASTADA DE FORMA DIRETA E EXPLÍCITA — não basta dizer que "não configura associação negativa". Inclua, com clareza, uma frase do tipo: "Com [N] dias, seu bebê AINDA NÃO CRIA associação comportamental negativa por dormir no peito, buscar o peito ou precisar voltar ao peito para se acalmar." Use o N exato do PERFIL DO BEBÊ. Reforce que nessa idade o peito é alimento, regulação, conforto e organização fisiológica — não vício, manha ou mau hábito. NÃO use as palavras "vício", "manha" ou "mau hábito" como categoria válida para o RN. Após afastar a hipótese comportamental, conduza pela hierarquia alimentar (mamada efetiva, saciedade, produção, transferência, conforto pós-mamada).',
  },
  {
    id: 'cite_explicit_age_rn',
    label: 'Caso RN — cite a idade exata (N dias) ao menos uma vez na resposta',
    directive: true,
    phrases: [], // matched programmatically when ageDays is set
    boostThemes: [],
    priority:
      'CITAÇÃO EXPLÍCITA DA IDADE: ao menos uma vez na resposta, cite a idade exata do bebê — "para um bebê de [N] dias", "com [N] dias", "seu bebê de [N] dias" — usando EXATAMENTE o N do PERFIL DO BEBÊ. Isso aumenta a segurança da resposta e mostra que a leitura da informação da mãe foi precisa.',
  },
  {
    id: 'wake_after_early_sleep_rn',
    label: 'RN dormiu cedo (19h–20h) e acorda 22h–00h — investigar mamada nesse horário',
    directive: true,
    phrases: [
      'acorda 22h', 'acorda 22:00', 'acorda as 22', 'acorda às 22',
      'acorda 23h', 'acorda 23:00', 'acorda as 23', 'acorda às 23',
      'acorda umas 22', 'acorda umas 23', 'acorda por volta das 22', 'acorda por volta das 23',
      'desperta as 22', 'desperta às 22', 'desperta as 23', 'desperta às 23',
      'dorme as 19', 'dorme às 19', 'dorme as 20', 'dorme às 20',
      'sono da noite por volta de 19', 'sono da noite por volta de 20',
      'inicia o sono.*19', 'inicia o sono.*20',
      'demora a pegar o sono novamente', 'demora a voltar a dormir',
      'demora para voltar a dormir', 'nao consegue voltar a dormir',
      'demora a pegar no sono', 'demora para pegar no sono',
    ],
    boostThemes: [
      'despertar_noturno_investigar_fome',
      'mamadas_ineficientes',
      'baixa_producao_leite',
      'baixa_producao_fim_dia',
    ],
    priority:
      'PADRÃO CRÍTICO: RN inicia o sono cedo (19h–20h) e acorda nas primeiras horas da noite (22h–00h), demorando a voltar a dormir. Esse cenário, por si só, indica intervalo importante desde a última mamada. PERGUNTA INDISPENSÁVEL antes de qualquer outra: "Você alimenta a bebê nesse horário em que ela acorda?" / "Nesse despertar das [23h], você oferece a mamada?". CONTEXTUALIZE explicitamente: como ele/ela iniciou o sono às 19h/20h e acorda perto das 23h, já está vindo de um intervalo importante desde a última mamada — se acorda com sinais de fome, deve ser alimentado. NÃO ABRA com "É comum que os bebês apresentem padrões de sono variados" nem com "É normal nessa fase" — esse tipo de abertura genérica deve ser substituída por uma condução direta para fome/mamada. Só DEPOIS de oferecer mamada → vertical 30-40 min → arroto → transferência ao berço, vem o ambiente escuro/calmo. Reflexo de Moro, charutinho e Travesseiro só se a mãe relatou susto/desorganização — não os puxe especulativamente.',
  },
  {
    id: 'start_day_or_keep_night_rn',
    label: 'Mãe pergunta se "começa o dia" ou mantém ambiente noturno (madrugada difícil RN)',
    directive: true,
    phrases: [
      'comecar o dia', 'começar o dia', 'comeco do dia', 'começo do dia',
      'abrir a janela', 'abro a janela', 'trocar o pijama', 'troco o pijama',
      'ja era pra ter comecado o dia', 'já era pra ter começado o dia',
      'devo comecar o dia', 'devo começar o dia',
      'manter ambiente noturno', 'manter o ambiente noturno',
      'fiz certo em manter', 'fiz errado em manter',
      'manter no quarto', 'mantive no quarto', 'manter ele no quarto',
      'comecar a rotina do dia', 'começar a rotina do dia',
    ],
    boostThemes: [
      'acorda_ao_deitar',
      'dificuldade_berco',
      'reflexo_moro',
    ],
    priority:
      'DECISÃO PRÁTICA DA MÃE NA MADRUGADA: ela pergunta se deveria ter "começado o dia" (abrir janela, trocar pijama) ou se fez certo em manter ambiente noturno. RESPONDA DIRETAMENTE na PRIMEIRA frase: "Você fez certo em manter o ambiente noturno. Para um bebê de [N] dias, não precisa começar o dia nesse horário." Tranquilize a mãe sobre o horário da manhã: acordar perto de 8h/8h30 depois de uma madrugada difícil NÃO é problema para o RN. ORIENTAÇÕES NA MADRUGADA: trocar fralda com MÍNIMA luz, pouco manuseio, sem estímulo (para não sinalizar início do dia); manter ruído branco/escuro/calmo; se ele estiver desperto sem desconforto, manter ambiente noturno. INVESTIGUE a mamada de madrugada: foi efetiva, ele arrotou, permaneceu em posição vertical 30 a 40 minutos? NÃO use frases comportamentais como "ajudar o bebê a se adaptar melhor ao sono" — para RN o foco é organização fisiológica.',
  },
  {
    id: 'bath_crying_rn',
    label: 'Choro durante o banho no RN — não desviar para investigação alimentar',
    directive: true,
    phrases: [
      'chora no banho', 'chora muito no banho', 'chorando no banho',
      'chora muuuito no banho', 'chora muuuuito no banho',
      'choro no banho', 'choro do banho', 'hora do banho',
      'na hora do banho', 'durante o banho', 'no momento do banho',
      'almofada de banho', 'almofadas de banho', 'almofada para o banho',
      'almofadinha de banho', 'banho ele chora', 'banho ela chora',
      'nao gosta do banho', 'não gosta do banho', 'detesta o banho',
    ],
    boostThemes: ['choro_banho_rn'],
    priority:
      'QUEIXA SOBRE CHORO NO BANHO no RN: NÃO desvie para investigação alimentar (mamada efetiva, saciedade, produção/transferência) — a queixa é específica sobre BANHO. NÃO indique aulas de cólicas / Hora da Bruxa / Mamadas efetivas como prioritárias para essa queixa. CONDUTA PRÁTICA para o banho do RN: (1) explicar que o choro no banho costuma vir de SENSAÇÃO DE QUEDA, INSEGURANÇA ou FRIO; (2) ENROLAR o bebê em uma FRALDA DE PANO durante o banho para aumentar a sensação de CONTENÇÃO, molhando o corpinho aos poucos; (3) observar se ele melhora quando fica com o CORPINHO MAIS SUBMERSO na água, sempre com apoio firme e supervisão total; (4) experimentar a posição DE BARRIGUINHA PARA BAIXO apoiado com segurança no braço do adulto (apoio firme, controle do corpo); (5) manter AMBIENTE AQUECIDO, sem correntes de ar; (6) deixar TUDO PREPARADO antes de começar; (7) escolher um momento em que ele NÃO esteja com muita fome nem muito irritado — banho logo após uma mamada cheia pode aumentar desconforto/regurgitação; (8) banho CURTO. NÃO faça perguntas sobre saciedade, mamada efetiva ou produção de leite a menos que a mãe traga essa pista — a queixa do banho deve permanecer no eixo do banho.',
  },
  {
    id: 'cautious_seios_flacidos_rn',
    label: 'Pergunta sobre "seios flácidos / menor enchimento" exige cuidado (não diagnóstico isolado)',
    directive: true,
    phrases: [], // matched programmatically when retrieval mentions flaccid breast
    boostThemes: [],
    priority:
      'Ao investigar PRODUÇÃO de leite, EVITE dar a entender que "seio flácido" = pouco leite. Use linguagem cautelosa e prefira investigar EFETIVIDADE da mamada: o bebê faz sucção ativa? Você escuta deglutição? Adormece muito rapidamente no peito? Volta a procurar o peito em pouco tempo? Apresenta sinais reais de saciedade? Se for citar enchimento, contextualize que ele varia naturalmente e não deve ser interpretado isoladamente como diagnóstico de baixa produção.',
  },
];

/**
 * Facts the mother may have ALREADY given. When present, the assistant must
 * not ask for them again. `askKeywords` are substrings used to drop matching
 * entries from a chunk's `askIfMissing` list.
 */
const PROVIDED_FACTS = [
  {
    id: 'feeding_type',
    label: 'forma de alimentação',
    phrases: ['mama no peito', 'amament', 'seio', 'dois seios', 'leite materno', 'aleitamento', 'formula', 'mamadeira', 'mama nos dois'],
    askKeywords: ['alimenta', 'peito/formula', 'peito/fórmula', 'forma de alimenta'],
  },
  {
    id: 'burping',
    label: 'arroto',
    phrases: ['arroto', 'arrota', 'faco arrotar', 'faço arrotar', 'arrotar', 'arrotou', 'coloco pra arrotar', 'estimulo o arroto'],
    askKeywords: ['arroto', 'arrot'],
  },
  {
    id: 'vertical_time',
    label: 'tempo em posição vertical após a mamada',
    phrases: ['posicao vertical', 'na vertical', 'em pe apos', 'minutos vertical', 'segurei em pe', 'mantenho em pe', 'fico em pe', 'verticalizad'],
    askKeywords: ['vertical'],
  },
  {
    id: 'feeding_interval',
    label: 'intervalo entre mamadas',
    phrases: ['a cada 2', 'a cada 3', 'de 2 em 2', 'de 3 em 3', 'intervalo de', 'mama de', 'a cada duas', 'a cada tres'],
    askKeywords: ['intervalo'],
  },
  // Deliberately NOT mapping "mama bem" / "acho que tenho leite" as a
  // provided fact: test feedback (caso 23d) flagged that these subjective
  // perceptions cannot be accepted as confirmation of effective feeding,
  // especially when there are concurrent symptoms (short naps, wake-on-
  // transfer, post-feed irritability). We keep ONLY explicit, concrete
  // facts here. The assistant must still investigate production/transfer
  // even when the mother says "mama bem".
  {
    id: 'wake_latency',
    label: 'em quanto tempo desperta após ser deitado',
    phrases: ['acorda logo', 'acorda em seguida', 'acorda na hora', 'desperta em', 'acorda depois de', 'acorda assim que', 'desperta logo'],
    askKeywords: ['em quanto tempo', 'desperta apos', 'desperta após'],
  },
];

/**
 * Techniques / tools the mother may already be using. When present, the
 * assistant must not present them as a new suggestion.
 */
const TECHNIQUES = [
  { id: 'charutinho', label: 'charutinho', phrases: ['charutinho', 'charuto', 'enrolo o bebe', 'enrolad'] },
  { id: 'travesseiro', label: 'estratégia do travesseiro', phrases: ['travesseiro', 'estrategia do travesseiro', 'tecnica do travesseiro', 'técnica do travesseiro'] },
  { id: 'ruido_branco', label: 'ruído branco', phrases: ['ruido branco', 'ruído branco', 'som branco', 'barulho branco', 'ruidinho'] },
  { id: 'luminosidade', label: 'controle de luminosidade', phrases: ['luminosidade', 'luz baixa', 'no escuro', 'penumbra', 'blackout', 'cortina', 'luz apagada', 'pouca luz'] },
  { id: 'ninho', label: 'ninho', phrases: ['ninho', 'redutor de berco'] },
  { id: 'chupeta', label: 'chupeta', phrases: ['chupeta'] },
  { id: 'moises', label: 'moisés', phrases: ['moises', 'moisés'] },
];

/**
 * Collects only what the MOTHER said (current message + her past turns).
 * We deliberately ignore assistant turns so "already provided / already using"
 * reflects the user, not the bot's own suggestions.
 */
function collectMotherText({ message, conversation }) {
  const parts = [String(message || '')];
  for (const m of conversation || []) {
    if (!m) continue;
    const role = String(m.role || '').toLowerCase();
    if (role === 'user' || role === 'mae' || role === 'mãe') {
      parts.push(String(m.content || ''));
    }
  }
  return parts.join('\n');
}

// Synthetic signals that are computed programmatically (not from phrase matching).
const SYNTHETIC_SIGNAL_IDS = new Set([
  'mama_bem_with_concurrent_symptoms',
  'cite_explicit_age_rn',
  'cautious_seios_flacidos_rn',
]);

export function extractSignals({ message, conversation, ageBand, ageDays } = {}) {
  const motherText = collectMotherText({ message, conversation });
  const norm = normalize(motherText);
  const currentNorm = normalize(message);

  const signals = [];
  const boostThemes = new Set();
  const priorities = [];
  let hasDirectiveSignal = false;

  for (const def of SIGNAL_DEFS) {
    // Skip synthetic signals here; they are computed after the main pass.
    if (SYNTHETIC_SIGNAL_IDS.has(def.id)) continue;
    const matched = def.phrases.filter((p) => norm.includes(normalize(p)));
    if (matched.length) {
      signals.push({ id: def.id, label: def.label, matched });
      def.boostThemes.forEach((t) => boostThemes.add(t));
      priorities.push(def.priority);
      if (def.directive) hasDirectiveSignal = true;
    }
  }

  // Synthetic: ALWAYS cite explicit age when we're in the RN band and have ageDays.
  const isRnBand =
    String(ageBand || '').toLowerCase() === 'rn' ||
    (Number.isFinite(ageDays) && ageDays >= 0 && ageDays <= 28);
  if (isRnBand && Number.isFinite(ageDays)) {
    const def = SIGNAL_DEFS.find((d) => d.id === 'cite_explicit_age_rn');
    if (def) {
      signals.push({ id: def.id, label: def.label, matched: [`${ageDays} dias`] });
      priorities.push(def.priority.replace(/\[N\]/g, String(ageDays)));
      hasDirectiveSignal = true;
    }

    // Also substitute [N] in other RN priorities already added that reference [N] dias.
    for (let i = 0; i < priorities.length; i++) {
      if (typeof priorities[i] === 'string' && priorities[i].includes('[N]')) {
        priorities[i] = priorities[i].replace(/\[N\]/g, String(ageDays));
      }
    }
  }

  // Synthetic: when feeding/production signals fire, attach the cautious-flaccid-breast
  // directive so the LLM uses careful language about "seios flácidos".
  const productionSignalIds = new Set([
    'evening_pattern', 'night_production_drop', 'short_feeding_interval',
    'feeding_clinical_context', 'mama_bem_with_concurrent_symptoms',
    'late_crib_placement', 'wakes_on_transfer',
  ]);
  if (signals.some((s) => productionSignalIds.has(s.id))) {
    const def = SIGNAL_DEFS.find((d) => d.id === 'cautious_seios_flacidos_rn');
    if (def) {
      signals.push({ id: def.id, label: def.label, matched: ['production-cautious'] });
      priorities.push(def.priority);
    }
  }

  // Secondary pass: "mama bem" coexisting with any concurrent symptom.
  // Test feedback (caso 23d): the assistant accepted "mama bem" as
  // sufficient confirmation. We flag this combination explicitly so the
  // prompt block forces the two-layer investigation (feeding + posture).
  const mamaBemPhrases = [
    'mama bem', 'mama muito bem', 'esta mamando bem', 'está mamando bem',
    'mamou bem', 'tenho bastante leite', 'leite suficiente', 'acho que tenho leite',
  ];
  const concurrentSignalIds = new Set([
    'evening_pattern', 'night_production_drop', 'short_feeding_interval',
    'feeding_clinical_context', 'prolonged_awake_after_feed', 'long_daytime_nap',
    'breast_soothing', 'late_crib_placement', 'wakes_on_transfer', 'pacifier_in_rn',
  ]);
  const mamaBemMatch = mamaBemPhrases.filter((p) => norm.includes(normalize(p)));
  const hasConcurrent = signals.some((s) => concurrentSignalIds.has(s.id));
  if (mamaBemMatch.length && hasConcurrent) {
    const def = SIGNAL_DEFS.find((d) => d.id === 'mama_bem_with_concurrent_symptoms');
    signals.push({ id: def.id, label: def.label, matched: mamaBemMatch });
    def.boostThemes.forEach((t) => boostThemes.add(t));
    priorities.push(def.priority);
    hasDirectiveSignal = true;
  }

  const provided = PROVIDED_FACTS.filter((f) =>
    f.phrases.some((p) => norm.includes(normalize(p))),
  ).map((f) => ({ id: f.id, label: f.label, askKeywords: f.askKeywords }));

  const alreadyUsing = TECHNIQUES.filter((t) =>
    t.phrases.some((p) => norm.includes(normalize(p))),
  ).map((t) => t.label);

  // Rich context = the mother already brought enough for the assistant to give
  // practical orientation instead of only asking questions. A directive signal
  // (e.g. "should I wake to feed?", "worse at dawn") is itself enough to commit
  // to a practical answer even from a short message.
  const detailScore =
    provided.length + signals.length + (currentNorm.length >= 140 ? 1 : 0);
  const hasRichContext = hasDirectiveSignal || detailScore >= 2 || currentNorm.length >= 180;

  return {
    signals,
    boostThemes: [...boostThemes],
    priorities,
    provided,
    alreadyUsing,
    hasRichContext,
    hasDirectiveSignal,
  };
}

/**
 * Drops from `askIfMissing` any item the mother already answered, so we never
 * ask twice. Used by both the router (ASK_MORE_CONTEXT) and the prompt.
 */
export function filterAnswered(askIfMissing, provided) {
  if (!Array.isArray(askIfMissing) || askIfMissing.length === 0) return askIfMissing || [];
  if (!provided?.length) return askIfMissing;
  return askIfMissing.filter((item) => {
    const n = normalize(item);
    return !provided.some((p) =>
      (p.askKeywords || []).some((kw) => n.includes(normalize(kw))),
    );
  });
}
