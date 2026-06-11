import { readFileSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config/index.js';

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf-8'));
}

/**
 * Builds the restrictive system prompt for a given namespace (age band).
 * Loads the namespace-specific rules + forbidden vocabulary so the LLM has
 * the exact methodological boundaries injected at every turn.
 */
export function buildSystemPrompt({ namespace, band }) {
  const ns = namespace.toLowerCase();
  const rules = readJson(path.join(config.paths.knowledge, ns, 'rules.json'));
  const forbidden = readJson(path.join(config.paths.knowledge, ns, 'forbidden.json'));

  const fixedRules = rules.fixedRules.map((r) => `- ${r.rule}`).join('\n');
  const forbiddenTerms = forbidden.forbiddenTerms.map((t) => `- "${t}"`).join('\n');
  const forbiddenInterps = forbidden.forbiddenInterpretations.map((t) => `- ${t}`).join('\n');
  const langForbidden = forbidden.languageRules.forbidden.map((t) => `- ${t}`).join('\n');
  const langRequired = forbidden.languageRules.required.map((t) => `- ${t}`).join('\n');

  return `Você é a Zlaya, mentora inteligente do Método Eliana Dias dentro do aplicativo Zleep Baby.

# IDENTIDADE
- Você NÃO é um chatbot genérico. Você é uma IA conversacional especializada e proprietária do Método Eliana Dias.
- Você opera EXCLUSIVAMENTE dentro do Método Eliana Dias. Você não usa fontes externas, conhecimento generalista de parentalidade ou opiniões pessoais.
- Você atua como orientadora e direcionadora dentro do método. Você NÃO substitui aulas, profissionais de saúde ou avaliação pediátrica.

# FAIXA ETÁRIA ATIVA (NAMESPACE)
- Faixa ativa: ${band?.label || namespace}
- Você só pode aplicar regras, condutas e interpretações desta faixa etária.
- É PROIBIDO trazer interpretações ou condutas de outras faixas etárias.

# REGRAS FIXAS DO MÉTODO PARA ESTA FAIXA
${fixedRules}

# TERMOS PROIBIDOS (NUNCA USE)
${forbiddenTerms}

# INTERPRETAÇÕES PROIBIDAS (NUNCA APLIQUE)
${forbiddenInterps}

# LINGUAGEM PROIBIDA
${langForbidden}

# LINGUAGEM OBRIGATÓRIA
${langRequired}

# GROUNDING
- Responda APENAS com base nos chunks autorizados fornecidos no contexto (CONTEXTO AUTORIZADO).
- NUNCA complete com conhecimento externo.
- Se os chunks não forem suficientes, NÃO invente: peça mais contexto OU acione fallback OU direcione para uma aula.
- Você pode citar nomes de aulas e indicar caminhos no app quando estiverem nos chunks recuperados.

# ESTRUTURA DA RESPOSTA (siga nesta ordem)
1. ACOLHIMENTO + VALIDAÇÃO: reconheça o que é fisiológico e esperado para a idade (1 a 2 linhas).
2. ORIENTAÇÃO PRÁTICA SEGURA: dê um próximo passo concreto e seguro do método, baseado nos chunks. Esta é a parte mais importante — a mãe precisa de direção, não só de perguntas.
3. INVESTIGAÇÃO COMPLEMENTAR (segunda camada): só então faça as perguntas que ainda faltam para refinar. Faça poucas e específicas.
4. ENCAMINHAMENTO: indique a aula mais específica do caso quando houver nos chunks.

# REGRAS DE RESPOSTA (CRÍTICAS)
- NÃO responda apenas com perguntas. Quando a mãe já trouxe dados suficientes (ver "CONTEXTO JÁ FORNECIDO"), avance com orientação prática ANTES de investigar.
- NUNCA pergunte algo que a mãe já respondeu. Verifique "CONTEXTO JÁ FORNECIDO" e o histórico antes de perguntar.
- NUNCA sugira como novidade uma técnica que a mãe já disse usar (ver "JÁ EM USO PELA MÃE"). Se ela já usa, reforce/ajuste o uso, não apresente como nova.
- Dê peso aos "SINAIS RELEVANTES DETECTADOS": eles indicam a hipótese prioritária do caso. Trate-os, não os ignore.
- Não trate um caso com padrão específico (ex.: piora após as 18h) como dificuldade genérica de sono.

# ESTILO
- Linguagem respeitosa, madura, acolhedora, objetiva e segura.
- Sem diminutivos para se dirigir à mãe. Use "mãe" ou o nome informado.
- Resposta curta a média (em geral 4 a 10 linhas), organizada e clara.
- Não dramatize. Não use emojis. Não use exclamações excessivas.

# AUTOCONSCIÊNCIA DE LIMITES
- Você tem total liberdade para reconhecer que não pode responder com segurança.
- Reconhecer limites de forma natural é parte da sua função, não uma falha.
- Diante de sinais de alerta clínico, oriente avaliação pediátrica imediata.`;
}

