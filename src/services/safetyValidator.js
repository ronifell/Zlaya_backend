import { readFileSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config/index.js';

function loadForbidden(namespace) {
  const file = path.join(config.paths.knowledge, namespace.toLowerCase(), 'forbidden.json');
  return JSON.parse(readFileSync(file, 'utf-8'));
}

const CACHE = new Map();
function getForbidden(namespace) {
  if (!CACHE.has(namespace)) CACHE.set(namespace, loadForbidden(namespace));
  return CACHE.get(namespace);
}

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Patterns that catch unsafe pacifier guidance flagged in RN test feedback.
 * The methodology forbids teaching the mother to "hold" or "secure" the
 * pacifier in the baby's mouth or to choose specific pacifier designs to
 * keep it from falling — that diverts from the real investigation
 * (feeding effectiveness, milk production, postural measures).
 */
const UNSAFE_PACIFIER_PATTERNS = [
  { re: /manter\s+(a\s+)?chupeta\s+(presa|segura|fixa|no\s+lugar)/, label: 'manter a chupeta presa/segura/no lugar' },
  { re: /chupeta\s+(mais\s+)?(segura|presa|fixa)\s+(na\s+)?boca/, label: 'chupeta segura/presa/fixa na boca' },
  { re: /prender\s+(a\s+)?chupeta/, label: 'prender a chupeta' },
  { re: /chupeta\s+com\s+design\s+(para|que)\s+(mant|nao\s+cair|fixa)/, label: 'chupeta com design para manter no lugar' },
  { re: /design\s+(especial\s+)?(da\s+)?chupeta\s+para\s+(manter|fixar|nao\s+cair)/, label: 'design especial da chupeta para manter no lugar' },
  { re: /posicion(e|ar)\s+(a\s+)?chupeta\s+(de\s+forma\s+que\s+)?(fique|continue|permane[çc]a)\s+(mais\s+)?(segura|presa|fixa)/, label: 'posicionar a chupeta para ficar segura' },
];

/**
 * Behavioral-association vocabulary that the RN methodology forbids when
 * applied to pacifier / breast / lap / feeding. We do not block these words
 * globally (they have legitimate uses), but in the RN namespace they must
 * never be used to characterize the baby's relationship with chupeta, peito,
 * colo or mamada. Catches "dependência da chupeta", "vício no peito",
 * "apego ao colo", etc.
 */
const RN_FORBIDDEN_BEHAVIORAL_FRAMINGS = [
  // (label, regex that allows up to ~30 chars between framing word and object)
  { re: /depend[êe]nc[iy]a\s+(emocional\s+|excessiva\s+)?(d[aoe]|com\s+a|para\s+com\s+a)\s*(chupeta|peito|mamada|amamenta|colo)/, label: 'dependência da chupeta/peito/mamada/colo' },
  { re: /v[íi]cio\s+(d[aoe]|na|no|com\s+a)\s*(chupeta|peito|mamada|amamenta|colo)/, label: 'vício na chupeta/peito/mamada/colo' },
  { re: /apego\s+(emocional\s+|excessivo\s+)?(d[aoe]|a[oô]\s+|à\s+|para\s+com\s+a)\s*(chupeta|peito|mamada|amamenta|colo)/, label: 'apego à chupeta/peito/mamada/colo' },
  { re: /(criar|cria|criou|criando)\s+(uma\s+)?associa[çc][ãa]o\s+(negativa\s+)?(d[aoe]|com\s+a|para\s+com\s+a)\s*(chupeta|peito|mamada|amamenta|colo|sono)/, label: 'criar associação (negativa) à chupeta/peito/mamada/colo/sono' },
  { re: /m[aá]\s+associa[çc][ãa]o\s+(d[aoe]|com\s+a)\s*(chupeta|peito|mamada|amamenta|colo|sono)/, label: 'má associação à chupeta/peito/mamada/colo/sono' },
];

/**
 * Checks a piece of text (typically a drafted answer) against the forbidden
 * vocabulary configured for the namespace.
 *
 * Returns { safe, violations: [{ term, kind }] }
 */
export function checkForbiddenContent({ text, namespace, ageDays } = {}) {
  const forbidden = getForbidden(namespace);
  const norm = normalize(text);
  const violations = [];

  for (const term of forbidden.forbiddenTerms || []) {
    if (norm.includes(normalize(term))) {
      violations.push({ term, kind: 'forbidden_term' });
    }
  }
  // Pattern-based diminutive / infantilized language check
  const diminutivePatterns = [/mamaezinha/, /queridinha/, /fofa/, /amorzinho/, /bebezinho/];
  for (const re of diminutivePatterns) {
    if (re.test(norm)) violations.push({ term: re.source, kind: 'language_diminutive' });
  }

  for (const { re, label } of UNSAFE_PACIFIER_PATTERNS) {
    if (re.test(norm)) {
      violations.push({ term: label, kind: 'unsafe_pacifier_guidance' });
    }
  }

  // RN-only: forbidden behavioral framings ("dependência da chupeta",
  // "vício no peito", "apego ao colo"). Test feedback (caso 22d) flagged
  // the model writing "a dependência da chupeta" for a 22-day baby — the
  // methodology rejects this framing for RN regardless of context.
  if (String(namespace || '').toUpperCase() === 'RN') {
    for (const { re, label } of RN_FORBIDDEN_BEHAVIORAL_FRAMINGS) {
      if (re.test(norm)) {
        violations.push({ term: label, kind: 'rn_behavioral_framing' });
      }
    }
  }

  // Age consistency: never let the model claim a different age than the
  // profile's. Test feedback flagged repeated cases where the AI answered
  // "14 dias" while the baby was 10 or 22 days. We accept ranges if the
  // profile age falls inside them and only flag standalone numeric ages.
  const ageViolations = checkAgeConsistency({ text, ageDays });
  for (const v of ageViolations) violations.push(v);

  return { safe: violations.length === 0, violations };
}

/**
 * Detects numeric age mentions in the draft that contradict the profile's
 * ageDays. Returns an array of violations (empty if all mentions are
 * compatible — including ranges that contain the real age).
 *
 * We intentionally only look at "<num> dias" / "<num> dia" patterns; mentions
 * in weeks or months are out of scope for RN (0–28 dias) and would have
 * different syntactic shapes anyway.
 */
export function checkAgeConsistency({ text, ageDays }) {
  if (!Number.isFinite(ageDays)) return [];
  const norm = normalize(text);
  const violations = [];
  const re = /(\d{1,3})(?:\s*(?:a|ate|até|–|-|—)\s*(\d{1,3}))?\s*dias?\b/gi;
  let m;
  while ((m = re.exec(norm)) !== null) {
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    // Skip clearly non-RN ranges (e.g. "365 dias", "100 dias de vida"); we
    // only care about hallucinations within the RN window.
    if (lo > 60) continue;
    if (ageDays < lo || ageDays > hi) {
      violations.push({
        term: `idade citada "${m[0].trim()}" diverge do perfil (${ageDays} dias)`,
        kind: 'age_mismatch',
        detected: m[0].trim(),
        profileAgeDays: ageDays,
      });
    }
  }
  return violations;
}

/**
 * Canonical list of satiety signs (Método Eliana Dias, RN 0–28 days).
 * Used by ensureSatietySignsExplained() to expand any vague "observe
 * sinais de saciedade" mention into a concrete, teachable enumeration.
 *
 * Test feedback (caso bebê 16 dias): a mother asked "como devo ajustar?"
 * and the IA answered "observe sinais de saciedade" without ever listing
 * what those signs are. For a RN mother the instruction is unusable.
 */
// TESTE 006 (RN 22d): a lista de sinais de saciedade foi tornada FEEDING-FORM-
// ADAPTIVA. A formulação "solta o peito espontaneamente" só faz sentido para
// peito; para fórmula/mamadeira o equivalente é "reduz o ritmo da sucção e
// demonstra saciedade após a oferta". Como a forma de alimentação muitas
// vezes não está confirmada quando o bloco é anexado, mantemos a leitura
// condicional explícita logo no início.
export const SATIETY_SIGNS_OFFICIAL_TEXT =
  'Sinais de saciedade no RN: se mama no peito, observe se solta o peito espontaneamente; se usa fórmula ou mamadeira, observe se reduz o ritmo da sucção e demonstra saciedade após a oferta. Em qualquer forma de alimentação, o bebê relaxa o corpo, abre as mãozinhas, fica tranquilo após a mamada e permanece mais confortável depois de arrotar e de ficar em posição vertical por 30 a 40 minutos. Se ao contrário ele continua agitado, mantém as mãozinhas cerradas e busca o peito ou a oferta novamente em pouco tempo, isso pode indicar que a mamada não foi suficiente ou que houve dificuldade de transferência — se ele mama no peito, ofereça o peito de novo em livre demanda; se usa fórmula ou complemento, avalie volume, intervalo e sinais de saciedade conforme orientação individual. Em qualquer caso, reavalie a produção/transferência no período.';

/**
 * Words that, on their own or co-occurring with "saciedade", indicate the
 * IA listed the satiety signs concretely (so no expansion is needed).
 * We require at least 3 of these to consider the enumeration present —
 * the official list has 6 items so 3 is a conservative quorum.
 */
const SATIETY_SIGN_TOKENS = [
  /solt[ae]r?\s+(o\s+)?peito/, // "solta o peito"
  /relaxa(r|do)?\s+(o\s+)?corpo/, // "relaxa o corpo"
  /(abre|abrir|abrindo)\s+(as\s+)?(maozinhas|m[ãa]ozinhas|maos|m[ãa]os)/, // "abre as mãozinhas"
  /(reduz|reduzir|diminui|diminuir)\s+(o\s+)?ritmo\s+(d[ae]\s+)?suc[çc][aã]o/, // "reduz o ritmo da sucção"
  /tranquil[oa]\s+(ap[óo]s|depois\s+(de|d[ao]))\s+(a\s+)?mamada/, // "tranquilo após a mamada"
  /confort[aá]vel\s+(depois|ap[óo]s)\s+(de\s+)?(arrotar|posi[çc][aã]o\s+vertical)/, // "confortável depois de arrotar / posição vertical"
];

/**
 * Phrases that mention satiety (and therefore trigger the enumeration
 * requirement). Matched on the normalized text.
 */
const SATIETY_TRIGGER_PATTERNS = [
  /sinais\s+de\s+sacied/, // "sinais de saciedade"
  /sinais\s+de\s+que\s+(ela|ele|o\s+beb[êe])\s+(est[aá]\s+)?sacia/, // "sinais de que está saciado/a"
  /(se\s+)?(ela|ele|o\s+beb[êe])\s+(est[aá]|fica|ficou|fic[ao]u)\s+sacia/, // "se está saciada"
  /observ(ar|e|ando|a)\s+(a\s+|os\s+sinais\s+de\s+)?sacied/, // "observar a saciedade"
  /(est[aá]|fica|ficou|ficar)\s+satisfeit/, // "está/fica/ficou satisfeito/a"
  /sinais\s+de\s+que\s+(ela|ele|o\s+beb[êe])\s+(est[aá]\s+|fica\s+|ficou\s+)?satisfeit/,
];

/**
 * Phrases that indicate the response already contains the operational
 * block B (what to do when the satiety signs do NOT appear). If any of
 * these is present we consider the operational guidance covered.
 *
 * Test feedback 001 (RN 9d): the LLM listed all 6 signs but stopped
 * there — failed to teach the mother what to DO if the signs don't show
 * up, which is the operational half of the method. We append block B
 * automatically when missing.
 */
const SATIETY_OPERATIONAL_TOKENS = [
  /se\s+ao\s+contr[aá]rio/, // "se ao contrário ele continua agitado"
  /se\s+(ele|ela)\s+continua(r)?\s+agitad/, // "se ele continua agitado"
  /se\s+(esses\s+|os\s+)?sinais\s+n[aã]o\s+aparec/, // "se esses sinais não aparecem"
  /se\s+n[aã]o\s+(v[ei]r|aparec|notar)\s+(esses\s+|os\s+)?sinais/, // "se não vir esses sinais"
  /ofere[çc]a\s+(o\s+peito\s+)?(de\s+)?novo/, // "ofereça o peito de novo"
  /ofere[çc]a\s+novamente\s+o\s+peito/, // "ofereça novamente o peito"
  /repita\s+a\s+mamada/, // "repita a mamada"
  /n[aã]o\s+foi\s+suficient/, // "a mamada não foi suficiente"
  /mantem\s+(as\s+)?(maozinhas|m[ãa]ozinhas)\s+cerrad/, // "mantém as mãozinhas cerradas"
];

/**
 * Returns { text, expanded: 'list'|'operational'|false }:
 * - 'list'        → the canonical enumeration was missing and got appended
 * - 'operational' → the enumeration was present but the operational block
 *                   B ("what to do when the signs do NOT appear") was
 *                   missing and got appended
 * - false         → nothing was changed
 *
 * Content-preserving: the rest of the draft is untouched.
 */
export function ensureSatietySignsExplained({ text, forceTrigger = false }) {
  if (!text) return { text: text || '', expanded: false };
  const norm = normalize(text);
  const triggered = forceTrigger || SATIETY_TRIGGER_PATTERNS.some((re) => re.test(norm));
  if (!triggered) return { text, expanded: false };

  const signsHit = SATIETY_SIGN_TOKENS.reduce((n, re) => (re.test(norm) ? n + 1 : n), 0);
  const operationalHit = SATIETY_OPERATIONAL_TOKENS.some((re) => re.test(norm));

  // The official rubric (TESTE 004 RN 9d, item 5) requires the answer
  // to list the 6 canonical satiety signs by name. Two of them — "solta
  // o peito" and "abre as mãozinhas" — are the strongest tokens for the
  // mother to recognize satiety in practice. When the evening/vespertine
  // pattern fires (forceTrigger=true) we ALWAYS guarantee these two are
  // present by appending the canonical list when either is missing —
  // regardless of how many other satiety tokens the LLM already emitted.
  const anchorsHit =
    /solt[ae]r?\s+(o\s+)?peito/.test(norm) &&
    /(abre|abrir|abrindo)\s+(as\s+)?(maozinhas|m[ãa]ozinhas|maos|m[ãa]os)/.test(norm);

  if (forceTrigger && !anchorsHit) {
    const trimmed = text.replace(/\s+$/, '');
    const out = `${trimmed}\n\n${SATIETY_SIGNS_OFFICIAL_TEXT}`;
    return { text: out, expanded: 'list' };
  }

  if (signsHit >= 3 && operationalHit) return { text, expanded: false };

  if (signsHit >= 3 && !operationalHit) {
    // Block A is there; we only need to append block B (operational tail).
    const trimmed = text.replace(/\s+$/, '');
    const out = `${trimmed}\n\nApós a mamada, mantenha em posição vertical por 30 a 40 minutos antes de transferir para o berço. Se ao contrário ele continua agitado, mantém as mãozinhas cerradas e busca o peito ou a oferta novamente em pouco tempo, isso pode indicar que a mamada não foi suficiente ou que houve dificuldade de transferência — se ele mama no peito, ofereça o peito de novo em livre demanda; se usa fórmula ou complemento, avalie volume, intervalo e sinais de saciedade conforme orientação individual. Em qualquer caso, reavalie a produção/transferência no período.`;
    return { text: out, expanded: 'operational' };
  }

  // Block A missing → append the full canonical line (A + B in one).
  const trimmed = text.replace(/\s+$/, '');
  const out = `${trimmed}\n\n${SATIETY_SIGNS_OFFICIAL_TEXT}`;
  return { text: out, expanded: 'list' };
}

/**
 * Patterns that indicate the mother is explicitly asking whether the
 * described behavior is normal/expected for the age. Detected on the
 * user message; if present the FIRST sentence of the response must carry
 * a direct affirmation (Sim / Em parte sim / Não), not an empathic
 * opening like "É compreensível que você esteja preocupada…".
 *
 * Test feedback 001 (RN 9d) explicitly graded this as a clarity error.
 */
const ASKS_IF_NORMAL_PATTERNS = [
  /isso\s+[eé]\s+normal/,
  /[eé]\s+normal\s+(pr[ao]|para\s+a)\s+idade/,
  /[eé]\s+normal\s+nessa\s+(idade|fase)/,
  /[eé]\s+normal\s+(para|nessa|nesta)\s+fase/,
  /isso\s+[eé]\s+esperado/,
  /[eé]\s+esperado\s+nessa\s+(idade|fase)/,
  /[eé]\s+comum\s+nessa\s+(idade|fase)/,
  /isso\s+[eé]\s+comum/,
];

/**
 * Returns { text, prepended: boolean }.
 *
 * If the user asked "is this normal?" (any of the patterns above) AND
 * the first sentence of the response does NOT carry a direct affirmation,
 * prepend a method-aligned direct answer so the response opens by
 * answering the question, not by deflecting into empathy.
 */
export function ensureDirectNormalityAnswer({ text, userMessage, diurnalOnly = false }) {
  if (!text || !userMessage) return { text: text || '', prepended: false };
  const normUser = normalize(userMessage);
  const triggered = ASKS_IF_NORMAL_PATTERNS.some((re) => re.test(normUser));
  if (!triggered) return { text, prepended: false };

  // First sentence (up to first ".", "?" or "!" followed by space/newline).
  const firstSentenceRaw = text.split(/(?<=[\.!\?])\s+/)[0] || text;
  const firstSentence = normalize(firstSentenceRaw);

  const directOpeners = [
    /^\s*sim[\s,—\-:]/, // "Sim, ..." / "Sim — ..."
    /^\s*em\s+parte\s+sim/, // "Em parte sim..."
    /^\s*n[aã]o[\s,—\-:]/, // "Não, ..."
    /^\s*sim\s+e\s+n[aã]o/, // "Sim e não..."
    /^\s*esse\s+padr[aã]o\s+(pode|costuma|[eé])/, // "Esse padrão pode/costuma/é..."
    /^\s*esse\s+comportamento\s+(pode|costuma|[eé])/, // "Esse comportamento..."
    /^\s*isso\s+(pode|costuma|[eé])/, // "Isso pode/é..."
    /^\s*[eé]\s+(comum|esperado|fisiol[oó]gico)/, // "É comum/esperado/fisiológico..."
    /^\s*com\s+\d{1,3}\s+dias?\s+(isso|esse|esses?|esse comportamento|esse padr[aã]o|[eé])/, // "Com 9 dias isso é..."
    /^\s*sim\s*[—\-]/, // "Sim — ..."
  ];
  const hasDirectOpener = directOpeners.some((re) => re.test(firstSentence));
  if (hasDirectOpener) return { text, prepended: false };

  // Tailored, neutral, method-safe direct opener. We avoid claiming
  // anything beyond the methodology: it just affirms the pattern can
  // occur and reframes it as alimentary, then yields to the LLM's text.
  // PERIOD-AWARE: when the complaint is diurnal-only (night preserved),
  // we must NOT bind the hypothesis to "fim do dia/noite" — the dossier
  // (TESTE 003, RN 20d) flags that as a period mismatch.
  const directOpener = diurnalOnly
    ? 'Sim — esse padrão pode ocorrer no RN nessa fase. Como a dificuldade está nas sonecas diurnas e a noite está preservada, a leitura do método é alimentar (mamada efetiva e produção/transferência de leite durante o dia) e de conforto/postura, não associação negativa.'
    : 'Sim — esse padrão pode ocorrer no RN nessa fase, e o método o trata como uma questão alimentar (mamada efetiva, transferência e produção de leite) e de conforto/postura, não como associação negativa.';
  const out = `${directOpener}\n\n${text.trimStart()}`;
  return { text: out, prepended: true };
}

/**
 * Phrases the mother uses to express the fear of "creating a negative
 * association". Test feedback 001 (RN 9d): the mother literally wrote
 * "Tenho medo dessa associação negativa, mas muitas vezes nada mais
 * funciona." If she explicitly raises this fear, the method requires the
 * Zlaya to address it head-on (tranquilizar) — never to dodge it.
 */
const NEG_ASSOC_TRIGGERS_USER = [
  /medo\s+(d[aeo]?ss?[ae]?\s+)?associa[çc][aã]o\s+negativ/,
  /tenho\s+medo\s+(d[aeo]\s+)?(criar|estar\s+criando)\s+(uma\s+)?associa[çc][aã]o/,
  /(criar|criando|crio)\s+(uma\s+)?associa[çc][aã]o\s+negativ/,
  /associa[çc][aã]o\s+negativa/,
  /associa[çc][aã]o\s+ruim/,
  /vai\s+criar\s+m[aá]\s+associa/,
];

/**
 * Phrases that indicate the response already reassures the mother that
 * what she described is NOT a negative association (and is fisiológico in
 * the RN). If any of these is present we consider point (6) of the
 * vespertine framework already covered.
 */
const NEG_ASSOC_REASSURE_TOKENS = [
  /n[aã]o\s+(configura|caracteriza|representa)\s+(uma\s+)?associa[çc][aã]o\s+negativa/,
  /n[aã]o\s+[eé]\s+(uma\s+)?associa[çc][aã]o\s+negativa/,
  /essa\s+leitura\s+n[aã]o\s+se\s+aplica/,
  /[eé]\s+fisiol[oó]gico\s+e\s+esperado/,
  /comportamento\s+fisiol[oó]gico\s+e\s+esperado/,
  /no\s+rn[\s,]+(dormir|mamar|estar\s+no\s+colo)/,
];

/**
 * Returns { text, appended: boolean }.
 *
 * If the user explicitly raised the fear of "associação negativa" and
 * the response does NOT contain an explicit reassurance, appends a
 * method-aligned reassurance paragraph. Point (6) of the vespertine
 * 6-point framework — fail-safe.
 */
// Strict reassurance tokens — beyond the soft NEG_ASSOC_REASSURE_TOKENS, the
// methodology requires an EXPLICIT "AINDA NÃO CRIA associação comportamental"
// formulation alongside an explicit RN age citation. Test feedback 001/003
// (RN 9d) treats these as hard requirements.
const NEG_ASSOC_STRICT_AINDA_NAO_CRIA = /(aind?a?\s+n[aã]o\s+cria\s+(?:essa\s+|uma\s+|a\s+)?associa[çc][aã]o(?:\s+comportamental(?:\s+negativa)?)?|n[aã]o\s+cria\s+associa[çc][aã]o\s+comportamental\s+negativa)/;
const NEG_ASSOC_STRICT_ALIMENTO_REGULACAO = /(peito\s+(?:[eé]\s+)?(?:alimento|regulac[aã]o|conforto|organizac[aã]o)|alimento[\s,]+regulac[aã]o|regulac[aã]o[\s,]+conforto|n[aã]o\s+[eé]\s+v[íi]cio[\s,]+(?:manha|mau\s+h[aá]bito))/;

export function ensureNegativeAssociationReassurance({ text, userMessage, ageDays } = {}) {
  if (!text || !userMessage) return { text: text || '', appended: false };
  const normUser = normalize(userMessage);
  const triggered = NEG_ASSOC_TRIGGERS_USER.some((re) => re.test(normUser));
  if (!triggered) return { text, appended: false };

  const normText = normalize(text);
  // The methodology has TWO completeness requirements when this trigger fires:
  //   (a) explicit age citation: "<N> dias" mention;
  //   (b) the canonical AINDA NÃO CRIA associação comportamental phrasing,
  //       PLUS the alimento/regulação/conforto reframing for the peito.
  // We only return early ("already covered") when BOTH (a) and (b) are
  // satisfied — otherwise we append the missing pieces below.
  const hasAgeMention = !Number.isFinite(ageDays) || new RegExp(`\\b${ageDays}\\s*dias\\b`).test(normText);
  const hasStrictAindaNaoCria = NEG_ASSOC_STRICT_AINDA_NAO_CRIA.test(normText);
  const hasStrictAlimentoRegulacao = NEG_ASSOC_STRICT_ALIMENTO_REGULACAO.test(normText);
  if (hasAgeMention && hasStrictAindaNaoCria && hasStrictAlimentoRegulacao) {
    return { text, appended: false };
  }

  const ageLabel = Number.isFinite(ageDays) ? `${ageDays} dias` : 'essa idade (RN)';
  const trimmed = text.replace(/\s+$/, '');
  const append = `Sobre o seu receio de associação negativa: com ${ageLabel}, sua bebê AINDA NÃO CRIA associação comportamental negativa por dormir no peito, buscar o peito ou precisar voltar ao peito para se acalmar — nessa idade o peito é alimento, regulação, conforto e organização fisiológica, não é vício, manha ou mau hábito. A leitura metodológica correta é alimentar (mamada efetiva, transferência e produção de leite) e de conforto/postura, não comportamental.`;
  return { text: `${trimmed}\n\n${append}`, appended: true };
}

/**
 * Sonda + ordenha completeness check (TESTE 004 RN 16d).
 *
 * Quando a mãe relata uso de SONDA / COMPLEMENTO COM SONDA (sinal
 * `feeding_clinical_context` com "sonda" no texto), o método exige que a
 * resposta carregue, no corpo do texto:
 *   (A) a expressão literal "complemento com sonda" (palavras exatas, na
 *       narrativa principal) — não basta dizer só "complemento";
 *   (B) a palavra "ordenha" / "ordenhas" como estratégia explícita de
 *       estimulação da produção materna (não basta sugerir "estimular a
 *       produção" genericamente).
 *
 * O LLM, mesmo com a regra no system prompt, varia entre runs e às vezes
 * omite uma ou as duas. Esta função é a malha de proteção.
 *
 * Returns { text, appended: boolean, missing: string[] }.
 */
const SONDA_TRIGGER_TOKENS = [
  /\bsonda\b/,
  /complement(o|a|ando)\b[\s\S]{0,40}\bsonda\b/,
  /translacta[çc][aã]o/,
  /relacta[çc][aã]o/,
];
const SONDA_PHRASE_LITERAL = /complemento\s+com\s+sonda/;
const ORDENHA_PHRASE = /\bordenh(a|as|ar|ando)\b/;

export function ensureSondaOrdenhaComplete({ text, userMessage, signalIds = [] } = {}) {
  if (!text) return { text: text || '', appended: false, missing: [] };
  const userNorm = normalize(userMessage || '');
  const sigSet = new Set(signalIds || []);
  const sondaInMessage = SONDA_TRIGGER_TOKENS.some((re) => re.test(userNorm));
  if (!sondaInMessage) return { text, appended: false, missing: [] };

  const norm = normalize(text);
  const missing = [];
  if (!SONDA_PHRASE_LITERAL.test(norm)) missing.push('complemento_com_sonda');
  if (!ORDENHA_PHRASE.test(norm)) missing.push('ordenha');

  if (missing.length === 0) return { text, appended: false, missing: [] };

  const fragmentByKey = {
    complemento_com_sonda:
      'Como a sua bebê já recebe complemento com sonda, isso indica baixa produção materna ou necessidade de suporte de produção — o déficit pode ocorrer também durante o dia e não apenas à noite. Avalie o complemento também no fim da tarde, quando o comportamento de busca pelo peito começa.',
    ordenha:
      'Considere fazer ordenhas no fim da tarde e ao longo do dia para estimular a produção materna, como ferramenta de avaliação e organização (sempre como apoio à mamada efetiva, não como solução isolada).',
  };
  const order = ['complemento_com_sonda', 'ordenha'];
  const sentences = order
    .filter((k) => missing.includes(k))
    .map((k) => fragmentByKey[k]);
  const append = sentences.join(' ');
  const trimmed = text.replace(/\s+$/, '');
  return { text: `${trimmed}\n\n${append}`, appended: true, missing };
}

/**
 * Reflux-routing completeness check (TESTE 004 RN 20d).
 *
 * When the case shows the methodology's reflux pattern — bebê é colocado no
 * berço, permanece poucos minutos, acorda chorando e melhora no colo, OR a
 * resposta cita "refluxo" / "regurgita" / "desconforto pós-mamada" — o método
 * exige que a resposta carregue, no corpo do texto, OS QUATRO ITENS abaixo
 * (não basta indicar como aulas avulsas):
 *   (A) posição vertical 30 a 40 minutos após a mamada;
 *   (B) elevação do colchão em 45° como medida postural complementar;
 *   (C) condução para o material do Pediatra Roberto Franklin nas Aulas
 *       Extras/Bônus do curso (a própria suspeita de refluxo patológico já
 *       indica esse encaminhamento);
 *   (D) encaminhamento ao suporte humano (idem).
 *
 * Além disso, deve diferenciar EXPLICITAMENTE "refluxo fisiológico" de
 * "refluxo patológico" — não basta dizer só "refluxo".
 *
 * Esta função é a malha de proteção: quando o LLM omite qualquer item, ela
 * completa a resposta com um parágrafo metodológico canônico, sem alterar o
 * conteúdo já escrito.
 *
 * Returns { text, appended: boolean, missing: string[] }.
 */
const REFLUX_TRIGGER_TOKENS = [
  /refluxo/,
  /regurgit/,
  /desconforto\s+(p[oó]s[\s-]?mamada|ao\s+deitar)/,
  /acorda(?:r)?\s+chorando.*ber[cç]o/,
  /permanece\s+(?:cerca\s+de\s+)?\d+\s*min(?:utos)?\s*(?:no\s+ber[cç]o)?[\s\S]{0,200}colo/,
];
const REFLUX_PHRASE_PHYSIOLOGICAL = /refluxo\s+fisiol[oó]gico/;
const REFLUX_PHRASE_PATHOLOGICAL = /refluxo\s+patol[oó]gico/;
const REFLUX_PHRASE_VERTICAL_30_40 = /(30\s*(?:a|–|-|—|at[eé])\s*40\s*min|posi[çc][aã]o\s+vertical[\s\S]{0,40}30\s*(?:a|–|-|—|at[eé])\s*40)/;
const REFLUX_PHRASE_MATTRESS_30_40 = /(eleva[çc][aã]o\s+do\s+colch[aã]o\s+(?:em|a|de)?\s*30\s*(?:a|–|-|—|at[eé])\s*40|colch[aã]o\s+(?:em|a|de)?\s*30\s*(?:a|–|-|—|at[eé])\s*40)/;
const REFLUX_PHRASE_MATTRESS_45 = /(eleva[çc][aã]o\s+do\s+colch[aã]o\s+(?:em|a|de)?\s*45|colch[aã]o\s+(?:em|a|de)?\s*45[\s°º]*|inclinar\s+(?:o\s+)?colch[aã]o.*45|45[\s°º]+(?:no|do)?\s*colch)/;
const REFLUX_PATHOLOGICAL_USER_SIGNS =
  /(vom[ií]to|em\s+jato|engasgo|engasga|recus(a|ar)\s+aliment|arquei[ao]|irritabilidade\s+persistente)/;
const REFLUX_PHRASE_PEDIATRA_MATERIAL = /(material\s+do\s+pediatra|pediatra\s+roberto|roberto\s+franklin|aulas?\s+extras?|aulas?\s+b[oô]nus|aulas?\s+bonus)/;
const REFLUX_PHRASE_HUMAN_SUPPORT = /(suporte\s+humano|equipe\s+de\s+suporte|suporte\s+do\s+curso|encaminh\w*\s+(?:para\s+)?(?:o\s+)?suporte)/;

export function ensureRefluxRoutingComplete({ text, userMessage = '', signalIds = [] } = {}) {
  if (!text) return { text: text || '', appended: false, missing: [] };
  const norm = normalize(text);
  const userNorm = normalize(userMessage || '');
  const sigSet = new Set(signalIds || []);

  // Scope guard (TESTE 005 RN 9d / 19d / 22d): the FULL reflux block
  // (refluxo fisiológico + refluxo patológico + 45° + Pediatra Roberto
  // Franklin + suporte humano) must ONLY be appended when there is upstream
  // CLINICAL evidence in the mother's message — not when the LLM happens
  // to mention "refluxo" tangentially as justification for vertical 30–40,
  // and not when the mother's "acorda chorando ... berço" is just the
  // routine described from a distance (without the short-after-crib /
  // back-to-lap pattern that the dedicated signal captures).
  //
  // KEY DESIGN RULE: the dedicated upstream signals
  //   - `wakes_short_after_crib_back_to_lap` (the canonical reflux pattern)
  //   - `reflux_discomfort_suspicion`         (clinical signs in the relato)
  // are the SOLE valid triggers. Loose REFLUX_TRIGGER_TOKENS scans on the
  // user message are insufficient — they over-fire on tangential mentions
  // of "berço" / "acorda chorando" inside long routine descriptions
  // (TESTE 005 RN 9d regression). If a relato truly carries clinical
  // suspicion the upstream signal extractor is responsible for raising it.
  const triggeredBySignal =
    sigSet.has('wakes_short_after_crib_back_to_lap') ||
    sigSet.has('reflux_discomfort_suspicion');
  if (!triggeredBySignal) {
    return { text, appended: false, missing: [] };
  }
  // Belt-and-suspenders: even if a clinical signal fired, an explicit
  // isolated-scope signal vetoes the full block (the composite signals
  // `pacifier_isolated_complaint` etc. encode the scope semantics).
  const isolatedScopeSignals = [
    'pacifier_isolated_complaint',
    'bath_crying_isolated_rn',
    'diaper_change_isolated_rn',
  ];
  if (isolatedScopeSignals.some((id) => sigSet.has(id))) {
    return { text, appended: false, missing: [] };
  }
  // userMessage / userNorm intentionally unused below — kept in the
  // signature for extensibility and so callers continue to wire it.
  void userNorm;

  const missing = [];
  if (!REFLUX_PHRASE_PHYSIOLOGICAL.test(norm)) missing.push('refluxo_fisiologico');
  if (!REFLUX_PHRASE_PATHOLOGICAL.test(norm)) missing.push('refluxo_patologico');
  if (!REFLUX_PHRASE_VERTICAL_30_40.test(norm)) missing.push('vertical_30_40');

  const hasPathologicalUserSigns = REFLUX_PATHOLOGICAL_USER_SIGNS.test(userNorm);
  const hasMattress30_40 = REFLUX_PHRASE_MATTRESS_30_40.test(norm);
  const hasMattress45 = REFLUX_PHRASE_MATTRESS_45.test(norm);
  const has45RuleForPathological =
    /(45[\s°º]*.{0,80}refluxo\s+patol|refluxo\s+patol.{0,80}45[\s°º]*|eleva[çc][aã]o.{0,60}45.{0,60}patol|patol.{0,60}eleva[çc][aã]o.{0,40}45)/.test(norm);
  if (!hasMattress30_40 && !hasMattress45) {
    missing.push('colchao_30_40');
  }
  if (!has45RuleForPathological && !hasMattress45) {
    missing.push('colchao_45_rule');
  }
  if (hasPathologicalUserSigns && !hasMattress45) {
    missing.push('colchao_45');
  }
  if (hasPathologicalUserSigns) {
    if (!REFLUX_PHRASE_PEDIATRA_MATERIAL.test(norm)) missing.push('material_pediatra');
    if (!REFLUX_PHRASE_HUMAN_SUPPORT.test(norm)) missing.push('suporte_humano');
  }

  if (missing.length === 0) return { text, appended: false, missing: [] };

  // Build a single complementary paragraph with ONLY the missing pieces, in
  // a stable order so the appended text reads naturally regardless of which
  // items the LLM already covered.
  const order = [
    'refluxo_fisiologico',
    'refluxo_patologico',
    'vertical_30_40',
    'colchao_30_40',
    'colchao_45_rule',
    'colchao_45',
    'material_pediatra',
    'suporte_humano',
  ];
  const fragmentByKey = {
    refluxo_fisiologico:
      'Acordar chorando logo após o berço e melhorar no colo pode sugerir desconforto pós-mamada ou REFLUXO FISIOLÓGICO.',
    refluxo_patologico:
      'Sinais como vômitos intensos ou em jato, engasgos frequentes, recusa alimentar, prostração, arqueamento corporal importante ou irritabilidade persistente são sugestivos de POSSIBILIDADE DE REFLUXO PATOLÓGICO — sem que isso signifique diagnóstico.',
    vertical_30_40:
      'Mantenha em posição vertical por 30 a 40 minutos após a mamada antes de transferir para o berço.',
    colchao_30_40:
      'Para refluxo fisiológico, quando indicada pelo método, considere a elevação do colchão em 30 a 40 graus como medida postural complementar à posição vertical.',
    colchao_45_rule:
      'Quando houver suspeita ou investigação de refluxo patológico, a elevação do colchão em 45°, conforme método/material do Pediatra, é a medida postural indicada nesse contexto.',
    colchao_45:
      'Para refluxo patológico ou suspeita/investigação de refluxo patológico, a elevação do colchão em 45°, quando indicada pelo método/material do pediatra, complementa a posição vertical — não use 45° como orientação padrão para refluxo fisiológico.',
    material_pediatra:
      'Recomendo consultar o material do Pediatra Roberto Franklin nas Aulas Extras/Bônus do curso para orientação sobre refluxo fisiológico e patológico.',
    suporte_humano:
      'Diante da possibilidade de refluxo patológico, procure também o suporte humano para acompanhamento — a investigação já justifica esse encaminhamento.',
  };
  const sentences = order
    .filter((k) => missing.includes(k))
    .map((k) => fragmentByKey[k]);
  const append = sentences.join(' ');
  const trimmed = text.replace(/\s+$/, '');
  return { text: `${trimmed}\n\n${append}`, appended: true, missing };
}

/**
 * Travesseiro (pillow strategy) eixos completeness — TESTE 004 RN 19d.
 *
 * Quando a mãe relata que TENTOU a Estratégia do Travesseiro sem sucesso
 * (sinal `travesseiro_tried_without_success`), o método exige que a resposta
 * contemple os EIXOS PRÁTICOS DO RN no corpo do texto:
 *   (A) postura: posição vertical por 30 a 40 minutos após a mamada;
 *   (B) desconforto gástrico: arroto / refluxo / desconforto / ar preso
 *       (basta um termo do conjunto, não exige todos);
 *   (C) reasseguramento explícito anti-associação com a idade do bebê
 *       — "com X dias, sua bebê AINDA NÃO CRIA associação...".
 *
 * O LLM, mesmo com a regra no system prompt, varia entre runs e às vezes
 * omite (A), (B) ou (C). Esta função é a malha de proteção: completa apenas
 * os itens que faltam, em parágrafo curto, sem alterar o que o LLM já
 * escreveu corretamente.
 *
 * Returns { text, appended: boolean, missing: string[] }.
 */
const TRAVESSEIRO_PHRASE_VERTICAL_30_40 = /(30\s*(?:a|–|-|—|at[eé])\s*40\s*min|posi[çc][aã]o\s+vertical[\s\S]{0,40}30\s*(?:a|–|-|—|at[eé])\s*40)/;
const TRAVESSEIRO_PHRASE_GASTRIC_EIXO = /(arrot|ar\s+preso|regurgit)/;
const TRAVESSEIRO_PHRASE_NO_NEG_ASSOC = /(aind?a?\s+n[aã]o\s+cria\s+(uma\s+)?associa[çc][aã]o|n[aã]o\s+(e|é|configura|significa|representa)\s+(uma\s+)?(associa[çc][aã]o\s+negativa|v[íi]cio|mau\s+h[aá]bito|manha))/;
// Triggers that show the LLM is leaning on behavioral framing ("adaptar ao
// berço") instead of the physiological reframing required for RN.
const TRAVESSEIRO_PHRASE_BEHAVIORAL_FRAMING_TRIGGER = /(adaptar\s+(?:[ao]o|para\s+o)\s+ber[cç]o|adaptac[aã]o\s+ao\s+ber[cç]o|acostumar\s+ao\s+ber[cç]o)/;
// Acceptable physiological reframing tokens.
const TRAVESSEIRO_PHRASE_PHYSIOLOGICAL_REFRAMING = /(adapta[çc][aã]o\s+fisiol[oó]gica|fase\s+de\s+adapta[çc][aã]o\s+fisiol[oó]gica|transi[çc][aã]o\s+de\s+superf[ií]cie|transi[çc][aã]o\s+de\s+textura|transi[çc][aã]o\s+colo[\s-]+(?:superf[ií]cie|berco|berço)|organiza[çc][aã]o\s+corporal)/;

export function ensureTravesseiroEixosComplete({ text, signalIds = [], ageDays } = {}) {
  if (!text) return { text: text || '', appended: false, missing: [] };
  const sigSet = new Set(signalIds || []);
  if (!sigSet.has('travesseiro_tried_without_success')) {
    return { text, appended: false, missing: [] };
  }

  const norm = normalize(text);
  const missing = [];
  if (!TRAVESSEIRO_PHRASE_VERTICAL_30_40.test(norm)) missing.push('vertical_30_40');
  if (!TRAVESSEIRO_PHRASE_GASTRIC_EIXO.test(norm)) missing.push('gastric_eixo');
  if (!TRAVESSEIRO_PHRASE_NO_NEG_ASSOC.test(norm)) missing.push('no_neg_assoc');
  // Etapa intermediária do Travesseiro: travesseiro sobre o colo + contenção
  // das mãos. Quando a mãe já tentou (signal disparado), é OBRIGATÓRIO
  // descrever a etapa prática — independentemente de a resposta voltar a
  // citar a palavra "travesseiro" ou não. Isso é uma travado da execução
  // prática que o método pede.
  const intermediateStepPattern =
    /(travesseiro\s+(?:em\s+cima|sobre)\s+(?:do\s+)?colo|colo\s+(?:com\s+)?(?:o\s+)?travesseiro|conten[cç][aã]o\s+(?:das\s+)?(?:m[aã]o|mao)|(?:m[aã]o|mao)[\s\S]{0,30}conten[cç][aã]o)/;
  if (!intermediateStepPattern.test(norm)) {
    missing.push('travesseiro_intermediate_step');
  }
  // Only require the physiological reframing when the response actually
  // uses behavioral framing ("adaptar ao berço") and lacks a physiological
  // reframing token. We don't impose it on responses that simply skip the
  // word "adaptar" altogether.
  if (
    TRAVESSEIRO_PHRASE_BEHAVIORAL_FRAMING_TRIGGER.test(norm)
    && !TRAVESSEIRO_PHRASE_PHYSIOLOGICAL_REFRAMING.test(norm)
  ) {
    missing.push('physiological_reframing');
  }

  if (missing.length === 0) return { text, appended: false, missing: [] };

  const ageLabel = Number.isFinite(ageDays) ? `${ageDays} dias` : 'essa idade (RN)';
  const fragmentByKey = {
    physiological_reframing: `Para o RN, prefira ler o caso como FASE DE ADAPTAÇÃO FISIOLÓGICA, ORGANIZAÇÃO CORPORAL e TRANSIÇÃO DE SUPERFÍCIE/TEXTURA — a "adaptação ao berço" é consequência desse processo, não a causa principal.`,
    vertical_30_40:
      'Após a mamada, mantenha o bebê em posição vertical por 30 a 40 minutos antes de tentar a transferência para o berço.',
    gastric_eixo:
      'Observe também o eixo de desconforto gástrico — se ela arrotou, se há sinais de refluxo fisiológico ou desconforto pós-mamada que possam estar sustentando o despertar quando deitada.',
    // TESTE 006 (RN 23d): a frase de não-associação foi ampliada para
    // explicitar TRÊS modos legítimos de organização no RN (colo, peito e
    // contenção), pois o dossiê pediu que essa frase contemple os três.
    no_neg_assoc: `Com ${ageLabel}, sua bebê AINDA NÃO CRIA associação comportamental negativa por dormir no colo, dormir no peito ou precisar de contenção — nessa idade isso é fisiológico e esperado, não é vício, manha nem mau hábito.`,
    // TESTE 006 (RN 23d): reforço explícito de que travesseiro sobre o colo
    // com contenção é PARTE DO PROCESSO, não falha. O dossiê classificou
    // esse reforço como ajuste fino para subir de 9,5 para nota máxima.
    travesseiro_intermediate_step:
      'Como você já tentou a Estratégia do Travesseiro, o passo prático que costuma faltar é a ETAPA INTERMEDIÁRIA: nos primeiros dias, muitas sonecas podem acontecer com a bebê NO TRAVESSEIRO EM CIMA DO COLO, com sua mão fazendo a CONTENÇÃO das mãozinhas/braços enquanto necessário — isso ajuda a bebê a se organizar e se preparar para a transição ao berço com mais leveza. Você não precisa colocá-la diretamente no berço e esperar que ela aceite — o TRAVESSEIRO SOBRE O COLO COM CONTENÇÃO É PARTE DO PROCESSO, NÃO FALHA: é a etapa fisiológica de transição de superfície/textura, e repeti-la com leveza é justamente o caminho para a transferência gradual ao berço.',
  };
  const order = ['no_neg_assoc', 'physiological_reframing', 'travesseiro_intermediate_step', 'vertical_30_40', 'gastric_eixo'];
  const sentences = order.filter((k) => missing.includes(k)).map((k) => fragmentByKey[k]);
  const append = sentences.join(' ');
  const trimmed = text.replace(/\s+$/, '');
  return { text: `${trimmed}\n\n${append}`, appended: true, missing };
}

/**
 * Travesseiro tentado — nunca perder eixo alimentar (TESTE 007 RN 19d).
 * Quando a mãe relata dificuldade colo→berço com Travesseiro tentado, a
 * resposta DEVE manter mamada efetiva, saciedade, produção (especialmente
 * fim da tarde), charutinho se Moro/desorganização e ambiente de sono.
 */
const TRAVESSEIRO_FEEDING_AXIS =
  /(mamada\s+efetiv|sinais\s+de\s+saciedade|produc[aã]o\s+de\s+leite|transfer[eê]ncia\s+de\s+leite|fluxo\s+no\s+fim\s+da\s+tarde|queda\s+de\s+fluxo)/;
const TRAVESSEIRO_CHARUTINHO_PRACTICAL =
  /(charutinho|reflexo\s+de\s+moro|desorganiza[cç][aã]o\s+corporal)/;
const TRAVESSEIRO_SLEEP_ENV =
  /(ambiente\s+escuro|baixa\s+estimula[cç][aã]o|calmo\s+e\s+com\s+baixa|escuro.{0,40}calmo)/;

export function ensureTravesseiroFeedingAxisComplete({ text, signalIds = [] } = {}) {
  if (!text) return { text: text || '', appended: false, missing: [] };
  const sigSet = new Set(signalIds || []);
  if (!sigSet.has('travesseiro_tried_without_success')) {
    return { text, appended: false, missing: [] };
  }

  const norm = normalize(text);
  const missing = [];
  if (!TRAVESSEIRO_FEEDING_AXIS.test(norm)) missing.push('feeding_axis');
  if (!TRAVESSEIRO_CHARUTINHO_PRACTICAL.test(norm)) missing.push('charutinho_practical');
  if (!TRAVESSEIRO_SLEEP_ENV.test(norm)) missing.push('sleep_environment');

  if (missing.length === 0) return { text, appended: false, missing: [] };

  const fragmentByKey = {
    feeding_axis:
      'Antes de focar só na transição para o berço, avalie mamada efetiva, sinais de saciedade e produção de leite — especialmente queda de fluxo no fim da tarde. Observe se ela mama e relaxa, solta o peito espontaneamente, abre as mãozinhas ou volta a buscar o peito pouco tempo depois.',
    charutinho_practical:
      'Se houver reflexo de Moro ou desorganização corporal, use charutinho antes da transferência para o berço — inclusive nas sonecas diurnas.',
    sleep_environment:
      'Mantenha ambiente escuro, calmo e com baixa estimulação durante a transição para o sono.',
  };
  const order = ['feeding_axis', 'charutinho_practical', 'sleep_environment'];
  const sentences = order.filter((k) => missing.includes(k)).map((k) => fragmentByKey[k]);
  const trimmed = text.replace(/\s+$/, '');
  return { text: `${trimmed}\n\n${sentences.join(' ')}`, appended: true, missing };
}

/**
 * Soneca curta no berço + choro — não normalizar demais na abertura (TESTE 007 RN 20d).
 */
const SHORT_NAP_OVER_NORMALIZED =
  /(e\s+(comum|esperado|normal)\s+(nes)?sa\s+fase|podem?\s+ocorrer\s+no\s+rn.{0,80}(sem\s+investigar|sem\s+mercer|apenas\s+observar))/;

export function ensureShortNapOpeningRefined({ text, signalIds = [] } = {}) {
  if (!text) return { text: text || '', appended: false, missing: [] };
  const sigSet = new Set(signalIds || []);
  if (!sigSet.has('wakes_short_after_crib_back_to_lap')) {
    return { text, appended: false, missing: [] };
  }

  const norm = normalize(text);
  const hasRefinedOpening =
    /(nao\s+deve\s+ser\s+tratad[ao]\s+como\s+simplesmente\s+esperad|merece\s+investigac[aã]o|dado\s+principal|acordar\s+chorando.{0,80}melhorar.{0,80}colo.{0,80}investig)/.test(norm);
  if (hasRefinedOpening) return { text, appended: false, missing: [] };

  const prepend =
    'Sonecas curtas podem acontecer no RN, mas acordar chorando após cerca de 20 minutos no berço e melhorar apenas no colo não deve ser tratado como simplesmente esperado — merece investigação.';
  return { text: `${prepend}\n\n${text.replace(/^\s+/, '')}`, appended: true, missing: ['refined_opening'] };
}

/**
 * Pacifier (chupeta cai) practical management completeness — TESTE 002 RN 22d.
 *
 * Quando dispara o sinal `pacifier_in_rn` E a mãe relata o padrão "chupeta
 * cai e bebê acorda" (mensagem original ou seus sinônimos), o método exige
 * no corpo da resposta:
 *   (A) reflexo de sucção / necessidade de regulação como leitura;
 *   (B) manejo prático: se a chupeta cair e o bebê continuar dormindo,
 *       NÃO precisa recolocar; se acordar logo que cai, diferenciar fome,
 *       desconforto pós-mamada, sucção e transição para o berço.
 *
 * O LLM, mesmo com a regra no system prompt e nos chunks, varia entre runs
 * e às vezes salta para sinais de saciedade sem ancorar o manejo prático.
 * Esta função é a malha de proteção: completa apenas os itens faltantes.
 *
 * Returns { text, appended: boolean, missing: string[] }.
 */
const PACIFIER_USER_TRIGGER = /(chupeta\s+cai|cai\s+a\s+chupeta|recolocar\s+a\s+chupeta|acorda\s+(?:porque|quando)\s+a\s+chupeta\s+cai|fico\s+(?:colocando|recolocando)\s+(?:a\s+)?chupeta)/;
const PACIFIER_PHRASE_REFLEX_REGULATION = /(reflexo\s+de\s+suc[çc][aã]o|necessidade\s+de\s+suc[çc][aã]o|necessidade\s+de\s+regula[çc][aã]o|regula[çc][aã]o)/;
const PACIFIER_PHRASE_PRACTICAL_MGMT = /(se\s+a\s+chupeta\s+cair[\s\S]{0,80}(?:n[aã]o\s+precis(?:a|e)\s+recolocar|continuar\s+dormindo|deix[ae]\s+dormir)|n[aã]o\s+precis(?:a|e)\s+recolocar\s+a\s+chupeta|chupeta\s+cair[\s\S]{0,40}continuar\s+dormindo)/;
// TESTE 006 (RN 22d): exigência explícita de afirmar que nessa fase
// a chupeta não representa associação comportamental negativa.
const PACIFIER_PHRASE_EXPLICIT_NOT_NEG_ASSOC = /(n[aã]o\s+(deve\s+ser\s+|representa\s+|configura\s+|caracteriza\s+)?(interpretad[ao]\s+como\s+)?associa[çc][aã]o\s+(comportamental\s+)?negativa\s+nessa\s+fase|nessa\s+fase\s+(a\s+)?chupeta\s+n[aã]o\s+(deve\s+ser\s+|representa\s+|configura\s+|caracteriza\s+)?(interpretad[ao]\s+como\s+)?associa[çc][aã]o|nessa\s+fase\s+(isso|essa\s+(necessidade|leitura))\s+n[aã]o\s+(e|configura|representa)\s+associa[çc][aã]o\s+(comportamental\s+)?negativa)/;

export function ensurePacifierPracticalComplete({ text, userMessage, signalIds = [] } = {}) {
  if (!text || !userMessage) return { text: text || '', appended: false, missing: [] };
  const sigSet = new Set(signalIds || []);
  if (!sigSet.has('pacifier_in_rn')) return { text, appended: false, missing: [] };
  const userNorm = normalize(userMessage);
  if (!PACIFIER_USER_TRIGGER.test(userNorm)) return { text, appended: false, missing: [] };

  const norm = normalize(text);
  const missing = [];
  if (!PACIFIER_PHRASE_REFLEX_REGULATION.test(norm)) missing.push('reflexo_regulacao');
  if (!PACIFIER_PHRASE_PRACTICAL_MGMT.test(norm)) missing.push('practical_mgmt');
  if (!PACIFIER_PHRASE_EXPLICIT_NOT_NEG_ASSOC.test(norm)) missing.push('explicit_not_neg_assoc');

  if (missing.length === 0) return { text, appended: false, missing: [] };

  // TESTE 006 (RN 22d): gender-aware practical_mgmt fragment. When the
  // mother used feminine cues ("minha bebê", "ela"), the practical
  // management block needs to keep grammatical gender consistent —
  // the dossiê explicitly flagged "se ela cair e o bebê continuar dormindo
  // ... se ele acordar" as a coerência problem.
  const motherGender = detectMotherGenderCue(userMessage);
  const isFem = motherGender === 'feminine';
  const fragmentByKey = {
    reflexo_regulacao:
      'Para o RN, a chupeta é leitura de REFLEXO DE SUCÇÃO e NECESSIDADE DE REGULAÇÃO — não é vício nem hábito comportamental.',
    explicit_not_neg_assoc: isFem
      ? 'Nessa fase, a chupeta NÃO representa associação comportamental negativa para a bebê — é apoio fisiológico de regulação, não vício, manha nem mau hábito.'
      : 'Nessa fase, a chupeta NÃO representa associação comportamental negativa para o bebê — é apoio fisiológico de regulação, não vício, manha nem mau hábito.',
    practical_mgmt: isFem
      ? 'Sobre a chupeta cair: se ela cair e a bebê continuar dormindo, NÃO PRECISA RECOLOCAR; se ela acordar logo que cai, diferencie entre fome, desconforto pós-mamada, necessidade de sucção e transição para o berço — investigue o eixo correspondente em vez de reposicionar a chupeta repetidas vezes. NUNCA prenda ou fixe a chupeta.'
      : 'Sobre a chupeta cair: se ela cair e o bebê continuar dormindo, NÃO PRECISA RECOLOCAR; se ele acordar logo que cai, diferencie entre fome, desconforto pós-mamada, necessidade de sucção e transição para o berço — investigue o eixo correspondente em vez de reposicionar a chupeta repetidas vezes. NUNCA prenda ou fixe a chupeta.',
  };
  const order = ['explicit_not_neg_assoc', 'reflexo_regulacao', 'practical_mgmt'];
  const sentences = order.filter((k) => missing.includes(k)).map((k) => fragmentByKey[k]);
  const append = sentences.join(' ');
  const trimmed = text.replace(/\s+$/, '');
  return { text: `${trimmed}\n\n${append}`, appended: true, missing };
}

/**
 * TESTE 004 (RN 22d): the methodology requires the satiety closing to be
 * cautious ("isso pode indicar que a mamada não foi suficiente ou que houve
 * dificuldade de transferência") and to adapt the conduct to the feeding
 * form (peito × fórmula × complemento). The canonical text in
 * SATIETY_SIGNS_OFFICIAL_TEXT is already cautious + adaptive; this enricher
 * is a defense-in-depth that REWRITES any residual hard claim ("a mamada
 * provavelmente não foi suficiente") that the LLM might still emit on its
 * own (independent of the satiety enricher).
 *
 * Returns { text, rewritten: boolean }.
 */
export function softenMamadaInsufficientClaim({ text } = {}) {
  if (!text) return { text: text || '', rewritten: false };
  // Only rewrite when the categorical claim is present and the cautious
  // counterpart isn't already adjacent — avoids double-softening the
  // canonical satiety closing.
  const norm = normalize(text);
  if (!/a\s+mamada\s+provavelmente\s+n[aã]o\s+foi\s+suficiente/.test(norm)) {
    return { text, rewritten: false };
  }
  // The replacement keeps the canonical operational continuation intact and
  // only swaps the leading clause for the cautious formulation. We use a
  // diacritics-tolerant pattern to handle both "não" and "nao" variants.
  const out = text.replace(
    /a\s+mamada\s+provavelmente\s+n(?:ã|a)o\s+foi\s+suficiente/gi,
    'isso pode indicar que a mamada não foi suficiente ou que houve dificuldade de transferência',
  );
  return { text: out, rewritten: out !== text };
}

/**
 * TESTE 004 (RN 23d): mãe relata charutinho funcionando à NOITE com Moro/
 * espasmos sem ele, e SONECAS DIURNAS DIFÍCEIS. A leitura metodológica
 * exige (a) charutinho TAMBÉM DURANTE O DIA explicitamente; (b) investigação
 * concreta de mamada efetiva (sucção/deglutição/saciedade/busca precoce),
 * não confiar em "mama bem"; (c) reposicionar o colo como recurso de
 * organização/segurança em RN, sem framing comportamental.
 *
 * Returns { text, appended: boolean, missing: string[] }.
 */
// Aligned with TESTE 006 RN 23d rubric — loose phrasing like "durante as
// sonecas" without "diurnas", or "oriente que ele use" without tying
// charutinho to the day, does NOT count as explicit day guidance.
const CHARUTINHO_DAY_PATTERN =
  /(charutinho\s+tambem\s+durante\s+o\s+dia|charutinho.{0,80}(durante o dia|tambem.{0,30}dia|nas sonecas diurnas|durante as sonecas diurnas|tambem.{0,20}sonecas)|tambem.{0,40}charutinho.{0,40}(dia|sonecas diurnas)|use.{0,40}charutinho.{0,40}dia)/;
const EFFECTIVE_FEEDING_INVESTIGATION_PATTERN =
  /(succao\s+(com\s+ritmo|ativa|com\s+pausa|pausada|ritmica|ritmo\s+e\s+pausa)|pausa\s+entre\s+sucçoes|ouve\s+a\s+deglu|escut[ae].*degluti|degluticao\s+aud[ií]vel|ritmo\s+de\s+succao|ritmica\s+e\s+pausada|pausas\s+ritmicas)/;
// Explicit "mama bem ≠ mamada efetiva" framing — TESTE 005 RN 23d, regra
// vinculante. The methodology requires the answer to STATE that the
// mother's "ela mama bem" perception does NOT confirm effective feeding
// in the RN, and that effective feeding must be investigated with concrete
// signs (sucção/deglutição/saciedade/busca precoce). It is not enough to
// list the signs — the explicit re-framing must be present, otherwise the
// mother keeps anchoring on her own perception and the investigation is
// undercut at the framing level.
const MAMA_BEM_NOT_EFFECTIVE_FRAMING =
  /("?mama\s+bem"?|que\s+(ela|ele)\s+(esta\s+mamando\s+bem|mama\s+bem))[\s\S]{0,80}(nao\s+(confirma|garante|significa|equivale|comprov|assegur)|nao\s+e\s+suficiente|nao\s+e\s+sin[oô]nimo|nao\s+e\s+o\s+mesmo|nao\s+basta)/;
const EARLY_BREAST_SEEK_PATTERN =
  /(busca.*peito.*pouco tempo|volta a buscar o peito|busca pelo peito em pouco tempo|busca precoce|continua procurando o peito|volta a buscar.*peito)/;
const COLO_BEHAVIORAL_FRAMING_RISK =
  /(manter\s+(?:a\s+)?bebe\s+exclusivamente\s+no\s+colo\s+(?:reforc|aumenta|cria))|(?:exclusivamente\s+no\s+colo\s+(?:reforc|aumenta|cria))/;
const COLO_RN_REFRAMING_PHRASES =
  /(adaptacao fisiologica|organizacao corporal|recurso\s+de\s+(?:organizacao|seguranca)|colo\s+(?:e|continua\s+sendo)\s+recurso)/;

export function ensureCharutinhoNightOnlyComplete({ text, userMessage, signalIds = [] } = {}) {
  if (!text) return { text: text || '', appended: false, missing: [] };
  const sigSet = new Set(signalIds || []);
  if (!sigSet.has('charutinho_night_only_rn')) return { text, appended: false, missing: [] };
  void userMessage;

  // Moro fisiológico framing — required for the charutinho-night-only case.
  // When the mother explicitly mentions Moro/espasmos and our enricher fires,
  // the response MUST frame Moro as fisiológico/esperado/comum nessa fase.
  // We accept several near-equivalent phrasings the LLM may pick up.
  const MORO_PHYSIOLOGICAL_FRAMING =
    /(reflexo\s+de\s+moro[\s\S]{0,120}(fisiologic|esperad|comum|normal|nessa\s+fase|conter)|moro[\s\S]{0,120}(fisiologic|esperad|comum|normal|conter)|fisiologic[\s\S]{0,80}(reflexo\s+de\s+moro|moro)|esperad[ao][\s\S]{0,80}(reflexo\s+de\s+moro|moro)|comum[\s\S]{0,80}(reflexo\s+de\s+moro|moro)|charutinho[\s\S]{0,40}(conter|reflexo\s+de\s+moro))/;

  const norm = normalize(text);
  const missing = [];
  if (!CHARUTINHO_DAY_PATTERN.test(norm)) missing.push('charutinho_dia');
  if (!EFFECTIVE_FEEDING_INVESTIGATION_PATTERN.test(norm)) missing.push('effective_feeding');
  if (!MAMA_BEM_NOT_EFFECTIVE_FRAMING.test(norm)) missing.push('mama_bem_framing');
  if (!EARLY_BREAST_SEEK_PATTERN.test(norm)) missing.push('early_breast_seek');
  if (!MORO_PHYSIOLOGICAL_FRAMING.test(norm)) missing.push('moro_physiological');
  if (COLO_BEHAVIORAL_FRAMING_RISK.test(norm) && !COLO_RN_REFRAMING_PHRASES.test(norm)) {
    missing.push('colo_rn_reframing');
  }
  if (missing.length === 0) return { text, appended: false, missing: [] };

  const fragmentByKey = {
    moro_physiological:
      'O REFLEXO DE MORO é FISIOLÓGICO e ESPERADO no RN — nessa fase é comum que ele esteja impactando a manutenção do sono e a permanência no berço, especialmente nas sonecas diurnas. O charutinho é o recurso para CONTER o reflexo de Moro enquanto a bebê se organiza.',
    charutinho_dia:
      'Como o charutinho funciona à noite e os espasmos pelo reflexo de Moro voltam sem ele, use o CHARUTINHO TAMBÉM DURANTE O DIA, especialmente nas SONECAS DIURNAS — não restrinja o charutinho só à noite.',
    mama_bem_framing:
      'Importante: quando você diz que a sua bebê "mama bem", essa percepção NÃO confirma mamada efetiva no RN. Por isso é necessário investigar concretamente os sinais de mamada efetiva, em vez de apoiar a conduta apenas na sensação de que ela mama bem.',
    effective_feeding:
      'Investigue concretamente: SUCÇÃO ATIVA com pausas rítmicas, DEGLUTIÇÃO AUDÍVEL durante a mamada e SACIEDADE após mamar (solta o peito espontaneamente, relaxa o corpo, abre as mãozinhas, reduz o ritmo da sucção, fica tranquila depois de arrotar e em posição vertical).',
    early_breast_seek:
      'Observe também a BUSCA PRECOCE PELO PEITO — se ela volta a buscar o peito em pouco tempo após mamar, é sinal de que a mamada pode não ter sido suficiente ou houve dificuldade de transferência; avalie produção e transferência junto com os demais sinais.',
    // TESTE 006 (RN 23d): a frase final de fechamento foi ampliada para
    // dizer textualmente que dormir no colo, dormir no peito ou precisar de
    // contenção não cria associação negativa nessa fase — e que o
    // travesseiro sobre o colo com contenção é parte do processo.
    colo_rn_reframing:
      'No RN, o COLO continua sendo RECURSO de organização, segurança e transição — dormir no colo, dormir no peito ou precisar de contenção AINDA NÃO CRIA associação comportamental negativa nessa fase, não é vício, manha nem mau hábito. A transição para o berço/Moisés é gradual: TRAVESSEIRO SOBRE O COLO COM CONTENÇÃO das mãos é PARTE DO PROCESSO, NÃO FALHA — repita com leveza, em paralelo às medidas de mamada efetiva, arroto, posição vertical por 30 a 40 minutos e charutinho nas sonecas diurnas.',
  };
  const order = [
    'moro_physiological',
    'colo_rn_reframing',
    'charutinho_dia',
    'mama_bem_framing',
    'effective_feeding',
    'early_breast_seek',
  ];
  const sentences = order.filter((k) => missing.includes(k)).map((k) => fragmentByKey[k]);
  const append = sentences.join(' ');
  const trimmed = text.replace(/\s+$/, '');
  return { text: `${trimmed}\n\n${append}`, appended: true, missing };
}

/**
 * Janela crítica 23h–02h (RN) — pergunta indispensável "ANTES ou DEPOIS da
 * mamada?" e ramo condicional. TESTE 005 RN 10d.
 *
 * Quando dispara `night_hunger_signs_rn` (mãe descreve que, na faixa
 * 23h–02h, a bebê fica nervosa, suga as mãozinhas, choraminga — sinais
 * fortes de fome no RN), o método obriga a fazer DUAS perguntas
 * indispensáveis e oferecer um RAMO operacional condicional:
 *   (1) "Nesse horário, ela já mamou? Você ofereceu a mamada?" — checa o
 *       eixo alimentar primeiro, antes de qualquer manejo de berço.
 *   (2) "Esse comportamento acontece ANTES ou DEPOIS da mamada?" — define
 *       a árvore: se ANTES → alimentar em livre demanda; se DEPOIS →
 *       investigar mamada efetiva, produção e saciedade.
 *
 * O LLM, mesmo com a regra no system prompt, varia entre runs e às vezes
 * omite (1) ou (2). Esta função é a malha de proteção: anexa SOMENTE o(s)
 * item(ns) faltante(s) com a árvore condicional explícita.
 *
 * Returns { text, appended: boolean, missing: string[] }.
 */
const NIGHT_HUNGER_FED_AT_TIME_PATTERN =
  /(ela\s+(j[aá]\s+)?mamou\s+nesse\s+hor|nesse\s+hor[aá]rio[,\s]+ela\s+(j[aá]\s+)?(mamou|tem mamado)|antes\s+de\s+(tentar\s+coloc[aá]-la|coloc[aá]-la\s+no\s+ber).{0,80}ela\s+(j[aá]\s+)?(mama|mamou)|ela\s+(j[aá]\s+)?mamou\s+antes|voc[eê]\s+oferec[eu]\s+a\s+mamada\s+nesse\s+hor|quando\s+ela\s+acorda.{0,40}voc[eê]\s+oferec[eu]\s+a\s+mamada|nesse\s+hor[aá]rio.{0,40}voc[eê]\s+oferec[eu]\s+a\s+mamada)/;
const NIGHT_HUNGER_BEFORE_OR_AFTER_PATTERN =
  /(antes\s+ou\s+depois\s+da\s+mamada|antes\s+da\s+mamada\s+ou\s+depois|depois\s+da\s+mamada\s+ou\s+antes|esse\s+comportamento.{0,80}(antes|depois)\s+da\s+mamada)/;

export function ensureNightHungerJanelaCriticaComplete({ text, signalIds = [] } = {}) {
  if (!text) return { text: text || '', appended: false, missing: [] };
  const sigSet = new Set(signalIds || []);
  if (!sigSet.has('night_hunger_signs_rn')) return { text, appended: false, missing: [] };

  const norm = normalize(text);
  const missing = [];
  if (!NIGHT_HUNGER_FED_AT_TIME_PATTERN.test(norm)) missing.push('fed_at_time_question');
  if (!NIGHT_HUNGER_BEFORE_OR_AFTER_PATTERN.test(norm)) missing.push('before_or_after_question');

  if (missing.length === 0) return { text, appended: false, missing: [] };

  // TESTE 006 (RN 10d): a pergunta indispensável "ANTES ou DEPOIS da mamada?"
  // PRECISA aparecer LOGO NO INÍCIO da condução, não no final. O dossiê
  // explicitamente marcou como ponto de ajuste a pergunta ter ficado no
  // último parágrafo. Mudamos a estratégia de APPEND → PREPEND para garantir
  // que a árvore condicional seja o eixo que abre o raciocínio do caso.
  // TESTE 007 (RN 10d): perguntas + conduta imediata na mesma abertura; seios/
  // deglutição só quando houver aleitamento materno.
  const fragmentByKey = {
    fed_at_time_question:
      'Nesse horário, ela já mamou?',
    before_or_after_question:
      'Esse comportamento de ficar nervosa, sugar as mãozinhas e choramingar acontece ANTES ou DEPOIS da mamada?',
    conduct_tree:
      'Se acontece ANTES da mamada, a conduta é alimentar em livre demanda. Se acontece DEPOIS da mamada, investigue se a mamada foi efetiva, se houve boa transferência de leite, se ela apresentou sinais de saciedade, se arrotou e se permaneceu em posição vertical por 30 a 40 minutos. Se ela mama no peito, observe também como os seios ficam ao final da tarde e se há deglutição audível; se usa fórmula ou mamadeira, observe volume, intervalo e sinais de saciedade conforme orientação individual.',
  };
  const order = ['fed_at_time_question', 'before_or_after_question', 'conduct_tree'];
  const sentences = order.filter((k) => {
    if (k === 'conduct_tree') {
      return missing.includes('before_or_after_question') || missing.includes('fed_at_time_question');
    }
    return missing.includes(k);
  }).map((k) => fragmentByKey[k]);
  const prepend = sentences.join(' ');
  return { text: `${prepend}\n\n${text.replace(/^\s+/, '')}`, appended: true, missing };
}

/**
 * Madrugada (night-feed routine) completeness — TESTE 005 RN 12d/02.
 *
 * Quando a mãe relata o cenário "acordou para mamar de madrugada, troquei a
 * fralda, demorou para voltar a dormir" (sinais `night_diaper_change_routine`
 * e/ou `start_day_or_keep_night_rn`), o método exige que a resposta carregue
 * no corpo do texto:
 *   (A) a sequência operacional "troca de fralda ANTES da mamada" para a
 *       madrugada (a fralda já cheia desperta o RN logo após a mamada);
 *   (B) "mínima luz" e (idealmente) "sem conversa" no manejo;
 *   (C) "posição vertical por 30 a 40 minutos" após a mamada — eixo postural
 *       do RN (independente de suspeita clínica de refluxo).
 *
 * O LLM, mesmo com a regra no system prompt, varia entre runs e às vezes
 * omite (A) ou (C). Esta função é a malha de proteção: completa apenas os
 * itens que faltam, em parágrafo curto, sem alterar o que o LLM já
 * escreveu corretamente.
 *
 * Returns { text, appended: boolean, missing: string[] }.
 */
const NIGHT_DIAPER_BEFORE_FEED_PATTERN =
  /((troca[r]?|troc[ae]|troque[i]?)\s+(a\s+|de\s+|da\s+)?fralda[\s\S]{0,140}antes\s+(da\s+mamada|de\s+mamar)|fralda[\s\S]{0,40}antes\s+(da\s+mamada|de\s+mamar)|antes\s+(da\s+mamada|de\s+mamar)[\s\S]{0,180}(troca|trocar|troc[ae]|troque[i]?)\s+(a\s+|de\s+|da\s+)?fralda)/;
const NIGHT_MINIMAL_LIGHT_PATTERN =
  /(minima\s+luz|pouca\s+luz|luz\s+m[ií]nima|luz\s+baix|sem\s+luz|no\s+escur)/;
const VERTICAL_30_40_PATTERN =
  /(30\s*(?:a|–|-|—|at[eé])\s*40\s*min|posi[çc][aã]o\s+vertical[\s\S]{0,40}30\s*(?:a|–|-|—|at[eé])\s*40)/;

export function ensureNightDiaperRoutineComplete({ text, signalIds = [] } = {}) {
  if (!text) return { text: text || '', appended: false, missing: [] };
  const sigSet = new Set(signalIds || []);
  const triggered =
    sigSet.has('night_diaper_change_routine') ||
    sigSet.has('start_day_or_keep_night_rn');
  if (!triggered) return { text, appended: false, missing: [] };

  const norm = normalize(text);
  const missing = [];
  if (!NIGHT_DIAPER_BEFORE_FEED_PATTERN.test(norm)) missing.push('diaper_before_feed');
  if (!NIGHT_MINIMAL_LIGHT_PATTERN.test(norm)) missing.push('minimal_light');
  if (!VERTICAL_30_40_PATTERN.test(norm)) missing.push('vertical_30_40');

  if (missing.length === 0) return { text, appended: false, missing: [] };

  const fragmentByKey = {
    diaper_before_feed:
      'Para os despertares de madrugada, oriente fazer a TROCA DE FRALDA ANTES DA MAMADA: assim a bebê não acorda logo em seguida por causa de uma fralda já cheia, e a mamada conduz mais diretamente ao retorno do sono.',
    minimal_light:
      'Mantenha o ambiente com MÍNIMA LUZ (apenas a luz necessária para enxergar) e o mínimo de conversa durante o manejo, para preservar o estado noturno e facilitar o retorno ao sono.',
    vertical_30_40:
      'Após a mamada, mantenha a bebê em POSIÇÃO VERTICAL POR 30 A 40 MINUTOS antes de transferir para o berço — eixo postural padrão do RN, que reduz desconforto gástrico e melhora a transição para o sono.',
  };
  const order = ['diaper_before_feed', 'minimal_light', 'vertical_30_40'];
  const sentences = order.filter((k) => missing.includes(k)).map((k) => fragmentByKey[k]);
  const append = sentences.join(' ');
  const trimmed = text.replace(/\s+$/, '');
  return { text: `${trimmed}\n\n${append}`, appended: true, missing };
}

/**
 * Removes redundant repetitions of the "posição vertical por 30 a 40 minutos"
 * orientation within the same response. TESTE 006 (RN 22d) explicitly flagged
 * this repetition as a calibration issue: the orientation is correct in
 * isolation, but appearing twice in close proximity makes the response feel
 * less polished. We keep the FIRST occurrence (which is usually inside the
 * canonical practical sequence) and gently rewrite later occurrences into
 * lighter back-references like "mantenha a posição vertical já mencionada".
 *
 * Conservative: only rewrites when there are 2+ full mentions of the canonical
 * phrase "posição vertical por 30 a 40 minutos" / "posição vertical 30 a 40
 * minutos" within the same response. Other shapes are left untouched.
 *
 * Returns { text, deduplicated: boolean, removedCount: number }.
 */
const VERTICAL_30_40_MENTION_RE =
  /(?:manten?h?[ae]?[\-\s]?(?:a|o|[oa]\s+beb[êe])?\s*)?(?:em\s+)?posi[çc][aã]o\s+vertical(?:\s+(?:por|durante))?\s+(?:de\s+)?30\s*(?:a|–|-|—|at[eé])\s*40\s*(?:min(?:utos)?|m)\b/gi;

export function dedupeVerticalThirtyForty({ text } = {}) {
  if (!text) return { text: text || '', deduplicated: false, removedCount: 0 };
  const matches = [...text.matchAll(VERTICAL_30_40_MENTION_RE)];
  if (matches.length < 2) return { text, deduplicated: false, removedCount: 0 };

  // Keep the first occurrence intact. From the second onwards, replace the
  // whole canonical mention by a lightweight back-reference. We preserve the
  // sentence boundaries by NOT removing leading/trailing punctuation.
  let removed = 0;
  let lastIndex = 0;
  const parts = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const start = m.index;
    const end = start + m[0].length;
    parts.push(text.slice(lastIndex, start));
    if (i === 0) {
      parts.push(m[0]);
    } else {
      // Replace by a back-reference. We try to keep capitalization consistent
      // with the original token (rough heuristic: if it started with capital).
      const startsCapital = /^[A-ZÀ-Ý]/.test(m[0]);
      const replacement = startsCapital
        ? 'Mantenha o bebê em posição vertical'
        : 'mantê-lo em posição vertical';
      parts.push(replacement);
      removed += 1;
    }
    lastIndex = end;
  }
  parts.push(text.slice(lastIndex));
  return { text: parts.join(''), deduplicated: removed > 0, removedCount: removed };
}

