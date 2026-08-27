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
      'e esperado nessa fase', 'é esperado nessa fase', 'esperado nessa fase',
      'e esperado nessa idade', 'é esperado nessa idade', 'esperado nessa idade',
      'comportamento e esperado', 'comportamento é esperado',
      'e esperado para a idade', 'é esperado para a idade',
      'e comum nessa fase', 'é comum nessa fase', 'comum nessa fase',
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
      'A mãe pediu conduta prática ("como melhorar/ajustar"). NÃO responda só com investigação — entregue na ORIENTAÇÃO PRÁTICA a SEQUÊNCIA NOTURNA OFICIAL, de forma fluida (sem sensação de lista técnica): (1) garantir uma mamada/oferta alimentar o mais efetiva possível, DE ACORDO COM A FORMA DE ALIMENTAÇÃO — se for peito, oferecer o segundo peito quando necessário; NÃO assuma peito antes de confirmar peito/fórmula/complemento; (2) observar sinais de saciedade (listar os 6); (3) colocar para arrotar; (4) manter em posição vertical 30 a 40 minutos; (5) ambiente escuro, calmo e com baixa estimulação; (6) charutinho se houver reflexo de Moro ou desorganização corporal (inclusive nas sonecas diurnas); (7) só então tentar a transferência para o berço. Se houver desconforto ao deitar (choro na transferência, dificuldade de arrotar), verbalize explicitamente a hipótese de desconforto leve pós-mamada ao deitar.',
  },
  {
    id: 'evening_pattern',
    label: 'Piora no final do dia / após as 18h',
    directive: true,
    phrases: [
      'depois das 18', 'apos as 18', 'apos 18', 'após 18', 'a partir das 18',
      '18h', '18 horas', 'das 18', 'final do dia', 'fim do dia',
      'final da tarde', 'fim da tarde', 'no fim da tarde', 'fim de tarde',
      'finalzinho da tarde', 'finalzinho do dia', 'no finalzinho da tarde',
      'a noite piora', 'piora a noite', 'piora de noite', 'piora a tarde',
      'comeca a noite', 'comeca de noite', 'entardecer', 'anoitecer',
      'hora da bruxa', 'final do dia ele', 'no final do dia',
      'iniciou ja no finalzinho da tarde', 'comecou ja no fim da tarde',
      'comecou ja no final da tarde', 'comeca ja no fim da tarde',
    ],
    boostThemes: [
      'padrao_vespertino',
      'busca_excessiva_peito',
      'mamadas_ineficientes',
      'baixa_producao_leite',
      'irritabilidade_final_tarde',
    ],
    priority:
      'A piora no final do dia (após as 18h) é um padrão vespertino típico no RN. NOMEIE a hipótese principal de forma direta: "A principal hipótese é baixa transferência de leite ou menor produção materna no final do dia/noite." Use o ENQUADRAMENTO METODOLÓGICO OFICIAL em SEIS pontos: (1) produção de leite da mãe no fim da tarde/noite; (2) efetividade da transferência (sucção ativa, deglutição, sinais de saciedade); (3) necessidade de sucção do RN; (4) tempo em posição vertical após a mamada (30 a 40 min); (5) motivo do despertar imediato ao ser transferido para o berço, se houver — incluindo desconforto leve pós-mamada ao deitar quando houver dificuldade de arrotar e choro na transferência; (6) tranquilizar explicitamente a mãe sobre o receio de associação negativa (no RN essa leitura não se aplica). Se a mãe perguntou "como melhorar", entregue a SEQUÊNCIA PRÁTICA NOTURNA (mamada/oferta alimentar efetiva conforme a forma de alimentação — se peito, segundo peito quando necessário → saciedade → arroto → vertical 30-40 min → ambiente calmo → charutinho se Moro → transferência). A Estratégia do Travesseiro só como apoio secundário — NÃO como eixo principal quando alimentação/arroto/desconforto forem prioritários. APROFUNDAR a investigação da produção noturna com pergunta concreta — escolha uma: (i) "No fim da tarde/noite, você percebe os seios mais flácidos ou com menor enchimento? Durante a mamada, ele faz sucção ativa e você escuta deglutição, ou adormece rapidamente? Depois que solta o peito, relaxa e permanece tranquilo, ou volta a procurar o peito em pouco tempo?"; (ii) "Nas mamadas após as 18h, você consegue ouvir a deglutição?"; (iii) ordenha de avaliação no fim do dia vs. manhã; (iv) quando houver complemento: "O complemento foi orientado apenas para as mamadas da noite, ou já foi avaliada a necessidade de suporte também no final da tarde, quando o comportamento começa?".',
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
      'manhas mais tranquilas', 'manhãs mais tranquilas',
      'madrugadas tem sido dificeis', 'madrugadas têm sido difíceis',
      'as madrugadas tem sido dificeis', 'as madrugadas têm sido difíceis',
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
      'NOMEIE a hipótese principal de forma direta, com esta leitura: "Pelo horário em que isso começa — final da tarde, madrugada difícil e manhã mais tranquila — a principal hipótese é baixa produção OU menor transferência de leite no período final do dia/noite." Não leia como desorganização do sono. NUNCA escreva "mesmo com complemento" se a mãe não citou complemento — esse trecho só pode entrar se a mãe explicitamente mencionou complemento/sonda no relato; caso contrário, complemento aparece apenas em formulação CONDICIONAL ("caso haja complemento, avalie volume, intervalo e sinais de saciedade conforme orientação individual"). APROFUNDE a investigação da produção de leite especificamente no PERÍODO NOTURNO — pergunte concretamente: (a) como os seios ficam ao final da tarde; (b) deglutição audível na mamada após as 18h. SOMENTE quando a mãe relatar complemento/sonda: oriente reavaliar com quem acompanha a amamentação e o pediatra se o complemento precisa ser ajustado também no FINAL DA TARDE (não só 22h/madrugada); inclua suporte à produção (ordenha como ferramenta de avaliação, nunca solução isolada) e acompanhamento. Investigue transferência efetiva e produção materna nesse período. Nessa fase, NÃO force intervalo de 2h se houver sinais de fome/saciedade insuficiente — prioridade é garantir a ingestão (livre demanda). SEMPRE QUE MENCIONAR posição vertical, declare EXPLICITAMENTE os 30 a 40 minutos.',
  },
  {
    id: 'short_feeding_interval',
    label: 'Procura o peito em intervalo curto (< 2h)',
    directive: true,
    phrases: [
      'antes de 2 horas', 'antes de duas horas', 'menos de 2 horas', 'menos de duas horas',
      'menor que 2 horas', 'menor que 2h', 'intervalo menor que 2', 'intervalo menor que 2h',
      'em intervalo menor que 2', 'em intervalo menor que 2h',
      'em menos de 2', 'em menos de duas',
      'a cada 1 hora', 'a cada uma hora', 'a cada hora', 'de hora em hora',
      'quer mamar toda hora', 'quer mamar o tempo todo', 'mama de hora em hora',
      'procura o peito antes de', 'logo apos mamar quer de novo', 'logo após mamar quer de novo',
      'quer mamar de novo logo', 'volta a querer mamar logo',
      'procurando o peito no intervalo menor que 2', 'ficou procurando o peito',
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
      'Há contexto de icterícia, linguinha/frênulo, sonda ou complemento. REGRA CRÍTICA: se a mãe informou que o bebê AGORA mama bem, é PROIBIDO citar icterícia ou linguinha como fator que impacta a transferência ou a mamada no contexto ATUAL — trate APENAS como histórico. É PROIBIDO "especialmente após o procedimento na linguinha e a icterícia". COMPLEMENTO COM SONDA indica BAIXA PRODUÇÃO MATERNA — NOMEIE explicitamente. NÃO normalize como "bastante comum" com sonda + busca <2h. Incluir ORDENHAS, avaliar complemento durante o dia e fim da tarde, posição vertical 30 a 40 min.',
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
      'mamada_noturna_insuficiente',
      'baixa_producao_fim_dia',
      'baixa_producao_leite',
      'mamadas_ineficientes',
      'padrao_vespertino',
      'busca_excessiva_peito',
    ],
    priority:
      'PADRÃO DIAGNÓSTICO CRÍTICO: bebê faz sonecas no berço DURANTE O DIA mas NÃO permanece no berço à NOITE. Isso significa que o berço NÃO é o problema central — a hipótese prioritária é MAMADA NOTURNA INSUFICIENTE OU BAIXA PRODUÇÃO MATERNA NO PERÍODO DA NOITE. A IA NÃO deve abrir por adaptação ao berço, Moisés, Estratégia do Travesseiro ou reflexo de Moro. NOMEIE diretamente: "Como ele/ela aceita o berço durante o dia, o problema não é adaptação ao berço — a primeira coisa a investigar é a mamada noturna e a produção de leite nesse período." HIERARQUIA OBRIGATÓRIA: (1) mamada noturna — pergunte EXPLICITAMENTE: "Antes de tentar colocá-lo no berço à noite, ele mama? Como é essa mamada? Ele parece ficar satisfeito ou continua procurando o peito?"; (2) possível baixa produção de leite no período da noite (pode haver menor produção, menor fluxo ou menor transferência — formule de forma condicional); (3) sinais de saciedade; (4) tempo em posição vertical (30 a 40 min); (5) arroto; (6) refluxo/desconforto; (7) reflexo de Moro; (8) só por último berço/Travesseiro. PERGUNTA OBRIGATÓRIA também: "Ele mama no peito, fórmula ou os dois?". AULAS PRIORITÁRIAS: MAMADAS EFETIVAS, ESTIMULE O ARROTO, O QUE É O REFLUXO?, CHARUTINHO E REFLEXOS DE MORO. NÃO indique como principais ESTABELEÇA O HORÁRIO DO INÍCIO DO SONO NOTURNO nem EVITE QUE O BEBÊ TROQUE O DIA PELA NOITE — o caso não aponta para troca dia-noite. A Estratégia do Travesseiro entra apenas como apoio posterior, nunca como eixo principal.',
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
      'SINAIS CLÁSSICOS DE FOME NO RN detectados (sugar mãozinhas + nervoso/agitado + choramingo, especialmente entre 23h e 02h). Esse conjunto é SINAL CLARO DE FOME, não desorganização do sono nem agitação genérica. PERGUNTAS INDISPENSÁVEIS NO INÍCIO (antes de qualquer outra hipótese): "Nesse horário, ela já mamou?" e "Esse comportamento de ficar nervosa, sugar as mãozinhas e choramingar acontece ANTES ou DEPOIS da mamada?". IMEDIATAMENTE APÓS, ofereça a árvore condicional: (a) se ANTES → alimentar em livre demanda; (b) se DEPOIS → investigar mamada efetiva, sinais de saciedade, conforto após arroto, posição vertical por 30 a 40 minutos. Se mama no peito, observe produção e deglutição ("Se ela mama no peito, observe como os seios ficam ao final da tarde e se há deglutição audível"); se usa fórmula/mamadeira, volume/intervalo/saciedade. NÃO investigue seios/deglutição sem aleitamento materno. NÃO presuma ordenha/complemento. AULAS ESTRITAS: Mamadas Efetivas (principal), Passo 4, Estimule o Arroto (se desconforto pós-mamada), Charutinho (só se desorganização). NÃO indicar Início do Sono Noturno nem Troca dia/noite.',
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
      'depois de 1 da manha', 'depois de uma da manha',
      '1h da manha', 'uma da manha', '1 da manha', 'so dorme no berco de madrugada',
      'so consigo coloca-lo no berco depois', 'so consigo coloca lo no berco depois',
      'so consigo coloca-la no berco depois', 'so consigo coloca la no berco depois',
      'so consigo colocar ele no berco depois', 'so consigo colocar ela no berco depois',
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
      'O despertar na transferência para o berço segue a hierarquia: (1) tempo vertical após a mamada (30 a 40 min — sempre explícito), (2) arroto, (3) reflexo de Moro, (4) adaptação à superfície (transição de superfície/textura), (5) refluxo FISIOLÓGICO/desconforto pós-mamada ao deitar. VERBALIZAÇÃO OBRIGATÓRIA: quando houver dificuldade de arrotar, choro logo ao colocar no berço ou melhora ao voltar ao peito/colo, a resposta DEVE conter uma frase explícita do tipo "isso pode indicar desconforto leve pós-mamada ao deitar" ou "o bebê pode estar sentindo desconforto ao deitar após a mamada" — não basta orientar a posição vertical, é preciso NOMEAR a hipótese de desconforto ao deitar. Oriente EXPLICITAMENTE manter em POSIÇÃO VERTICAL POR 30 A 40 MINUTOS após a mamada antes da transição. Se a mãe perguntou "como melhorar", inclua a sequência prática noturna completa. A Estratégia do Travesseiro só como apoio secundário, não eixo principal. GATE CLÍNICO: NÃO escalone para refluxo PATOLÓGICO + Material do Pediatra Roberto Franklin + Suporte Humano + elevação do colchão SEM que o relato da mãe contenha pelo menos um destes sinais clínicos concretos: vômitos intensos/em jato, engasgos frequentes, recusa alimentar persistente, arqueamento corporal importante, irritabilidade persistente. Sem esses sinais, basta citar refluxo FISIOLÓGICO como possibilidade. AULAS PRIORITÁRIAS quando a queixa for "só dorme no colo / Travesseiro tentado" (TESTE 005 RN 19d): UTILIZE A ESTRATÉGIA DO TRAVESSEIRO, O BERÇO DO BEBÊ, ESTIMULE O ARROTO, CHARUTINHO E REFLEXOS DE MORO (se houver Moro), MAMADAS EFETIVAS. NUNCA indicar "EVITE QUE O BEBÊ TROQUE O DIA PELA NOITE" nem "ESTABELEÇA O HORÁRIO DO INÍCIO DO SONO NOTURNO" como aulas principais — se a mãe diz que o bebê dorme bem à noite, troca dia-noite e início de sono noturno NÃO são o eixo da queixa.',
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
      'reflexo_moro',
    ],
    priority:
      'Queixa envolvendo chupeta no RN (0–28 dias) é REFLEXO DE SUCÇÃO e NECESSIDADE DE REGULAÇÃO — use esses termos explicitamente na resposta. HIERARQUIA TESTE 011: (1) apoio fisiológico sem associação negativa; (2) resposta DIRETA — se cair e continuar dormindo, não recolocar; se acordar, investigar; (3) SEGURANÇA OBRIGATÓRIA — diga textualmente "nunca prenda ou fixe a chupeta"; (4) confirmar forma de alimentação; (5) sequência prática. PERGUNTA OBRIGATÓRIA sobre forma de alimentação se a mãe não informou: "Ela mama no peito, usa fórmula ou recebe complemento?" — é proibido orientar "ofereça o peito" antes dessa confirmação. SINAIS DE SACIEDADE ADAPTADOS: peito → solta o peito espontaneamente; fórmula/complemento → reduz o ritmo da sucção e demonstra saciedade após a oferta. POSIÇÃO VERTICAL 30 A 40 MIN após mamada — diga que ajuda a reduzir desconfortos pós-mamada e favorece a transição; NÃO escreva "para evitar refluxo". Mantenha o gênero gramatical que a mãe usa (ela/dela) — não alterne para "ele" se a mãe fala "minha bebê/ela". NUNCA oriente prender a chupeta. ESCOPO ISOLADO DA QUEIXA — REGRA DE OUTPUT (TESTE 005 RN 22d): se a única queixa da mãe é a chupeta caindo (sem que ela tenha relatado refluxo, vômitos, engasgos, recusa, arqueamento, irritabilidade persistente, espasmos do Moro, charutinho noturno ou Estratégia do Travesseiro tentada), MANTENHA a resposta dentro do escopo: chupeta + reflexo de sucção + alimentação (peito/fórmula/complemento) + sinais de saciedade + arroto + posição vertical 30 a 40 min + transição para o berço. É PROIBIDO escrever frases como "como você já tentou a Estratégia do Travesseiro", "como o charutinho funciona à noite", "como há sinais que podem sugerir refluxo" — a mãe não trouxe nada disso. NÃO escalone para refluxo patológico, NÃO mande para o material do Pediatra Roberto Franklin / Aulas Extras/Bônus, NÃO encaminhe para suporte humano, NÃO oriente elevação do colchão (em qualquer ângulo) sem sinais clínicos concretos. A resposta deve ser CURTA E FOCADA — o avaliador marcou como erro grave a inclusão de blocos não sustentados pela pergunta original. Se houver reflexo de Moro/desorganização CITADO PELA MÃE, pode mencionar charutinho. Caso contrário, fique no eixo da pergunta original.',
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
      'PADRÃO CRÍTICO: RN inicia o sono cedo (19h–20h) e acorda nas primeiras horas da noite (22h–00h), demorando a voltar a dormir. Esse cenário, por si só, indica intervalo importante desde a última mamada. PERGUNTA INDISPENSÁVEL antes de qualquer outra: "Você alimenta a bebê nesse horário em que ela acorda?" / "Nesse despertar das [23h], você oferece a mamada?". CONTEXTUALIZE explicitamente: como ele/ela iniciou o sono às 19h/20h e acorda perto das 23h, já está vindo de um intervalo importante desde a última mamada — se acorda com sinais de fome, deve ser alimentado. NÃO ABRA com "É comum que os bebês apresentem padrões de sono variados" nem com "É normal nessa fase" — esse tipo de abertura genérica deve ser substituída por uma condução direta para fome/mamada. Só DEPOIS de oferecer mamada → vertical 30-40 min → arroto → transferência ao berço, vem o ambiente escuro/calmo. Reflexo de Moro, charutinho e Travesseiro só se a mãe relatou susto/desorganização — não os puxe especulativamente. É OBRIGATÓRIO incluir na resposta a LISTA OFICIAL DE SINAIS DE SACIEDADE NO RN como parte da investigação da mamada (palavra-chave "sinais de saciedade" + lista completa, observável): "O bebê solta o peito espontaneamente, relaxa o corpo, abre as mãozinhas, reduz o ritmo da sucção, fica tranquila após a mamada e permanece mais confortável depois de arrotar e de ficar em posição vertical." Nunca omita essa lista neste cenário — ela é a ferramenta que a mãe usa para julgar se a mamada das 23h foi suficiente. Em seguida, oriente o que fazer quando os sinais NÃO aparecem: se ele continua agitado, mantém as mãozinhas cerradas e busca o peito novamente em pouco tempo, isso pode indicar mamada insuficiente ou dificuldade de transferência — se mama no peito, ofereça em livre demanda e reavalie produção/transferência no período.',
  },
  {
    id: 'start_day_or_keep_night_rn',
    label: 'Mãe pergunta se "começa o dia" ou mantém ambiente noturno (madrugada difícil RN)',
    directive: true,
    phrases: [
      'comecar o dia', 'começar o dia', 'comeco do dia', 'começo do dia',
      'comecado o dia', 'começado o dia',
      'ter comecado o dia', 'ter começado o dia',
      'abrir a janela', 'abro a janela', 'abrindo janela', 'abrindo a janela',
      'trocar o pijama', 'troco o pijama',
      'trocando o pijama', 'trocando o pijaminha', 'trocar o pijaminha', 'troco o pijaminha',
      'ja era pra ter comecado o dia', 'já era pra ter começado o dia',
      'devo comecar o dia', 'devo começar o dia',
      'manter ambiente noturno', 'manter o ambiente noturno',
      'fiz certo em manter', 'fiz errado em manter',
      'manter no quarto', 'mantive no quarto', 'manter ele no quarto',
      'manter ele ali no quarto', 'manter ela ali no quarto', 'manter ele ali', 'manter ela ali',
      'ali no quarto',
      'comecar a rotina do dia', 'começar a rotina do dia',
      'o dia dele nao vai inicar muito tarde', 'o dia dele não vai iniciar muito tarde',
      'o dia dele nao vai iniciar muito tarde',
      'dia comecar muito tarde', 'dia começar muito tarde',
      'dia vai inicar muito tarde', 'dia vai iniciar muito tarde',
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
    id: 'night_diaper_change_routine',
    label: 'Troca de fralda na madrugada — orientar trocar ANTES da mamada (Hayato)',
    directive: true,
    phrases: [
      'troquei a fralda', 'trocou a fralda', 'troquei fralda', 'trocar a fralda',
      'fralda de xixi', 'fralda muito cheia', 'fralda cheia', 'fralda estava cheia',
      'troquei a fralda pois', 'troquei a fralda porque',
      'fralda na madrugada', 'troca de fralda na madrugada',
      'troca a fralda', 'trocar fralda', 'trocou fralda',
      'troquei o pijama', 'troquei a roupinha',
      'depois da mamada troco', 'apos mamada troco', 'após mamada troco',
      'antes da mamada troco', 'antes de mamar troco',
      'troquei e depois mamou', 'mamou e troquei', 'mamou e depois troquei',
      'troquei e ele mamou', 'troquei e ela mamou',
    ],
    boostThemes: ['rotina_madrugada', 'acorda_ao_deitar', 'baixa_producao_fim_dia', 'mamadas_ineficientes'],
    priority:
      'TROCA DE FRALDA NA MADRUGADA — ORIENTAÇÃO PRÁTICA OFICIAL DO MÉTODO: a sequência ideal é TROCAR A FRALDA ANTES DA MAMADA, NUNCA DEPOIS. Trocar a fralda DEPOIS da mamada tende a despertar o bebê novamente, faz ele perder o estado de sonolência conquistado pela mamada e prolonga muito o tempo até o retorno ao sono. Trocando ANTES, o bebê mama em seguida, relaxa, arrota e adormece com mais naturalidade. CONDUTA OPERACIONAL OBRIGATÓRIA NA RESPOSTA: (1) trocar a fralda com MÍNIMA LUZ (luz indireta/abajur baixo, NUNCA luz do teto), POUCO MANUSEIO e SEM CONVERSA; (2) NÃO abrir janela, NÃO trocar de pijama, NÃO estimular o bebê; (3) em seguida, oferecer a mamada; (4) após a mamada, manter em POSIÇÃO VERTICAL POR 30 A 40 MINUTOS, observar arroto; (5) só então transferir para o berço com calma. PERGUNTA INDISPENSÁVEL quando a mãe relata despertar prolongado após a mamada de madrugada: "A troca de fralda foi feita antes ou depois da mamada?". Se a mãe relatou ter feito DEPOIS, EXPLIQUE de forma direta que isso pode ter contribuído para o despertar prolongado e oriente INVERTER a sequência nas próximas madrugadas (trocar antes, mamar depois). NÃO trate a troca de fralda noturna como sinal de início do dia. Não há problema, para o RN, em o dia começar um pouco mais tarde após uma madrugada difícil.',
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
      'QUEIXA SOBRE CHORO NO BANHO no RN: NÃO desvie para investigação alimentar (mamada efetiva, saciedade, produção/transferência) — a queixa é específica sobre BANHO. NÃO indique aulas de cólicas / Hora da Bruxa / Mamadas efetivas / Passo 4 / Início do Sono Noturno / Troca dia-noite como prioritárias para essa queixa. CONDUTA PRÁTICA para o banho do RN: (1) explicar que o choro no banho costuma vir de SENSAÇÃO DE QUEDA, INSEGURANÇA ou FRIO; (2) ENROLAR o bebê em uma FRALDA DE PANO durante o banho para aumentar a sensação de CONTENÇÃO, molhando o corpinho aos poucos; (3) observar se ele melhora quando fica com o CORPINHO MAIS SUBMERSO na água, sempre com apoio firme e supervisão total; (4) experimentar a posição DE BARRIGUINHA PARA BAIXO apoiado com segurança no braço do adulto (apoio firme, controle do corpo); (5) manter AMBIENTE AQUECIDO, sem correntes de ar; (6) deixar TUDO PREPARADO antes de começar; (7) escolher um momento em que ele NÃO esteja com muita fome nem muito irritado — banho logo após uma mamada cheia pode aumentar desconforto/regurgitação; (8) banho CURTO. FECHAMENTO OBRIGATÓRIO: "Com repetição e previsibilidade, muitos bebês vão se adaptando melhor ao banho." Encaminhamento ao pediatra APENAS com sinais associados — febre, recusa alimentar, prostração, vômitos importantes, choro inconsolável fora do banho ou mudança importante no comportamento — NÃO usar "se o choro persistir" como critério isolado.',
  },
  {
    id: 'cautious_seios_flacidos_rn',
    label: 'Pergunta sobre "seios flácidos / menor enchimento" exige cuidado (não diagnóstico isolado)',
    directive: true,
    phrases: [], // matched programmatically when retrieval mentions flaccid breast
    boostThemes: [],
    priority:
      'Ao investigar PRODUÇÃO de leite, EVITE dar a entender que "seio flácido" = pouco leite. Use linguagem cautelosa e prefira investigar EFETIVIDADE da mamada: o bebê faz sucção ativa? Você escuta deglutição? SOMENTE quando houver aleitamento materno — se usa fórmula/mamadeira, investigue volume, intervalo e sinais de saciedade em vez de seios/deglutição.',
  },
  {
    id: 'travesseiro_tried_without_success',
    label: 'Mãe JÁ TENTOU a Estratégia do Travesseiro sem sucesso — corrigir a aplicação',
    directive: true,
    phrases: [
      'ja tentei o travesseiro', 'já tentei o travesseiro', 'ja tentei usar o travesseiro', 'já tentei usar o travesseiro',
      'ja tentei o metodo do travesseiro', 'já tentei o método do travesseiro',
      'metodo do travesseiro', 'método do travesseiro',
      'ja usei o travesseiro', 'já usei o travesseiro', 'ja usei a estrategia do travesseiro',
      'tentei a estrategia do travesseiro', 'tentei a estratégia do travesseiro',
      'mesmo com a tecnica do travesseiro', 'mesmo com técnica do travesseiro',
      'mesmo com a estrategia do travesseiro', 'mesmo com a estratégia do travesseiro',
      'ja tentei a tecnica do travesseiro', 'já tentei a técnica do travesseiro',
      'travesseiro mas nao', 'travesseiro mas não', 'travesseiro e nao funciona', 'travesseiro e não funciona',
      'com o travesseiro ela acorda', 'com o travesseiro ele acorda',
    ],
    boostThemes: ['estrategia_travesseiro_execucao', 'dificuldade_berco', 'acorda_ao_deitar', 'reflexo_moro'],
    priority:
      'A mãe JÁ TENTOU a Estratégia do Travesseiro e NÃO teve sucesso. NÃO cite a estratégia de forma genérica — CORRIJA a aplicação e NUNCA perca o eixo alimentar. (1) ASSISTIR/REASSISTIR à aula e repetir EXATAMENTE como ensinado. (2) ETAPA INTERMEDIÁRIA: travesseiro EM CIMA DO COLO com CONTENÇÃO das mãos — PARTE DO PROCESSO, NÃO FALHA. (3) Investigue mamada efetiva, saciedade (listar os 6 sinais: soltar peito, relaxar corpo, abrir mãozinhas, reduzir sucção, tranquila após mamada, confortável após arroto/vertical), produção/transferência e queda de fluxo no fim da tarde — PERGUNTA OBRIGATÓRIA: "Você percebe queda no fluxo de leite no fim da tarde ou no começo da noite?". (4) Se sinais de mamada insuficiente: peito → livre demanda; fórmula/complemento → volume/intervalo/saciedade; reavaliar produção/transferência. (5) Arroto e posição vertical 30 a 40 min. (6) Charutinho se Moro/desorganização — inclusive sonecas diurnas. (7) Ambiente escuro, calmo, baixa estimulação. Leitura FISIOLÓGICA: adaptação fisiológica, organização corporal, transição de superfície/textura — NÃO "acostumado ao colo". Ao citar transição colo→berço, use "dificuldade NA transição" ou "ajudar NESSA transição" — PROIBIDO "se transição" ou substituição automática que quebre a gramática. NÃO encerrar com suporte humano genérico ("não hesite em buscar suporte") — só se houver dificuldade persistente na execução ou sinais clínicos importantes. Reassegure: com [N] dias AINDA NÃO CRIA associação negativa. AULAS: Travesseiro, Berço, Estimule o Arroto, Mamadas Efetivas, Charutinho (se Moro). NÃO indicar Início do Sono Noturno nem Troca dia/noite.',
  },
  {
    id: 'reflux_discomfort_suspicion',
    label: 'Sinais de refluxo/desconforto — diferenciar fisiológico x patológico e encaminhar',
    directive: true,
    phrases: [
      'refluxo', 'reflux', 'regurgita', 'regurgitacao', 'regurgitação', 'golfa', 'golfada', 'golfando',
      'vomita', 'vômita', 'vomito', 'vômito', 'vomitando', 'vomito em jato', 'vômito em jato', 'em jato',
      'engasga', 'engasgo', 'engasgos', 'se engasga',
      'arqueia', 'arqueando', 'arqueamento', 'arquea o corpo', 'arqueia o corpo', 'arqueia as costas',
      'recusa o peito', 'recusa a mamada', 'recusa alimentar', 'recusa de mamar',
      'parece com dor', 'chora de dor', 'desconforto apos mamar', 'desconforto após mamar',
      'acorda chorando no berco', 'acorda chorando no berço',
    ],
    boostThemes: ['refluxo_fisiologico', 'acorda_ao_deitar', 'dificuldade_berco'],
    priority:
      'Há sinais de REFLUXO/DESCONFORTO. DIFERENCIE explicitamente o REFLUXO FISIOLÓGICO da POSSIBILIDADE de refluxo patológico — sinais clínicos concretos de POSSÍVEL refluxo patológico (a investigar): vômitos intensos/em jato, engasgos frequentes, recusa alimentar persistente, arqueamento corporal importante, irritabilidade persistente. NUNCA diagnostique. MEDIDAS POSTURAIS (faixa metodológica atual): (A) POSIÇÃO VERTICAL 30 A 40 MIN após a mamada — SEMPRE obrigatória. (B) ELEVAÇÃO DO COLCHÃO — para REFLUXO FISIOLÓGICO, quando indicada, a faixa preferencial é 30 A 40 GRAUS; a elevação em 45° permanece aceitável quando indicada pelo método/material do Pediatra, MAS é reservada para REFLUXO PATOLÓGICO ou suspeita/investigação de refluxo patológico. NÃO escreva "elevação do colchão em 45° aplicável tanto ao refluxo fisiológico quanto à suspeita de refluxo patológico" — essa formulação foi marcada como erro pelo dossiê. ESCALONAMENTO GATED: o caminho completo (nomear "refluxo PATOLÓGICO" + MATERIAL DO PEDIATRA Roberto Franklin nas Aulas Extras/Bônus + SUPORTE HUMANO) só é OBRIGATÓRIO quando há PELO MENOS UM dos sinais clínicos concretos acima no relato da mãe. Sem esses sinais, basta citar refluxo FISIOLÓGICO como possibilidade de desconforto pós-mamada e orientar posição vertical 30 a 40 min — NÃO escalone, NÃO mencione elevação do colchão como recurso genérico, NÃO mande para o material do Pediatra/suporte humano.',
  },
  {
    id: 'diurnal_only_difficulty',
    label: 'Queixa só nas sonecas diurnas, noite preservada — ajustar período da hipótese',
    directive: true,
    phrases: [
      'sonecas diurnas curtas', 'soneca diurna curta', 'sonecas do dia curtas',
      'sonecas diurnas muito curtas', 'soneca diurna muito curta',
      'sonecas diurnas curtas no berco', 'sonecas diurnas curtas no berço',
      'sonecas diurnas estao mais dificeis', 'sonecas diurnas estão mais difíceis',
      'sonecas estao mais dificeis durante o dia', 'sonecas mais dificeis de dia', 'sonecas mais difíceis de dia',
      'durante o dia, as sonecas estao mais dificeis', 'durante o dia, as sonecas estão mais difíceis',
      'durante o dia as sonecas estao mais dificeis', 'durante o dia as sonecas estão mais difíceis',
      'sonecas estao mais dificeis', 'sonecas estão mais difíceis',
      'sonecas diurnas dificeis', 'sonecas diurnas difíceis',
      'de dia somente dorme no colo', 'de dia so dorme no colo', 'de dia só dorme no colo',
      'durante o dia as sonecas', 'durante o dia somente dorme no colo',
      'a noite dorme bem no berco', 'à noite dorme bem no berço', 'a noite dorme bem', 'à noite dorme bem',
      'a noite ela dorme bem no berco', 'de noite dorme bem no berco', 'de noite dorme bem',
      'a noite no berco dorme bem', 'no berco a noite dorme', 'a noite ele dorme bem no berco',
      'a noite, dorme bem no berco', 'a noite, dorme bem',
      'dorme bem a noite', 'dorme bem à noite',
    ],
    boostThemes: ['ajuste_periodo_queixa', 'mamadas_ineficientes', 'estrategia_travesseiro_execucao', 'reflexo_moro'],
    priority:
      'A queixa principal é de SONECAS DIURNAS curtas/difíceis e o sono NOTURNO está preservado. NÃO encaixe automaticamente o caso em "queda de produção no fim do dia/noite" — ajuste a hipótese alimentar ao PERÍODO CORRETO: foque nas MAMADAS DIURNAS (sustentação da soneca, saciedade e transferência de leite durante o DIA). O enquadramento vespertino/noturno NÃO se aplica aqui. Se houver reflexo de Moro impactando as sonecas, oriente o CHARUTINHO TAMBÉM DURANTE O DIA, especialmente nas sonecas diurnas. NÃO repita apenas recursos que a mãe já disse usar (Travesseiro, ruído, luminosidade) — avance para mamada efetiva, produção de leite (inclusive à tarde), saciedade e busca precoce pelo peito.',
  },
  {
    id: 'charutinho_night_only_rn',
    label: 'Charutinho funciona à noite + Moro/espasmos sem ele + sonecas diurnas difíceis (TESTE 004 RN 23d)',
    directive: true,
    // Composite signal — fired programmatically (see post-processing below).
    phrases: [],
    boostThemes: [
      'reflexo_moro',
      'estrategia_travesseiro_execucao',
      'mamadas_ineficientes',
      'baixa_producao_leite',
      'dificuldade_berco',
    ],
    priority:
      'PADRÃO CRÍTICO TESTE 004 (RN 23d): a mãe relata que o bebê dorme bem à NOITE com CHARUTINHO e que SEM o charutinho aparecem ESPASMOS pelo REFLEXO DE MORO; durante o DIA, as sonecas estão mais difíceis (mama bem, dorme no colo, acorda logo ao ser colocada no berço/Moisés mesmo com técnica do travesseiro). REGRAS OBRIGATÓRIAS NA RESPOSTA: (1) ORIENTE EXPLICITAMENTE que o CHARUTINHO TAMBÉM DEVE SER USADO DURANTE O DIA, especialmente nas SONECAS DIURNAS — escreva isso de forma direta, não basta indicar a aula. (2) "MAMA BEM" não confirma mamada efetiva — investigue concretamente SUCÇÃO COM RITMO, DEGLUTIÇÃO AUDÍVEL, SACIEDADE após a mamada e BUSCA PRECOCE pelo peito (volta a buscar o peito em pouco tempo). (3) Diferencie produção de leite × mamada efetiva. (4) Sequência prática organizada: mamada efetiva → arroto → posição vertical 30-40 min → CHARUTINHO NAS SONECAS DIURNAS → Estratégia do Travesseiro (com etapa intermediária no colo + contenção das mãos, porque a mãe já tentou) → transição gradual ao berço/Moisés. (5) NÃO formule como "manter exclusivamente no colo reforça a dificuldade de adaptação" — em RN o colo é RECURSO de organização, segurança e transição; reposicione como FASE DE ADAPTAÇÃO FISIOLÓGICA, ORGANIZAÇÃO CORPORAL e TRANSIÇÃO DE SUPERFÍCIE/TEXTURA, sem framing comportamental.',
  },
  {
    id: 'pacifier_isolated_complaint',
    label: 'Queixa ISOLADA sobre chupeta caindo (TESTE 005 RN 22d) — manter resposta no escopo',
    directive: true,
    // Composite signal — fired programmatically when pacifier_in_rn is the
    // only relevant complaint and there are no clinical signs.
    phrases: [],
    boostThemes: ['busca_excessiva_peito', 'mamadas_ineficientes'],
    priority:
      'QUEIXA ISOLADA DE CHUPETA (TESTE 005 RN 22d, regressão −3,0): a mãe relatou EXCLUSIVAMENTE que a chupeta cai e a bebê acorda — SEM mencionar refluxo, vômitos, engasgos, recusa, arqueamento, irritabilidade persistente, espasmos do Moro, charutinho noturno OU Estratégia do Travesseiro tentada. MANTENHA a resposta CURTA E FOCADA dentro do escopo da pergunta: (1) chupeta como apoio de reflexo de sucção e regulação; (2) com [N] dias ainda não cria associação negativa; (3) confirmar forma de alimentação se a mãe não informou ("Ela mama no peito, usa fórmula ou recebe complemento?"); (4) listar sinais de saciedade; (5) manejo da chupeta caindo — se cair e a bebê continuar dormindo, não recolocar; se acordar logo que cai, diferenciar fome real, necessidade de sucção, desconforto pós-mamada, sono leve e dificuldade de transição para o berço; (6) arroto e POSIÇÃO VERTICAL 30 A 40 MIN após a mamada; (7) transição para o berço. É TERMINANTEMENTE PROIBIDO incluir nesta resposta: refluxo patológico, elevação do colchão (em qualquer ângulo), material do Pediatra Roberto Franklin, Aulas Extras/Bônus, suporte humano, charutinho noturno como recurso já em uso, Estratégia do Travesseiro como já tentada, "como há sinais de refluxo", "como você já tentou X", "como o charutinho funciona à noite". AULAS PERTINENTES (escolher entre estas, máximo 2-3): REFLEXO DE SUCÇÃO, MAMADAS EFETIVAS, ESTIMULE O ARROTO. NÃO indicar aulas de refluxo, Travesseiro, Berço do Bebê, Moro/Charutinho como prioritárias se a mãe não trouxe sinais para esses temas. CONSISTÊNCIA DE GÊNERO: a mãe usa "minha bebê" / "ela" — manter feminino em toda a resposta; nunca escrever "se ele mama".',
  },
  {
    id: 'sonda_with_mama_bem_priority_production',
    label: 'Complemento com sonda + "mama bem" (TESTE 005 RN 16d) — priorizar baixa produção',
    directive: true,
    // Composite signal — fired programmatically when sonda + mama bem coexist.
    phrases: [],
    boostThemes: ['baixa_producao_leite', 'baixa_producao_fim_dia', 'mamadas_ineficientes'],
    priority:
      'PADRÃO CRÍTICO TESTE 011 (RN 16d): a mãe relata que a bebê AGORA está mamando bem E há complemento com sonda + busca pelo peito em intervalo <2h (especialmente fim da tarde/madrugada). A hipótese principal a NOMEAR EXPLICITAMENTE é BAIXA PRODUÇÃO MATERNA OU NECESSIDADE DE SUPORTE DE PRODUÇÃO — NÃO "baixa transferência". EXPLICITE a trava: "Como você informou que agora ela mama bem, icterícia e procedimento na linguinha ficam apenas como histórico, não como causa atual." É PROIBIDO citar icterícia ou linguinha como causa ATUAL. NÃO normalize a abertura com "é comum os bebês nessa fase apresentarem padrões de busca pelo peito", "fisiológico e esperado" ou "bastante comum". Modelo aceito: "Pelo padrão que você descreve, com busca pelo peito em intervalo menor que 2h começando no final da tarde e piorando na madrugada, a principal hipótese é baixa produção materna ou necessidade de suporte de produção nesse período, especialmente porque sua bebê já recebe complemento com sonda. Esse déficit pode ocorrer também durante o dia. Por isso, é importante avaliar se o complemento também precisa ser ajustado no final da tarde e durante o dia, além de considerar ordenhas como apoio à produção. Como você informou que agora ela mama bem, icterícia e procedimento na linguinha ficam apenas como histórico, não como causa atual." PERGUNTA OBRIGATÓRIA (já com "durante o dia"): o complemento foi orientado só para a noite ou também para o final da tarde e durante o dia? Durante o dia ela também busca o peito em menos de 2h? Incluir ORDENHAS no fim da tarde e ao longo do dia, segundo peito quando necessário, posição vertical 30 a 40 min. GÊNERO: manter feminino se a mãe usa ela/minha bebê — nunca "ele continua" ou "se ele mama". AULAS: Amamentação Prática e Descomplicada + Mamadas Efetivas.',
  },
  {
    id: 'wakes_short_after_crib_back_to_lap',
    label: 'Soneca curta no berço + acorda chorando após N minutos + melhora no colo (TESTE 004 RN 20d)',
    directive: true,
    // Composite signal — fired programmatically (see post-processing below).
    phrases: [],
    boostThemes: [
      'refluxo_fisiologico',
      'acorda_ao_deitar',
      'dificuldade_berco',
      'reflexo_moro',
      'mamadas_ineficientes',
      'baixa_producao_leite',
    ],
    priority:
      'PADRÃO CRÍTICO TESTE 008 (RN 20d): bebê é colocado no berço, permanece poucos minutos (~20 min), acorda chorando e SÓ MELHORA quando volta ao colo, com NOITE PRESERVADA. ABERTURA: "Sonecas curtas podem acontecer no RN, mas acordar chorando após cerca de 20 minutos no berço e melhorar apenas no colo não deve ser tratado como simplesmente esperado — merece investigação." QUATRO EIXOS OBRIGATÓRIOS no corpo: (1) mamada efetiva/saciedade/busca precoce/produção diurna; (2) refluxo fisiológico/desconforto pós-mamada; (3) possibilidade de refluxo patológico (sinais clínicos); (4) Moro/charutinho/contenção. AULAS: Estimule o Arroto, O que é o Refluxo, Travesseiro (secundário), Charutinho/Moro, Mamadas Efetivas. NÃO indicar Troca dia-noite / Início do Sono Noturno. OBRIGATÓRIO: posição vertical 30 a 40 min. Refluxo fisiológico → elevação 30 a 40°; refluxo patológico/suspeita/investigação → elevação 45° + material do Pediatra Roberto Franklin (Aulas Extras/Bônus) + SUPORTE HUMANO (obrigatório quando houver investigação de refluxo patológico).',
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
  {
    id: 'wake_window_before_nap',
    label: 'tempo acordado antes de iniciar a condução da soneca (já informado)',
    phrases: [
      'janela de sono del eh de 1',
      'janela de sono dele eh de 1',
      'janela de sono dele e de 1',
      'janela de sono dela eh de 1',
      '1 hr/1 hr 15',
      '1 hr/1 hr',
      '1h/1h15',
      '1h / 1h15',
      'quando vai dando este horario',
      'quando vai dando este horário',
    ],
    askKeywords: [
      'permanece acordado antes',
      'permanecer acordado antes',
      'antes de iniciar a conducao',
      'antes de iniciar a condução',
      'antes das sonecas',
    ],
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
    phrases: [
      'acorda logo', 'acorda em seguida', 'acorda na hora', 'desperta em',
      'acorda depois de', 'acorda assim que', 'desperta logo',
      // Explicit minutes-based latencies the mother volunteers (TESTE 004 RN 20d):
      // "permanece cerca de 20 minutos", "fica 15 minutos", "depois de 10 minutos"
      'permanece cerca de', 'permanece por cerca de', 'permanece por',
      'fica cerca de', 'fica por cerca de', 'fica por',
      'apos cerca de', 'após cerca de', 'depois de cerca de',
      'apos uns', 'após uns', 'depois de uns',
      'em cerca de', 'em poucos minutos', 'apos poucos minutos', 'após poucos minutos',
      'depois de poucos minutos',
      'permanece 10', 'permanece 15', 'permanece 20', 'permanece 25', 'permanece 30',
      'fica 10 min', 'fica 15 min', 'fica 20 min', 'fica 25 min', 'fica 30 min',
      'apos 10 min', 'apos 15 min', 'apos 20 min', 'apos 25 min', 'apos 30 min',
      'após 10 min', 'após 15 min', 'após 20 min', 'após 25 min', 'após 30 min',
      'depois de 10 min', 'depois de 15 min', 'depois de 20 min', 'depois de 25 min', 'depois de 30 min',
    ],
    askKeywords: ['em quanto tempo', 'desperta apos', 'desperta após', 'quanto tempo ele desperta', 'quanto tempo ela desperta'],
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
  'wakes_short_after_crib_back_to_lap',
  'charutinho_night_only_rn',
  'pacifier_isolated_complaint',
  'sonda_with_mama_bem_priority_production',
  'bath_crying_isolated_rn',
]);

/** Signals whose priorities/framing are RN-only and must NOT fire on 30_60+. */
const RN_ONLY_SIGNAL_IDS = new Set([
  'asks_how_to_improve',
  'pacifier_in_rn',
  'fear_negative_association_rn',
  'cite_explicit_age_rn',
  'cautious_seios_flacidos_rn',
  'mama_bem_with_concurrent_symptoms',
  'night_hunger_signs_rn',
  'charutinho_night_only_rn',
  'pacifier_isolated_complaint',
  'bath_crying_rn',
  'bath_crying_isolated_rn',
  'crib_ok_day_problem_night',
  'sonda_with_mama_bem_priority_production',
  'travesseiro_tried_without_success',
]);

const SIGNAL_DEFS_30_60 = [
  {
    id: 'wake_window_30_60',
    label: 'Janela de vigília 30–60 dias',
    directive: true,
    phrases: [
      'janela de sono', 'janela de vigilia', 'janela de vigília', 'tempo acordado',
      'demora para dormir', 'demora para iniciar', 'demora muuuito', 'demora muito',
      'sonecas curtas', 'soneca curta', 'um ciclo de sono', 'ciclo de sono',
    ],
    boostThemes: ['janela_sono_sonecas', 'vigilia_excessiva_diurna', 'rotina_estruturada'],
    priority:
      'Faixa 30–60: janela de vigília de referência = 45 minutos a 1 hora e 15 minutos. NÃO diga que a janela é só 1h–1h15 e NÃO omita os 45 minutos. NÃO imponha mínimo de 4 a 5 sonecas. Se a condução começa após ~1h–1h15 e o bebê ainda demora ~40–45 min para adormecer, o tempo total até ADORMECER (~1h40–2h) é o dado central — nomeie VIGÍLIA EXCESSIVA como eixo.',
  },
  {
    id: 'no_mau_habito_30_60',
    label: 'Bloqueio de rótulo mau hábito (0–3 meses)',
    directive: true,
    phrases: [
      'mau habito', 'mau hábito', 'maus habitos', 'maus hábitos', 'so dorme no colo',
      'só dorme no colo', 'so dorme no peito', 'só dorme no peito', 'chupeta',
      'travesseiro', 'balancar', 'balançar', 'dorme sozinho',
    ],
    boostThemes: [
      'conducao_sem_rotulo_habito',
    ],
    priority:
      'REGRA OBRIGATÓRIA 0–3 meses (inclui 30–60): NÃO classifique como mau hábito. Investigue vigília, alimentação/saciedade, desconforto e condução. NÃO indique a aula "Ensinando a dormir e tirando os maus hábitos". NÃO fixe ~10 minutos de choro.',
  },
  {
    id: 'vertical_20_30_30_60',
    label: 'Posição vertical 20–30 min (30–60)',
    directive: true,
    phrases: [
      'posicao vertical', 'posição vertical', 'depois de mamar', 'apos a mamada',
      'após a mamada', 'arrotar', 'refluxo', 'desconforto',
    ],
    boostThemes: ['posicao_vertical_30_60', 'despertar_irritado_pos_soneca'],
    priority:
      'Posição vertical nesta faixa: referência GERAL 20 a 30 minutos. Use 30 a 40 minutos SOMENTE se houver refluxo ou desconforto claro. NÃO aplique 30–40 min como rotina automática.',
  },
  {
    id: 'night_start_19_20_30_60',
    label: 'Início do sono noturno 19h–20h',
    directive: true,
    phrases: [
      'sono noturno', 'iniciar o sono', 'inicio do sono', 'início do sono',
      '21h', '21:30', '21h30', '22h', '22:00', 'banho', '19h', '20h',
    ],
    boostThemes: ['inicio_sono_noturno_30_60', 'rotina_estruturada'],
    priority:
      'Responda DIRETO: horário recomendado de início do sono noturno = 19h a 20h. Se a mãe já inicia às 21h, diga que 21h TAMBÉM já está além dessa faixa. 21h30/22h NÃO é recomendado (diga UMA vez). Banho às 21h30 NÃO é recomendado quando atrasa o início do sono noturno. A demora para adormecer NÃO se explica só pelas 21h: leia também a última soneca e a janela (45min–1h15). Pergunte a última soneca UMA vez. NÃO mande revisar genericamente os módulos 3 e 4 (já há aulas específicas). NÃO indique Passo 1 sem necessidade. Mantenha o gênero consistente com o perfil.',
  },
  {
    id: 'nap_angry_wake_30_60',
    label: 'Despertar irritado após soneca adequada',
    directive: true,
    phrases: [
      'acorda muito brava', 'acorda brava', 'acorda bravo', 'acorda chorando',
      'chora bastante', 'so acalma', 'só acalma', 'mama bem pouco e relaxa',
      'sonecas de 1h', 'soneca de 1h', 'faz sonecas de 1',
    ],
    boostThemes: ['despertar_irritado_pos_soneca', 'posicao_vertical_30_60'],
    priority:
      'Se a soneca informada é ~1h ou mais, NÃO chame de soneca curta. NÃO abra dizendo que é normal acordar irritado/chorando nem cite “adaptação ao sono”. NÃO normalize o choro pelo fato de a soneca ter durado 1h ou mais — isso só afasta soneca curta como eixo, sem explicar o choro. NÃO pergunte como está o sono noturno: a queixa é o despertar após a soneca diurna. COMECE: como ela consegue dormir por cerca de 1 hora ou mais, a duração não é o principal ponto; o que chama atenção é acordar muito irritada e relaxar depois de sugar um pouco. Eixo = alimentação/saciedade → efetividade da mamada → pós-mamada (arroto, vertical 20–30 min) → desconforto/refluxo. ESCREVA EM LINGUAGEM NATURAL PARA A MÃE. NÃO indique aula de Janela de Vigília como solução principal.',
  },
  {
    id: 'bottle_volume_30_60',
    label: 'Mamadeira de aprendizado / volume',
    directive: true,
    phrases: [
      'mamadeira', 'quantos ml', 'quantos ml', 'introduzir 1 mamadeira', 'ml devo',
      'quanto tempo dura a amamentacao', 'quanto tempo dura a amamentação',
    ],
    boostThemes: ['mamadeira_aprendizado_volume', 'volta_trabalho_mamadeira'],
    priority:
      'Mamadeira de aprendizado: ~90 ml no primeiro mês e ~120 ml no segundo mês. Aos 40 dias (segundo mês) a referência é aproximadamente 120 ml — diga UMA vez, já com o contexto do segundo mês. Peito: cerca de 20 minutos, podendo ser mais curta ou ~30 minutos. O tempo isoladamente não determina o término: o parâmetro é retirada efetiva de leite e sinais de saciedade. NÃO introduza leitura comportamental da sucção. NÃO fale em hábito a corrigir. NÃO garanta ausência de desmame/confusão de bico. NÃO gere frases truncadas. Se as duas perguntas objetivas (duração e ml) já foram respondidas e não há sinal de problema, NÃO faça perguntas complementares. Indique SOMENTE conteúdo de mamadeira/volta ao trabalho.',
  },
  {
    id: 'excess_total_wake_30_60',
    label: 'Vigília total excessiva (condução + demora para adormecer)',
    directive: true,
    phrases: [
      'soneca grande pela manhã', 'soneca grande pela manha',
      'demora muuuito', 'demora muito pra relaxar', 'demora muuuito prw relaxar',
      '40/45 minutos', '40 a 45 minutos', 'quase 40/45',
      '2 hrs/ 2 hrs e 30', '2 hrs/ 2 hrs',
    ],
    boostThemes: ['vigilia_excessiva_diurna', 'janela_sono_sonecas', 'rotina_estruturada'],
    priority:
      'VIGÍLIA TOTAL: some o tempo acordado antes da condução + o tempo até adormecer. Referência 45 minutos a 1 hora e 15 minutos. Se inicia após 1h–1h15 e ainda demora 40–45 min, o total (~1h40–2h) está excessivo — ESSE é o eixo da demora para relaxar no berço. Avance direto para essa análise — NÃO abra com “é normal ter variações nas sonecas”. Fracione a soneca longa da manhã para ~1h30–2h para observar a DISTRIBUIÇÃO da tarde — diga isso UMA vez; NÃO apresente a soneca da manhã como causa direta dos 40–45 min. Alimentação: una em UM único trecho — se a demora aproxima o próximo intervalo de mamada, considere fome; pergunte o intervalo UMA vez, já explicando por quê. NÃO diga "caprichar nas mamadas para relaxar". NÃO pergunte duração das sonecas nem tempo acordado se a mãe já informou (incluindo “antes de iniciar a condução” e “antes das sonecas”). NÃO indique Estratégia do Travesseiro neste eixo. Antes de entregar: elimine repetições e perguntas já respondidas.',
  },
  {
    id: 'keep_pacifier_30_60',
    label: 'Mãe quer manter a chupeta e conduzir despertares',
    directive: true,
    phrases: [
      'nao quero retira-la', 'não quero retirá-la', 'nao quero retirar',
      'não quero retirar', 'recolado a chupeta', 'recolocado a chupeta',
      'retome o sono sem colocar a chupeta',
    ],
    boostThemes: ['chupeta_despertares_soneca'],
    priority:
      'A mãe NÃO quer retirar a chupeta. Respeite. Eixo = MUDANÇA RECENTE de padrão (sonecas longas → acorda em um ciclo), NÃO vigília excessiva — ela NÃO informou o tempo acordado entre sonecas; não transforme ausência de dado em hipótese principal. Preserve iniciar o sono sozinho no berço. CONDUÇÃO PRÁTICA: ela já relatou que às vezes ele retoma sem a chupeta — oriente observar alguns instantes no despertar (se o choro não cresce) e recolocar a chupeta se precisar. Investigue alimentação, saciedade, desconforto, sucção e se a queda coincide com o despertar. Janela 45min–1h15 só como causa se houver dado de que foi ultrapassada. NÃO misture colo/peito/travesseiro. NÃO classifique como mau hábito.',
  },
  {
    id: 'short_naps_pacifier_mention_30_60',
    label: 'Sonecas curtas + menção de chupeta (sem nexo)',
    directive: true,
    phrases: [
      'sonecas duram', 'média de 30 min', 'media de 30 min',
      'despertares durante as sonecas',
    ],
    boostThemes: ['sonecas_curtas_chupeta_condicional', 'janela_sono_sonecas'],
    priority:
      'Sonecas de ~30 min podem ocorrer nesta idade. Hierarquia: como o bebê desperta → alimentação/saciedade → desconforto → vigília 45min a 1h15 → chupeta SOMENTE se a queda coincidir com o despertar. "Usa chupeta" NÃO autoriza hipótese principal. Formulação: "Como ele usa chupeta, vale observar se os despertares acontecem justamente quando ela cai. Se não houver essa relação, não há motivo para considerá-la causa principal." NÃO infira soneca de 30 min → iniciar a condução mais cedo. Só ajuste a janela se o tempo acordado estiver fora de 45min–1h15 ou se os sinais de sono aparecerem antes. NÃO acrescente que acorda irritado se a mãe só informou despertares: pergunte/observe como desperta. Consolide chupeta e janela em um trecho cada. NÃO imponha mínimo de 4–5 sonecas. Vertical geral 20–30 min.',
  },
  {
    id: 'day_sleep_difficulty_30_60',
    label: 'Dificuldade para dormir de dia (colo/peito/travesseiro)',
    directive: true,
    phrases: [
      'dificuldade de dormir durante o dia', 'dificuldade para dormir durante o dia',
      'só dorme se for no colo', 'so dorme se for no colo',
      'quanto tempo pra ela aprender', 'quanto tempo para ela aprender',
    ],
    boostThemes: ['conducao_sono_diurno', 'estrategia_travesseiro_execucao'],
    priority:
      'Eixo = dificuldade para dormir DURANTE O DIA, não "adaptação ao berço" nem "acostumada ao colo/peito". Na fala à mãe use “passo a passo”, não “hierarquia”. Passo a passo: vigília 45min–1h15 → mamada efetiva → saciedade → se ainda há fome, manter alimentação; se saciada e permanece no peito, retirar do peito → posição vertical → conduzir ao sono. NÃO vincule o fim da janela a uma nova mamada: alimentação = horário da última mamada → mamada efetiva → saciedade → sinais de fome. NÃO diga “buscando conforto” antes de avaliar a mamada. NÃO use “apenas por conforto” como critério para retirar do peito. NÃO oriente interrupção do peito a partir de “mamada por conforto”. NÃO exija iniciar o Travesseiro com a bebê calma: investigue execução e momento da vigília UMA vez. Sempre que indicar a Estratégia do Travesseiro, direcione para a aula correspondente. Sem prazo fixo. Sem ~10 min de choro. Contenção ok.',
  },
  {
    id: 'early_night_ritual_crib_30_60',
    label: 'Ritual cedo (18h30) até adormecer às 20h + transferência ao berço',
    directive: true,
    phrases: [
      '18:30', '18h30', '18h 30', 'umas 18:30', 'umas 18h30',
      'criar autonomia',
      'habituar com o berço', 'habituar com o berco',
      'meio acordada ainda', 'transferir pro berço', 'transferir pro berco',
    ],
    boostThemes: ['ritual_noturno_cedo_30_60', 'janela_sono_sonecas'],
    priority:
      'NÃO leia 18h30 só como ritual visando 19h–20h. NÃO determine que a rotina/ritual tenha que começar entre 19h e 20h. Ritual noturno deve ser BREVE (banho, mamada, dormir). NÃO normalize 18h30 até 20h como “não é necessariamente um problema”: se inicia às 18h30 e só adormece às 20h, verifique quanto tempo permaneceu acordada — ritual breve e janela 45min–1h15. Duas possibilidades: (1) se estiver pronta, iniciar a noite ~18h30; (2) se ainda for cedo, soneca de até ~1h e iniciar a noite depois. Berço: mamou e adormeceu → pode ir dormindo; vai dormir sem mamar → pode conduzir no berço acordada. NÃO exija “colocar acordada” para autonomia/habituação ao berço.',
  },
  {
    id: 'crib_awake_start_30_60',
    label: 'Início do sono no berço: acordado vs sono leve/profundo',
    directive: true,
    phrases: [
      'sono leve', 'sono profundo',
      'esperar ele dormir sozinho', 'esperar ela dormir sozinho',
      'colocar no berço e esperar', 'colocar no berco e esperar',
      'posso colocar no berço', 'posso colocar no berco',
      'preciso colocar ele em sono', 'preciso colocar ela em sono',
    ],
    boostThemes: ['inicio_sono_berco_acordado_30_60'],
    priority:
      'Responda DIRETO, sem fallback. Se estiver tranquilo e sem chorar, PODE colocar acordado no berço e dar a oportunidade de adormecer ali. NÃO é obrigatório esperar sono leve ou profundo. Se irritar/chorar, acalmar e seguir a condução — NÃO exigir autonomia. Se a mamada coincidir e adormecer mamando, pode ir já dormindo; NÃO acordar para colocar acordado. A Estratégia do Travesseiro pode ajudar na condução e na colocação no berço, dando mais segurança à mãe — NÃO diga só “ajudar na transição”. Direcione para a aula UMA vez. NÃO puxe excesso de estímulos, janela de sono, rotina ou ruído branco nesta dúvida. NÃO peça idade de novo.',
  },
  {
    id: 'crib_adaptation_same_day_30_60',
    label: 'Adaptação ao berço: todas as sonecas do mesmo dia',
    directive: true,
    phrases: [
      'ensinando a adormecer', 'adormecer direto no berço', 'adormecer direto no berco',
      'progressivamente', 'avançando gradativamente', 'avancando gradativamente',
      'todas as sonecas de uma vez', 'em todas as sonecas de uma vez',
      'fico uns 10 min', 'refaço o processo', 'refaco o processo',
    ],
    boostThemes: ['adaptacao_berco_mesmo_dia_30_60', 'conducao_sono_diurno'],
    priority:
      'NÃO oriente avançar UMA soneca por vez ao longo dos dias. Comece pela PRIMEIRA soneca da manhã e siga com TODAS as demais sonecas DAQUELE MESMO DIA no berço. Repita diariamente até consolidar. Resistência: acalmar no colo → voltar ao berço → repetir até adormecer. NÃO cronometrar o choro. Janela 45min–1h15. NÃO diga “ter paciência e respeitar a resposta do bebê”: oriente consistência e repetição, acolhendo o choro e ajudando no colo quando necessário. Indique a Estratégia do Travesseiro de forma DIRETA (não “pode ser uma boa estratégia”) e encaminhe para a aula. NÃO puxe horário de início da noite 19h–20h neste eixo.',
  },
  {
    id: 'pacifier_drop_long_wake_30_60',
    label: 'Chupeta cai no sono + janela habitual acima de 1h15',
    directive: true,
    phrases: [
      'quando a chupeta cai', 'chupeta cai da boca',
      'devo colocá-la logo', 'devo coloca-la logo',
      'esperar um pouco para colocá-la', 'esperar um pouco para coloca-la',
      'janela de sono dele está maior', 'janela de sono dele esta maior',
      'maior que 1h15', '1h30 a 1h45', '1h30 a 1h45',
    ],
    boostThemes: ['chupeta_cai_durante_sono_30_60', 'janela_sono_sonecas'],
    priority:
      'Responda as DUAS dúvidas. Chupeta: se só reclamar ao cair, NÃO recolocar imediatamente — observe se continua dormindo; se despertar e precisar de ajuda, ofereça de novo. Diga isso UMA vez. Janela: 45 minutos a 1 hora e 15 minutos; 1h30–1h45 habitual JÁ está acima — compare com a referência, SEM “principal hipótese de vigília excessiva” e sem rotular “vigília excessiva” se basta dizer que está acima. Observar sinais de sono e preparar ANTES de passar de 1h15. Pergunte “quanto tempo ele demora para entrar em sono” — NÃO “depois de deitar”. NÃO pergunte a duração da soneca da manhã. NÃO fracionar a soneca da manhã nem inferir dificuldade na tarde se a mãe não informou; se faltar dado, pergunte antes de intervir. NÃO peça idade de novo. NÃO use fallback nem suporte humano: há conteúdo metodológico suficiente.',
  },
  {
    id: 'night_hourly_wakes_30_60',
    label: 'Despertares de hora em hora após as 4h (investigar alimentação)',
    directive: true,
    phrases: [
      'após as 04:00', 'apos as 04:00', 'após as 4:00', 'apos as 4:00',
      'depois das 04:00', 'depois das 4:00',
      'acorda de 1 em 1', 'de 1 em 1 hrs', 'de 1 em 1 horas',
      'mama mesmo sabendo que não é fome', 'mama mesmo sabendo que nao e fome',
      'ninando no colo sem sucesso',
      'continuo assim por ele ainda ser novinho',
    ],
    boostThemes: ['despertares_madrugada_alimentacao_30_60', 'sono_noturno_30_60'],
    priority:
      'Preserve o relógio: “após as 4h da manhã” NÃO é “após 4 horas de sono”. Fluxo: (1) horário da última mamada antes das 4h; (2) rotina alimentar do DIA (intervalos, efetividade, manutenção da saciedade, produção); (3) medidas posturais pós-mamada (arroto, vertical 20–30 min) e desconforto; (4) se já passaram ~2h30–3h, mamada efetiva até a saciedade; se ainda não completou o intervalo desde uma mamada efetiva, tentar conduzir ao sono sem oferecer o peito imediatamente. O intervalo de 3h NÃO decide sozinho, isolado desses dados, que a mamada é desnecessária. NÃO use intervalo fixo de 3h para evitar mamada sem essa avaliação. NÃO diga "não é necessário acordá-lo" se a mãe NÃO está acordando o bebê. NÃO diga que investigar alimentação ajuda a evitar associação despertar–mamada. NÃO comece por associação peito–sono. A percepção de que "não é fome" NÃO basta — oferecer o peito não se resume a ele ser novinho. NÃO entregue frases truncadas (ex.: "Isso pode ajudar a" sem conclusão).',
  },
];

export function extractSignals({ message, conversation, ageBand, ageDays } = {}) {
  const motherText = collectMotherText({ message, conversation });
  const norm = normalize(motherText);
  const currentNorm = normalize(message);

  const signals = [];
  const boostThemes = new Set();
  const priorities = [];
  let hasDirectiveSignal = false;

  const isRnBand =
    String(ageBand || '').toLowerCase() === 'rn' ||
    (Number.isFinite(ageDays) && ageDays >= 0 && ageDays <= 28);
  const is3060Band =
    String(ageBand || '').toLowerCase() === '30_60' ||
    (Number.isFinite(ageDays) && ageDays >= 29 && ageDays <= 60);

  for (const def of SIGNAL_DEFS) {
    // Skip synthetic signals here; they are computed after the main pass.
    if (SYNTHETIC_SIGNAL_IDS.has(def.id)) continue;
    // Prevent RN-only directives (vertical 30–40, sequência noturna, etc.) from
    // contaminating 30_60+ answers (official 30–60 dossiers).
    if (!isRnBand && RN_ONLY_SIGNAL_IDS.has(def.id)) continue;
    const matched = def.phrases.filter((p) => norm.includes(normalize(p)));
    if (matched.length) {
      signals.push({ id: def.id, label: def.label, matched });
      def.boostThemes.forEach((t) => boostThemes.add(t));
      priorities.push(def.priority);
      if (def.directive) hasDirectiveSignal = true;
    }
  }

  if (is3060Band) {
    for (const def of SIGNAL_DEFS_30_60) {
      const matched = def.phrases.filter((p) => norm.includes(normalize(p)));
      if (matched.length) {
        signals.push({ id: def.id, label: def.label, matched });
        def.boostThemes.forEach((t) => boostThemes.add(t));
        priorities.push(def.priority);
        if (def.directive) hasDirectiveSignal = true;
      }
    }

    // 40d pacifier: "ciclo de sono" must NOT become vigília excessiva without a reported wake window.
    const hasKeepPacifier = signals.some((s) => s.id === 'keep_pacifier_30_60');
    const reportedWakeWindow = /1\s*h(r|ora)?\s*(\/|-|a|à)?\s*1\s*h?\s*15|janela de (sono|vig[ií]lia)|40\s*\/\s*45|quase 40/.test(norm);
    if (hasKeepPacifier && !reportedWakeWindow) {
      const drop = new Set(['excess_total_wake_30_60', 'wake_window_30_60']);
      for (let i = signals.length - 1; i >= 0; i -= 1) {
        if (!drop.has(signals[i].id)) continue;
        const onlyCycle = (signals[i].matched || []).every((m) =>
          /ciclo de sono|sonecas? curtas?/i.test(m),
        );
        if (signals[i].id === 'excess_total_wake_30_60' || onlyCycle) {
          signals.splice(i, 1);
        }
      }
      boostThemes.delete('vigilia_excessiva_diurna');
      for (let i = priorities.length - 1; i >= 0; i -= 1) {
        if (/VIGÍLIA TOTAL|nomeie VIGÍLIA EXCESSIVA/i.test(priorities[i])) {
          priorities.splice(i, 1);
        }
      }
    }

    // 48d: 18h30→20h is a different axis from "start night at 19h–20h / don't bathe at 21h30".
    if (signals.some((s) => s.id === 'early_night_ritual_crib_30_60')) {
      for (let i = signals.length - 1; i >= 0; i -= 1) {
        if (signals[i].id === 'night_start_19_20_30_60') signals.splice(i, 1);
      }
      for (let i = priorities.length - 1; i >= 0; i -= 1) {
        if (/21h30\/22h NÃO é recomendado|Banho às 21h30/i.test(priorities[i])) {
          priorities.splice(i, 1);
        }
      }
    }

    // 57d same-day crib adaptation is not the 56d "acordado vs sono leve/profundo" axis.
    if (signals.some((s) => s.id === 'crib_adaptation_same_day_30_60')) {
      for (let i = signals.length - 1; i >= 0; i -= 1) {
        if (signals[i].id === 'crib_awake_start_30_60') signals.splice(i, 1);
      }
    }

    // 56d / 57d crib-start questions are not the 19h–20h night-start axis.
    if (signals.some((s) => s.id === 'crib_awake_start_30_60' || s.id === 'crib_adaptation_same_day_30_60')) {
      for (let i = signals.length - 1; i >= 0; i -= 1) {
        if (signals[i].id === 'night_start_19_20_30_60') signals.splice(i, 1);
      }
      for (let i = priorities.length - 1; i >= 0; i -= 1) {
        if (/21h30\/22h NÃO é recomendado|Banho às 21h30/i.test(priorities[i])) {
          priorities.splice(i, 1);
        }
      }
    }
    // 48d (18h30) keeps the early-ritual axis; 56d (sono leve/profundo without 18h30) does not.
    if (/18h?[:h]?30|18:30/.test(norm)) {
      for (let i = signals.length - 1; i >= 0; i -= 1) {
        if (signals[i].id === 'crib_awake_start_30_60') signals.splice(i, 1);
      }
    } else if (signals.some((s) => s.id === 'crib_awake_start_30_60')) {
      for (let i = signals.length - 1; i >= 0; i -= 1) {
        if (signals[i].id === 'early_night_ritual_crib_30_60') signals.splice(i, 1);
      }
    }

    // 55d: drop-during-sleep is not the "keep pacifier / recent change" axis.
    if (signals.some((s) => s.id === 'pacifier_drop_long_wake_30_60')) {
      for (let i = signals.length - 1; i >= 0; i -= 1) {
        if (signals[i].id === 'keep_pacifier_30_60') signals.splice(i, 1);
      }
    }
  }

  // Synthetic: ALWAYS cite explicit age when we're in the RN band and have ageDays.
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

  // Synthetic RN-only enrichers — must not run on 30_60+ (official dossiers).
  if (isRnBand) {
  // Synthetic: when feeding/production signals fire, attach the cautious-flaccid-breast
  // directive so the LLM uses careful language about "seios flácidos".
  const productionSignalIds = new Set([
    'evening_pattern', 'night_production_drop', 'short_feeding_interval',
    'feeding_clinical_context', 'mama_bem_with_concurrent_symptoms',
    'late_crib_placement', 'wakes_on_transfer', 'diurnal_only_difficulty',
    'travesseiro_tried_without_success',
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
    'diurnal_only_difficulty', 'reflux_discomfort_suspicion', 'travesseiro_tried_without_success',
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
  } // end isRnBand enrichers (production / mama bem)

  if (isRnBand) {
  // Composite signal — TESTE 004 (RN 20d): bebê é colocado no berço, permanece
  // poucos minutos, acorda chorando e SÓ MELHORA NO COLO. Este padrão exige
  // investigação obrigatória de refluxo (fisiológico x patológico), Moro/
  // charutinho, elevação do colchão em 45° e suporte humano. Detectamos via
  // composição de fragmentos textuais para tolerar variações.
  const cribStayPattern =
    /(permane[cç]e\s+(cerca\s+de\s+)?\d+\s*min|fica\s+(cerca\s+de\s+)?\d+\s*min(?:\s+no\s+ber[cç]o)?|dura\s+\d+\s*min|por\s+(volta\s+de\s+)?\d+\s*min(?:utos)?\s+no\s+ber[cç]o|ap[oó]s\s+(cerca\s+de\s+)?\d+\s*min|depois\s+de\s+\d+\s*min|sonecas?\s+diurnas?\s+muito\s+curtas?|sonecas?\s+diurnas?\s+curtas?\s+no\s+ber[cç]o|sonecas?\s+curtas?\s+no\s+ber[cç]o)/;
  const cryAtCribPattern =
    /(acorda\s+chorando|desperta\s+chorando|acorda\s+e\s+chora|chora\s+ao\s+acordar|acorda\s+chorando\s+no\s+ber[cç]o)/;
  const improvesOnLapPattern =
    /(volta\s+a\s+dormir\s+(bem\s+)?(apenas\s+)?(se\s+)?(no\s+|ao\s+ir\s+para\s+o\s+|ao\s+colo|no\s+colo)|melhora(?:r)?\s+(?:s[oó]\s+)?(no\s+colo|ao\s+ir\s+para\s+o\s+colo)|s[oó]\s+(?:dorme|relaxa|fica\s+bem)\s+no\s+colo|pego\s+e\s+ficar?\s+no\s+colo|pega-?lo\s+no\s+colo|peg(?:a-)?lo\s+e\s+ficar\s+no\s+colo|volta\s+(?:bem|tranquilo)\s+no\s+colo|fica\s+bem\s+no\s+colo)/;
  if (
    cribStayPattern.test(norm) &&
    cryAtCribPattern.test(norm) &&
    improvesOnLapPattern.test(norm)
  ) {
    const def = SIGNAL_DEFS.find((d) => d.id === 'wakes_short_after_crib_back_to_lap');
    if (def) {
      signals.push({ id: def.id, label: def.label, matched: ['composite-pattern'] });
      def.boostThemes.forEach((t) => boostThemes.add(t));
      priorities.push(def.priority);
      hasDirectiveSignal = true;
    }
  }
  } // end isRnBand crib/reflux composite

  // Composite signal — TESTE 004 (RN 23d): mãe relata que charutinho funciona
  // À NOITE e que SEM ele aparecem espasmos pelo Moro; e que durante o DIA as
  // sonecas estão difíceis. A leitura correta exige orientar charutinho TAMBÉM
  // DURANTE O DIA e investigar mamada efetiva concretamente (não basta "mama
  // bem").
  const charutinhoNightPattern =
    /(charutinho|charuto|enrolad).{0,80}(a\s+noite|à\s+noite|de\s+noite|noite|dorme\s+bem)|(dorme\s+bem\s+(a|à)\s+noite|dorme\s+bem\s+de\s+noite|noite\s+dorme\s+bem).{0,80}(charutinho|charuto|enrolad)|apenas\s+com\s+charutinho|s[oó]\s+com\s+charutinho/;
  const moroSpasmsPattern =
    /(espasmos|sobressaltos|sustos|sustos\s+e\s+espasmos|espasmos\s+do\s+moro|reflexo\s+de\s+moro)/;
  const diurnalNapDifficultyPattern =
    /(durante\s+o\s+dia|de\s+dia|sonecas?\s+diurnas?|nas\s+sonecas\s+do\s+dia).{0,120}(mais\s+dif[ií]ceis|dif[ií]ceis|curtas?|acorda\s+logo|n[aã]o\s+permanece|n[aã]o\s+fica)|sonecas?\s+est[aã]o\s+(mais\s+)?dif[ií]ceis/;
  if (
    charutinhoNightPattern.test(norm) &&
    moroSpasmsPattern.test(norm) &&
    diurnalNapDifficultyPattern.test(norm)
  ) {
    const def = SIGNAL_DEFS.find((d) => d.id === 'charutinho_night_only_rn');
    if (def) {
      signals.push({ id: def.id, label: def.label, matched: ['composite-charutinho-night-only'] });
      def.boostThemes.forEach((t) => boostThemes.add(t));
      priorities.push(def.priority);
      hasDirectiveSignal = true;
    }
  }

  if (isRnBand) {
  // Composite signal — TESTE 005 (RN 22d, regressão −3,0): queixa ISOLADA sobre
  // chupeta caindo, sem que a mãe tenha relatado nenhum sinal clínico de
  // refluxo, espasmos do Moro, charutinho noturno em uso ou Estratégia do
  // Travesseiro tentada. Nesse cenário a resposta deve permanecer no escopo da
  // chupeta — bloqueando explicitamente a importação de blocos sobre refluxo
  // patológico, Pediatra Roberto Franklin, suporte humano, 45° e travesseiro.
  const hasPacifierSignal = signals.some((s) => s.id === 'pacifier_in_rn');
  const hasClinicalRefluxSignsInMessage =
    /(vom[ií]to|engasgo|engasga|recus(a|ar)\s+aliment|arquei[ao]|arqueamento|irritabilidade\s+persistente|chora\s+persistentemente|reflexo\s+de\s+moro|moro|espasmo|sobressalto|susto|charutinho|charuto|enrolad|estrat[eé]gia\s+do\s+travesseiro|tecnica\s+do\s+travesseiro|t[eé]cnica\s+do\s+travesseiro|metodo\s+do\s+travesseiro|m[eé]todo\s+do\s+travesseiro|j[aá]\s+tentei\s+o\s+travesseiro|usei\s+o\s+travesseiro|tentei\s+a\s+estrat[eé]gia)/.test(norm);
  if (hasPacifierSignal && !hasClinicalRefluxSignsInMessage) {
    const def = SIGNAL_DEFS.find((d) => d.id === 'pacifier_isolated_complaint');
    if (def) {
      signals.push({ id: def.id, label: def.label, matched: ['composite-pacifier-isolated'] });
      def.boostThemes.forEach((t) => boostThemes.add(t));
      priorities.push(def.priority);
      hasDirectiveSignal = true;
    }
  }

  // Composite signal — TESTE 005 (RN 16d): mãe relata complemento com sonda
  // E que a bebê AGORA mama bem. A hipótese central deve priorizar baixa
  // produção materna (não baixa transferência), e a investigação deve incluir
  // avaliação do complemento também durante o dia.
  const sondaPattern =
    /(complemento\s+com\s+sonda|sonda\s+(orogastrica|orogástrica|nasogastrica|nasogástrica|gastrica|gástrica|para\s+(mamada|aliment|complement))|com\s+sonda|com\s+a\s+sonda|complementando\s+(.{0,40})?(com\s+)?sonda|complement[oa]\s+com\s+sonda|usei\s+sonda|usa\s+sonda|usando\s+sonda)/;
  const mamaBemNowPattern =
    /(agora\s+(esta|est[aá])\s+mamando\s+bem|esta\s+mamando\s+bem|est[aá]\s+mamando\s+bem|mamando\s+bem|mamou\s+bem|mama\s+bem)/;
  if (sondaPattern.test(norm) && mamaBemNowPattern.test(norm)) {
    const def = SIGNAL_DEFS.find((d) => d.id === 'sonda_with_mama_bem_priority_production');
    if (def) {
      signals.push({ id: def.id, label: def.label, matched: ['composite-sonda-mama-bem'] });
      def.boostThemes.forEach((t) => boostThemes.add(t));
      priorities.push(def.priority);
      hasDirectiveSignal = true;
    }
  }

  // Composite signal — choro no banho ISOLADO (TESTE 006 RN 13d): a queixa é
  // exclusivamente sobre banho, sem pistas alimentares/sono que desviem o eixo.
  // Bloqueia recuperação de aulas de mamadas efetivas, Hora da Bruxa, cólicas,
  // Passo 4, início do sono noturno e troca dia-noite nos cards sugeridos.
  const hasBathSignal = signals.some((s) => s.id === 'bath_crying_rn');
  const bathConcurrentSignalIds = new Set([
    'evening_pattern', 'night_production_drop', 'short_feeding_interval',
    'feeding_clinical_context', 'wakes_short_after_crib_back_to_lap',
    'diurnal_only_difficulty', 'crib_ok_day_problem_night', 'pacifier_in_rn',
    'reflux_discomfort_suspicion', 'travesseiro_tried_without_success',
    'night_hunger_signs_rn', 'prolonged_awake_after_feed', 'breast_soothing',
  ]);
  if (hasBathSignal && !signals.some((s) => bathConcurrentSignalIds.has(s.id))) {
    const def = SIGNAL_DEFS.find((d) => d.id === 'bath_crying_rn');
    if (def) {
      signals.push({
        id: 'bath_crying_isolated_rn',
        label: 'Choro no banho isolado — manter eixo banho e filtrar aulas',
        matched: ['composite-bath-isolated'],
      });
      hasDirectiveSignal = true;
    }
  }
  } // end isRnBand composites

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
