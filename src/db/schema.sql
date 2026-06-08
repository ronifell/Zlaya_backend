-- Zlaya RN MVP — optional Postgres schema for audit logs.
-- The same DDL is executed automatically by auditLogger.js when DATABASE_URL is set.

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

CREATE INDEX IF NOT EXISTS audit_log_conv_idx       ON audit_log (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS audit_log_route_idx      ON audit_log (route_path);
CREATE INDEX IF NOT EXISTS audit_log_namespace_idx  ON audit_log (namespace);
