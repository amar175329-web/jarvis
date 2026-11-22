import test from 'node:test';
import assert from 'node:assert/strict';
import { createReminderFireHandler } from '../src/fire-handler.mjs';

const makeJob = (reminder) => ({
  job: { owner_id: 'owner-1', payload: { reminder_id: reminder.id } },
  signal: new AbortController().signal,
  log: { info() {} },
});

test('fire handler dispatches only through reminders.fire power and marks one-shot reminder fired', async () => {
  const calls = [];
  const handler = createReminderFireHandler({
    findReminder: async () => ({ id: '123e4567-e89b-42d3-a456-426614174000', state: 'pending', approved_decision_id: '223e4567-e89b-42d3-a456-426614174000', remind_at: '2020-01-01T00:00:00Z', repeat_rule: null }),
    verifyApproval: async ({ powerId }) => powerId === 'reminders.create',
    runPower: async ({ powerId, confirmed, run }) => { calls.push(powerId); assert.equal(confirmed, true); return { executed: true, result: await run() }; },
    sendNotification: async ({ idempotencyKey }) => { assert.match(idempotencyKey, /^reminder:123e4567-e89b-42d3-a456-426614174000:/); calls.push('notification'); },
    markFired: async (args) => calls.push(args.keepPending ? 'keep-pending' : 'fired'),
    requeue: async () => calls.push('requeue'),
  });
  const result = await handler(makeJob({ id: '123e4567-e89b-42d3-a456-426614174000' }));
  assert.deepEqual(calls, ['reminders.fire', 'notification', 'fired']);
  assert.equal(result.fired, true);
  assert.equal(result.recurring, false);
});

test('repeat notification requeues and advances local schedule inside the registered power', async () => {
  const calls = [];
  const handler = createReminderFireHandler({
    findReminder: async () => ({ id: '123e4567-e89b-42d3-a456-426614174000', state: 'pending', approved_decision_id: '223e4567-e89b-42d3-a456-426614174000', remind_at: '2026-11-22T01:30:00Z', repeat_rule: 'FREQ=DAILY', time_zone: 'Asia/Kolkata' }),
    verifyApproval: async ({ powerId }) => powerId === 'reminders.create',
    runPower: async ({ run }) => ({ executed: true, result: await run() }),
    sendNotification: async () => calls.push('notification'),
    markFired: async (args) => calls.push(args.keepPending ? args.nextAt : 'fired'),
    requeue: async (args) => calls.push(args.runAt.toISOString()),
    now: () => new Date('2026-11-22T02:00:00.000Z').getTime(),
  });
  const result = await handler(makeJob({ id: '123e4567-e89b-42d3-a456-426614174000' }));
  assert.deepEqual(calls, ['notification', '2026-11-23T01:30:00.000Z', '2026-11-23T01:30:00.000Z']);
  assert.equal(result.recurring, true);
});

test('blocked or missing registered power cannot mark a reminder fired', async () => {
  let marked = false;
  const handler = createReminderFireHandler({
    findReminder: async () => ({ id: '123e4567-e89b-42d3-a456-426614174000', state: 'pending', approved_decision_id: '223e4567-e89b-42d3-a456-426614174000', remind_at: '2020-01-01T00:00:00Z', repeat_rule: null }),
    verifyApproval: async ({ powerId }) => powerId === 'reminders.create',
    runPower: async () => ({ executed: false }), sendNotification: async () => undefined,
    markFired: async () => { marked = true; }, requeue: async () => undefined,
  });
  await assert.rejects(() => handler(makeJob({ id: '123e4567-e89b-42d3-a456-426614174000' })), /blocked/);
  assert.equal(marked, false);
});

test('fire handler fails closed if power adapter does not positively report execution', async () => {
  let marked = false;
  const handler = createReminderFireHandler({
    findReminder: async () => ({ id: '123e4567-e89b-42d3-a456-426614174000', state: 'pending', approved_decision_id: '223e4567-e89b-42d3-a456-426614174000', remind_at: '2020-01-01T00:00:00Z', repeat_rule: null }),
    verifyApproval: async ({ powerId }) => powerId === 'reminders.create',
    runPower: async () => undefined, sendNotification: async () => undefined,
    markFired: async () => { marked = true; }, requeue: async () => undefined,
  });
  await assert.rejects(() => handler(makeJob({ id: '123e4567-e89b-42d3-a456-426614174000' })), /blocked/);
  assert.equal(marked, false);
});

test('fire handler refuses a reminder without a verified owner approval record', async () => {
  let sent = false;
  const handler = createReminderFireHandler({
    findReminder: async () => ({ id: '123e4567-e89b-42d3-a456-426614174000', state: 'pending', approved_decision_id: '223e4567-e89b-42d3-a456-426614174000', remind_at: '2020-01-01T00:00:00Z', repeat_rule: null }),
    verifyApproval: async () => false, runPower: async () => ({ executed: true }),
    sendNotification: async () => { sent = true; }, markFired: async () => undefined, requeue: async () => undefined,
  });
  await assert.rejects(() => handler(makeJob({ id: '123e4567-e89b-42d3-a456-426614174000' })), /approval/);
  assert.equal(sent, false);
});
