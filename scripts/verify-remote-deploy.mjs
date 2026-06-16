#!/usr/bin/env node
/**
 * Verify whether the remote (or local) Zlaya backend is running the
 * post-deploy code (v3 auto-corrections). Hits /api/health, prints the
 * feature matrix and exits non-zero if any feature is inactive.
 *
 * Usage:
 *   node scripts/verify-remote-deploy.mjs [BASE_URL]
 *
 * Examples:
 *   node scripts/verify-remote-deploy.mjs http://98.81.111.229:4000
 *   node scripts/verify-remote-deploy.mjs http://localhost:4000
 */

const baseUrl = (process.argv[2] || process.env.ZLAYA_API_URL || 'http://localhost:4000').replace(/\/+$/, '');
const url = `${baseUrl}/api/health`;

console.log(`[verify] GET ${url}`);
let res;
try {
  res = await fetch(url, { headers: { accept: 'application/json' } });
} catch (err) {
  console.error(`[verify] connection failed: ${err.message}`);
  process.exit(2);
}
if (!res.ok) {
  console.error(`[verify] HTTP ${res.status} ${res.statusText}`);
  process.exit(2);
}
const body = await res.json();

console.log('');
console.log('  status            :', body.status);
console.log('  env               :', body.env);
console.log('  llm               :', body.llm);
console.log('  activeNamespaces  :', body.activeNamespaces?.join(', '));
console.log('  bootAt            :', body.bootAt);
console.log('  upSec             :', body.upSec);
console.log('  buildSignature    :', body.buildSignature || '(missing — backend pre-v3)');
console.log('  vectorIndex.count :', body.vectorIndex?.itemCount);
console.log('  vectorIndex.builtAt:', body.vectorIndex?.builtAt);
console.log('');

if (!Array.isArray(body.features)) {
  console.error('[verify] /api/health does not expose features — backend is OLD code.');
  console.error('         Restart the Node process on the host:');
  console.error('           pkill -f "node src/server.js" && npm --prefix backend start');
  process.exit(1);
}

console.log('  FEATURES (auto-correções v3):');
let allOk = true;
for (const f of body.features) {
  console.log(`    ${f.active ? '✓' : '✗'} ${f.id}`);
  if (!f.active) allOk = false;
}
console.log('');

if (allOk) {
  console.log('[verify] ✅ Backend está NA versão nova (v3). Pode mandar a próxima conversa.');
  process.exit(0);
}
console.log('[verify] ❌ Algumas features estão INATIVAS — o backend NÃO carregou o código novo.');
console.log('           Reinicie o processo Node no host remoto.');
process.exit(1);
