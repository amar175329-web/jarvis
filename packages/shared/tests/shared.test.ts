import test from 'node:test';
import assert from 'node:assert/strict';
import { assertNotKilled, readKillFailClosed, KilledError, backoffMs, sleep, fixedClock, NonRetryableError } from '../src/index.ts';

test('kill switch OFF passes', async () => {
  const s = await assertNotKilled({ read: async () => ({ kill: false, epoch: 2 }) });
  assert.equal(s.epoch, 2);
});
test('kill switch ON throws KilledError', async () => {
  await assert.rejects(assertNotKilled({ read: async () => ({ kill: true, epoch: 1 }) }), KilledError);
});
test('fail-closed: unreadable kill switch counts as ON', async () => {
  assert.equal((await readKillFailClosed({ read: async () => { throw new Error('db down'); } })).kill, true);
  assert.equal((await readKillFailClosed({ read: async () => ({}) as any })).kill, true);
  assert.equal((await readKillFailClosed({ read: async () => ({ kill: 'no', epoch: 0 }) as any })).kill, true);
  await assert.rejects(assertNotKilled({ read: async () => { throw new Error('x'); } }), KilledError);
});
test('backoff grows, is capped, and has jitter between half and full', () => {
  assert.equal(backoffMs(1, 1000, 60000, () => 1), 1000);
  assert.equal(backoffMs(1, 1000, 60000, () => 0), 500);
  assert.equal(backoffMs(3, 1000, 60000, () => 1), 4000);
  assert.equal(backoffMs(20, 1000, 60000, () => 1), 60000);
});
test('sleep ends early when aborted', async () => {
  const c = new AbortController(); const t0 = Date.now(); setTimeout(() => c.abort(), 20);
  await sleep(5000, c.signal); assert.ok(Date.now() - t0 < 1000);
});
test('fixed clock and NonRetryableError', () => {
  assert.equal(fixedClock('2026-11-07T00:00:00Z').now().toISOString(), '2026-11-07T00:00:00.000Z');
  assert.equal(new NonRetryableError('x').name, 'NonRetryableError');
});
