import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executePower, type DecisionLogEntry } from '../src/executor.ts';
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

test('executePower: executes run() when allowed and kill switch is OFF', async () => {
  const store = mockStore({ kill: false, epoch: 1 });
  let ran = false;
  let log: DecisionLogEntry | null = null;

  const res = await executePower({
    reg,
    powerId: 'terminal-strip.display',
    store,
    ownerId: OWNER,
    run: async () => {
      ran = true;
      return { output: 'displayed' };
    },
    onDecisionLog: (entry) => {
      log = entry;
    },
  });

  assert.equal(ran, true);
  assert.equal(res.executed, true);
  assert.deepEqual(res.result, { output: 'displayed' });
  assert.equal(res.gate.allow, true);
  assert.equal(res.gate.mode, 'act_silent');
  assert.ok(log);
  assert.equal(log!.executed, true);
  assert.equal(log!.powerId, 'terminal-strip.display');
  assert.equal(typeof log!.durationMs, 'number');
});

test('executePower: run() NEVER runs when kill switch is ON', async () => {
  const store = mockStore({ kill: true, epoch: 2 });
  let ran = false;
  let log: DecisionLogEntry | null = null;

  const res = await executePower({
    reg,
    powerId: 'terminal-strip.display',
    store,
    ownerId: OWNER,
    run: async () => {
      ran = true;
      return 'should-not-run';
    },
    onDecisionLog: (entry) => {
      log = entry;
    },
  });

  assert.equal(ran, false);
  assert.equal(res.executed, false);
  assert.equal(res.gate.allow, false);
  assert.equal(res.gate.mode, 'deny');
  assert.equal(res.gate.reason, 'kill switch is ON');
  assert.ok(log);
  assert.equal(log!.executed, false);
});

test('executePower: run() NEVER runs when kill switch is unreadable / throws', async () => {
  const store = mockStore(null, true);
  let ran = false;
  let log: DecisionLogEntry | null = null;

  const res = await executePower({
    reg,
    powerId: 'terminal-strip.display',
    store,
    ownerId: OWNER,
    run: async () => {
      ran = true;
      return 'should-not-run';
    },
    onDecisionLog: (entry) => {
      log = entry;
    },
  });

  assert.equal(ran, false);
  assert.equal(res.executed, false);
  assert.equal(res.gate.allow, false);
  assert.equal(res.gate.mode, 'deny');
  assert.match(res.gate.reason, /unreadable/);
  assert.ok(log);
  assert.equal(log!.executed, false);
});

test('executePower: run() NEVER runs for L2 (ask_confirm) without confirmation', async () => {
  const store = mockStore({ kill: false, epoch: 1 });
  let ran = false;
  let log: DecisionLogEntry | null = null;

  // memory.forget is L2
  const res = await executePower({
    reg,
    powerId: 'memory.forget',
    store,
    ownerId: OWNER,
    confirmed: false,
    run: async () => {
      ran = true;
      return 'forgotten';
    },
    onDecisionLog: (entry) => {
      log = entry;
    },
  });

  assert.equal(ran, false);
  assert.equal(res.executed, false);
  assert.equal(res.gate.allow, true);
  assert.equal(res.gate.mode, 'ask_confirm');
  assert.ok(res.error);
  assert.match(res.error!.message, /requires explicit confirmation/);
  assert.ok(log);
  assert.equal(log!.executed, false);
  assert.match(log!.error!, /confirmation/);
});

test('executePower: run() executes for L2 when confirmed: true', async () => {
  const store = mockStore({ kill: false, epoch: 1 });
  let ran = false;
  let log: DecisionLogEntry | null = null;

  const res = await executePower({
    reg,
    powerId: 'memory.forget',
    store,
    ownerId: OWNER,
    confirmed: true,
    run: async () => {
      ran = true;
      return 'deleted memory';
    },
    onDecisionLog: (entry) => {
      log = entry;
    },
  });

  assert.equal(ran, true);
  assert.equal(res.executed, true);
  assert.equal(res.result, 'deleted memory');
  assert.equal(res.gate.mode, 'ask_confirm');
  assert.ok(log);
  assert.equal(log!.executed, true);
});

test('executePower: run() NEVER runs for L0 or L1 powers', async () => {
  const store = mockStore({ kill: false, epoch: 1 });
  let ran = false;

  // L0 power: memory.forget-all (autonomy 0)
  const res = await executePower({
    reg,
    powerId: 'memory.forget-all',
    store,
    ownerId: OWNER,
    confirmed: true,
    run: async () => {
      ran = true;
      return 'wiped';
    },
  });

  assert.equal(ran, false);
  assert.equal(res.executed, false);
  assert.equal(res.gate.allow, false);
  assert.equal(res.gate.mode, 'observe');
});

test('executePower: records error in decision log when run() throws', async () => {
  const store = mockStore({ kill: false, epoch: 1 });
  let log: DecisionLogEntry | null = null;

  const res = await executePower({
    reg,
    powerId: 'terminal-strip.display',
    store,
    ownerId: OWNER,
    run: async () => {
      throw new Error('display hardware disconnected');
    },
    onDecisionLog: (entry) => {
      log = entry;
    },
  });

  assert.equal(res.executed, false);
  assert.ok(res.error);
  assert.match(res.error!.message, /hardware disconnected/);
  assert.ok(log);
  assert.equal(log!.executed, false);
  assert.equal(log!.error, 'display hardware disconnected');
});

// BUGFIX TESTS (LEAD P7B):
// (a) run chala + log throw -> executed true, run sirf 1 baar
test('executePower bugfix (a): run executed once even if onDecisionLog throws, executed stays true', async () => {
  const store = mockStore({ kill: false, epoch: 1 });
  let runCount = 0;

  const res = await executePower({
    reg,
    powerId: 'terminal-strip.display',
    store,
    ownerId: OWNER,
    run: async () => {
      runCount++;
      return { status: 'sent' };
    },
    onDecisionLog: async () => {
      throw new Error('remote audit DB connection timeout');
    },
  });

  assert.equal(runCount, 1, 'run() must execute exactly once');
  assert.equal(res.executed, true, 'res.executed must remain true even when logging fails');
  assert.deepEqual(res.result, { status: 'sent' });
  assert.equal(res.logError, 'remote audit DB connection timeout');
  assert.equal(res.decisionLog.logError, 'remote audit DB connection timeout');
  assert.equal(res.decisionLog.executed, true);
});

// (b) kill ON + log throw -> executed false, exception nahi phooti
test('executePower bugfix (b): kill ON + onDecisionLog throws -> executed false, no unhandled exception', async () => {
  const store = mockStore({ kill: true, epoch: 2 });
  let runCount = 0;

  const res = await executePower({
    reg,
    powerId: 'terminal-strip.display',
    store,
    ownerId: OWNER,
    run: async () => {
      runCount++;
      return 'must-not-run';
    },
    onDecisionLog: async () => {
      throw new Error('logger disk full');
    },
  });

  assert.equal(runCount, 0, 'run() must not execute when kill is ON');
  assert.equal(res.executed, false);
  assert.equal(res.gate.allow, false);
  assert.equal(res.gate.mode, 'deny');
  assert.equal(res.logError, 'logger disk full');
  assert.equal(res.decisionLog.logError, 'logger disk full');
  assert.equal(res.decisionLog.executed, false);
});