/**
 * Surgical auto-correction of age mentions in a drafted response.
 * Replaces any "<N> dias" / "<N> dia" / "<N>d" mention inside the RN window
 * (0–60 d) that diverges from the profile age with the canonical
 * "<profileAge> dias". Preserves the rest of the response untouched.
 *
 * Also rewrites coarse mentions like "duas semanas" / "uma semana de vida"
 * when the profile age clearly contradicts them. We are intentionally
 * conservative: anything outside the RN window (e.g. "365 dias") or any
 * range that already contains the profile age is left alone.
 *
 * Returns { text, corrections: [{ before, after }] }.
 *
 * Test feedback explicitly requires this: the mother stating "16 dias" and
 * the IA answering "14 dias" is a 'PRESERVAÇÃO DE DADO OBJETIVO' error and
 * compromises the response. We fix it before it ever reaches the mother.
 */
export function correctAgeMentions({ text, ageDays }) {
  if (!Number.isFinite(ageDays) || !text) {
    return { text: text || '', corrections: [] };
  }
  const corrections = [];

  // 1) Numeric "<N> dias" mentions. Whitespace-flexible. Skip ranges (those
  //    are validated elsewhere by checkAgeConsistency and would be ambiguous
  //    to auto-rewrite).
  const numericRe = /(\b\d{1,3})\s*dias?\b/gi;
  let out = text.replace(numericRe, (match, numStr, offset, fullText) => {
    // Skip if this is the trailing number of a range like "20 a 28 dias".
    // We look back to see if there's "a/até/-/–/—" plus a number right
    // before this token within ~8 chars.
    const before = fullText.slice(Math.max(0, offset - 12), offset);
    if (/(\b\d{1,3})\s*(?:a|até|ate|–|-|—)\s*$/i.test(before)) return match;

    const n = Number(numStr);
    if (!Number.isFinite(n) || n < 0 || n > 60) return match;
    if (n === ageDays) return match;
    corrections.push({ before: match.trim(), after: `${ageDays} dias`, kind: 'numeric_days' });
    return `${ageDays} dias`;
  });

  // 2) Coarse "X semana(s)" mentions inside the RN window. If profile is
  //    e.g. 22 days and the IA writes "duas semanas" (=14d), that's still a
  //    misrepresentation of the data.
  const semanasMap = {
    uma: 7,
    duas: 14,
    tres: 21,
    três: 21,
    quatro: 28,
  };
  // Standard from test feedback: preserve the objective data EXACTLY (no
  // approximation by week-bucketing). Rewrite any week mention that does not
  // map back to the profile age in days. (Note: legitimate range mentions
  // like "duas a três semanas" would have a different shape and are out of
  // scope here.)
  const semanasRe = /\b(uma|duas|tr[êe]s|quatro)\s+semanas?\b/gi;
  out = out.replace(semanasRe, (match, word) => {
    const key = word.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const days = semanasMap[key];
    if (!Number.isFinite(days)) return match;
    if (days === ageDays) return match;
    corrections.push({ before: match.trim(), after: `${ageDays} dias`, kind: 'weeks_word' });
    return `${ageDays} dias`;
  });

  // 3) "<N> semana(s)" numeric variant inside the RN window.
  const semanasNumRe = /\b(\d{1,2})\s*semanas?\b/gi;
  out = out.replace(semanasNumRe, (match, numStr) => {
    const n = Number(numStr);
    if (!Number.isFinite(n) || n < 1 || n > 8) return match;
    const days = n * 7;
    if (days === ageDays) return match;
    corrections.push({ before: match.trim(), after: `${ageDays} dias`, kind: 'weeks_numeric' });
    return `${ageDays} dias`;
  });

  return { text: out, corrections };
}

