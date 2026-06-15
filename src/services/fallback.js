import { PATHS, supportChannels, getLessonsByIds } from './decisionRouter.js';

/**
 * Generates the natural-language messages for non-direct paths.
 * The text is intentionally controlled (templated) to guarantee consistency
 * and to never depend on the LLM to "improvise" a fallback.
 */
export function renderRoute({ route, namespace, retrieval, motherName }) {
  const greet = motherName ? `${motherName}` : 'Mãe';
  const channels = supportChannels(namespace);

  switch (route.path) {
    case PATHS.ASK_MORE_CONTEXT: {
      const missing = route.details.missing?.slice(0, 5) || [];
      const lines = [
        `${greet}, antes de te orientar com segurança, preciso entender melhor alguns detalhes:`,
        ...missing.map((m) => `• ${m}`),
        '',
        'Assim que você me responder esses pontos, consigo te orientar com mais precisão dentro do método.',
      ];
      return {
        text: lines.join('\n'),
        meta: { kind: 'ask_more_context', missing },
      };
    }

    case PATHS.FORWARD_TO_LESSON: {
      const lessons = route.details.lessons || [];
      const lines = [
        `${greet}, esse tema é trabalhado de forma detalhada dentro do método. O conteúdo mais próximo do seu caso é:`,
        ...lessons.map((l) => `• ${l.title}`),
        '',
        'Esses materiais conduzem você passo a passo. Quando assistir, pode voltar aqui que continuo com você.',
      ];
      return {
        text: lines.join('\n'),
        meta: { kind: 'forward_to_lesson', lessons },
      };
    }

    case PATHS.FALLBACK: {
      const lines = [
        `${greet}, não encontrei orientação suficiente dentro do método para te responder com segurança agora.`,
        'Posso seguir de duas formas:',
        '• Me contar um pouco mais de contexto (idade exata, padrão de sono, alimentação, episódios recentes), ou',
        '• Te encaminhar para o conteúdo mais próximo disponível e, se preferir, para o suporte humano da equipe.',
      ];
      return {
        text: lines.join('\n'),
        meta: { kind: 'fallback', reason: route.details.reason || null },
      };
    }

    case PATHS.RECOMMEND_PROFESSIONAL: {
      const flags = route.details.redFlags || [];
      const lines = [
        `${greet}, pelos sinais que você descreveu, preciso te orientar para uma avaliação com o pediatra da família o quanto antes.`,
      ];
      if (flags.length) {
        lines.push('Os pontos que indicam essa avaliação são:');
        for (const f of flags) lines.push(`• ${f}`);
      }
      lines.push('', 'A Zlaya não emite diagnóstico. Pelo método, situações com esses sinais devem ser avaliadas clinicamente antes de qualquer conduta comportamental.');
      if (channels.familyPediatrician) {
        lines.push(`Recomendado: ${channels.familyPediatrician.label}.`);
      }
      return {
        text: lines.join('\n'),
        meta: { kind: 'recommend_professional', redFlags: flags, channel: channels.familyPediatrician || null },
      };
    }

    case PATHS.INTERRUPT_UNSAFE: {
      // Render a templated answer from the authorized chunks when the
      // violation is a wording problem (forbidden term / RN behavioral
      // framing / pacifier guidance). The mother still gets practical,
      // methodologically-grounded content instead of a generic "preciso
      // reformular" message — and by construction this text comes from the
      // chunks, so it can't carry the prohibited wording.
      const violations = route.details.violations || [];
      const onlyWordingViolations = violations.length > 0 && violations.every((v) =>
        ['forbidden_term', 'rn_behavioral_framing', 'unsafe_pacifier_guidance', 'language_diminutive', 'age_mismatch'].includes(v.kind),
      );
      if (onlyWordingViolations && retrieval?.chunks?.length) {
        const leading = retrieval.chunks[0].chunk;
        const supporting = retrieval.chunks.slice(1, 3).map((c) => c.chunk);
        const lines = [
          `${greet}, deixa eu te orientar de forma direta, dentro do método:`,
          '',
          leading.text,
        ];
        if (supporting.length) {
          lines.push('', 'Outros pontos relevantes:');
          for (const s of supporting) {
            lines.push(`• ${String(s.text || '').replace(/\s+/g, ' ').slice(0, 240)}`);
          }
        }
        return {
          text: lines.join('\n'),
          meta: {
            kind: 'interrupt_unsafe',
            recoveredFromChunks: true,
            violations,
          },
        };
      }
      const lines = [
        `${greet}, preciso reformular essa orientação. A resposta que eu estava construindo não atendia totalmente os critérios do método para a faixa etária ativa.`,
        'Posso te conduzir por outro caminho seguro: você pode me contar um pouco mais de contexto ou prefere que eu te encaminhe para o conteúdo correspondente no app?',
      ];
      return {
        text: lines.join('\n'),
        meta: {
          kind: 'interrupt_unsafe',
          violations,
        },
      };
    }

    case PATHS.ROUTE_TO_HUMAN_SUPPORT: {
      const lines = [
        `${greet}, esse cenário ultrapassa o que consigo conduzir com segurança dentro da base validada agora.`,
        'O melhor caminho é encaminhar para o suporte humano da equipe Eliana Dias para uma análise individual.',
      ];
      if (channels.humanSupport) {
        lines.push(`Acesso: ${channels.humanSupport.label}.`);
      }
      return {
        text: lines.join('\n'),
        meta: { kind: 'route_to_human_support', channel: channels.humanSupport || null },
      };
    }

    default:
      return null;
  }
}

export function suggestedLessonsFromRetrieval(retrieval, namespace) {
  const ids = new Set();
  for (const c of retrieval?.chunks?.slice(0, 3) || []) {
    for (const lid of c.chunk.relatedLessons || []) ids.add(lid);
  }
  return getLessonsByIds(namespace, [...ids]);
}
