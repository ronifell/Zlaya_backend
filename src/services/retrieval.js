import { config } from '../config/index.js';
import { embedOne } from './embeddings.js';
import { search as vectorSearch } from './vectorStore.js';

/**
 * Performs controlled retrieval scoped to a single namespace (age band).
 * Pipeline:
 *   1) embed query
 *   2) vector search restricted to namespace
 *   3) intent-aware reranking (boost chunks whose `intent` matches the classified intent)
 *   3b) signal-aware reranking (boost chunks whose `theme` matches a detected
 *       contextual signal — e.g. "after 6pm" boosts the vespertine/feeding themes)
 *   4) confidence aggregation
 */
export async function retrieve({ query, namespace, intent, boostThemes = [] }) {
  if (!namespace) {
    return emptyResult('namespace_required');
  }

  const queryEmbedding = await embedOne(query);
  const candidates = vectorSearch({
    queryEmbedding,
    namespace,
    topK: config.retrieval.topK,
  });

  if (candidates.length === 0) {
    return emptyResult('no_candidates');
  }

  const themeSet = new Set(boostThemes || []);
  const THEME_BOOST_PER_MATCH = 0.08;
  const THEME_BOOST_CAP = 0.16;

  // Reranking: similarity base + intent-match boost + signal/theme boost.
  const reranked = candidates.map((c) => {
    const intents = Array.isArray(c.chunk.intent) ? c.chunk.intent : [c.chunk.intent].filter(Boolean);
    const intentBoost = intent && intents.includes(intent) ? 0.1 : 0;
    const themeMatch = themeSet.has(c.chunk.theme);
    const themeBoost = themeMatch ? Math.min(THEME_BOOST_PER_MATCH, THEME_BOOST_CAP) : 0;
    const safetyPenalty = c.chunk.safetyLevel === 'vermelho' ? 0 : 0;
    return {
      ...c,
      rerankScore: c.similarity + intentBoost + themeBoost - safetyPenalty,
      intentMatch: intent ? intents.includes(intent) : false,
      themeMatch,
    };
  });

  reranked.sort((a, b) => b.rerankScore - a.rerankScore);
  const top = reranked.slice(0, config.retrieval.rerankK);

  // Filter out anything clearly below the similarity floor.
  const aboveFloor = top.filter((t) => t.similarity >= config.retrieval.minSimilarity);

  // Confidence aggregation: combine top similarity with how many results
  // cleared the floor and whether the intent matched on the leader.
  const topSim = aboveFloor[0]?.similarity ?? top[0]?.similarity ?? 0;
  const coverage = aboveFloor.length / Math.max(1, config.retrieval.rerankK);
  const intentBoostFactor = aboveFloor[0]?.intentMatch ? 0.1 : 0;
  const themeBoostFactor = aboveFloor[0]?.themeMatch ? 0.05 : 0;
  const confidence = clamp01(topSim * 0.7 + coverage * 0.2 + intentBoostFactor + themeBoostFactor);

  return {
    status: aboveFloor.length === 0 ? 'low_confidence' : 'ok',
    confidence,
    topSimilarity: topSim,
    chunks: aboveFloor.length > 0 ? aboveFloor : top, // always return something for audit
    abovefloorCount: aboveFloor.length,
  };
}

function emptyResult(reason) {
  return {
    status: 'no_results',
    reason,
    confidence: 0,
    topSimilarity: 0,
    chunks: [],
    abovefloorCount: 0,
  };
}

function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}
