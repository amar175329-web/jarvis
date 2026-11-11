// Size watch. Free Supabase = 500 MB. Alarm = "ab bada store jodna chahiye" (see docs/GROWTH_AND_PORTABILITY.md, decision proposal 013).
import { GROWTH } from './rules.ts';
import type { StoreStats } from './types.ts';

export type GrowthLevel = 'ok' | 'warn' | 'alarm';
export type GrowthReport = { level: GrowthLevel; reasons: string[]; action: 'none' | 'watch' | 'add_bigger_store'; message: string };

export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null; const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))]!;
}

/** `probeMs` = the last daily search probes (newest last). Slowness only raises the alarm when the last N probes are ALL slow. */
export function checkGrowth(stats: Pick<StoreStats, 'memories' | 'db_mb' | 'pending_embeddings'>, probeMs: number[] = []): GrowthReport {
  const alarm: string[] = []; const warn: string[] = [];
  if (stats.db_mb !== null && stats.db_mb >= GROWTH.alarm.db_mb) alarm.push(`database ${stats.db_mb} MB (limit ${GROWTH.alarm.db_mb})`);
  else if (stats.db_mb !== null && stats.db_mb >= GROWTH.warn.db_mb) warn.push(`database ${stats.db_mb} MB`);
  if (stats.memories >= GROWTH.alarm.memories) alarm.push(`${stats.memories} memories (limit ${GROWTH.alarm.memories})`);
  else if (stats.memories >= GROWTH.warn.memories) warn.push(`${stats.memories} memories`);
  const last = probeMs.slice(-GROWTH.probesRequired);
  if (last.length === GROWTH.probesRequired && last.every((x) => x >= GROWTH.alarm.search_p95_ms)) alarm.push(`search slow: last ${GROWTH.probesRequired} probes all >= ${GROWTH.alarm.search_p95_ms} ms`);
  else { const p = percentile(probeMs.slice(-7), 95); if (p !== null && p >= GROWTH.warn.search_p95_ms) warn.push(`search p95 ${Math.round(p)} ms`); }
  if (stats.pending_embeddings >= GROWTH.warn.pending_embeddings) warn.push(`${stats.pending_embeddings} memories waiting for embeddings (quota or kill switch?)`);
  if (alarm.length) return { level: 'alarm', reasons: alarm, action: 'add_bigger_store', message: `Boss, memory badi ho gayi (${alarm.join('; ')}). Ab bada store jodna chahiye (Neon ya Turso). Pehle export le lo.` };
  if (warn.length) return { level: 'warn', reasons: warn, action: 'watch', message: `Memory bhar rahi hai (${warn.join('; ')}). Abhi theek hai, par bade store ki taiyari shuru kar do.` };
  return { level: 'ok', reasons: [], action: 'none', message: 'Memory ka size theek hai.' };
}