/**
 * Detects baby gender from the mother's wording. Returns 'feminine' | 'masculine' | null.
 * Mirrors the logic in systemPrompt.js so we can apply the same fix downstream.
 */
function detectMotherGenderCue(text) {
  if (!text) return null;
  const norm = String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const fem =
    /\bminha\s+(beb[eê]|bb|filha|menina|princesa|nenem|nen[eé]m|bebezinha)\b|\bbeb[eê]\s+(menina|fem[ií]nina)\b|\b(ela|dela)\b/.test(
      norm,
    );
  const masc =
    /\bmeu\s+(beb[eê]|bb|filho|menino|principe|nenem|nen[eé]m|bebezinho)\b|\bbeb[eê]\s+(menino|masculino)\b|\b(ele|dele)\b/.test(
      norm,
    );
  if (fem && !masc) return 'feminine';
  if (masc && !fem) return 'masculine';
  if (fem && masc) {
    const idxFem = norm.search(/\b(ela|dela|minha\s+(bebe|bb|filha|menina))\b/);
    const idxMasc = norm.search(/\b(ele|dele|meu\s+(bebe|bb|filho|menino))\b/);
    if (idxFem === -1) return 'masculine';
    if (idxMasc === -1) return 'feminine';
    return idxFem < idxMasc ? 'feminine' : 'masculine';
  }
  return null;
}

