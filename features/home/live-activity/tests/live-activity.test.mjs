import test from 'node:test';
import assert from 'node:assert/strict';
import { projectLiveActivity, isCancellableLiveActivity } from '../src/project.mjs';
import { ACTIONS, handle, LIVE_ACTIVITY_READ_POWER, LIVE_ACTIVITY_STOP_POWER } from '../src/handler.mjs';
const OWNER = '11111111-1111-4111-8111-111111111111';
const JOB = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PHONE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const req = (action, body = {}) => new Request(`https://jarvis.test/api/tasks/${action}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

test('live activity action list is bounded and explicit', () => assert.deepEqual(ACTIONS, ['live.activity', 'live.stop']));

test('projection returns only generic labels and metadata, never task payloads or device command data', () => {
  const privatePayload = { medicine: 'metformin lena', bank: 'account 1234567890' };
  const output = projectLiveActivity({
    jobs: [{ id: JOB, kind: 'browser.search', state: 'running', created_at: '2026-11-23T06:00:00Z', payload: privatePayload, result: privatePayload, error: 'private' }, { id: JOB, kind: 'unknown.private', state: 'running' }],
    phoneCommands: [{ id: PHONE, state: 'queued', created_at: '2026-11-23T06:01:00Z', command: privatePayload }],
  });
  assert.deepEqual(output.map((x) => x.label), ['Phone action', 'Researching the web']);
  assert.equal(JSON.stringify(output).includes('metformin'), false);
  assert.equal(JSON.stringify(output).includes('1234567890'), false);
  assert.equal('payload' in output[1], false);
  assert.equal(output[0].can_stop, true);
});

test('only queued activities are cancellable and list is capped at five', () => {
  assert.equal(isCancellableLiveActivity({ id: JOB, source: 'job', state: 'queued' }), true);
  assert.equal(isCancellableLiveActivity({ id: JOB, source: 'job', state: 'running' }), false);
  const jobs = Array.from({ length: 8 }, (_, i) => ({ id: `${String(i).padStart(8, '0')}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`, kind: 'code.task', state: 'queued' }));
  assert.equal(projectLiveActivity({ jobs }).length, 5);
});

test('live read delegates metadata-only owner reads behind the read power', async () => {
  let reads = [], power;
  const response = await handle('live.activity', req('live.activity'), {
    ownerId: OWNER,
    readJobs: async (args) => { reads.push(args); return [{ id: JOB, kind: 'browser.search', state: 'running', created_at: '2026-11-23T06:00:00Z' }]; },
    readPhoneCommands: async (args) => { reads.push(args); return []; },
    runPower: async (args) => { power = args; return { ok: true, result: await args.run() }; },
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(power.powerId, LIVE_ACTIVITY_READ_POWER);
  assert.match(power.why, /safe status metadata/);
  assert.deepEqual(reads.map((r) => r.columns), [['id', 'kind', 'state', 'created_at'], ['id', 'state', 'created_at']]);
  assert.equal(body.data.items[0].label, 'Researching the web');
});

test('stop requires confirmation and runs only through the L2 power wrapper', async () => {
  let power, stopped;
  const body = { id: JOB, source: 'job', confirmed: true };
  const response = await handle('live.stop', req('live.stop', body), {
    ownerId: OWNER,
    stopActivity: async (args) => { stopped = args; return { stopped: true }; },
    runPower: async (args) => { power = args; return { ok: true, result: await args.run() }; },
  });
  assert.equal(response.status, 200);
  assert.equal(power.powerId, LIVE_ACTIVITY_STOP_POWER);
  assert.equal(power.confirmed, true);
  assert.deepEqual(stopped, { ownerId: OWNER, id: JOB, source: 'job', onlyIfState: 'queued' });
});

test('stop without confirmation, missing kill/power, and non-queued conflict fail closed', async () => {
  const noConfirm = await handle('live.stop', req('live.stop', { id: JOB, source: 'job', confirmed: false }), { ownerId: OWNER, runPower: async () => ({ ok: true, result: {} }) });
  assert.equal(noConfirm.status, 409);
  let run = 0;
  const kill = await handle('live.stop', req('live.stop', { id: JOB, source: 'job', confirmed: true }), {
    ownerId: OWNER, stopActivity: async () => ({ stopped: true }), runPower: async () => ({ ok: false, status: 403, code: 'forbidden' }),
  });
  assert.equal(kill.status, 403);
  const conflict = await handle('live.stop', req('live.stop', { id: JOB, source: 'job', confirmed: true }), {
    ownerId: OWNER, stopActivity: async () => ({ stopped: false }), runPower: async (a) => { run++; return { ok: true, result: await a.run() }; },
  });
  assert.equal(conflict.status, 409);
  assert.equal(run, 1);
});
