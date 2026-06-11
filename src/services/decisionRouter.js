import { readFileSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config/index.js';
import { filterAnswered } from './signalExtractor.js';

/**
 * Implements the operational decision flow described in the project spec.
 *
 * The 7 possible paths (Caminhos) are:
 *   1. ANSWER_DIRECTLY          — direct, methodologically grounded answer
 *   2. ASK_MORE_CONTEXT         — investigative follow-up question
 *   3. FORWARD_TO_LESSON        — point the mother to the right internal lesson
 *   4. FALLBACK                 — controlled fallback (low confidence, ambiguous)
 *   5. RECOMMEND_PROFESSIONAL   — recommend pediatric / professional evaluation
 *   6. INTERRUPT_UNSAFE         — block a drafted response that violates rules
 *   7. ROUTE_TO_HUMAN_SUPPORT   — escalate to the human support team
 *
 * The router runs BEFORE answer generation to choose a path, and is also
 * consulted AFTER drafting to enforce safety (Caminho 6 can override).
 */

export const PATHS = {
  ANSWER_DIRECTLY: 'answer_directly',
  ASK_MORE_CONTEXT: 'ask_more_context',
  FORWARD_TO_LESSON: 'forward_to_lesson',
  FALLBACK: 'fallback',
  RECOMMEND_PROFESSIONAL: 'recommend_professional',
  INTERRUPT_UNSAFE: 'interrupt_unsafe',
  ROUTE_TO_HUMAN_SUPPORT: 'route_to_human_support',
};

const lessonsCache = new Map();
function getLessons(namespace) {
  const ns = namespace.toLowerCase();
  if (!lessonsCache.has(ns)) {
    const data = JSON.parse(
      readFileSync(path.join(config.paths.knowledge, ns, 'lessons.json'), 'utf-8'),
    );
    lessonsCache.set(ns, data);
  }
  return lessonsCache.get(ns);
}

/**
 * Pre-generation decision. Picks the path BEFORE we draft the answer.
 *
 *  Inputs:
 *    - intent, intentConfidence
 *    - retrieval = { status, confidence, topSimilarity, chunks, ... }
 *    - clinical  = { hasRedFlag, redFlags }
 *    - babyContext = { hasMinimumContext, missingFields }
 *    - namespace
 */
export function decideRoute({
  intent,
  intentConfidence,
  retrieval,
  clinical,
  babyContext,
  namespace,
}) {
  // Caminho 5: clinical red flag short-circuits everything
  if (clinical?.hasRedFlag) {
    return route(PATHS.RECOMMEND_PROFESSIONAL, {
      reason: 'clinical_red_flag',
      redFlags: clinical.redFlags,
    });
  }

  // Caminho 7: explicitly out of scope OR no retrieval at all
  if (intent === 'fora_da_base') {
    return route(PATHS.ROUTE_TO_HUMAN_SUPPORT, { reason: 'intent_out_of_base' });
  }
  if (!retrieval || retrieval.status === 'no_results') {
    return route(PATHS.ROUTE_TO_HUMAN_SUPPORT, { reason: 'no_retrieval_results' });
  }

  // Caminho 4: ambiguous intent or low retrieval confidence
  if (intent === 'ambiguo' || (intentConfidence ?? 0) < 0.35) {
    return route(PATHS.FALLBACK, { reason: 'low_intent_confidence', intentConfidence });
  }
  if (retrieval.confidence < (config.retrieval.answerMinConfidence * 0.6)) {
    return route(PATHS.FALLBACK, { reason: 'very_low_retrieval_confidence', confidence: retrieval.confidence });
  }

  // Caminho 2: missing baby context required for safe answering
  if (babyContext && !babyContext.hasMinimumContext) {
    return route(PATHS.ASK_MORE_CONTEXT, {
      reason: 'missing_baby_context',
      missing: babyContext.missingFields,
    });
  }

  // When the mother already brought enough context, we should give practical
  // orientation, not just keep asking questions (test feedback). This flag
  // unlocks ANSWER_DIRECTLY a bit more aggressively and suppresses ASK paths.
  const richContext = Boolean(babyContext?.hasRichContext);
  const provided = babyContext?.provided || [];

  // Inspect the leading chunk to decide between FORWARD_TO_LESSON vs ASK_MORE_CONTEXT vs ANSWER_DIRECTLY
  const leading = retrieval.chunks?.[0]?.chunk;
  if (leading) {
    // If the chunk demands more context AND we have not gathered any, ask first.
    if (Array.isArray(leading.askIfMissing) && leading.askIfMissing.length >= 3) {
      // Drop anything the mother already answered so we never ask twice.
      const stillMissing = filterAnswered(leading.askIfMissing, provided);
      // Only ask first when the question is short/vague, context is NOT rich,
      // and there is genuinely something left to ask.
      if (babyContext?.questionLooksVague && !richContext && stillMissing.length >= 2) {
        return route(PATHS.ASK_MORE_CONTEXT, {
          reason: 'methodology_requires_more_context',
          missing: stillMissing,
          relatedLessons: leading.relatedLessons || [],
        });
      }
    }

    // If retrieval confidence is moderate and the chunk explicitly points to
    // a lesson as the primary handling, route to that lesson — UNLESS the
    // mother already gave rich context, in which case prefer a practical,
    // grounded answer (lessons are still attached as suggestions).
    if (retrieval.confidence < config.retrieval.answerMinConfidence) {
      if (richContext && retrieval.confidence >= config.retrieval.answerMinConfidence * 0.75) {
        return route(PATHS.ANSWER_DIRECTLY, {
          reason: 'rich_context_practical_orientation',
          confidence: retrieval.confidence,
        });
      }
      const lessons = lessonsForChunks(retrieval.chunks, namespace);
      if (lessons.length > 0) {
        return route(PATHS.FORWARD_TO_LESSON, {
          reason: 'moderate_confidence_lesson_primary',
          lessons,
        });
      }
      return route(PATHS.FALLBACK, {
        reason: 'moderate_confidence_no_lesson',
        confidence: retrieval.confidence,
      });
    }
  }

  // Caminho 1: green path
  return route(PATHS.ANSWER_DIRECTLY, {
    reason: 'sufficient_confidence',
    confidence: retrieval.confidence,
  });
}

/**
 * Post-draft safety hook (Caminho 6).
 * If the drafted answer triggers forbidden content, force INTERRUPT_UNSAFE.
 */
export function postGenerationGuard({ draft, safetyCheck }) {
  if (!safetyCheck?.safe) {
    return route(PATHS.INTERRUPT_UNSAFE, {
      reason: 'forbidden_content_detected',
      violations: safetyCheck.violations,
      draftPreview: draft?.text?.slice(0, 240) || '',
    });
  }
  return null;
}

function route(path, details = {}) {
  return { path, details };
}

function lessonsForChunks(chunks, namespace) {
  const lessonsData = getLessons(namespace);
  const ids = new Set();
  for (const c of chunks.slice(0, 3)) {
    for (const lid of c.chunk.relatedLessons || []) ids.add(lid);
  }
  return lessonsData.lessons
    .filter((l) => ids.has(l.id))
    .map((l) => ({ id: l.id, title: l.title, appPath: l.appPath, track: l.track }));
}

/**
 * Heuristic: is the question vague enough that we should probably ask first?
 */
export function questionLooksVague(text) {
  const t = String(text || '').trim();
  if (t.length <= 60) return true;
  // very few question marks AND no numbers/details usually indicates a generic prompt
  return false;
}

export function getLessonsByIds(namespace, ids) {
  const data = getLessons(namespace);
  return data.lessons.filter((l) => ids.includes(l.id));
}

export function supportChannels(namespace) {
  return getLessons(namespace).supportChannels || {};
}