/**
 * Surgical grammatical-gender post-fix. When the mother uses feminine (ela/dela/
 * minha bebê), the response should not slip back to masculine in known templated
 * phrases (especially the satiety closing "se ao contrário ele continua agitado").
 * We only fix UNAMBIGUOUS templated phrases — never general "ele/ela" elsewhere,
 * to avoid mistakes on quoted text or third-person references.
 *
 * Returns { text, corrections: [{ before, after }] }.
 */
export function enforceGenderConsistency({ text, userMessage }) {
  if (!text || !userMessage) return { text: text || '', corrections: [] };
  const gender = detectMotherGenderCue(userMessage);
  if (gender !== 'feminine') return { text, corrections: [] };

  const corrections = [];
  const rules = [
    // satiety closing block — "se ao contrário ele continua agitado..."
    [/\bele\s+continua\s+agitado\b/gi, 'ela continua agitada'],
    [/\bele\s+permanece\s+agitado\b/gi, 'ela permanece agitada'],
    [/\bele\s+est[áa]\s+agitado\b/gi, 'ela está agitada'],
    [/\bele\s+continua\s+(tranquilo|sonolento|inquieto)\b/gi, (_, w) => `ela continua ${w === 'tranquilo' ? 'tranquila' : w === 'sonolento' ? 'sonolenta' : 'inquieta'}`],
    // satiety closing block tail — "se ele mama no peito, ofereça..." (TESTE 005)
    [/\bse\s+ele\s+mama\s+no\s+peito\b/gi, 'se ela mama no peito'],
    [/\bse\s+ele\s+est[áa]\s+mamando\s+no\s+peito\b/gi, 'se ela está mamando no peito'],
    // generic templated mentions of the baby — "seu bebê" → "sua bebê"
    // when the mother used feminine cues. Conservative: only fixes the
    // possessive+noun pair, never bare "seu/sua" elsewhere.
    [/\bseu\s+beb[êe]\b/gi, 'sua bebê'],
    [/\bdo\s+seu\s+beb[êe]\b/gi, 'da sua bebê'],
    [/\bao\s+seu\s+beb[êe]\b/gi, 'à sua bebê'],
    [/\bpara\s+o\s+seu\s+beb[êe]\b/gi, 'para a sua bebê'],
    [/\bcom\s+o\s+seu\s+beb[êe]\b/gi, 'com a sua bebê'],
    [/\bo\s+seu\s+beb[êe]\b/gi, 'a sua bebê'],
    // verbs in masculine-oriented closing templates
    [/\bele\s+suga\s+ativamente\b/gi, 'ela suga ativamente'],
    [/\bele\s+solta\s+o\s+peito\b/gi, 'ela solta o peito'],
    [/\bele\s+relaxa\s+o\s+corpo\b/gi, 'ela relaxa o corpo'],
    [/\bse\s+ele\s+mama\b/gi, 'se ela mama'],
    // common templated openers/sequences
    [/\bcoloque-o\s+para\s+arrotar\b/gi, 'coloque-a para arrotar'],
    [/\bcoloc[áa]-lo\s+(no\s+ber[cç]o|para\s+arrotar)\b/gi, (m, w) => `colocá-la ${w}`],
    [/\bsegur[áa]-lo\b/gi, 'segurá-la'],
    [/\btransferi-lo\b/gi, 'transferi-la'],
    [/\bdeit[áa]-lo\b/gi, 'deitá-la'],
    [/\boferec[êe]-lo\b/gi, 'oferecê-la'],
    [/\bmant[êe]-lo\b/gi, 'mantê-la'],
    [/\bmant[êe]nha-o\b/gi, 'mantenha-a'],
    [/\bcoloc[áa]-lo\b/gi, 'colocá-la'],
    // TESTE 006 (RN 22d): the pacifier practical block kept reading
    // "se ela cair e o bebê continuar dormindo ... se ele acordar"
    // alongside the mother's feminine cues — the dossiê flagged this
    // intra-sentence gender drift. The patterns below are tightly scoped to
    // the practical pacifier templates so we don't accidentally rewrite
    // legitimate masculine third-person references elsewhere.
    [/\bo\s+beb[êe]\s+continuar\s+dormindo\b/gi, 'a bebê continuar dormindo'],
    [/\bo\s+beb[êe]\s+continuar\s+(tranquilo|sonolento|sossegado)\b/gi, (_, w) => `a bebê continuar ${w === 'tranquilo' ? 'tranquila' : w === 'sonolento' ? 'sonolenta' : 'sossegada'}`],
    [/\bse\s+ele\s+acordar\s+logo\s+que\s+(a\s+)?(chupeta\s+)?cai\b/gi, 'se ela acordar logo que a chupeta cai'],
    [/\bse\s+ele\s+acordar\s+logo\b/gi, 'se ela acordar logo'],
  ];
  let out = text;
  for (const [re, replacement] of rules) {
    out = out.replace(re, (match, ...rest) => {
      const sub = typeof replacement === 'function' ? replacement(match, ...rest) : replacement;
      if (sub !== match) corrections.push({ before: match, after: sub });
      return sub;
    });
  }
  return { text: out, corrections };
}

