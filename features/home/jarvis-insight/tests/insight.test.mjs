import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveInsight } from '../src/insight.mjs';
import { ACTIONS, handle, JARVIS_INSIGHT_READ_POWER } from '../src/handler.mjs';
const OWNER = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-11-23T08:00:00.000Z');
const req = () => new Request('https://jarvis.test/api/tasks/insight.summary', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } });

test('insight has only one read action', () => assert.deepEqual(ACTIONS, ['insight.summary']));

test('insight aggregates safe tasks and allowlisted activity into seven bars', () => {
  const result = deriveInsight({
    now: NOW,
    tasks: [
      { title: 'Prepare slides', status: 'done', created_at: '2026-11-22T10:00:00+05:30', completed_at: '2026-11-22T11:00:00+05:30' },
      { title: 'Metformin lena', status: 'done', created_at: '2026-11-22T10:00:00+05:30', completed_at: '2026-11-22T11:00:00+05:30' },
      { title: 'Write notes', notes: 'Dad account details', status: 'done', created_at: '2026-11-22T10:00:00+05:30', completed_at: '2026-11-22T11:00:00+05:30' },
    ],
    activity: [
      { action: 'browser.search', actor: 'web', target: '12345678-1234-1234-1234-123456789012', ts: '2026-11-21T10:00:00Z', detail: {} },
      { action: 'browser.search', actor: 'web', ts: '2026-11-21T10:00:00Z', detail: { note: 'private family detail' } },
      { action: 'custom.private', actor: 'web', ts: '2026-11-21T10:00:00Z' },
    ],
  });
  assert.equal(result.bars.length, 7);
  assert.equal(result.safe_task_count, 1);
  assert.equal(result.completed_task_count, 1);
  assert.equal(result.bars.some((bar) => bar.public_actions > 0), true);
  assert.equal(JSON.stringify(result).includes('Metformin'), false);
  assert.equal(JSON.stringify(result).includes('family'), false);
});

test('private or uncertain task titles do not contribute to any count', () => {
  const result = deriveInsight({ now: NOW, tasks: [
    { title: 'Salary and bank account balance', status: 'done', created_at: '2026-11-22T10:00:00Z', completed_at: '2026-11-22T11:00:00Z' },
    { title: 'Dad hospital visit', status: 'done', created_at: '2026-11-22T10:00:00Z', completed_at: '2026-11-22T11:00:00Z' },
    { title: 'Call sister about school', status: 'done', created_at: '2026-11-22T10:00:00Z', completed_at: '2026-11-22T11:00:00Z' },
    { title: 'Review salary plan', status: 'done', created_at: '2026-11-22T10:00:00Z', completed_at: '2026-11-22T11:00:00Z' },
  ], activity: [] });
  assert.equal(result.safe_task_count, 0);
  assert.equal(result.completed_task_count, 0);
});

test('handler reads only selected safe metadata behind its registered power', async () => {
  let readCalls = [], power;
  const response = await handle('insight.summary', req(), {
    ownerId: OWNER,
    readTasks: async (args) => { readCalls.push(args); return [{ title: 'Study', status: 'done', completed_at: '2026-11-23T07:00:00Z' }]; },
    readActivity: async (args) => { readCalls.push(args); return []; },
    runPower: async (args) => { power = args; return { ok: true, result: await args.run() }; },
    now: NOW,
  });
  assert.equal(response.status, 200);
  assert.equal(power.powerId, JARVIS_INSIGHT_READ_POWER);
  assert.match(power.why, /local deterministic insight/);
  assert.deepEqual(readCalls.map((x) => x.columns), [
    ['title', 'notes', 'status', 'created_at', 'completed_at', 'updated_at'], ['action', 'ts', 'actor', 'target', 'detail'],
  ]);
  assert.equal((await response.json()).data.bars.length, 7);
});

test('kill/power or owner reader unavailable fails closed', async () => {
  const response = await handle('insight.summary', req(), {
    ownerId: OWNER, readTasks: async () => [], readActivity: async () => [],
    runPower: async () => ({ ok: false, status: 403, code: 'forbidden' }),
  });
  assert.equal(response.status, 403);
});
