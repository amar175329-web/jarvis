import test from 'node:test';
import assert from 'node:assert/strict';
import { readKillSwitch, setKillSwitch, type KillSwitchStore } from '../src/index.ts';

function store(initial: { kill: boolean; epoch: number } | null = { kill: false, epoch: 0 }) {
  let state = initial;
  const writes: { kill: boolean; changedBy: string }[] = [];
  const s: KillSwitchStore = {
    async read() { return state; },
    async write(_owner, kill, changedBy) {
      if (!state) return null;
      if (state.kill !== kill) state = { kill, epoch: state.epoch + 1 };
      writes.push({ kill, changedBy });
      return state;
    },
  };
  return { s, writes, current: () => state };
}

const owner = { kind: 'owner' as const, ownerId: 'owner-1', email: 'amit@example.com' };
const device = { kind: 'device' as const, ownerId: 'owner-1', deviceId: 'phone-1' };

test('read returns the real kill state', async () => {
  const x = store({ kill: false, epoch: 4 });
  assert.deepEqual(await readKillSwitch(x.s, owner.ownerId), { ok: true, state: { kill: false, epoch: 4 } });
});
test('missing/unreadable kill state fails closed as ON', async () => {
  const missing = store(null);
  assert.deepEqual(await readKillSwitch(missing.s, owner.ownerId), { ok: false, code: 'unavailable', failClosed: { kill: true, epoch: -1 } });
  const broken: KillSwitchStore = { read: async () => { throw new Error('db down'); }, write: async () => null };
  assert.equal((await readKillSwitch(broken, owner.ownerId)).ok, false);
  assert.equal((await setKillSwitch(broken, owner, false)).code, 'unavailable');
});
test('device can turn kill ON', async () => {
  const x = store();
  const r = await setKillSwitch(x.s, device, true);
  assert.ok(r.ok && r.state.kill && r.state.epoch === 1);
  assert.deepEqual(x.writes[0], { kill: true, changedBy: 'device:phone-1' });
});
test('device can never turn kill OFF', async () => {
  const x = store({ kill: true, epoch: 2 });
  assert.deepEqual(await setKillSwitch(x.s, device, false), { ok: false, code: 'forbidden' });
  assert.equal(x.writes.length, 0);
  assert.equal(x.current()?.kill, true);
});
test('only owner can turn kill OFF', async () => {
  const x = store({ kill: true, epoch: 2 });
  const r = await setKillSwitch(x.s, owner, false);
  assert.ok(r.ok && !r.state.kill && r.state.epoch === 3);
  assert.equal(x.writes[0].changedBy, 'owner:amit@example.com');
});
test('write failure never reports kill OFF', async () => {
  const broken: KillSwitchStore = { read: async () => ({ kill: true, epoch: 1 }), write: async () => { throw new Error('db down'); } };
  const r = await setKillSwitch(broken, owner, false);
  assert.deepEqual(r, { ok: false, code: 'unavailable', failClosed: { kill: true, epoch: -1 } });
});