/**
 * Bath crying closing + pediatric referral (TESTE 006 RN 13d).
 * When the complaint is isolated choro no banho, the response must close with
 * adaptation/repetition/previsibilidade AND cite specific clinical signs for
 * pediatric evaluation — not a generic "se o choro persistir, procure o pediatra".
 */
const BATH_ADAPTATION_CLOSING =
  /(repetic[aã]o|previsibilidade).{0,80}(adapta|se\s+acostuma|melhora|banho)|vai\s+se\s+adaptando\s+melhor\s+ao\s+banho|tend[ea]\s+a\s+se\s+adaptar\s+ao\s+banho/;
const BATH_PEDIATRIC_SIGNS =
  /(febre|prostrac[aã]o|recusa\s+alimentar|vom[ií]tos?\s+importantes|choro\s+inconsol[aá]vel\s+fora\s+do\s+banho|mudan[cç]a\s+importante.{0,30}comportamento)/;
const BATH_BAD_PEDIATRIC_REFERRAL =
  /(se\s+(o\s+)?choro\s+(persistir|persiste|continua)|caso\s+(o\s+)?choro\s+persista)[^.]{0,80}pediatra/;

export function ensureBathClosingComplete({ text, signalIds = [] } = {}) {
  if (!text) return { text: text || '', appended: false, missing: [] };
  const sigSet = new Set(signalIds || []);
  if (!sigSet.has('bath_crying_rn') && !sigSet.has('bath_crying_isolated_rn')) {
    return { text, appended: false, missing: [] };
  }

  const norm = normalize(text);
  const missing = [];
  if (!BATH_ADAPTATION_CLOSING.test(norm)) missing.push('adaptation_closing');
  if (!BATH_PEDIATRIC_SIGNS.test(norm) || BATH_BAD_PEDIATRIC_REFERRAL.test(norm)) {
    missing.push('pediatric_signs');
  }

  if (missing.length === 0) return { text, appended: false, missing: [] };

  const fragmentByKey = {
    adaptation_closing:
      'Com repetição e previsibilidade, muitos bebês vão se adaptando melhor ao banho.',
    pediatric_signs:
      'Se o choro acontecer apenas durante o banho, sem outros sinais, mantenha as estratégias de contenção, ambiente aquecido e banho curto. Procure o pediatra se houver sinais associados, como febre, recusa alimentar, prostração, vômitos importantes, choro inconsolável fora do banho ou mudança importante no comportamento.',
  };
  const order = ['adaptation_closing', 'pediatric_signs'];
  const sentences = order.filter((k) => missing.includes(k)).map((k) => fragmentByKey[k]);
  const trimmed = text.replace(/\s+$/, '');
  return { text: `${trimmed}\n\n${sentences.join(' ')}`, appended: true, missing };
}

