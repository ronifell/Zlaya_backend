import { v4 as uuid } from 'uuid';
import { config } from '../config/index.js';
import { resolveAge, isNamespaceActive } from './ageService.js';
import { classifyIntent, applyRnIntentOverrides } from './intentClassifier.js';
import { extractSignals } from './signalExtractor.js';
import { retrieve } from './retrieval.js';
import {
  checkForbiddenContent,
  correctAgeMentions,
  detectClinicalRedFlags,
} from './safetyValidator.js';
import {
  decideRoute,
  postGenerationGuard,
  questionLooksVague,
  PATHS,
} from './decisionRouter.js';
import { generateAnswer } from './responseGenerator.js';
import { renderRoute, suggestedLessonsFromRetrieval } from './fallback.js';
import { recordTurn } from './auditLogger.js';

/**
 * Full Zlaya turn pipeline.
 *
 *   Etapa 1 — Enquadramento por idade  (ageService)
 *   Etapa 2 — Classificação de intenção (intentClassifier)
 *   Etapa 2b — Detecção de red flags clínicos (safetyValidator)
 *   Etapa 3 — Avaliação de contexto
 *   Etapa 4 — Recuperação controlada (retrieval, namespace-scoped)
 *   Etapa 5 — Decisão operacional      (decisionRouter, Caminhos 1-7)
 *   Etapa 6 — Geração ou template controlado
 *   Etapa 7 — Guard pós-geração + auditoria
 */
export async function processTurn({ message, babyProfile, conversation, conversationId }) {
  const startedAt = Date.now();
  const turnId = uuid();

  // 1) Age band ---------------------------------------------------------
  const age = resolveAge(babyProfile);
  if (!age.band) {
    return finalize({
      turnId,
      conversationId,
      question: message,
      babyProfile,
      age,
      response: {
        text:
          'Para te orientar com segurança, preciso ter a idade do bebê registrada no seu perfil. Pode confirmar a data de nascimento ou a idade em dias?',
        kind: 'missing_profile',
      },
      route: { path: PATHS.ASK_MORE_CONTEXT, details: { reason: 'missing_age' } },
      startedAt,
    });
  }
  if (!isNamespaceActive(age.band.id)) {
    return finalize({
      turnId,
      conversationId,
      question: message,
      babyProfile,
      age,
      response: {
        text:
          `O piloto atual da Zlaya está limitado à faixa ${config.activeNamespaces.join(', ')}. ` +
          `A faixa do seu bebê (${age.band.label}) ainda não está habilitada nesta fase. ` +
          'Vou te encaminhar para o suporte humano para que a equipe possa te orientar.',
        kind: 'namespace_not_active',
      },
      route: { path: PATHS.ROUTE_TO_HUMAN_SUPPORT, details: { reason: 'namespace_not_active', band: age.band.id } },
      startedAt,
    });
  }

  const namespace = age.band.id;

  // 2) Intent classification ------------------------------------------
  let intent = await classifyIntent(message);
  // 2a) RN-specific intent overrides (e.g. block ASSOCIACAO_COMPORTAMENTAL
  //     for RN + chupeta/colo/peito — test feedback explicitly prohibits it
  //     in this age band and asks for reclassification to berço/manutenção
  //     de sono/mamadas instead).
  const intentOverride = applyRnIntentOverrides({
    intent,
    message,
    ageDays: age?.days ?? null,
  });
  intent = intentOverride.intent;

  // 2b) Clinical red flags --------------------------------------------
  const clinical = detectClinicalRedFlags({ text: message, namespace });

  // 2c) Contextual signals (vespertine pattern, breast-soothing, crib
  //     transition, already-provided info, already-used techniques) -----
  const signals = extractSignals({ message, conversation });

  // 3) Context evaluation ---------------------------------------------
  const babyContext = {
    hasMinimumContext: Boolean(babyProfile?.ageDays || babyProfile?.birthDate),
    missingFields: [],
    questionLooksVague: questionLooksVague(message),
    hasRichContext: signals.hasRichContext,
    provided: signals.provided,
  };

  // 4) Controlled retrieval (signal themes boost matching chunks) ------
  const retrieval = await retrieve({
    query: message,
    namespace,
    intent: intent.intent,
    boostThemes: signals.boostThemes,
  });

  // 5) Operational decision -------------------------------------------
  const route = decideRoute({
    intent: intent.intent,
    intentConfidence: intent.confidence,
    retrieval,
    clinical,
    babyContext,
    namespace,
  });

  // 6) Generation OR templated path
  let draft = null;
  let safety = { safe: true, violations: [] };

  if (route.path === PATHS.ANSWER_DIRECTLY) {
    draft = await generateAnswer({
      question: message,
      namespace,
      band: age.band,
      intent: intent.intent,
      chunks: retrieval.chunks,
      babyProfile,
      conversation,
      signals,
    });

    // Age auto-correction (PRESERVAÇÃO DE DADO OBJETIVO).
    // Test feedback explicitly requires that "mãe diz 16 dias e Zlaya
    // responde 14 dias" be treated as a serious error. We do not let it
    // reach the mother: any divergent "<N> dias" / "X semanas" mention
    // inside the RN window is surgically rewritten to the profile age
    // before the safety check runs. The check below remains as a net.
    const ageFix = correctAgeMentions({ text: draft.text, ageDays: age?.days ?? null });
    if (ageFix.corrections.length > 0) {
      draft.text = ageFix.text;
      draft.ageCorrections = ageFix.corrections;
    }

    safety = checkForbiddenContent({
      text: draft.text,
      namespace,
      ageDays: age?.days ?? null,
    });

    // 7a) Post-generation safety guard (Caminho 6)
    const guardOverride = postGenerationGuard({ draft, safetyCheck: safety });
    if (guardOverride) {
      const rendered = renderRoute({
        route: guardOverride,
        namespace,
        retrieval,
        motherName: babyProfile?.motherName,
      });
      return finalize({
        turnId,
        conversationId,
        question: message,
        babyProfile,
        age,
        intent,
        retrieval,
        route: guardOverride,
        safety,
        clinical,
        response: { text: rendered.text, kind: rendered.meta.kind, meta: rendered.meta, draftBlocked: draft.text },
        responseSource: 'guard-override',
        startedAt,
        fallbackUsed: true,
      });
    }

    const suggestedLessons = suggestedLessonsFromRetrieval(retrieval, namespace);
    return finalize({
      turnId,
      conversationId,
      question: message,
      babyProfile,
      age,
      intent,
      retrieval,
      route,
      safety,
      clinical,
      response: {
        text: draft.text,
        kind: 'answer',
        suggestedLessons,
      },
      responseSource: draft.source,
      startedAt,
    });
  }

  // Non-direct paths use the deterministic templated renderer (Caminhos 2-7)
  const rendered = renderRoute({
    route,
    namespace,
    retrieval,
    motherName: babyProfile?.motherName,
  });

  return finalize({
    turnId,
    conversationId,
    question: message,
    babyProfile,
    age,
    intent,
    retrieval,
    route,
    safety,
    clinical,
    response: { text: rendered.text, kind: rendered.meta.kind, meta: rendered.meta },
    responseSource: 'template',
    startedAt,
    fallbackUsed: route.path === PATHS.FALLBACK,
  });
}

