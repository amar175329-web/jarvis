import test from 'node:test';
import assert from 'node:assert/strict';
import { EventOutbox, eventHttpTransport, type OutboxStore } from '../src/index.ts';
import type { Envelope } from '../src/envelope.ts';

const event = (key: string): Envelope => ({
  id: `00000000-0000-4000-8000-${Buffer.from(key).toString('hex').padStart(12, '0').slice(-12)}`,
  type: 'activity.logged', source: 'app', ts: new Date('2026-11-07T00:00:00Z').toISOString(),
  payload: { summary: key }, version: 1, idempotency_key: key,
});
function memoryStore(): OutboxStore {
  const rows = new Map<string, Envelope>();
  return {
    async put(e) { if (rows.has(e.idempotency_key!)) return 'duplicate'; rows.set(e.idempotency_key!, e); return 'created'; },
    async list(n) { return [...rows.values()].sort((a, b) => a.ts.localeCompare(b.ts)).slice(0, n); },
    async remove(k) { rows.delete(k); },
    async count() { return rows.size; },
  };
}

test('outbox validates and requires an idempotency key', async () => {
  const q = new EventOutbox(memoryStore());
  assert.equal(await q.enqueue(event('k1')), 'created');
  assert.equal(await q.enqueue(event('k1')), 'duplicate');
  await assert.rejects(q.enqueue({ ...event('k2'), idempotency_key: undefined }), /idempotency_key/);
  await assert.rejects(q.enqueue({ ...event('k3'), type: 'unknown.event' }), /unknown_type/);
});
test('flush sends oldest events and removes only accepted ones', async () => {
  const q = new EventOutbox(memoryStore()); await q.enqueue(event('first')); await q.enqueue(event('second'));
  const sent: string[] = [];
  const r = await q.flush(async (e) => { sent.push(e.idempotency_key!); return { ok: true }; });
  assert.deepEqual(sent, ['first', 'second']);
  assert.deepEqual(r, { sent: 2, remaining: 0, stoppedBy: 'empty' });
});
test('offline/transport failure preserves the event and stops ordered replay', async () => {
  const q = new EventOutbox(memoryStore()); await q.enqueue(event('first')); await q.enqueue(event('second'));
  const r = await q.flush(async () => { throw new Error('offline'); });
  assert.deepEqual(r, { sent: 0, remaining: 2, stoppedBy: 'transport' });
});
test('HTTP 429 or 5xx preserves the queue for later retry', async () => {
  const q = new EventOutbox(memoryStore()); await q.enqueue(event('first'));
  const r = await q.flush(async () => ({ ok: false, status: 429 }));
  assert.deepEqual(r, { sent: 0, remaining: 1, stoppedBy: 'server' });
});
test('permanent 4xx remains queued rather than silently losing data', async () => {
  const q = new EventOutbox(memoryStore()); await q.enqueue(event('first'));
  const r = await q.flush(async () => ({ ok: false, status: 400 }));
  assert.deepEqual(r, { sent: 0, remaining: 1, stoppedBy: 'client' });
});
test('empty queue does not call transport', async () => {
  const q = new EventOutbox(memoryStore()); let called = false;
  const r = await q.flush(async () => { called = true; return { ok: true }; });
  assert.equal(called, false); assert.equal(r.stoppedBy, 'empty');
});
test('HTTP transport posts with same-origin cookies and does not send client secrets', async () => {
  let captured: any;
  const send = eventHttpTransport((async (url, init) => { captured = { url, init }; return new Response(null, { status: 200 }); }) as any);
  assert.deepEqual(await send(event('key')), { ok: true });
  assert.equal(captured.url, '/api/system/events.emit');
  assert.equal(captured.init.credentials, 'same-origin');
  assert.equal(captured.init.method, 'POST');
  assert.ok(!JSON.stringify(captured.init.headers).toLowerCase().includes('authorization'));
});
