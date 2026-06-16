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
export const SATIETY_SIGNS_OFFICIAL_TEXT =
  'Sinais de saciedade no RN: o bebê solta o peito espontaneamente, relaxa o corpo, abre as mãozinhas, reduz o ritmo da sucção, fica tranquilo após a mamada e permanece mais confortável depois de arrotar e de ficar em posição vertical. Se ao contrário ele continua agitado, mantém as mãozinhas cerradas e busca o peito novamente em pouco tempo, a mamada provavelmente não foi suficiente — ofereça o peito de novo em livre demanda e reavalie a produção/transferência no período.';

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

  if (signsHit >= 3 && operationalHit) return { text, expanded: false };

  if (signsHit >= 3 && !operationalHit) {
    // Block A is there; we only need to append block B (operational tail).
    const trimmed = text.replace(/\s+$/, '');
    const out = `${trimmed}\n\nSe ao contrário ele continua agitado, mantém as mãozinhas cerradas e busca o peito novamente em pouco tempo, a mamada provavelmente não foi suficiente — ofereça o peito de novo em livre demanda e reavalie a produção/transferência no período.`;
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
export function ensureDirectNormalityAnswer({ text, userMessage }) {
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
  const directOpener =
    'Sim — esse padrão pode ocorrer no RN nessa fase, e o método trata como uma questão alimentar (transferência/produção de leite no fim do dia/noite), não como associação negativa.';
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
export function ensureNegativeAssociationReassurance({ text, userMessage }) {
  if (!text || !userMessage) return { text: text || '', appended: false };
  const normUser = normalize(userMessage);
  const triggered = NEG_ASSOC_TRIGGERS_USER.some((re) => re.test(normUser));
  if (!triggered) return { text, appended: false };

  const normText = normalize(text);
  const hasReassurance = NEG_ASSOC_REASSURE_TOKENS.some((re) => re.test(normText));
  if (hasReassurance) return { text, appended: false };

  const trimmed = text.replace(/\s+$/, '');
  const append =
    'Sobre o seu receio de associação negativa: o que você descreve — bebê que só se acalma mamando, dorme no peito ou no colo, dificuldade de permanência no berço — NÃO configura associação negativa de sono no RN. Nessa faixa etária isso é fisiológico e esperado, e a leitura metodológica correta é alimentar (transferência e produção de leite no fim do dia/noite), não comportamental.';
  return { text: `${trimmed}\n\n${append}`, appended: true };
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
