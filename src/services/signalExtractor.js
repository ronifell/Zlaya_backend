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
      'A piora no final do dia (após as 18h) é um padrão vespertino típico no RN. Priorize a investigação ALIMENTAR: eficácia das mamadas, possível queda fisiológica da produção de leite no fim do dia, fome residual acumulada e mamadas agrupadas (cluster). Considere também a "hora da bruxa".',
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
    phrases: [
      'depois da 1h', 'depois da uma', 'depois da meia noite', 'depois da meia-noite',
      'so consigo colocar no berco depois', 'so coloco no berco depois',
      'so vai pro berco depois', 'apos a 1h da manha', 'depois da 1 da manha',
      '1h da manha', 'uma da manha', 'so dorme no berco de madrugada',
      'so vai pro berco de madrugada',
    ],
    boostThemes: ['dificuldade_berco', 'acorda_ao_deitar', 'reflexo_moro'],
    priority:
      'Conseguir colocar o bebê no berço apenas na madrugada indica trabalhar a transição colo→berço e a hierarquia de permanência no berço (tempo vertical após a mamada, arroto, reflexo de Moro, adaptação à superfície).',
  },
  {
    id: 'wakes_on_transfer',
    label: 'Desperta ao ser colocado no berço',
    phrases: [
      'desperta ao ser colocado', 'acorda quando coloco', 'acorda ao ser colocado',
      'acorda ao deitar', 'acorda quando deito', 'desperta ao deitar',
      'acorda ao colocar no berco', 'acorda assim que coloco', 'desperta assim que coloco',
      'acorda na transferencia', 'acorda ao colocar', 'desperta quando coloco',
      'acorda assim que deito', 'acorda no berco',
    ],
    boostThemes: ['acorda_ao_deitar', 'dificuldade_berco', 'reflexo_moro'],
    priority:
      'O despertar na transferência para o berço segue a hierarquia: (1) tempo vertical após a mamada, (2) arroto, (3) reflexo de Moro, (4) adaptação à superfície, (5) refluxo. Oriente a transição gradual colo→superfície com o corpo bem contido.',
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
    id: 'milk_supply',
    label: 'percepção sobre a produção de leite',
    phrases: ['mama bem', 'tenho bastante leite', 'pouco leite', 'producao de leite', 'produção de leite', 'acho que tenho leite', 'leite suficiente'],
    askKeywords: ['producao', 'produção', 'percepcao materna'],
  },
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

  for (const def of SIGNAL_DEFS) {
    const matched = def.phrases.filter((p) => norm.includes(normalize(p)));
    if (matched.length) {
      signals.push({ id: def.id, label: def.label, matched });
      def.boostThemes.forEach((t) => boostThemes.add(t));
      priorities.push(def.priority);
    }
  }

  const provided = PROVIDED_FACTS.filter((f) =>
    f.phrases.some((p) => norm.includes(normalize(p))),
  ).map((f) => ({ id: f.id, label: f.label, askKeywords: f.askKeywords }));

  const alreadyUsing = TECHNIQUES.filter((t) =>
    t.phrases.some((p) => norm.includes(normalize(p))),
  ).map((t) => t.label);

  // Rich context = the mother already brought enough for the assistant to give
  // practical orientation instead of only asking questions.
  const detailScore =
    provided.length + signals.length + (currentNorm.length >= 140 ? 1 : 0);
  const hasRichContext = detailScore >= 2 || currentNorm.length >= 180;

  return {
    signals,
    boostThemes: [...boostThemes],
    priorities,
    provided,
    alreadyUsing,
    hasRichContext,
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
