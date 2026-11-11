import test from 'node:test';
import assert from 'node:assert/strict';
import { supabaseJobStore, discoverOwner } from '../src/supabase-store.ts';
import { readKillFailClosed } from '../../../packages/shared/src/index.ts';

const KEY = 'SERVICE-ROLE-SECRET-VALUE';
function stub(handler: (url: string, init: any) => { status?: number; body?: unknown }) {
  const calls: { url: string; init: any }[] = [];
  const f = (async (url: string, init: any) => { calls.push({ url, init }); const r = handler(url, init); const status = r.status ?? 200; return { ok: status < 400, status, text: async () => (r.body === undefined ? '' : JSON.stringify(r.body)), json: async () => r.body }; }) as any;
  return { f, calls };
}
const store = (f: any) => supabaseJobStore({ url: 'https://p.supabase.co/', serviceKey: KEY, ownerId: 'owner-1', fetch: f });

test('claim: right URL, key in headers, body; null / all-null rows mean "no job"', async () => {
  const { f, calls } = stub(() => ({ body: { id: 'j1', kind: 'a.b', attempts: 1 } }));
  const j = await store(f).claim('w1', 60); assert.equal(j?.id, 'j1');
  assert.equal(calls[0].url, 'https://p.supabase.co/rest/v1/rpc/claim_job'); assert.equal(calls[0].init.headers.apikey, KEY); assert.equal(calls[0].init.headers.Authorization, `Bearer ${KEY}`);
  assert.deepEqual(JSON.parse(calls[0].init.body), { p_worker: 'w1', p_lease_seconds: 60 });
  assert.equal(await store(stub(() => ({ body: null })).f).claim('w', 1), null);
  assert.equal(await store(stub(() => ({ body: { id: null, kind: null } })).f).claim('w', 1), null);
});
test('heartbeat and finish send the right arguments', async () => {
  const { f, calls } = stub((u) => ({ body: u.endsWith('heartbeat_job') ? true : { id: 'j1' } }));
  const s = store(f); assert.equal(await s.heartbeat('j1', 'w', 30), true);
  await s.finish('j1', 'w', { ok: false, error: 'boom', retryInSeconds: 12, retry: false });
  assert.deepEqual(JSON.parse(calls[1].init.body), { p_id: 'j1', p_worker: 'w', p_ok: false, p_result: null, p_error: 'boom', p_retry_in_seconds: 12, p_retry: false });
  assert.equal(await store(stub(() => ({ body: false })).f).heartbeat('j', 'w', 1), false);
});
test('enqueue: created vs duplicate, with ignore-duplicates header', async () => {
  const a = stub(() => ({ body: [{ id: 'x' }] })); assert.equal(await store(a.f).enqueue({ kind: 'system.keepalive', idempotencyKey: 'k' }), 'created');
  assert.match(a.calls[0].url, /jobs\?on_conflict=owner_id,idempotency_key$/); assert.match(a.calls[0].init.headers.Prefer, /ignore-duplicates/); assert.equal(JSON.parse(a.calls[0].init.body).owner_id, 'owner-1');
  assert.equal(await store(stub(() => ({ body: [] })).f).enqueue({ kind: 'a.b', idempotencyKey: 'k' }), 'duplicate');
});
test('kill switch reader: reads own row; missing row or HTTP error => fail-closed ON', async () => {
  assert.deepEqual(await readKillFailClosed(store(stub(() => ({ body: [{ kill: false, epoch: 3 }] })).f)), { kill: false, epoch: 3 });
  assert.equal((await readKillFailClosed(store(stub(() => ({ body: [] })).f))).kill, true);
  assert.equal((await readKillFailClosed(store(stub(() => ({ status: 500, body: {} })).f))).kill, true);
});
test('errors name the status and path but never the key', async () => {
  const s = store(stub(() => ({ status: 401, body: { message: KEY } })).f);
  await assert.rejects(s.claim('w', 1), (e: Error) => /HTTP 401 on POST rpc\/claim_job/.test(e.message) && !e.message.includes(KEY));
});
test('ping is a real request; purge returns the number', async () => {
  const { f, calls } = stub((u) => ({ body: u.includes('purge') ? 4 : [{ id: 1 }] }));
  const s = store(f); await s.ping(); assert.match(calls[0].url, /system_state\?select=id/); assert.equal(await s.purge(), 4);
});
test('discoverOwner: exactly one owner or a clear error', async () => {
  assert.equal(await discoverOwner('https://p.supabase.co', KEY, stub(() => ({ body: [{ owner_id: 'o1' }] })).f), 'o1');
  await assert.rejects(discoverOwner('https://p.supabase.co', KEY, stub(() => ({ body: [] })).f), /found 0/);
  await assert.rejects(discoverOwner('https://p.supabase.co', KEY, stub(() => ({ body: [{ owner_id: 'a' }, { owner_id: 'b' }] })).f), /found 2/);
});
