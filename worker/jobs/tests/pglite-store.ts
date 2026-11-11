// Test helper: a JobStore that talks to a REAL local Postgres (pglite) with the real migrations 0001-0004.
// So the worker is tested together with the SQL it will meet in Supabase.
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';
import fs from 'node:fs';
import type { Job, JobStore } from '../src/types.ts';

export const OWNER = '00000000-0000-0000-0000-00000000000a';
const mig = (n: string) => fs.readFileSync(new URL(`../../../packages/db/migrations/${n}`, import.meta.url), 'utf8');

export async function setupDb() {
  const db = new PGlite({ extensions: { vector } });
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    insert into auth.users values ('${OWNER}');`);
  for (const m of ['0001_core.sql', '0003_events_idempotency.sql', '0004_jobs.sql']) await db.exec(mig(m));
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${OWNER}',false); select init_owner(); reset role;`).catch(async () => {
    await db.exec(`grant usage on schema public, auth to authenticated; grant all on all tables in schema public to authenticated;`);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${OWNER}',false); select init_owner(); reset role;`);
  });
  return db;
}
export const setKill = async (db: PGlite, kill: boolean) => { await db.exec(`update system_state set kill = ${kill}`); };

export function pgliteStore(db: PGlite): JobStore & { calls: string[] } {
  const calls: string[] = [];
  const asJob = (r: any): Job | null => (r?.id ? r : null);
  return {
    calls,
    async read() { const r = (await db.query<any>('select kill, epoch from system_state limit 1')).rows[0]; if (!r) throw new Error('no row'); return r; },
    async claim(w, lease) { calls.push('claim'); return asJob((await db.query<any>('select * from claim_job($1,$2)', [w, lease])).rows[0]); },
    async heartbeat(id, w, lease) { calls.push('heartbeat'); return (await db.query<any>('select heartbeat_job($1,$2,$3) as r', [id, w, lease])).rows[0].r; },
    async finish(id, w, o) { calls.push('finish'); return asJob((await db.query<any>('select * from finish_job($1,$2,$3,$4,$5,$6,$7)', [id, w, o.ok, o.result === undefined ? null : JSON.stringify(o.result), o.error ?? null, o.retryInSeconds ?? 30, o.retry ?? true])).rows[0]); },
    async enqueue(j) {
      const r = await db.query<any>('insert into jobs(owner_id,kind,payload,run_at,idempotency_key,max_attempts) values ($1,$2,$3,$4,$5,$6) on conflict (owner_id, idempotency_key) do nothing returning id', [OWNER, j.kind, JSON.stringify(j.payload ?? {}), (j.runAt ?? new Date()).toISOString(), j.idempotencyKey ?? null, j.maxAttempts ?? 3]);
      return r.rows.length ? 'created' : 'duplicate';
    },
    async ping() { calls.push('ping'); await db.query('select 1 from system_state limit 1'); },
    async purge() { return (await db.query<any>('select purge_old_jobs() as n')).rows[0].n; },
  };
}
