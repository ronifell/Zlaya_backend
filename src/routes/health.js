import { Router } from 'express';
import { indexInfo } from '../services/vectorStore.js';
import { useOpenAI, config } from '../config/index.js';
import {
  correctAgeMentions,
  ensureSatietySignsExplained,
  ensureDirectNormalityAnswer,
  ensureNegativeAssociationReassurance,
} from '../services/safetyValidator.js';

const router = Router();

// Server boot timestamp — flips on every restart so the client can confirm
// whether the process really took the new code. The build signature lists
// the post-generation features active in this running build (each maps to a
// concrete test-feedback fix).
const BOOT_AT = new Date().toISOString();

function probeFeatures() {
  const checks = [];
  // Each probe runs the feature on a synthetic input and confirms the
  // expected effect — proof that the code in memory is the patched code.
  try {
    const r = correctAgeMentions({ text: 'bebê de 14 dias', ageDays: 10 });
    checks.push({ id: 'age_auto_correction', active: r.corrections?.length > 0 && r.text.includes('10 dias') });
  } catch { checks.push({ id: 'age_auto_correction', active: false }); }

  try {
    const r = ensureSatietySignsExplained({ text: 'observe sinais de saciedade.' });
    checks.push({ id: 'satiety_auto_expansion', active: r.expanded !== false });
  } catch { checks.push({ id: 'satiety_auto_expansion', active: false }); }

  try {
    const r = ensureSatietySignsExplained({
      text: 'observe os sinais de saciedade: o bebê solta o peito espontaneamente, relaxa o corpo, abre as mãozinhas e reduz o ritmo da sucção.',
    });
    checks.push({ id: 'satiety_operational_block', active: r.expanded === 'operational' });
  } catch { checks.push({ id: 'satiety_operational_block', active: false }); }

  try {
    const r = ensureDirectNormalityAnswer({
      text: 'É compreensível que você esteja preocupada.',
      userMessage: 'isso é normal pra idade?',
    });
    checks.push({ id: 'direct_normality_answer', active: r.prepended === true });
  } catch { checks.push({ id: 'direct_normality_answer', active: false }); }

  try {
    const r = ensureNegativeAssociationReassurance({
      text: 'orientação prática.',
      userMessage: 'tenho medo dessa associação negativa.',
    });
    checks.push({ id: 'negative_association_reassurance', active: r.appended === true });
  } catch { checks.push({ id: 'negative_association_reassurance', active: false }); }

  return checks;
}

router.get('/', (_req, res) => {
  let index = null;
  try {
    index = indexInfo();
  } catch {
    index = { error: 'no_index' };
  }
  const features = probeFeatures();
  const allActive = features.every((f) => f.active);
  res.json({
    status: 'ok',
    env: config.env,
    llm: useOpenAI ? 'openai' : 'local-fallback',
    activeNamespaces: config.activeNamespaces,
    vectorIndex: index,
    bootAt: BOOT_AT,
    upSec: Math.round((Date.now() - new Date(BOOT_AT).getTime()) / 1000),
    features,
    featuresAllActive: allActive,
    buildSignature: 'v3-auto-corrections-age+satiety+normality+negassoc',
    timestamp: new Date().toISOString(),
  });
});

export default router;
