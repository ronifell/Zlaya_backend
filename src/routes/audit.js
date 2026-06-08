import { Router } from 'express';
import { queryRecent } from '../services/auditLogger.js';
import { indexInfo } from '../services/vectorStore.js';
import { config, useOpenAI } from '../config/index.js';

const router = Router();

router.get('/recent', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const items = await queryRecent(limit);
    res.json({ items, count: items.length });
  } catch (err) {
    next(err);
  }
});

router.get('/index', (_req, res) => {
  res.json(indexInfo());
});

router.get('/config', (_req, res) => {
  res.json({
    activeNamespaces: config.activeNamespaces,
    retrieval: config.retrieval,
    llmProvider: useOpenAI ? 'openai' : 'local-fallback',
    chatModel: useOpenAI ? config.openai.chatModel : 'local-template',
    embeddingModel: useOpenAI ? config.openai.embeddingModel : 'local-hash',
  });
});

export default router;
