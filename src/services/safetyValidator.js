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
