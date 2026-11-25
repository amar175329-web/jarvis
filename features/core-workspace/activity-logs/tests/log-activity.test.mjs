import test from 'node:test';
import assert from 'node:assert/strict';
import { logActivity } from '../src/log-activity.ts';

test('logActivity writes only allow-listed metadata and redacts private fields', async () => {
  let saved;
  const result = await logActivity({
    actor: 'owner',
    action: 'history.messages.list',
    target: 'papa ki bimari',
    why: 'password is hunter2',
    detail: { why: 'metformin lena', status: 'opened', content: 'password is hunter2', count: 3 },
    ok: true,
  }, {
    insert: async (row) => { saved = row; return { id: 17 }; },
  });
  assert.deepEqual(result, { ok: true, id: 17 });
  assert.equal(saved.target, 'private_item');
  assert.equal(saved.detail.why, 'Private detail hidden');
  assert.equal(saved.detail.status, 'opened');
  assert.equal(saved.detail.count, 3);
  assert.equal('content' in saved.detail, false);
  assert.equal(JSON.stringify(saved).includes('hunter2'), false);
  assert.equal(JSON.stringify(saved).includes('metformin'), false);
});

test('logActivity rejects invalid actor/action and fails closed when insert fails', async () => {
  const invalid = await logActivity({
    actor: 'random user', action: 'not an action', why: 'safe', ok: true,
  }, { insert: async () => ({ id: 1 }) });
  assert.deepEqual(invalid, { ok: false, code: 'bad_request' });

  const unavailable = await logActivity({
    actor: 'owner', action: 'tasks.create', why: 'Owner created task.', ok: true,
  }, { insert: async () => { throw new Error('database unavailable'); } });
  assert.deepEqual(unavailable, { ok: false, code: 'unavailable' });
});
