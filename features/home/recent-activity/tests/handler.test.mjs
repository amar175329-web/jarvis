import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, RECENT_ACTIVITY_POWER, handle, sanitizeActivityEntry } from '../src/handler.mjs';

const OWNER = '11111111-1111-4111-8111-111111111111';
const TASK_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const safeRow = (overrides = {}) => ({
  id: 12,
  ts: '2026-11-22T09:10:00.000Z',
  actor: 'api',
  action: 'tasks.complete',
  target: TASK_ID,
  detail: {},
  ok: true,
  ...overrides,
});

function request(body = '{}', method = 'POST') {
  return new Request('https://jarvis.test/api/tasks/activity.recent', {
    method,
    headers: { 'content-type': 'application/json' },
    body: method === 'GET' ? undefined : body,
  });
}

test('only the declared activity read action is handled', async () => {
  assert.deepEqual(ACTIONS, ['activity.recent']);
  assert.equal(await handle('tasks.today', request(), {}), null);
});

test('safe known activity is reduced to a fixed display DTO', () => {
  const item = sanitizeActivityEntry(safeRow());
  assert.deepEqual(item, {
    id: '12', ts: '2026-11-22T09:10:00.000Z', label: 'Task completed', kind: 'complete', ok: true, private: false,
  });
  assert.equal('target' in item, false);
  assert.equal('detail' in item, false);
  assert.equal('actor' in item, false);
  assert.equal('action' in item, false);
});


test('opaque UUID target is not sent to sensitivity classifier and safe allowlisted row stays visible', () => {
  const item = sanitizeActivityEntry(safeRow({ target: '12345678-1234-1234-1234-123456789012', detail: {} }));
  assert.deepEqual(item, {
    id: '12', ts: '2026-11-22T09:10:00.000Z', label: 'Task completed', kind: 'complete', ok: true, private: false,
  });
});

test('medicine text in a non-opaque target remains hidden', () => {
  const item = sanitizeActivityEntry(safeRow({ target: 'metformin lena', detail: {} }));
  assert.equal(item.label, 'Private activity');
  assert.equal(item.kind, 'private');
  assert.equal(item.private, true);
  assert.equal(item.ts, '');
  assert.equal(JSON.stringify(item).includes('metformin'), false);
});

test('health, medicine, money and credential content is only returned as Private activity', () => {
  for (const detail of [
    { summary: 'doctor appointment and medicine' },
    { summary: 'paracetamol at 8 pm' },
    { summary: 'salary and bank account balance' },
    { summary: 'password reset OTP 123456' },
  ]) {
    const item = sanitizeActivityEntry(safeRow({ detail }));
    assert.equal(item.label, 'Private activity');
    assert.equal(item.kind, 'private');
    assert.equal(item.private, true);
    assert.equal(item.ts, '');
    assert.equal(JSON.stringify(item).includes(JSON.stringify(detail)), false);
  }
});

test('family/private free text and unknown actor/action shapes fail closed even if classifier misses wording', () => {
  const family = sanitizeActivityEntry(safeRow({ detail: { summary: 'Aunt called about the family visit' } }));
  const actor = sanitizeActivityEntry(safeRow({ actor: 'Mom' }));
  const unknown = sanitizeActivityEntry(safeRow({ action: 'custom.private-note' }));
  assert.equal(family.label, 'Private activity');
  assert.equal(actor.label, 'Private activity');
  assert.equal(unknown.label, 'Private activity');
});

test('arbitrary target strings and malformed timestamps are not exposed', () => {
  assert.equal(sanitizeActivityEntry(safeRow({ target: 'Dad' })).label, 'Private activity');
  assert.equal(sanitizeActivityEntry(safeRow({ ts: 'not-a-date' })), null);
});

test('handler delegates access to the registered read-power wrapper and returns sanitized data only', async () => {
  let readArgs;
  let powerArgs;
  const secret = 'salary ₹123456, Dad bank balance';
  const response = await handle('activity.recent', request(), {
    ownerId: OWNER,
    readActivity: async (args) => { readArgs = args; return [safeRow({ detail: { note: secret } }), safeRow()]; },
    runPower: async (args) => {
      powerArgs = args;
      return { ok: true, result: await args.run() };
    },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(readArgs, { ownerId: OWNER, limit: 8 });
  assert.equal(powerArgs.powerId, RECENT_ACTIVITY_POWER);
  assert.equal(powerArgs.confirmed, false);
  assert.match(powerArgs.why, /privacy-filtered/);
  assert.equal(body.data.items[0].label, 'Private activity');
  assert.equal(body.data.items[1].label, 'Task completed');
  assert.equal(JSON.stringify(body).includes('salary'), false);
  assert.equal(JSON.stringify(body).includes('Dad bank'), false);
});

test('malformed request and unavailable gate fail closed', async () => {
  const invalidBody = await handle('activity.recent', request('{"limit":999}'), {
    ownerId: OWNER, readActivity: async () => [], runPower: async () => ({ ok: true, result: [] }),
  });
  assert.equal(invalidBody.status, 400);
  const noGate = await handle('activity.recent', request(), {
    ownerId: OWNER, readActivity: async () => [safeRow()], runPower: async () => ({ ok: false, status: 403, code: 'forbidden' }),
  });
  assert.equal(noGate.status, 403);
  assert.equal((await noGate.json()).ok, false);
});

test('malformed source rows are dropped without serializing content', () => {
  assert.equal(sanitizeActivityEntry(null), null);
  assert.equal(sanitizeActivityEntry('private health note'), null);
  assert.equal(sanitizeActivityEntry({ ...safeRow(), detail: { note: 'family visit' } }).label, 'Private activity');
});