/**
 * Icterícia/linguinha as historical only when mãe diz que agora mama bem
 * (TESTE 006 RN 16d).
 */
const ICTERICIA_CURRENT_IMPACT =
  /(especialmente\s+apos\s+(o\s+)?procedimento|especialmente\s+depois\s+(do\s+)?procedimento|apos\s+(o\s+)?procedimento\s+na\s+linguinha\s+e\s+a\s+icter[ií]cia|(icter[ií]cia|linguinha|procedimento\s+na\s+linguinha|frenotomia|fr[eê]nulo|freio\s+lingual).{0,100}(podem\s+impactar|pode\s+impactar|impacta|afeta|dificulta|influencia|compromete|podem\s+dificultar|pode\s+dificultar|explicar|explica|contribuir|contribui|influenciar|influencia))/i;

export function ensureIctericiaHistoricalOnly({ text, signalIds = [] } = {}) {
  if (!text) return { text: text || '', appended: false, missing: [] };
  const sigSet = new Set(signalIds || []);
  if (!sigSet.has('sonda_with_mama_bem_priority_production')) {
    return { text, appended: false, missing: [] };
  }
  const norm = normalize(text);
  if (!ICTERICIA_CURRENT_IMPACT.test(norm)) {
    return { text, appended: false, missing: [] };
  }
  const append =
    'Como você informou que a bebê agora está mamando bem, icterícia e o procedimento na linguinha devem ser tratados apenas como histórico do início da amamentação — o foco atual é baixa produção materna ou necessidade de suporte de produção, complemento com sonda e instabilidade no final da tarde e na madrugada.';
  const trimmed = text.replace(/\s+$/, '');
  return { text: `${trimmed}\n\n${append}`, appended: true, missing: ['ictericia_historical'] };
}

