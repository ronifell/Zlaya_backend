import { readFileSync } from 'node:fs';
import path from 'node:path';
import { config, useOpenAI } from '../config/index.js';
import { getOpenAI } from './openaiClient.js';

const intentsData = JSON.parse(
  readFileSync(path.join(config.paths.knowledge, 'intents.json'), 'utf-8'),
);
const INTENT_IDS = intentsData.intents.map((i) => i.id);

/**
 * Lightweight keyword fallback used when no LLM is available.
 * Each rule: { intent, keywords[], weight }.
 */
const KEYWORD_RULES = [
  { intent: 'risco_clinico',            weight: 5, keywords: ['febre', 'arroxeado', 'roxo', 'desidrata', 'fontanela', 'sangue', 'letargia', 'difficuldade respirat', 'respirar', 'recusa alimentar', 'perda de peso', 'nao ganha peso'] },
  { intent: 'refluxo',                  weight: 3, keywords: ['refluxo', 'regurgit', 'golfa', 'vomito', 'vômito', 'arqueia', 'arqueamento'] },
  { intent: 'choro_excessivo',          weight: 2, keywords: ['chora', 'choro', 'chorando', 'inconsolavel', 'colica', 'cólica'] },
  { intent: 'mamadas',                  weight: 2, keywords: ['mama', 'mamada', 'mamando', 'peito', 'amamenta', 'leite', 'formula', 'fórmula', 'mamadeira', 'producao de leite', 'ordenha'] },
  // High-weight vespertine / breast-soothing signals (test feedback): the
  // end-of-day worsening + constant return to the breast points to a feeding
  // hypothesis, so we weight it strongly toward `mamadas`.
  { intent: 'mamadas',                  weight: 3, keywords: ['so se acalma no peito', 'só se acalma no peito', 'so dorme no peito', 'só dorme no peito', 'so dorme mamando', 'só dorme mamando', 'volta pro peito', 'retornar ao peito', 'voltar ao peito', 'depois das 18', 'após 18', 'apos as 18', 'final do dia', 'fim da tarde', 'final da tarde', 'hora da bruxa'] },
  // Night production-drop / short-interval / feeding clinical context: strong
  // feeding-transfer hypothesis (test feedback) — must not be read as sleep.
  { intent: 'mamadas',                  weight: 3, keywords: ['piora na madrugada', 'madrugada', 'de manha melhora', 'manha mais tranquila', 'manha e mais tranquila', 'antes de 2 horas', 'antes de duas horas', 'a cada 1 hora', 'a cada hora', 'de hora em hora', 'quer mamar toda hora', 'menos de 2 horas', 'ictericia', 'icterícia', 'linguinha', 'lingua presa', 'língua presa', 'frenulo', 'frênulo', 'sonda', 'complemento', 'translactacao', 'translactação', 'mamada das 21', 'mamada da noite', 'baixa producao', 'baixa produção', 'transferencia de leite', 'transferência de leite'] },
  // Daytime feeding interval / waking to feed (RN): long daytime nap, "should
  // I wake to feed", interval questions. Must prioritize feeding, not sleep.
  { intent: 'intervalo_mamada_diurna',  weight: 3, keywords: ['acordar para mamar', 'devo acordar', 'preciso acordar', 'posso acordar', 'tenho que acordar', 'deixar dormir', 'soneca de 4', 'soneca de 3', 'dormiu 4 horas', 'dormiu 3 horas', 'dorme 4 horas', 'dorme muito de dia', 'soneca longa', 'soneca muito longa', 'intervalo de mamada', 'de quanto em quanto tempo', 'a cada quantas horas', 'quanto tempo pode ficar sem mamar', 'pode ficar sem mamar', '4 horas sem mamar', '3 horas sem mamar', 'dorme demais de dia'] },
  { intent: 'despertares_noturnos',     weight: 2, keywords: ['acorda', 'acordou', 'despertar', 'despertares', 'noite', 'madrugada'] },
  { intent: 'dificuldade_manutencao_sono', weight: 2, keywords: ['nao mantem o sono', 'sono curto', 'acorda logo', 'nao continua dormindo'] },
  { intent: 'adaptacao_ao_berco',       weight: 2, keywords: ['berco', 'berço', 'deitar', 'deita no berco', 'coloco no berco', 'transferir para o berco'] },
  { intent: 'sonecas_curtas',           weight: 2, keywords: ['soneca', 'sonecas', 'cochilo', 'cochila pouco'] },
  { intent: 'dificuldade_para_dormir',  weight: 1, keywords: ['nao dorme', 'dificuldade para dormir', 'nao consegue dormir', 'so dorme'] },
  { intent: 'rotina',                   weight: 1, keywords: ['rotina', 'horario', 'organiza o dia', 'janela', 'janelas'] },
  { intent: 'associacao_comportamental',weight: 1, keywords: ['associacao', 'so dorme mamando', 'so dorme no colo', 'dependencia'] },
  { intent: 'comportamento_esperado',   weight: 1, keywords: ['é normal', 'e normal', 'é esperado', 'e esperado', 'todo bebe', 'todos os bebes'] },
  { intent: 'desconforto_fisiologico',  weight: 1, keywords: ['desconforto', 'gases', 'arroto', 'incomodo', 'incômodo'] },
  { intent: 'ganho_peso',               weight: 1, keywords: ['peso', 'ganha peso', 'engorda'] },
  { intent: 'seguranca_sono',           weight: 1, keywords: ['posicao para dormir', 'posição para dormir', 'de bruco', 'de costas'] },
  { intent: 'ambiente',                 weight: 1, keywords: ['ruido branco', 'ruído branco', 'ninho', 'cama compartilhada', 'co-sleep', 'cosleep', 'quarto compartilhado', 'luminosidade', 'luz'] },
];

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Words that, when present in the question, indicate the topic is somewhere
// in the domain of baby sleep / routine / feeding / behavior. If NONE of these
// appear AND no keyword rule fires, we treat the question as `fora_da_base`
// rather than `ambiguo` — this matches what the LLM classifier would do.
const DOMAIN_HINTS = [
  'bebe', 'bebê', 'recem', 'recém', 'rn', 'neonato', 'neném', 'nenem',
  'dorm', 'sono', 'soneca', 'soneca', 'cochil', 'noite', 'noturn',
  'mama', 'mamada', 'mamadeira', 'amament', 'peito', 'leite', 'formula', 'fórmula', 'ordenha',
  'chora', 'choro', 'colica', 'cólica',
  'berco', 'berço', 'ninho', 'co-sleep', 'cosleep', 'cama compartilhada', 'quarto',
  'refluxo', 'regurgit', 'arroto', 'gases',
  'rotina', 'janela', 'horario', 'horário', 'madrugada', 'acordar',
  'ictericia', 'icterícia', 'linguinha', 'frenulo', 'frênulo', 'sonda', 'complemento', 'translactacao',
  'fralda', 'temperatura', 'febre', 'pediatra', 'aplv',
  'arquei', 'sucção', 'succao', 'chupeta',
  'olho', 'ruido branco', 'ruído branco', 'luz', 'luminosidade',
];

