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
 * Checks a piece of text (typically a drafted answer) against the forbidden
 * vocabulary configured for the namespace.
 *
 * Returns { safe, violations: [{ term, kind }] }
 */
export function checkForbiddenContent({ text, namespace }) {
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

  return { safe: violations.length === 0, violations };
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
