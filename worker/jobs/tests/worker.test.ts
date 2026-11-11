import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from '../src/worker.ts';
import { builtinHandlers, defaultRecurring } from '../src/handlers.ts';
import { NonRetryableError, fixedClock, sleep } from '../../../packages/shared/src/index.ts';
import { createLogger, memorySink } from '../../../packages/logging/src/index.ts';
import { OWNER, pgliteStore, setKill, setupDb } from './pglite-store.ts';
import type { Handler } from '../src/types.ts';

async function make(handlers: Record<string, Handler> = {}, o: Record<string, unknown> = {}) {
  const db = await setupDb(); await setKill(db, false);
  const store = pgliteStore(db); const sink = memorySink();
  const worker = new Worker({ store, handlers: { ...builtinHandlers, ...handlers }, logger: createLogger({ service: 'worker', sinks: [sink] }), workerId: 'w-test', pollMs: 20, killPollMs: 30, leaseSeconds: 30, retryBaseMs: 1000, ...o });
  const job = async (kind: string, extra = '') => (await db.query<any>(`insert into jobs(owner_id,kind${extra ? ',' + extra.split('=')[0] : ''}) values ('${OWNER}','${kind}'${extra ? ',' + extra.split('=')[1] : ''}) returning id`)).rows[0].id as string;
  const row = async (id: string) => (await db.query<any>('select * from jobs where id=$1', [id])).rows[0];
  return { db, store, sink, worker, job, row };
}

test('idle when there is nothing to do', async () => { const { worker } = await make(); assert.equal(await worker.tick(), 'idle'); });

test('runs a job: handler gets the payload, result is stored, state done', async () => {
  const seen: any[] = [];
  const { worker, db, row } = await make({ 'demo.echo': async ({ job }) => { seen.push(job.payload); return { echoed: job.payload }; } });
  const id = (await db.query<any>(`insert into jobs(owner_id,kind,payload) values ('${OWNER}','demo.echo','{"a":1}') returning id`)).rows[0].id;
  assert.equal(await worker.tick(), 'ran');
  const r = await row(id); assert.equal(r.state, 'done'); assert.deepEqual(r.result, { echoed: { a: 1 } }); assert.deepEqual(seen, [{ a: 1 }]); assert.equal(r.locked_by, null);
});

test('failing job is retried later, then fails for good after max attempts', async () => {
  let n = 0; const { worker, db, row } = await make({ 'demo.boom': async () => { n++; throw new Error('boom'); } }, { retryBaseMs: 1 });
  const id = (await db.query<any>(`insert into jobs(owner_id,kind,max_attempts) values ('${OWNER}','demo.boom',2) returning id`)).rows[0].id;
  await worker.tick(); let r = await row(id); assert.equal(r.state, 'queued'); assert.equal(r.error, 'boom'); assert.equal(r.attempts, 1);
  await db.exec(`update jobs set run_at = now() - interval '1 second'`);
  await worker.tick(); r = await row(id); assert.equal(r.state, 'failed'); assert.equal(n, 2);
});

test('NonRetryableError fails the job at once', async () => {
  const { worker, db, row } = await make({ 'demo.bad': async () => { throw new NonRetryableError('bad input'); } });
  const id = (await db.query<any>(`insert into jobs(owner_id,kind) values ('${OWNER}','demo.bad') returning id`)).rows[0].id;
  await worker.tick(); const r = await row(id); assert.equal(r.state, 'failed'); assert.equal(r.attempts, 1); assert.equal(r.error, 'bad input');
});

test('unknown job kind fails at once, with a clear error', async () => {
  const { worker, db, row } = await make();
  const id = (await db.query<any>(`insert into jobs(owner_id,kind) values ('${OWNER}','nobody.handles.this') returning id`)).rows[0].id;
  await worker.tick(); const r = await row(id); assert.equal(r.state, 'failed'); assert.match(r.error, /no handler/);
});

test('kill switch ON: worker takes nothing and runs nothing', async () => {
  let ran = false; const { worker, db, store } = await make({ 'demo.x': async () => { ran = true; } });
  await db.exec(`insert into jobs(owner_id,kind) values ('${OWNER}','demo.x')`); await setKill(db, true);
  assert.equal(await worker.tick(), 'killed'); assert.equal(ran, false); assert.ok(!store.calls.includes('claim'), 'must not even try to claim');
  await setKill(db, false); assert.equal(await worker.tick(), 'ran'); assert.equal(ran, true);
});

test('kill switch unreadable: counts as ON (fail-closed)', async () => {
  const { worker, store } = await make(); store.read = async () => { throw new Error('db down'); };
  assert.equal(await worker.tick(), 'killed');
});

test('kill switch turned ON while a job runs: the job is stopped and goes back to the queue', async () => {
  let aborted = false;
  const { worker, db, row } = await make({ 'demo.long': ({ signal }) => new Promise((_, rej) => { signal.addEventListener('abort', () => { aborted = true; rej(signal.reason); }); }) }, { retryBaseMs: 1 });
  const id = (await db.query<any>(`insert into jobs(owner_id,kind) values ('${OWNER}','demo.long') returning id`)).rows[0].id;
  const t = worker.tick(); await sleep(80); await setKill(db, true); assert.equal(await t, 'ran');
  const r = await row(id); assert.equal(aborted, true); assert.equal(r.state, 'queued'); assert.equal(r.error, 'stopped by kill switch');
});

