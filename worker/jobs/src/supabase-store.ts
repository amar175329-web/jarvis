// JobStore over Supabase REST (PostgREST). Uses the service_role key: server only. Errors say status + path, never headers or keys.
import type { EnqueueInput, FinishOutcome, Job, JobStore } from './types.ts';
import type { KillState } from '../../../packages/shared/src/index.ts';

export function supabaseJobStore(o: { url: string; serviceKey: string; ownerId: string; fetch?: typeof fetch }): JobStore {
  const f = o.fetch ?? fetch; const base = o.url.replace(/\/$/, '');
  const headers = { apikey: o.serviceKey, Authorization: `Bearer ${o.serviceKey}`, 'Content-Type': 'application/json' };
  async function req(method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<any> {
    const r = await f(`${base}/rest/v1/${path}`, { method, headers: { ...headers, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!r.ok) throw new Error(`Supabase HTTP ${r.status} on ${method} ${path.split('?')[0]}`);
    const t = await r.text(); return t ? JSON.parse(t) : null;
  }
  const asJob = (r: any): Job | null => (r && r.id ? (r as Job) : null); // a function that finds nothing returns null or an all-null row
  return {
    async read(): Promise<KillState> {
      const rows = await req('GET', `system_state?select=kill,epoch&owner_id=eq.${o.ownerId}&id=eq.1&limit=1`);
      if (!Array.isArray(rows) || !rows[0]) throw new Error('system_state row not found'); // fail-closed upstream
      return { kill: rows[0].kill, epoch: rows[0].epoch };
    },
    claim: async (workerId, leaseSeconds) => asJob(await req('POST', 'rpc/claim_job', { p_worker: workerId, p_lease_seconds: leaseSeconds })),
    async heartbeat(jobId, workerId, leaseSeconds) { return (await req('POST', 'rpc/heartbeat_job', { p_id: jobId, p_worker: workerId, p_lease_seconds: leaseSeconds })) === true; },
    finish: async (jobId, workerId, x: FinishOutcome) => asJob(await req('POST', 'rpc/finish_job', { p_id: jobId, p_worker: workerId, p_ok: x.ok, p_result: x.result ?? null, p_error: x.error ?? null, p_retry_in_seconds: x.retryInSeconds ?? 30, p_retry: x.retry ?? true })),
    async enqueue(j: EnqueueInput) {
      const rows = await req('POST', 'jobs?on_conflict=owner_id,idempotency_key', { owner_id: o.ownerId, kind: j.kind, payload: j.payload ?? {}, run_at: (j.runAt ?? new Date()).toISOString(), idempotency_key: j.idempotencyKey ?? null, ...(j.maxAttempts ? { max_attempts: j.maxAttempts } : {}) }, { Prefer: 'resolution=ignore-duplicates,return=representation' });
      return Array.isArray(rows) && rows.length ? 'created' : 'duplicate';
    },
    async ping() { await req('GET', 'system_state?select=id&limit=1'); },
    async purge() { return Number(await req('POST', 'rpc/purge_old_jobs', {})) || 0; },
  };
}

/** Finds the one owner (single-user system) from system_state. */
export async function discoverOwner(url: string, serviceKey: string, f: typeof fetch = fetch): Promise<string> {
  const r = await f(`${url.replace(/\/$/, '')}/rest/v1/system_state?select=owner_id&limit=2`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
  if (!r.ok) throw new Error(`Supabase HTTP ${r.status} while finding the owner`);
  const rows = (await r.json()) as { owner_id: string }[];
  if (rows.length !== 1) throw new Error(`expected exactly 1 owner in system_state, found ${rows.length} (run init_owner() first)`);
  return rows[0].owner_id;
}
