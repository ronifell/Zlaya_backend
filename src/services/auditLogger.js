import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { config } from '../config/index.js';

const { Pool } = pg;

let pool = null;
let pgReady = false;

/**
 * Builds the Pool options. Adds SSL automatically for managed providers
 * that require it (Supabase, RDS, Render, etc.) — detected either by hostname
 * or by sslmode=require / DATABASE_SSL=true. The default of
 * `{ rejectUnauthorized: false }` is the standard `pg` config for accepting
 * the providers' chain without bundling a CA file.
 */
function buildPoolOptions() {
  const url = config.audit.databaseUrl;
  const wantsSsl =
    /sslmode=require/i.test(url) ||
    /\.supabase\.(com|co|in)/i.test(url) ||
    /\.rds\.amazonaws\.com/i.test(url) ||
    /\.render\.com/i.test(url) ||
    /\.neon\.tech/i.test(url) ||
    String(process.env.DATABASE_SSL || '').toLowerCase() === 'true';

  return {
    connectionString: url,
    max: 4,
    ssl: wantsSsl ? { rejectUnauthorized: false } : undefined,
  };
}

async function ensurePostgres() {
  if (!config.audit.databaseUrl) return null;
  if (pool) return pool;
  pool = new Pool(buildPoolOptions());
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id              UUID PRIMARY KEY,
      conversation_id TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      namespace       TEXT,
      age_days        INTEGER,
      intent          TEXT,
      intent_conf     REAL,
      retrieval_conf  REAL,
      top_similarity  REAL,
      route_path      TEXT,
      route_reason    TEXT,
      fallback_used   BOOLEAN,
      forbidden_hits  INTEGER,
      response_source TEXT,
      duration_ms     INTEGER,
      question        TEXT,
      response        TEXT,
      payload         JSONB
    );
    CREATE INDEX IF NOT EXISTS audit_log_conv_idx     ON audit_log (conversation_id, created_at);
    CREATE INDEX IF NOT EXISTS audit_log_route_idx    ON audit_log (route_path);
    CREATE INDEX IF NOT EXISTS audit_log_namespace_idx ON audit_log (namespace);
  `);
  pgReady = true;
  return pool;
}

function ensureFile() {
  const dir = path.dirname(config.audit.logFile);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/**
 * Records a single turn of the pipeline. We log everything the spec asks for:
 *   • pergunta original  • idade detectada  • intenção classificada
 *   • documentos recuperados (ids + similaridade)  • score de similaridade
 *   • resposta final  • fallback acionado  • tempo de resposta
 */
export async function recordTurn(entry) {
  const record = {
    id: entry.id,
    conversationId: entry.conversationId || null,
    createdAt: new Date().toISOString(),
    namespace: entry.namespace || null,
    ageDays: entry.ageDays ?? null,
    intent: entry.intent?.intent || null,
    intentConfidence: entry.intent?.confidence ?? null,
    retrievalConfidence: entry.retrieval?.confidence ?? null,
    topSimilarity: entry.retrieval?.topSimilarity ?? null,
    routePath: entry.route?.path || null,
    routeReason: entry.route?.details?.reason || null,
    fallbackUsed: entry.fallbackUsed === true,
    forbiddenHits: entry.safety?.violations?.length || 0,
    responseSource: entry.responseSource || null,
    durationMs: entry.durationMs ?? null,
    question: entry.question || null,
    response: entry.response || null,
    retrievedChunks: (entry.retrieval?.chunks || []).map((c) => ({
      id: c.id,
      similarity: c.similarity,
      rerankScore: c.rerankScore,
      intentMatch: c.intentMatch,
      theme: c.chunk?.theme,
      safetyLevel: c.chunk?.safetyLevel,
    })),
    safety: entry.safety || null,
    clinical: entry.clinical || null,
    routeDetails: entry.route?.details || null,
  };

  try {
    const p = await ensurePostgres();
    if (p && pgReady) {
      await p.query(
        `INSERT INTO audit_log (
           id, conversation_id, created_at, namespace, age_days,
           intent, intent_conf, retrieval_conf, top_similarity,
           route_path, route_reason, fallback_used, forbidden_hits,
           response_source, duration_ms, question, response, payload
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [
          record.id,
          record.conversationId,
          record.createdAt,
          record.namespace,
          record.ageDays,
          record.intent,
          record.intentConfidence,
          record.retrievalConfidence,
          record.topSimilarity,
          record.routePath,
          record.routeReason,
          record.fallbackUsed,
          record.forbiddenHits,
          record.responseSource,
          record.durationMs,
          record.question,
          record.response,
          record,
        ],
      );
      return { stored: 'postgres' };
    }
  } catch (err) {
    // Fall through to file log if Postgres write fails.
    record._pgError = err.message;
  }

  ensureFile();
  appendFileSync(config.audit.logFile, JSON.stringify(record) + '\n', 'utf-8');
  return { stored: 'file' };
}

/**
 * Reads the most recent N turns from the file-based log (best-effort, used
 * for the audit UI in the MVP). If Postgres is configured, use queryRecent().
 */
export function readRecentFromFile(limit = 50) {
  if (!existsSync(config.audit.logFile)) return [];
  const raw = readFileSync(config.audit.logFile, 'utf-8');
  const lines = raw.split('\n').filter(Boolean);
  const slice = lines.slice(-limit).reverse();
  return slice
    .map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    })
    .filter(Boolean);
}

export async function queryRecent(limit = 50) {
  if (config.audit.databaseUrl) {
    try {
      const p = await ensurePostgres();
      const res = await p.query(
        `SELECT payload FROM audit_log ORDER BY created_at DESC LIMIT $1`,
        [limit],
      );
      return res.rows.map((r) => r.payload);
    } catch (err) {
      return readRecentFromFile(limit);
    }
  }
  return readRecentFromFile(limit);
}
