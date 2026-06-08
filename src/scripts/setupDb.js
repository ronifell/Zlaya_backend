import pg from 'pg';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config/index.js';

const { Pool } = pg;

const DDL = readFileSync(
  path.join(config.paths.root, 'src', 'db', 'schema.sql'),
  'utf-8',
);

function buildPoolOptions(url) {
  const wantsSsl =
    /sslmode=require/i.test(url) ||
    /\.supabase\.(com|co|in)/i.test(url) ||
    /\.rds\.amazonaws\.com/i.test(url) ||
    /\.render\.com/i.test(url) ||
    /\.neon\.tech/i.test(url) ||
    String(process.env.DATABASE_SSL || '').toLowerCase() === 'true';
  return {
    connectionString: url,
    max: 2,
    ssl: wantsSsl ? { rejectUnauthorized: false } : undefined,
  };
}

function redact(url) {
  try {
    const u = new URL(url);
    const user = u.username || '';
    return `${u.protocol}//${user}:***@${u.host}${u.pathname}`;
  } catch {
    return '(invalid URL)';
  }
}

async function main() {
  if (!config.audit.databaseUrl) {
    console.error('[setup-db] DATABASE_URL is not set in .env — nothing to do.');
    process.exit(1);
  }

  console.log(`[setup-db] connecting to ${redact(config.audit.databaseUrl)}…`);
  const pool = new Pool(buildPoolOptions(config.audit.databaseUrl));

  try {
    const meta = await pool.query(
      `SELECT current_database() AS db, current_user AS usr, version() AS ver`,
    );
    const { db, usr, ver } = meta.rows[0];
    console.log(`[setup-db] connected — database=${db} user=${usr}`);
    console.log(`[setup-db]            server=${ver.split(' ').slice(0, 2).join(' ')}`);

    console.log('[setup-db] applying schema (src/db/schema.sql)…');
    await pool.query(DDL);

    const cols = await pool.query(
      `SELECT column_name, data_type
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'audit_log'
        ORDER BY ordinal_position`,
    );
    if (cols.rows.length === 0) {
      console.error('[setup-db] FAILED — audit_log table not present after DDL.');
      process.exit(2);
    }

    const indexes = await pool.query(
      `SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'audit_log'
        ORDER BY indexname`,
    );

    const count = await pool.query(`SELECT COUNT(*)::int AS n FROM audit_log`);

    console.log('[setup-db] OK — audit_log is ready.');
    console.log(`           columns (${cols.rows.length}):`);
    for (const c of cols.rows) console.log(`             - ${c.column_name.padEnd(18)} ${c.data_type}`);
    console.log(`           indexes (${indexes.rows.length}):`);
    for (const i of indexes.rows) console.log(`             - ${i.indexname}`);
    console.log(`           current row count: ${count.rows[0].n}`);
  } catch (err) {
    console.error('[setup-db] FAILED:', err.message);
    process.exitCode = 3;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error('[setup-db] unexpected error:', err);
  process.exit(1);
});
