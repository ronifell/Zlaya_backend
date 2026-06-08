import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '..', '..');

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: num(process.env.PORT, 4000),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',

  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    chatModel: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
  },

  retrieval: {
    minSimilarity: num(process.env.RETRIEVAL_MIN_SIMILARITY, 0.3),
    answerMinConfidence: num(process.env.ANSWER_MIN_CONFIDENCE, 0.55),
    topK: num(process.env.RETRIEVAL_TOP_K, 8),
    rerankK: num(process.env.RETRIEVAL_RERANK_K, 4),
  },

  audit: {
    databaseUrl: process.env.DATABASE_URL || '',
    logFile: path.join(ROOT, 'data', 'audit-log.jsonl'),
  },

  vectorStore: {
    file: path.join(ROOT, 'data', 'vector-store.json'),
  },

  paths: {
    root: ROOT,
    knowledge: path.join(ROOT, 'src', 'knowledge'),
    data: path.join(ROOT, 'data'),
  },

  // Pilot scope: only RN (0–28 days) is allowed for the MVP.
  activeNamespaces: (process.env.ACTIVE_NAMESPACES || 'RN')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};

export const useOpenAI = Boolean(config.openai.apiKey);
