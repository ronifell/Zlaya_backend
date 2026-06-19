import { v4 as uuid } from 'uuid';
import { config } from '../config/index.js';
import { resolveAge, isNamespaceActive } from './ageService.js';
import { classifyIntent, applyRnIntentOverrides } from './intentClassifier.js';
import { extractSignals } from './signalExtractor.js';
import { retrieve } from './retrieval.js';
import {
  checkForbiddenContent,
  correctAgeMentions,
  ensureSatietySignsExplained,
  ensureDirectNormalityAnswer,
  ensureNegativeAssociationReassurance,
  ensurePacifierPracticalComplete,
  ensureRefluxRoutingComplete,
  ensureSondaOrdenhaComplete,
  ensureTravesseiroEixosComplete,
  ensureCharutinhoNightOnlyComplete,
  softenMamadaInsufficientClaim,
  enforceGenderConsistency,
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
  const signals = extractSignals({
    message,
    conversation,
    ageBand: namespace,
    ageDays: age?.days ?? null,
  });

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

    // Saciedade auto-explanation (CLAREZA OBRIGATÓRIA).
    // Test feedback 16d: pedir "observe sinais de saciedade" sem listar
    // é incompleto. Test feedback 001 (RN 9d): listar os 6 sinais sem
    // ensinar o que fazer quando NÃO aparecem também é incompleto.
    // Em padrão vespertino o framework de 6 pontos exige a lista, então
    // forçamos o gatilho para garantir que o ponto 2 do framework esteja
    // visível mesmo se a LLM não usou a expressão "sinais de saciedade".
    const eveningTriggered = (signals?.signals || []).some(
      (s) => s.id === 'evening_pattern' || s.id === 'night_production_drop',
    );
    const satietyFix = ensureSatietySignsExplained({
      text: draft.text,
      forceTrigger: eveningTriggered,
    });
    if (satietyFix.expanded) {
      draft.text = satietyFix.text;
      draft.satietyAutoExpanded = satietyFix.expanded; // 'list' | 'operational'
    }

    // Direct normality answer (CLAREZA OBRIGATÓRIA — teste 001).
    // Quando a mãe pergunta explicitamente "isso é normal pra idade?"
    // a primeira frase precisa responder direto. Se a LLM abriu com
    // "É compreensível…" (acolhimento antes da resposta), prependemos
    // uma afirmação metodológica direta.
    // Period-awareness: when the complaint is about DAYTIME naps and the
    // night is preserved (diurnal_only_difficulty fired and no nocturnal/
    // vespertine signal did), the normality opener must NOT bind the
    // hypothesis to "fim do dia/noite" (TESTE 003 RN 20d).
    const sigIds = new Set((signals?.signals || []).map((s) => s.id));
    const diurnalOnly =
      sigIds.has('diurnal_only_difficulty') &&
      !['evening_pattern', 'night_production_drop', 'rn_night_waking', 'wake_after_early_sleep_rn', 'night_hunger_signs_rn', 'prolonged_awake_after_feed'].some((id) => sigIds.has(id));

    const normalityFix = ensureDirectNormalityAnswer({
      text: draft.text,
      userMessage: message,
      diurnalOnly,
    });
    if (normalityFix.prepended) {
      draft.text = normalityFix.text;
      draft.directNormalityPrepended = true;
    }

    // Tranquilização sobre associação negativa (ponto 6 do framework).
    // Test feedback 001 (RN 9d): a mãe explicitou "tenho medo dessa
    // associação negativa". Se a resposta não a tranquilizar, anexamos
    // uma tranquilização metodológica.
    const negAssocFix = ensureNegativeAssociationReassurance({
      text: draft.text,
      userMessage: message,
      ageDays: age?.days ?? null,
    });
    if (negAssocFix.appended) {
      draft.text = negAssocFix.text;
      draft.negativeAssociationReassuranceAppended = true;
    }

    // Reflux-routing completeness (TESTE 004 RN 20d).
    // Quando o caso dispara o sinal `wakes_short_after_crib_back_to_lap`
    // (bebê é colocado no berço, permanece poucos minutos, acorda chorando
    // e melhora no colo) ou a resposta já cita refluxo/desconforto, o
    // método exige presença explícita de quatro itens no corpo do texto:
    //   (a) posição vertical 30 a 40 min;
    //   (b) elevação do colchão em 45°;
    //   (c) condução para o material do Pediatra Roberto Franklin (Aulas
    //       Extras/Bônus) — a própria suspeita de refluxo patológico já
    //       indica esse encaminhamento;
    //   (d) encaminhamento ao suporte humano (idem).
    // Também exige diferenciação literal entre "refluxo fisiológico" e
    // "refluxo patológico". Se algum item ficar de fora, o enricher anexa
    // um parágrafo metodológico SOMENTE com os itens faltantes.
    const refluxFix = ensureRefluxRoutingComplete({
      text: draft.text,
      signalIds: (signals?.signals || []).map((s) => s.id),
    });
    if (refluxFix.appended) {
      draft.text = refluxFix.text;
      draft.refluxRoutingMissing = refluxFix.missing;
    }

    // Sonda + ordenha completeness (TESTE 004 RN 16d).
    // Quando a mãe relata uso de complemento com sonda, o método exige a
    // expressão literal "complemento com sonda" e a palavra "ordenha(s)"
    // explícitas no corpo do texto. Se faltar, anexamos o(s) item(ns)
    // faltante(s) sem alterar o restante.
    const sondaFix = ensureSondaOrdenhaComplete({
      text: draft.text,
      userMessage: message,
      signalIds: (signals?.signals || []).map((s) => s.id),
    });
    if (sondaFix.appended) {
      draft.text = sondaFix.text;
      draft.sondaOrdenhaMissing = sondaFix.missing;
    }

    // Pacifier (chupeta cai) practical management (TESTE 002 RN 22d).
    // Quando dispara `pacifier_in_rn` E a mãe relata o padrão "chupeta cai/
    // recoloco/acorda quando cai", o método exige no corpo do texto: (a)
    // leitura como reflexo de sucção / necessidade de regulação e (b)
    // manejo prático ("se cair e continuar dormindo, não precisa recolocar;
    // se acordar, diferencie fome/desconforto/sucção/transição"). Se algum
    // ficar faltando, o enricher anexa SOMENTE o(s) item(ns) faltante(s).
    const pacifierFix = ensurePacifierPracticalComplete({
      text: draft.text,
      userMessage: message,
      signalIds: (signals?.signals || []).map((s) => s.id),
    });
    if (pacifierFix.appended) {
      draft.text = pacifierFix.text;
      draft.pacifierPracticalMissing = pacifierFix.missing;
    }

    // Travesseiro eixos completeness (TESTE 004 RN 19d).
    // Quando dispara `travesseiro_tried_without_success` (mãe tentou a
    // Estratégia do Travesseiro sem sucesso), o método exige no corpo do
    // texto: posição vertical 30 a 40 min, eixo de desconforto gástrico
    // (arroto / refluxo / desconforto / ar preso) e reasseguramento
    // explícito anti-associação com a idade do bebê. Se algum eixo ficar
    // de fora, o enricher anexa SOMENTE o(s) faltante(s).
    const travesseiroFix = ensureTravesseiroEixosComplete({
      text: draft.text,
      signalIds: (signals?.signals || []).map((s) => s.id),
      ageDays: age?.days ?? null,
    });
    if (travesseiroFix.appended) {
      draft.text = travesseiroFix.text;
      draft.travesseiroEixosMissing = travesseiroFix.missing;
    }

    // Charutinho noite + sonecas diurnas difíceis (TESTE 004 RN 23d).
    // Quando dispara `charutinho_night_only_rn`, o método exige (a) orientar
    // charutinho TAMBÉM DURANTE O DIA, (b) investigar mamada efetiva
    // concretamente (não confiar em "mama bem"), (c) busca precoce pelo
    // peito e (d) reposicionar o colo como recurso de organização em RN
    // (sem framing comportamental).
    const charutinhoFix = ensureCharutinhoNightOnlyComplete({
      text: draft.text,
      userMessage: message,
      signalIds: (signals?.signals || []).map((s) => s.id),
    });
    if (charutinhoFix.appended) {
      draft.text = charutinhoFix.text;
      draft.charutinhoNightOnlyMissing = charutinhoFix.missing;
    }

    // Soften any residual hard claim "a mamada provavelmente não foi
    // suficiente" into the cautious form (TESTE 004 RN 22d). The canonical
    // satiety closing is already cautious; this is defense-in-depth for any
    // independent emission by the LLM.
    const softenFix = softenMamadaInsufficientClaim({ text: draft.text });
    if (softenFix.rewritten) {
      draft.text = softenFix.text;
      draft.mamadaClaimSoftened = true;
    }

    // Gender post-fix: when the mother uses feminine cues (minha bebê / ela /
    // dela), surgically rewrite known templated phrases that may have leaked
    // in masculine form (e.g. "ele continua agitado" from the satiety closing
    // block). Conservative: only fixes unambiguous templated patterns.
    const genderFix = enforceGenderConsistency({
      text: draft.text,
      userMessage: message,
    });
    if (genderFix.corrections.length) {
      draft.text = genderFix.text;
      draft.genderCorrections = genderFix.corrections;
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
