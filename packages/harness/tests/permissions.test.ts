import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkPowerPermission } from '../src/permissions.ts';
import { makeRegistry, type Power } from '../../brain/src/power-registry.ts';
import type { KillSwitchStore, KillStateRecord } from '../../safety/src/index.ts';

const seed = JSON.parse(readFileSync(new URL('../../brain/data/powers.seed.json', import.meta.url), 'utf8')) as Power[];
const reg = makeRegistry(seed);
const OWNER = '00000000-0000-4000-8000-00000000000a';

function mockStore(state: Partial<KillStateRecord> | null, throwError = false): KillSwitchStore {
  return {
    read: async () => {
      if (throwError) throw new Error('database down');
      if (!state) return null;
      return { kill: state.kill ?? false, epoch: state.epoch ?? 1, changed_at: new Date().toISOString() };
    },
    write: async () => null,
  };
}

test('allows safe power when kill switch is OFF (L4 act_silent)', async () => {
  const store = mockStore({ kill: false, epoch: 1 });
  const res = await checkPowerPermission(reg, 'terminal-strip.display', store, OWNER);
  assert.equal(res.allow, true);
  assert.equal(res.mode, 'act_silent');
  assert.equal(res.level, 4);
});

test('allows read power when kill switch is OFF (L3 act_then_tell)', async () => {
  const store = mockStore({ kill: false, epoch: 1 });
  const res = await checkPowerPermission(reg, 'browser.read-page', store, OWNER);
  assert.equal(res.allow, true);
  assert.equal(res.mode, 'act_then_tell');
  assert.equal(res.level, 3);
});

test('denies all powers when kill switch is ON', async () => {
  const store = mockStore({ kill: true, epoch: 2 });
  const res = await checkPowerPermission(reg, 'terminal-strip.display', store, OWNER);
  assert.equal(res.allow, false);
  assert.equal(res.mode, 'deny');
  assert.equal(res.reason, 'kill switch is ON');
});

test('fail-closed: denies powers when kill switch store throws / is unreadable', async () => {
  const store = mockStore(null, true);
  const res = await checkPowerPermission(reg, 'terminal-strip.display', store, OWNER);
  assert.equal(res.allow, false);
  assert.equal(res.mode, 'deny');
  assert.equal(res.reason, 'kill switch unreadable: treated as ON');
});

test('fail-closed: denies powers when kill state record is missing', async () => {
  const store = mockStore(null, false);
  const res = await checkPowerPermission(reg, 'terminal-strip.display', store, OWNER);
  assert.equal(res.allow, false);
  assert.equal(res.mode, 'deny');
  assert.equal(res.reason, 'kill switch unreadable: treated as ON');
});

test('memory.forget is L2 and requires confirmation', async () => {
  const store = mockStore({ kill: false, epoch: 1 });
  const res = await checkPowerPermission(reg, 'memory.forget', store, OWNER);
  assert.equal(res.allow, true);
  assert.equal(res.mode, 'ask_confirm');
  assert.equal(res.level, 2);
  assert.equal(res.reason, 'L2: act only after Amit confirms');
});

test('unknown power is denied fail-closed', async () => {
  const store = mockStore({ kill: false, epoch: 1 });
  const res = await checkPowerPermission(reg, 'unknown.power.id', store, OWNER);
  assert.equal(res.allow, false);
  assert.equal(res.mode, 'deny');
  assert.match(res.reason, /unknown power/);
});
