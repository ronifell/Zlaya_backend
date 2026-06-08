import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config/index.js';
import { buildIndex, indexInfo } from '../services/vectorStore.js';

function collectChunks() {
  const knowledgeRoot = config.paths.knowledge;
  const namespaces = readdirSync(knowledgeRoot).filter((entry) => {
    const full = path.join(knowledgeRoot, entry);
    return statSync(full).isDirectory();
  });

  const allChunks = [];
  for (const ns of namespaces) {
    const chunksFile = path.join(knowledgeRoot, ns, 'chunks.json');
    let data;
    try {
      data = JSON.parse(readFileSync(chunksFile, 'utf-8'));
    } catch {
      continue;
    }
    if (!Array.isArray(data.chunks)) continue;
    for (const c of data.chunks) {
      if (!c.namespace) c.namespace = data.namespace || ns.toUpperCase();
      allChunks.push(c);
    }
  }
  return allChunks;
}

async function main() {
  const chunks = collectChunks();
  if (chunks.length === 0) {
    console.error('[ingest] no chunks found under src/knowledge/*/chunks.json');
    process.exit(1);
  }
  console.log(`[ingest] indexing ${chunks.length} chunks…`);
  const result = await buildIndex(chunks);
  console.log('[ingest] done:', result);
  console.log('[ingest] index info:', indexInfo());
}

main().catch((err) => {
  console.error('[ingest] failed:', err);
  process.exit(1);
});