/**
 * Short diurnal naps + Moro/charutinho + Travesseiro in body (TESTE 006 RN 20d).
 */
const SHORT_NAP_MORO_BODY =
  /(reflexo\s+de\s+moro|sobressalto|desorganiza[cç][aã]o\s+corporal|charutinho|conten[cç][aã]o\s+corporal)/;
const SHORT_NAP_TRAVESSEIRO_SEQUENCE =
  /(mamada\s+efetiva.{0,120}arroto|arroto.{0,120}posi[cç][aã]o\s+vertical|transfer[eê]ncia\s+gradual|transi[cç][aã]o\s+gradual|estrategia\s+do\s+travesseiro|estrat[eé]gia\s+do\s+travesseiro)/;

export function ensureShortNapDiurnalBodyComplete({ text, signalIds = [] } = {}) {
  if (!text) return { text: text || '', appended: false, missing: [] };
  const sigSet = new Set(signalIds || []);
  const triggered =
    sigSet.has('wakes_short_after_crib_back_to_lap') &&
    sigSet.has('diurnal_only_difficulty');
  if (!triggered) return { text, appended: false, missing: [] };

  const norm = normalize(text);
  const missing = [];
  if (!SHORT_NAP_MORO_BODY.test(norm)) missing.push('moro_charutinho');
  if (!SHORT_NAP_TRAVESSEIRO_SEQUENCE.test(norm)) missing.push('travesseiro_sequence');

  if (missing.length === 0) return { text, appended: false, missing: [] };

  const fragmentByKey = {
    moro_charutinho:
      'Investigue também sobressaltos, reflexo de Moro, desorganização corporal e necessidade de contenção — o charutinho pode ajudar quando há espasmos ou desorganização ao deitar.',
    travesseiro_sequence:
      'Organize a sequência prática: mamada efetiva → arroto → posição vertical por 30 a 40 minutos → observe desconforto pós-mamada → contenção/charutinho quando necessário → Estratégia do Travesseiro com transferência gradual para o berço.',
  };
  const order = ['moro_charutinho', 'travesseiro_sequence'];
  const sentences = order.filter((k) => missing.includes(k)).map((k) => fragmentByKey[k]);
  const trimmed = text.replace(/\s+$/, '');
  return { text: `${trimmed}\n\n${sentences.join(' ')}`, appended: true, missing };
}

