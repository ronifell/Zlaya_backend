import { config, useOpenAI } from '../config/index.js';
import { getOpenAI } from './openaiClient.js';
import { buildSystemPrompt, buildUserPrompt } from '../prompts/systemPrompt.js';
import { filterAnswered } from './signalExtractor.js';

/**
 * Generates a supervised response strictly grounded on the retrieved chunks
 * and on the methodological rules for the active namespace.
 *
 * When OPENAI_API_KEY is missing, falls back to a deterministic template
 * composer that simply quotes the leading authorized chunk text. This keeps
 * the pipeline runnable end-to-end with zero external dependencies.
 */
export async function generateAnswer({
  question,
  namespace,
  band,
  intent,
  chunks,
  babyProfile,
  conversation,
  signals,
}) {
  if (!useOpenAI) {
    return composeLocalAnswer({ question, chunks, namespace, intent, signals });
  }

  const client = getOpenAI();
  const system = buildSystemPrompt({ namespace, band });
  const user = buildUserPrompt({ question, intent, chunks, babyProfile, conversation, signals });

  const resp = await client.chat.completions.create({
    model: config.openai.chatModel,
    temperature: 0.2,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });

  const text = resp.choices?.[0]?.message?.content?.trim() || '';
  return {
    text,
    source: 'llm',
    model: config.openai.chatModel,
  };
}

function composeLocalAnswer({ question, chunks, namespace, intent, signals }) {
  if (!chunks || chunks.length === 0) {
    return {
      text:
        'Não encontrei orientação suficiente dentro do método para responder isso com segurança agora. Vou direcionar para o conteúdo mais próximo disponível e, se preferir, posso te encaminhar para o suporte humano.',
      source: 'local-template-empty',
    };
  }

  const leading = chunks[0].chunk;
  const supporting = chunks.slice(1, 3).map((c) => c.chunk);

  const lines = [];
  lines.push(`Mãe, sobre a sua dúvida no contexto do RN (${namespace}):`);
  lines.push('');
  lines.push(leading.text);

  // Lead with the prioritized hypothesis when a high-weight signal fired.
  if (signals?.priorities?.length) {
    lines.push('');
    lines.push('Hipótese prioritária para o seu caso:');
    for (const p of signals.priorities.slice(0, 2)) {
      lines.push(`• ${p}`);
    }
  }

  if (supporting.length > 0) {
    lines.push('');
    lines.push('Outros pontos relevantes do método:');
    for (const s of supporting) {
      lines.push(`• ${oneLine(s.text)}`);
    }
  }

  // Only ask for what the mother has NOT already provided.
  const stillMissing = filterAnswered(leading.askIfMissing || [], signals?.provided);
  if (stillMissing.length) {
    lines.push('');
    lines.push('Para refinar a orientação, ainda ajuda saber:');
    for (const q of stillMissing.slice(0, 4)) {
      lines.push(`• ${q}`);
    }
  }
  return {
    text: lines.join('\n'),
    source: 'local-template',
    intent,
    question,
  };
}

function oneLine(text) {
  return String(text || '').replace(/\s+/g, ' ').slice(0, 220);
}
