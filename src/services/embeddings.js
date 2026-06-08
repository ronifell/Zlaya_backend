import crypto from 'node:crypto';
import { config, useOpenAI } from '../config/index.js';
import { getOpenAI } from './openaiClient.js';

const LOCAL_DIM = 384;

/**
 * Deterministic hash-based bag-of-tokens embedding used when no OPENAI_API_KEY
 * is configured. Not as semantic as a real LLM embedding, but stable, fast,
 * and good enough to validate the architecture end-to-end on a small base.
 */
function localEmbedding(text) {
  const vec = new Float32Array(LOCAL_DIM);
  const tokens = normalize(text)
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  for (const tok of tokens) {
    const h = crypto.createHash('sha1').update(tok).digest();
    for (let i = 0; i < 8; i++) {
      const idx = h.readUInt16LE(i * 2) % LOCAL_DIM;
      const sign = h[16 + i] & 1 ? 1 : -1;
      vec[idx] += sign;
    }
  }
  let norm = 0;
  for (let i = 0; i < LOCAL_DIM; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < LOCAL_DIM; i++) vec[i] /= norm;
  return Array.from(vec);
}

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function embedOne(text) {
  if (useOpenAI) {
    const client = getOpenAI();
    const resp = await client.embeddings.create({
      model: config.openai.embeddingModel,
      input: String(text || '').slice(0, 8000),
    });
    return resp.data[0].embedding;
  }
  return localEmbedding(text);
}

export async function embedMany(texts) {
  if (useOpenAI) {
    const client = getOpenAI();
    const resp = await client.embeddings.create({
      model: config.openai.embeddingModel,
      input: texts.map((t) => String(t || '').slice(0, 8000)),
    });
    return resp.data.map((d) => d.embedding);
  }
  return texts.map(localEmbedding);
}

export function cosineSimilarity(a, b) {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export const embeddingDim = () => (useOpenAI ? null : LOCAL_DIM);