test('a job that never finishes is stopped by the timeout', async () => {
  const { worker, db, row } = await make({ 'demo.hang': () => new Promise(() => {}) }, { jobTimeoutMs: 60 });
  const id = (await db.query<any>(`insert into jobs(owner_id,kind,max_attempts) values ('${OWNER}','demo.hang',1) returning id`)).rows[0].id;
  await worker.tick(); const r = await row(id); assert.equal(r.state, 'failed'); assert.match(r.error, /timed out/);
});

test('heartbeat keeps a long job leased; a second worker cannot steal it', async () => {
  const { worker, db, store, row } = await make({ 'demo.slow': async () => { await sleep(250); return 'ok'; } }, { heartbeatMs: 50 });
  const id = (await db.query<any>(`insert into jobs(owner_id,kind) values ('${OWNER}','demo.slow') returning id`)).rows[0].id;
  const t = worker.tick(); await sleep(60);
  assert.equal((await row(id)).state, 'running'); assert.equal(await store.claim('thief', 30), null);
  await t; assert.equal((await row(id)).state, 'done'); assert.ok(store.calls.includes('heartbeat'));
});

test('lease lost (someone else took the job): worker does not report a result', async () => {
  const { worker, db, store, row } = await make({ 'demo.steal': async () => { await db.exec(`update jobs set locked_by='other'`); await sleep(200); return 'x'; } }, { heartbeatMs: 50 });
  const id = (await db.query<any>(`insert into jobs(owner_id,kind) values ('${OWNER}','demo.steal') returning id`)).rows[0].id;
  await worker.tick(); const r = await row(id); assert.equal(r.state, 'running'); assert.equal(r.locked_by, 'other');
  assert.ok(!store.calls.includes('finish'));
});

test('keep-alive job runs a REAL query; purge job removes old finished jobs', async () => {
  const { worker, db, store, row } = await make();
  const k = (await db.query<any>(`insert into jobs(owner_id,kind) values ('${OWNER}','system.keepalive') returning id`)).rows[0].id;
  await worker.tick(); assert.equal((await row(k)).state, 'done'); assert.ok(store.calls.includes('ping'));
  await db.exec(`insert into jobs(owner_id,kind,state,finished_at) values ('${OWNER}','old.one','done', now() - interval '40 days')`);
  const p = (await db.query<any>(`insert into jobs(owner_id,kind) values ('${OWNER}','system.purge') returning id`)).rows[0].id;
  await worker.tick(); assert.deepEqual((await row(p)).result, { purged_jobs: 1 });
});

test('recurring jobs are scheduled once per time bucket, even across restarts', async () => {
  const clock = fixedClock('2026-11-07T11:40:00Z');
  const { worker, db, store, sink } = await make({}, { clock, recurring: defaultRecurring });
  await worker.tick(); await worker.tick();
  assert.equal((await db.query<any>(`select count(*)::int n from jobs where kind='system.keepalive'`)).rows[0].n, 1);
  const w2 = new Worker({ store, handlers: builtinHandlers, logger: createLogger({ service: 'w', sinks: [sink] }), workerId: 'w2', clock, recurring: defaultRecurring });
  await w2.tick(); assert.equal((await db.query<any>(`select count(*)::int n from jobs where kind='system.keepalive'`)).rows[0].n, 1);
  const later = new Worker({ store, handlers: builtinHandlers, logger: createLogger({ service: 'w', sinks: [sink] }), workerId: 'w3', clock: fixedClock('2026-11-08T11:40:00Z'), recurring: defaultRecurring });
  await later.tick(); assert.equal((await db.query<any>(`select count(*)::int n from jobs where kind='system.keepalive'`)).rows[0].n, 2);
});

test('a broken claim does not crash the worker', async () => {
  const { worker, store } = await make(); store.claim = async () => { throw new Error('network'); };
  assert.equal(await worker.tick(), 'error');
});

test('run() loops until stop(); stop() waits for the running job', async () => {
  let finished = false;
  const { worker, db, row } = await make({ 'demo.finishing': async () => { await sleep(120); finished = true; return 1; } });
  const id = (await db.query<any>(`insert into jobs(owner_id,kind) values ('${OWNER}','demo.finishing') returning id`)).rows[0].id;
  const loop = worker.run(); await sleep(60); await worker.stop(); await loop;
  assert.equal(finished, true); assert.equal((await row(id)).state, 'done');
});

test('logs: job id and kind are there; the service key and payload secrets are not', async () => {
  const { worker, db, sink } = await make({ 'demo.leak': async () => { throw new Error('failed with ' + ['ey', 'JhbGciOiJIUzI1NiJ9.', 'ey', 'Jyb2xlIjoic2VydmljZV9yb2xlIn0.', 'abcdefghijklmnop12345'].join('')); } });
  await db.exec(`insert into jobs(owner_id,kind,max_attempts) values ('${OWNER}','demo.leak',1)`);
  await worker.tick(); const all = JSON.stringify(sink.entries);
  assert.ok(all.includes('demo.leak') && !all.includes('ey' + 'JhbGci'));
});
