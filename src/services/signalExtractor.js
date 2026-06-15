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
      'A piora no final do dia (após as 18h) é um padrão vespertino típico no RN. NOMEIE a hipótese principal de forma direta: "A principal hipótese é baixa transferência de leite ou menor produção materna no final do dia/noite." Priorize a investigação ALIMENTAR: eficácia/transferência das mamadas, queda fisiológica da produção de leite no fim do dia e mamadas agrupadas (cluster). EVITE expressões vagas/inventadas como "fome residual acumulada" — fale diretamente em baixa produção ou transferência insuficiente de leite. Considere também a "hora da bruxa".',
  },
  {
    id: 'night_production_drop',
    label: 'Piora à noite/madrugada e manhã melhor (queda de produção no fim do dia/noite)',
    directive: true,
    phrases: [
      'piora na madrugada', 'piora de madrugada', 'madrugada dificil', 'madrugada difícil',
      'na madrugada', 'de madrugada', 'a noite procura mais', 'a noite quer mais',
      'de manha melhora', 'de manhã melhora', 'manha mais tranquila', 'manhã mais tranquila',
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
      'NOMEIE a hipótese principal de forma direta, com esta leitura: "Pelo horário em que isso começa — final da tarde, madrugada difícil e manhã mais tranquila — a principal hipótese é baixa produção OU menor transferência de leite no período final do dia/noite, mesmo com complemento." Não leia como desorganização do sono. Investigue transferência efetiva (sucção ativa e deglutição) e produção materna nesse período. Nessa fase (poucos dias de vida), NÃO force intervalo de 2h se houver sinais de fome/saciedade insuficiente — a prioridade é garantir a ingestão (livre demanda). Seja interpretativa e direta, não genérica.',
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
      'Há contexto que afeta a transferência de leite (icterícia, linguinha/frênulo, sonda, complemento, baixo peso). Faça uma leitura cuidadosa da AMAMENTAÇÃO: verifique se o bebê mama de forma efetiva (sucção ativa e deglutição) e não apenas por cansaço/conforto; reavalie o plano de complemento com quem acompanha a amamentação e com o pediatra. Não oriente alteração de complemento por conta própria.',
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
      'Para dúvida de soneca diurna longa / acordar para mamar no RN: NÃO normalize uma soneca de 3-4h à tarde como rotina. Durante o DIA, oriente acordar para oferecer a mamada (peito ~2h a 2h30; fórmula ~3h). À noite a regra é outra e depende de idade, peso, ganho e orientação do pediatra. NÃO use "afetar o sono noturno" como critério principal e NÃO investigue berço, arroto ou posição vertical se a mãe não relatou desconforto/refluxo.',
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
    ],
    boostThemes: ['acorda_ao_deitar', 'dificuldade_berco', 'reflexo_moro'],
    priority:
      'O despertar na transferência para o berço segue a hierarquia: (1) tempo vertical após a mamada, (2) arroto, (3) reflexo de Moro, (4) adaptação à superfície, (5) refluxo. Oriente EXPLICITAMENTE manter o bebê em POSIÇÃO VERTICAL POR 30 A 40 MINUTOS após a mamada antes da transição para o berço — não basta perguntar se a mãe faz, a conduta prática precisa estar na resposta. Depois disso, transição gradual colo→superfície com o corpo bem contido.',
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
      'Queixa envolvendo chupeta no RN (0–28 dias) NÃO é associação comportamental. A leitura correta segue a hierarquia: (1) reflexo de sucção / regulação; (2) ALIMENTAÇÃO — mamada efetiva e produção materna no período; (3) transição colo→berço e MEDIDAS POSTURAIS pós-mamada (POSIÇÃO VERTICAL 30 A 40 MIN após mamada); (4) ritmo dia/noite. É PROIBIDO orientar "manter a chupeta presa/segura/fixa na boca" ou indicar chupetas com "design para não cair". Se a chupeta cai e o bebê acorda, isso é sinal para investigar mamada/saciedade/desconforto, não para fixar a chupeta. NUNCA descreva o quadro com as palavras "dependência", "vício", "apego" ou "má associação" (em relação a chupeta, peito, colo, mamada ou sono) — use leitura fisiológica/metodológica.',
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

export function extractSignals({ message, conversation } = {}) {
  const motherText = collectMotherText({ message, conversation });
  const norm = normalize(motherText);
  const currentNorm = normalize(message);

  const signals = [];
  const boostThemes = new Set();
  const priorities = [];
  let hasDirectiveSignal = false;

  for (const def of SIGNAL_DEFS) {
    // Skip the synthetic 'mama bem + concurrent symptoms' signal here; it
    // is computed after the main pass when we know which other signals
    // fired.
    if (def.id === 'mama_bem_with_concurrent_symptoms') continue;
    const matched = def.phrases.filter((p) => norm.includes(normalize(p)));
    if (matched.length) {
      signals.push({ id: def.id, label: def.label, matched });
      def.boostThemes.forEach((t) => boostThemes.add(t));
      priorities.push(def.priority);
      if (def.directive) hasDirectiveSignal = true;
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
