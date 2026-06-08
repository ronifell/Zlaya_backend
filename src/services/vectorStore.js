import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { config, useOpenAI } from '../config/index.js';
import { cosineSimilarity, embedMany } from './embeddings.js';

/**
 * File-backed vector store, intentionally simple so the MVP runs without
 * external infrastructure. The interface (build / search) is the contract
 * we will preserve when swapping for Pinecone, Qdrant or pgvector later.
 */

let _index = null;

function load() {
  if (_index) return _index;
  if (!existsSync(config.vectorStore.file)) {
    _index = { provider: 'local', items: [] };
    return _index;
  }
  const raw = readFileSync(config.vectorStore.file, 'utf-8');
  _index = JSON.parse(raw);
  return _index;
}

function persist(index) {
  const dir = path.dirname(config.vectorStore.file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(config.vectorStore.file, JSON.stringify(index, null, 2), 'utf-8');
}

/**
 * Builds the vector index from a list of chunks.
 * Each chunk must contain at minimum: { id, namespace, text, ... }
 * Additional fields are kept as metadata.
 */
export async function buildIndex(chunks) {
  const texts = chunks.map((c) => buildEmbeddingText(c));
  const vectors = await embedMany(texts);
  const items = chunks.map((c, i) => ({
    id: c.id,
    namespace: c.namespace,
    metadata: c,
    embedding: vectors[i],
  }));
  const index = {
    provider: useOpenAI ? 'openai' : 'local-hash',
    embeddingModel: useOpenAI ? config.openai.embeddingModel : 'local-hash',
    builtAt: new Date().toISOString(),
    items,
  };
  persist(index);
  _index = index;
  return { count: items.length, provider: index.provider };
}

function buildEmbeddingText(chunk) {
  const parts = [
    chunk.theme,
    Array.isArray(chunk.intent) ? chunk.intent.join(' ') : chunk.intent,
    chunk.contentType,
    chunk.text,
  ].filter(Boolean);
  return parts.join('\n');
}

/**
 * Returns the top-K most similar chunks for the given query embedding,
 * filtered by namespace (hard isolation). Results are sorted by similarity.
 */
export function search({ queryEmbedding, namespace, topK = 8 }) {
  const index = load();
  const filtered = index.items.filter((it) => it.namespace === namespace);
  const scored = filtered.map((it) => ({
    id: it.id,
    namespace: it.namespace,
    similarity: cosineSimilarity(queryEmbedding, it.embedding),
    chunk: it.metadata,
  }));
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, topK);
}

export function indexInfo() {
  const index = load();
  return {
    provider: index.provider,
    embeddingModel: index.embeddingModel,
    builtAt: index.builtAt || null,
    itemCount: index.items.length,
    namespaces: [...new Set(index.items.map((i) => i.namespace))],
  };
}
