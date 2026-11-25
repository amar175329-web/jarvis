import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countOpenTasks, splitByState, replaceById, removeById,
  runOptimisticMutation, createDeferredActionQueue, createAutoDismissTimer, friendlyActionError,
} from '../src/optimistic-actions.mjs';

function manualTimers() {
  let next = 1;
  const timers = new Map();
  return {
    timers,
    setTimer(fn, ms) { const id = next++; timers.set(id, { fn, ms }); return id; },
    clearTimer(id) { timers.delete(id); },
    fire(id) { const timer = timers.get(id); if (!timer) return false; timers.delete(id); timer.fn(); return true; },
  };
}

test('optimistic update changes only the target row before the server promise resolves', async () => {
  let rows = [{ id: 't1', status: 'todo', title: 'Old' }, { id: 't2', status: 'todo', title: 'Keep' }];
  let finishRequest;
  const pending = runOptimisticMutation({
    snapshot: () => rows.find((row) => row.id === 't1'),
    optimistic: () => { rows = replaceById(rows, 't1', { ...rows[0], title: 'New' }); },
    request: () => new Promise((resolve) => { finishRequest = resolve; }),
    commit: (result) => { rows = replaceById(rows, 't1', result); },
    rollback: (before) => { rows = replaceById(rows, 't1', before); },
  });
  assert.equal(rows[0].title, 'New');
  assert.equal(rows[1].title, 'Keep');
  finishRequest({ id: 't1', status: 'todo', title: 'Server value' });
  const result = await pending;
  assert.equal(result.ok, true);
  assert.equal(rows[0].title, 'Server value');
  assert.equal(rows[1].title, 'Keep');
});

test('optimistic state rolls back to the exact snapshot on server failure', async () => {
  let rows = [{ id: 't1', status: 'todo', title: 'Walk' }];
  const result = await runOptimisticMutation({
    snapshot: () => rows.find((row) => row.id === 't1'),
    optimistic: () => { rows = replaceById(rows, 't1', { ...rows[0], status: 'done' }); },
    request: async () => { throw new Error('server refused'); },
    commit: () => {},
    rollback: (before) => { rows = replaceById(rows, before.id, before); },
  });
  assert.equal(result.ok, false);
  assert.deepEqual(rows, [{ id: 't1', status: 'todo', title: 'Walk' }]);
});

test('tab counts count only todo/doing tasks; done/cancelled are archive rows', () => {
  const tasks = [
    { id: '1', status: 'todo' }, { id: '2', status: 'doing' },
    { id: '3', status: 'done' }, { id: '4', status: 'cancelled' },
  ];
  assert.equal(countOpenTasks(tasks), 2);
  const groups = splitByState(tasks, 'status', ['todo', 'doing']);
  assert.deepEqual(groups.active.map((item) => item.id), ['1', '2']);
  assert.deepEqual(groups.archived.map((item) => item.id), ['3', '4']);
});

test('optimistic delete removes a row; rollback can restore the same row', () => {
  const original = { id: 'r1', state: 'pending', text: 'Call' };
  let rows = [original];
  rows = removeById(rows, 'r1');
  assert.deepEqual(rows, []);
  rows = replaceById(rows, original.id, original);
  assert.deepEqual(rows, [original]);
});

test('five-second deferred cancel expires and invokes the server action at 5000ms', async () => {
  const clock = manualTimers();
  const queue = createDeferredActionQueue({ delayMs: 5000, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
  const calls = [];
  queue.schedule('task:t1', async (keepalive) => calls.push({ keepalive }), assert.fail);
  assert.equal([...clock.timers.values()][0].ms, 5000);
  assert.deepEqual(calls, []);
  clock.fire(1);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, [{ keepalive: false }]);
  assert.equal(queue.size, 0);
});

test('Undo cancels the five-second server call', async () => {
  const clock = manualTimers();
  const queue = createDeferredActionQueue({ delayMs: 5000, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
  let calls = 0;
  queue.schedule('task:t1', async () => { calls += 1; });
  assert.equal(queue.cancel('task:t1'), true);
  assert.equal(clock.timers.size, 0);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 0);
});

test('pagehide flush sends every pending action immediately with keepalive=true', async () => {
  const clock = manualTimers();
  const queue = createDeferredActionQueue({ delayMs: 5000, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
  const calls = [];
  queue.schedule('task:t1', async (keepalive) => calls.push(['t1', keepalive]));
  queue.schedule('reminder:r1', async (keepalive) => calls.push(['r1', keepalive]));
  const result = await queue.flushAll();
  assert.equal(result.every((item) => item.status === 'fulfilled'), true);
  assert.deepEqual(calls.sort(), [['r1', true], ['t1', true]]);
  assert.equal(queue.size, 0);
  assert.equal(clock.timers.size, 0);
});

test('network errors never expose browser Failed to fetch text', () => {
  assert.equal(friendlyActionError(new TypeError('Failed to fetch')), 'Network dikkat, dobara try karo');
  assert.equal(friendlyActionError({ code: 'network_error', message: 'TypeError: fetch failed' }), 'Network dikkat, dobara try karo');
});

test('successful action with unavailable returned list uses the recovery message', () => {
  assert.equal(friendlyActionError({ code: 'list_refresh_failed' }), 'Kaam ho gaya, list abhi nahi aayi');
});

test('Cancel confirmation auto-reverts after exactly five seconds', () => {
  const clock = manualTimers();
  const prompt = createAutoDismissTimer({ delayMs: 5000, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
  let dismissed = false;
  prompt.schedule(() => { dismissed = true; });
  assert.equal(prompt.active, true);
  assert.equal([...clock.timers.values()][0].ms, 5000);
  assert.equal(dismissed, false);
  clock.fire(1);
  assert.equal(dismissed, true);
  assert.equal(prompt.active, false);
});
