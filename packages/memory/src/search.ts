// Ranking, identical for every store. The store only returns candidates; this decides the order.
// Starting weights live in rules.ts (RANK) and are meant to be tuned with Amit's real data (see docs/SEMANTIC_SEARCH_PLAN.md).
import { DAY, RANK, RECENCY_HALF_LIFE_DAYS, STALE_AFTER_DAYS } from './rules.ts';
import type { Memory, SearchHit } from './types.ts';

export type Ranked = { memory: Memory; score: number; sim: number | null; kw: number };

export function recencyScore(m: Memory, now: Date): number {
  const half = RECENCY_HALF_LIFE_DAYS[m.kind]; if (!half) return 1;
  const age = Math.max(0, (now.getTime() - Date.parse(m.updated_at)) / DAY);
  return Math.pow(0.5, age / half);
}
/** True when JARVIS should check lightly ("ab bhi wahi hai na?"): old for its kind, or only a guess. */
export function checkLightly(m: Memory, now: Date): boolean {
  if (m.source === 'inferred') return true;
  const limit = STALE_AFTER_DAYS[m.kind]; if (!limit) return false;
  return (now.getTime() - Date.parse(m.updated_at)) / DAY > limit;
}

export function rank(hits: SearchHit[], now: Date, opts: { vector: boolean; limit: number }): Ranked[] {
  const out: Ranked[] = [];
  for (const h of hits) {
    const rec = recencyScore(h.memory, now); const conf = h.memory.confidence;
    if (opts.vector && h.sim !== null) {
      if (h.sim < RANK.minSim && h.kw === 0) continue;               // weak vector-only match: drop
      const w = RANK.withVector; out.push({ memory: h.memory, sim: h.sim, kw: h.kw, score: w.sim * h.sim + w.kw * h.kw + w.recency * rec + w.confidence * conf });
    } else {
      if (h.kw === 0) continue;                                       // keyword-only mode needs at least one shared word
      const w = RANK.keywordOnly; out.push({ memory: h.memory, sim: h.sim, kw: h.kw, score: w.kw * h.kw + w.recency * rec + w.confidence * conf });
    }
  }
  return out.sort((a, b) => b.score - a.score || (a.memory.id < b.memory.id ? -1 : 1)).slice(0, opts.limit);
}