/**
 * Builds the user-turn prompt: the actual question, intent, profile, history,
 * and the retrieved authorized chunks the model must ground its answer in.
 */
export function buildUserPrompt({ question, intent, chunks, babyProfile, conversation, signals }) {
  const profileBlock = babyProfile
    ? [
        `# PERFIL DO BEBÊ`,
        `- Nome do bebê: ${babyProfile.babyName || '—'}`,
        `- Nome da mãe: ${babyProfile.motherName || '—'}`,
        `- Idade: ${babyProfile.ageDays ?? '—'} dias`,
        '',
      ].join('\n')
    : '';

  const signalsBlock = signals?.signals?.length
    ? [
        '# SINAIS RELEVANTES DETECTADOS (hipótese prioritária — trate-os)',
        ...signals.signals.map((s) => `- ${s.label}`),
        ...(signals.priorities?.length ? ['', 'Prioridades metodológicas para estes sinais:'] : []),
        ...(signals.priorities || []).map((p) => `- ${p}`),
        '',
      ].join('\n')
    : '';

  const providedBlock = signals?.provided?.length
    ? [
        '# CONTEXTO JÁ FORNECIDO PELA MÃE (NÃO pergunte de novo)',
        ...signals.provided.map((p) => `- ${p.label}`),
        '',
      ].join('\n')
    : '';

  const usingBlock = signals?.alreadyUsing?.length
    ? [
        '# JÁ EM USO PELA MÃE (NÃO sugira como novidade)',
        ...signals.alreadyUsing.map((u) => `- ${u}`),
        '',
      ].join('\n')
    : '';

  const historyBlock = conversation?.length
    ? [
        '# HISTÓRICO RECENTE',
        ...conversation.slice(-6).map((m) => `- ${m.role}: ${m.content}`),
        '',
      ].join('\n')
    : '';

  const ctxBlock =
    chunks && chunks.length
      ? [
          '# CONTEXTO AUTORIZADO',
          ...chunks.map((c, i) => formatChunk(c, i + 1)),
          '',
        ].join('\n')
      : '# CONTEXTO AUTORIZADO\n(vazio — se não houver contexto suficiente, peça mais informações ou acione fallback)';

  return [
    profileBlock,
    `# INTENÇÃO CLASSIFICADA\n- ${intent || 'indefinida'}\n`,
    signalsBlock,
    providedBlock,
    usingBlock,
    historyBlock,
    ctxBlock,
    `# PERGUNTA DA MÃE\n${question}`,
    '',
    '# SUA TAREFA',
    'Responda em português, exclusivamente com base nos chunks autorizados acima e nas regras do Método Eliana Dias para a faixa etária ativa. Siga a ESTRUTURA DA RESPOSTA: acolhimento, orientação prática segura, investigação complementar (apenas do que ainda falta — nunca do que já está em "CONTEXTO JÁ FORNECIDO") e encaminhamento para a aula mais específica. Priorize os "SINAIS RELEVANTES DETECTADOS". Não responda só com perguntas quando o contexto já for suficiente. Se houver sinais de alerta clínico, oriente avaliação pediátrica.',
  ].filter(Boolean).join('\n');
}

function formatChunk(c, idx) {
  const ch = c.chunk;
  const lines = [
    `[Chunk ${idx}] id=${ch.id} | tema=${ch.theme} | safety=${ch.safetyLevel}`,
    `intent=${Array.isArray(ch.intent) ? ch.intent.join(',') : ch.intent}`,
    `allowedAction: ${ch.allowedAction || '—'}`,
    `blockedAction: ${ch.blockedAction || '—'}`,
  ];
  if (ch.relatedLessons?.length) lines.push(`relatedLessons: ${ch.relatedLessons.join(', ')}`);
  if (ch.askIfMissing?.length) lines.push(`askIfMissing: ${ch.askIfMissing.join('; ')}`);
  lines.push(`text: ${ch.text}`);
  return lines.join('\n');
}
