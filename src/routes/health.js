import { Router } from 'express';
import { indexInfo } from '../services/vectorStore.js';
import { useOpenAI, config } from '../config/index.js';

const router = Router();

router.get('/', (_req, res) => {
  let index = null;
  try {
    index = indexInfo();
  } catch {
    index = { error: 'no_index' };
  }
  res.json({
    status: 'ok',
    env: config.env,
    llm: useOpenAI ? 'openai' : 'local-fallback',
    activeNamespaces: config.activeNamespaces,
    vectorIndex: index,
    timestamp: new Date().toISOString(),
  });
});

export default router;