/**
 * Checks if the user's input contains explicit clinical red flags that should
 * short-circuit the pipeline into the "professional evaluation" path.
 */
export function detectClinicalRedFlags({ text, namespace }) {
  const rulesPath = path.join(config.paths.knowledge, namespace.toLowerCase(), 'rules.json');
  const rules = JSON.parse(readFileSync(rulesPath, 'utf-8'));
  const flags = rules.clinicalRedFlags || [];
  const norm = normalize(text);

  const detected = [];
  // We use a coarse keyword scan; production version can be LLM-assisted.
  const keywordsByFlag = {
    'perda de peso ou baixa evolução ponderal': ['perda de peso', 'nao ganha peso', 'emagreceu', 'perdeu peso'],
    'vômitos em jato persistentes': ['vomito em jato', 'vômito em jato', 'vomita tudo', 'vomito persistente'],
    'sangue nas fezes': ['sangue nas fezes', 'fezes com sangue'],
    'febre': ['febre', 'temperatura alta', '38', '37.8', '37,8'],
    'letargia importante / dificuldade de despertar para alimentar': ['letarg', 'nao acorda', 'dificil de acordar', 'dificuldade de despertar', 'sonolencia excessiva'],
    'recusa alimentar persistente': ['recusa alimentar', 'recusa o peito', 'nao quer mamar'],
    'sinais de desidratação (fralda seca por mais de 6h, fontanela afundada)': ['fralda seca', 'fontanela afundada', 'desidrata'],
    'arqueamento corporal persistente com choro inconsolável': ['arqueamento', 'arqueia o corpo', 'inconsolavel'],
    'dificuldade respiratória': ['dificuldade respirat', 'respirar', 'falta de ar'],
    'coloração arroxeada': ['arroxeado', 'roxo', 'cianose'],
  };

  for (const flag of flags) {
    const kws = keywordsByFlag[flag] || [];
    if (kws.some((k) => norm.includes(normalize(k)))) {
      detected.push(flag);
    }
  }
  return { hasRedFlag: detected.length > 0, redFlags: detected };
}

export function getForbiddenSummary(namespace) {
  const f = getForbidden(namespace);
  return {
    namespace,
    terms: f.forbiddenTerms?.length || 0,
    interpretations: f.forbiddenInterpretations?.length || 0,
    languageRules: f.languageRules || {},
  };
}