function looksLikeDomain(normText) {
  return DOMAIN_HINTS.some((h) => normText.includes(normalize(h)));
}

function keywordClassify(text) {
  const norm = normalize(text);
  const scores = new Map();
  for (const rule of KEYWORD_RULES) {
    for (const kw of rule.keywords) {
      if (norm.includes(normalize(kw))) {
        scores.set(rule.intent, (scores.get(rule.intent) || 0) + rule.weight);
      }
    }
  }
  if (scores.size === 0) {
    if (looksLikeDomain(norm)) {
      return { intent: 'ambiguo', confidence: 0.2, candidates: [], source: 'keyword' };
    }
    return { intent: 'fora_da_base', confidence: 0.8, candidates: [], source: 'keyword' };
  }
  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const [topIntent, topScore] = sorted[0];
  const total = sorted.reduce((s, [, v]) => s + v, 0);
  return {
    intent: topIntent,
    confidence: Math.min(0.95, topScore / Math.max(total, 1) * 0.9 + 0.1),
    candidates: sorted.map(([id, sc]) => ({ id, score: sc })),
    source: 'keyword',
  };
}

const SYSTEM_PROMPT = `Você é um classificador de intenções da IA Zlaya (Método Eliana Dias - pilot RN 0-28 dias).
Sua única tarefa é classificar a pergunta da mãe em UMA das intenções abaixo.
Responda APENAS em JSON válido no formato:
{"intent": "<id>", "confidence": <0..1>, "rationale": "<curta justificativa>"}

Intenções permitidas:
${intentsData.intents.map((i) => `- ${i.id}: ${i.label}`).join('\n')}

Regras:
- Se a pergunta sugerir sinal de alerta clínico (febre, vômitos em jato, sangue, letargia, dificuldade respiratória, perda de peso), use "risco_clinico".
- Se a mãe perguntar sobre soneca diurna longa (3-4h), se deve acordar para mamar, ou intervalo de mamada durante o dia, use "intervalo_mamada_diurna" (NÃO use "sonecas_curtas" nem "comportamento_esperado").
- Quando o foco for busca pelo peito, eficácia/produção/transferência de leite, piora no fim do dia/madrugada, contexto de icterícia/linguinha/sonda/complemento, use "mamadas".
- NÃO classifique como "comportamento_esperado" um RN com período acordado prolongado após a mamada ou soneca diurna longa: nesses casos o foco é alimentação ("mamadas" ou "intervalo_mamada_diurna").
- Para o RN (0–28 dias), NUNCA use "associacao_comportamental" quando a queixa envolver chupeta, dormir mamando, dormir no colo ou só se acalmar no peito — nessa faixa esses comportamentos são de regulação/sucção/transição. Reclassifique como "adaptacao_ao_berco" quando o foco for dificuldade de colocar/permanecer no berço, "dificuldade_manutencao_sono" quando o foco for despertar (chupeta cai etc.) ou "mamadas" quando o foco for alimentação.
- Se a pergunta não tiver relação alguma com sono, rotina, alimentação, comportamento ou cuidados do bebê, use "fora_da_base".
- Se a pergunta for ambígua ou insuficiente, use "ambiguo".
- NUNCA invente uma intenção fora da lista.`;