async function finalize({
  turnId,
  conversationId,
  question,
  babyProfile,
  age,
  intent,
  retrieval,
  route,
  safety,
  clinical,
  response,
  responseSource,
  startedAt,
  fallbackUsed,
}) {
  const durationMs = Date.now() - startedAt;
  const audit = await recordTurn({
    id: turnId,
    conversationId: conversationId || null,
    namespace: age?.band?.id || null,
    ageDays: age?.days ?? null,
    intent,
    retrieval,
    route,
    safety,
    clinical,
    fallbackUsed: !!fallbackUsed,
    responseSource,
    durationMs,
    question,
    response: response?.text || null,
  });

  return {
    turnId,
    conversationId: conversationId || null,
    babyProfile: babyProfile || null,
    ageDays: age?.days ?? null,
    ageBand: age?.band || null,
    intent: intent || null,
    retrieval: retrieval
      ? {
          status: retrieval.status,
          confidence: retrieval.confidence,
          topSimilarity: retrieval.topSimilarity,
          chunks: (retrieval.chunks || []).map((c) => ({
            id: c.id,
            similarity: c.similarity,
            rerankScore: c.rerankScore,
            intentMatch: c.intentMatch,
            theme: c.chunk?.theme,
            safetyLevel: c.chunk?.safetyLevel,
            relatedLessons: c.chunk?.relatedLessons || [],
          })),
        }
      : null,
    route: route?.path || null,
    routeDetails: route?.details || null,
    safety,
    clinical,
    response,
    durationMs,
    audit,
  };
}
