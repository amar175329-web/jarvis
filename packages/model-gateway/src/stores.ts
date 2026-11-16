import type { UsageRow, UsageStore, UsageSummary } from './types.ts';
import { modelKey } from './budget.ts';

export function emptySummary(): UsageSummary { return { dayUsd: 0, monthUsd: 0, modelDayUsd: {}, modelDayRequests: {} }; }

/** For tests and for running without a database. */
export function memoryUsageStore(): UsageStore & { rows: (UsageRow & { ts: Date })[]; now: () => Date } {
  const store = {
    rows: [] as (UsageRow & { ts: Date })[], now: () => new Date(),
    async summary(dayStart: Date, monthStart: Date, modelDayStarts?: Record<string, Date>) {
      return summarize(store.rows, dayStart, monthStart, modelDayStarts);
    },
    async record(row: UsageRow) { store.rows.push({ ...row, ts: store.now() }); },
  };
  return store;
}
export function summarize(
  rows: { provider: string; model: string; cost_usd: number | string; ts: Date | string }[],
  dayStart: Date,
  monthStart: Date,
  modelDayStarts?: Record<string, Date>
): UsageSummary {
  const s = emptySummary();
  for (const r of rows) {
    const ts = new Date(r.ts);
    const cost = Number(r.cost_usd) || 0;
    const k = modelKey(r);
    if (ts >= monthStart) s.monthUsd += cost;
    if (ts >= dayStart) {
      s.dayUsd += cost;
      s.modelDayUsd[k] = (s.modelDayUsd[k] ?? 0) + cost;
    }
    const mStart = modelDayStarts?.[k] ?? dayStart;
    if (ts >= mStart) {
      s.modelDayRequests[k] = (s.modelDayRequests[k] ?? 0) + 1;
    }
  }
  return s;
}

/** model_usage table through Supabase REST. Server-side only (service_role). Reads at most 5000 rows of this month. */
export function supabaseUsageStore(o: { url: string; serviceKey: string; ownerId: string; fetch?: typeof fetch }): UsageStore {
  const f = o.fetch ?? fetch;
  const headers: Record<string, string> = { apikey: o.serviceKey, 'Content-Type': 'application/json' };
  if (o.serviceKey.includes('.')) headers.Authorization = `Bearer ${o.serviceKey}`;
  return {
    async summary(dayStart, monthStart, modelDayStarts) {
      const q = `select=provider,model,cost_usd,ts&owner_id=eq.${o.ownerId}&ts=gte.${encodeURIComponent(monthStart.toISOString())}&limit=5000`;
      const r = await f(`${o.url}/rest/v1/model_usage?${q}`, { headers });
      if (!r.ok) throw new Error(`usage read failed: HTTP ${r.status}`);
      return summarize((await r.json()) as any[], dayStart, monthStart, modelDayStarts);
    },
    async record(row) {
      const payload: Record<string, unknown> = {
        owner_id: o.ownerId,
        provider: row.provider,
        model: row.model,
        tokens_in: row.tokens_in,
        tokens_out: row.tokens_out,
        cost_usd: row.cost_usd,
        ok: row.ok,
        cache_read_tokens: row.cache_read_tokens ?? 0,
        cache_write_tokens: row.cache_write_tokens ?? 0,
      };
      if (row.task !== undefined) payload.task = row.task;
      if (row.tier !== undefined) payload.tier = row.tier;
      if (row.fallback_from !== undefined) payload.fallback_from = row.fallback_from;

      const r = await f(`${o.url}/rest/v1/model_usage`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(`usage write failed: HTTP ${r.status}`);
    },
  };
}