export async function classifyIntent(text) {
  if (!useOpenAI) return keywordClassify(text);

  try {
    const client = getOpenAI();
    const resp = await client.chat.completions.create({
      model: config.openai.chatModel,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: String(text || '') },
      ],
    });
    const raw = resp.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw);
    let intent = parsed.intent;
    if (!INTENT_IDS.includes(intent)) intent = 'ambiguo';
    return {
      intent,
      confidence: clamp01(parsed.confidence ?? 0.5),
      rationale: parsed.rationale || null,
      source: 'llm',
    };
  } catch (err) {
    // graceful degradation if the API call fails
    const fb = keywordClassify(text);
    return { ...fb, source: 'fallback-keyword', error: err.message };
  }
}

function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0.5;
  return Math.max(0, Math.min(1, x));
}

/**
 * Deterministic post-classification override for the RN namespace.
 *
 * Test feedback (22-day baby + pacifier case): the LLM was classifying the
 * complaint as `associacao_comportamental` and the assistant then advised
 * the mother to "keep the pacifier more secure in the mouth". In the RN
 * methodology this is wrong: at 0–28 days a pacifier complaint must be
 * read as sucção/regulação/transição-berço/alimentação, never as a learned
 * negative association. This function reroutes the intent to the most
 * appropriate alternative based on what the mother actually mentioned.
 */
