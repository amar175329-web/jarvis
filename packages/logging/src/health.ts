// Health: a list of small checks -> one report. Feeds /api/system/health and self/health.
import { systemClock, type Clock } from '../../shared/src/index.ts';
import { errorBody, okBody, type ErrorBody } from '../../contracts/src/index.ts';
import { ROUTES } from '../../contracts/src/index.ts';
import { redactString } from './redact.ts';

export type HealthCheck = { name: string; critical: boolean; timeoutMs?: number; run: () => Promise<{ ok: boolean; detail?: string }> };
export type Component = { name: string; status: 'ok' | 'degraded' | 'down'; latency_ms: number; detail?: string };
export type HealthReport = { status: 'ok' | 'degraded' | 'down'; ts: string; components: Component[] };

export async function runHealth(checks: HealthCheck[], clock: Clock = systemClock): Promise<HealthReport> {
  const components = await Promise.all(checks.map(async (c): Promise<Component> => {
    const t0 = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const r = await Promise.race([c.run(), new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), c.timeoutMs ?? 5000); })]);
      return { name: c.name, status: r.ok ? 'ok' : c.critical ? 'down' : 'degraded', latency_ms: Date.now() - t0, ...(r.detail ? { detail: redactString(r.detail).slice(0, 200) } : {}) };
    } catch (e) {
      return { name: c.name, status: c.critical ? 'down' : 'degraded', latency_ms: Date.now() - t0, detail: redactString(String((e as Error)?.message ?? e)).slice(0, 200) };
    } finally { clearTimeout(timer); }
  }));
  const status = components.some((c) => c.status === 'down') ? 'down' : components.some((c) => c.status === 'degraded') ? 'degraded' : 'ok';
  return { status, ts: clock.now().toISOString(), components };
}

/** What /api/system/health returns: only "ok" + time when fine, 503 unavailable otherwise. Details stay private (self/health reads the full report as owner). */
export function toHealthResponse(r: HealthReport): { status: number; body: unknown } {
  if (r.status === 'ok' || r.status === 'degraded') return { status: 200, body: okBody(ROUTES['system.health'].output).parse({ ok: true, data: { status: 'ok', ts: r.ts } }) };
  const e = errorBody('unavailable', 'JARVIS is not healthy right now');
  return { status: e.status, body: e.body satisfies ErrorBody };
}

/** Supabase free plan guard (decision 009): warn at 400 MB, critical at 480 MB of 500 MB. */
export function dbSizeCheck(getMb: () => Promise<number>, warnMb = 400, failMb = 480): HealthCheck {
  return { name: 'db.size', critical: false, run: async () => {
    const mb = await getMb();
    return { ok: mb < warnMb, detail: `${mb.toFixed(0)} MB used of 500 MB${mb >= failMb ? ' (almost full)' : ''}` };
  } };
}
