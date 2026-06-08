import { config } from '../config/index.js';
import { embedOne } from './embeddings.js';
import { search as vectorSearch } from './vectorStore.js';

/**
 * Performs controlled retrieval scoped to a single namespace (age band).
 * Pipeline:
 *   1) embed query
 *   2) vector search restricted to namespace
 *   3) intent-aware reranking (boost chunks whose `intent` matches the classified intent)
 *   4) confidence aggregation
 */
export async function retrieve({ query, namespace, intent }) {
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

  // Reranking: keep similarity as the base, add a small intent-match boost.
  const reranked = candidates.map((c) => {
    const intents = Array.isArray(c.chunk.intent) ? c.chunk.intent : [c.chunk.intent].filter(Boolean);
    const intentBoost = intent && intents.includes(intent) ? 0.1 : 0;
    const safetyPenalty = c.chunk.safetyLevel === 'vermelho' ? 0 : 0;
    return {
      ...c,
      rerankScore: c.similarity + intentBoost - safetyPenalty,
      intentMatch: intent ? intents.includes(intent) : false,
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
  const confidence = clamp01(topSim * 0.7 + coverage * 0.2 + intentBoostFactor);

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