export function applyRnIntentOverrides({ intent, message, ageDays }) {
  const isRn = Number.isFinite(ageDays) ? ageDays <= 28 : true;
  if (!isRn) return { intent, override: null };

  const norm = normalize(message);
  const mentionsPacifier = /chupeta|chupetinha/.test(norm);
  const mentionsCrib = /berco|berço|moises|moisés|deitar|colocar no berco|coloco no berco/.test(norm);
  const mentionsFeeding = /mama|mamada|peito|leite|amament|formula|fórmula|mamadeira/.test(norm);

  // RN crib pattern: baby accepts the crib during the DAY but not at NIGHT.
  // Test feedback (TESTE 004 RN 6d): the developer asked us to STOP logging
  // this pattern as `adaptacao_ao_berco` because the methodologically correct
  // hypothesis is night-feeding insufficient / low milk transfer at night —
  // not crib adaptation. We reclassify to `mamadas` so retrieval, audit and
  // the prompt all line up with the actual hypothesis.
  const dayInCrib =
    /(sonecas?|cochilo|dorme|aceita)[^.]{0,40}(no\s+ber[cç]o|no\s+ber[cç]inho|no\s+moise[s]?)/.test(norm) ||
    /(durante\s+o\s+dia|de\s+dia)[^.]{0,40}(ber[cç]o|moise[s]?)/.test(norm) ||
    /(faz\s+todas?\s+as?\s+sonecas?|todas\s+as\s+sonecas?)[^.]{0,40}(ber[cç]o|moise[s]?)/.test(norm) ||
    /(ber[cç]o|moise[s]?)[^.]{0,40}(durante\s+o\s+dia|de\s+dia)/.test(norm);
  const nightOutOfCrib =
    /(a\s+noite|à\s+noite|de\s+noite|noite|madrugada)[^.]{0,80}(n[aã]o\s+quer|n[aã]o\s+fica|n[aã]o\s+aceita|n[aã]o\s+dorme)[^.]{0,40}(ber[cç]o|moise[s]?)/.test(norm) ||
    /(n[aã]o\s+quer|n[aã]o\s+fica|n[aã]o\s+aceita)[^.]{0,40}(no\s+ber[cç]o|no\s+moise[s]?)[^.]{0,40}(a\s+noite|à\s+noite|de\s+noite|noite)/.test(norm) ||
    /(tenho\s+que\s+pega[\- ]?lo|tenho\s+que\s+pega[\- ]?la|levar?\s+para\s+o\s+(meu\s+)?quarto|levo\s+para\s+o\s+(meu\s+)?quarto)/.test(norm);
  const cribDayOkNightProblem = dayInCrib && nightOutOfCrib;

  if (
    cribDayOkNightProblem &&
    (intent?.intent === 'adaptacao_ao_berco' ||
      intent?.intent === 'dificuldade_manutencao_sono' ||
      intent?.intent === 'comportamento_esperado' ||
      intent?.intent === 'ambiguo' ||
      intent?.intent === 'dificuldade_para_dormir')
  ) {
    const target = 'mamadas';
    return {
      intent: {
        ...intent,
        intent: target,
        rationale:
          (intent.rationale ? intent.rationale + ' | ' : '') +
          `override_rn: bebê aceita o berço de dia mas não fica no berço à noite — hipótese central é mamada noturna insuficiente / baixa produção materna no período da noite, não adaptação ao berço → ${target}`,
        source: (intent.source || 'unknown') + '+rn_override',
        originalIntent: intent.intent,
      },
      override: {
        from: intent.intent,
        to: target,
        reason: 'rn_crib_day_ok_night_problem',
      },
    };
  }

  if (intent?.intent === 'associacao_comportamental' && (mentionsPacifier || mentionsFeeding)) {
    const target = mentionsCrib
      ? 'adaptacao_ao_berco'
      : mentionsPacifier
        ? 'dificuldade_manutencao_sono'
        : 'mamadas';
    return {
      intent: {
        ...intent,
        intent: target,
        rationale:
          (intent.rationale ? intent.rationale + ' | ' : '') +
          `override_rn: 'associacao_comportamental' não se aplica ao RN 0–28 dias (chupeta/colo/peito) → ${target}`,
        source: (intent.source || 'unknown') + '+rn_override',
        originalIntent: intent.intent,
      },
      override: { from: 'associacao_comportamental', to: target, reason: 'rn_pacifier_or_feeding' },
    };
  }
  return { intent, override: null };
}

export function listIntents() {
  return intentsData.intents;
}
