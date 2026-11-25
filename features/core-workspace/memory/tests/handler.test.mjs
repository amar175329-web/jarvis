import test from 'node:test';
import assert from 'node:assert/strict';
import { classify as classifyMemoryText } from '../../../../packages/memory/src/classify.ts';
import { findSecrets as findMemorySecrets } from '../../../../packages/memory/src/redact.ts';
import { decide as decideMemoryCandidate } from '../../../../packages/memory/src/policy.ts';
import { classifyWorkspaceContent } from '../src/privacy.mjs';
import { handle as memoryHandle } from '../src/handler.mjs';

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function context(overrides = {}) {
  const calls = { powers: [], updates: [], savedCandidate: null, directCreated: null, policyCandidate: null };
  const value = {
    ownerId: OWNER,
    // These are the real package exports, injected under the adapter names the handler consumes.
    classifyMemoryText,
    findMemorySecrets,
    async runPower(args) { calls.powers.push(args); return args.run(); },
    async decideMemoryCandidate(candidate) { calls.policyCandidate = candidate; return { verdict: 'save', kind: 'fact', title: candidate.title || candidate.text, body: candidate.text, source: 'amit_said', confidence: 1, why: candidate.why, subject: 'amit', tags: [], expires_at: null }; },
    ...overrides,
  };
  return { value, calls };
}
function req(path, body) { return new Request(`https://jarvis.test${path}`, body === undefined ? { method: 'POST' } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
function row(overrides = {}) {
  return { id: ID, kind: 'fact', title: 'Ordinary memory', body: 'A normal preference', source: 'amit_said', confidence: 1, why: 'Amit ne bataya', tier: 'normal', private: false, subject: 'amit', subject_key: null, tags: [], pinned: false, status: 'active', superseded_by: null, valid_to: null, revision: 1, ref_type: null, ref_id: null, tokens: [], embedding_model: null, embedded_at: null, created_at: '2026-11-22T10:00:00Z', updated_at: '2026-11-22T10:00:00Z', expires_at: null, ...overrides };
}

test('shared S08 classifier plus packages/memory categories classify T2 without another classifier', () => {
  const { value } = context();
  assert.equal(classifyWorkspaceContent(value, ['Dawai schedule']).private, true);
  assert.equal(classifyWorkspaceContent(value, ['salary is 50000 rupees']).private, true);
  assert.equal(classifyWorkspaceContent(value, ['my mother prefers Hindi']).private, true);
  assert.equal(classifyWorkspaceContent(value, ['project launch date']).private, false);
});

test('memory.list masks stored and legacy private entries with badge and no plaintext', async () => {
  const normal = row();
  const storedPrivate = row({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', title: 'Health detail - do not leak', body: 'Dawai at night', private: true, tier: 'sensitive' });
  const legacy = row({ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', title: 'Meri maa', body: 'Family details stay private' });
  const { value, calls } = context({
    memoryStore: { async list() { return { items: [normal, storedPrivate, legacy], total: 3 }; } },
    memoryService: {},
  });
  const response = await memoryHandle('memory.list', req('/api/memory/memory.list'), value);
  const text = await response.text(); const parsed = JSON.parse(text);
  assert.equal(response.status, 200);
  assert.equal(parsed.data.normal.length, 1);
  assert.equal(parsed.data.private.length, 2);
  assert.equal(parsed.data.private[0].label, 'Private item');
  assert.equal(parsed.data.private[0].badge, 'private');
  assert.equal(text.includes('Health detail'), false);
  assert.equal(text.includes('Dawai at night'), false);
  assert.equal(text.includes('Family details'), false);
  assert.equal(calls.powers[0].readOnly, true);
  assert.equal(calls.powers[0].powerId, 'memory.list');
});

test('shared-guard private memory is policy-checked then inserted directly as T2 without normal service/event path', async () => {
  const initial = row({ title: 'Medicine', body: 'Dawai at night', private: true, tier: 'sensitive' });
  const { value, calls } = context({
    memoryStore: { async create(input) { calls.directCreated = input; return initial; } },
    memoryService: { async remember() { assert.fail('private content must not pass through normal memory service'); } },
  });
  const response = await memoryHandle('memory.remember', req('/api/memory/memory.remember', { title: 'Medicine', text: 'Dawai at night', confirmed: true }), value);
  const text = await response.text(); const parsed = JSON.parse(text);
  assert.equal(response.status, 200);
  assert.equal(parsed.data.item.badge, 'private');
  assert.equal(text.includes('Dawai at night'), false);
  assert.equal(calls.directCreated.private, true);
  assert.equal(calls.directCreated.tier, 'sensitive');
  assert.deepEqual(calls.directCreated.tokens, []);
  assert.equal(calls.directCreated.pinned, false);
  assert.equal(calls.policyCandidate.origin, 'ui');
  assert.equal(calls.powers[0].confirmed, true);
});

test('raw password-like secrets are refused before MemoryService is called', async () => {
  const { value } = context({ memoryStore: {}, memoryService: { async remember() { assert.fail('secret must not be stored'); } } });
  const response = await memoryHandle('memory.remember', req('/api/memory/memory.remember', { text: 'password is ExampleSecret!9', confirmed: true }), value);
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error.code, 'raw_secret_refused');
});

test('missing S22 power gate fails closed before storage access', async () => {
  const { value } = context({ memoryStore: { async list() { assert.fail('must not query'); } }, memoryService: {} });
  delete value.runPower;
  const response = await memoryHandle('memory.list', req('/api/memory/memory.list'), value);
  assert.equal(response.status, 503);
});


test('handler receives real packages/memory classify + findSecrets adapters for five Hinglish privacy cases', async () => {
  const privateCases = ['metformin lena', 'papa ki bimari'];
  for (const text of privateCases) {
    const calls = { directCreated: null, normalRemembered: false };
    const { value } = context({
      memoryStore: {
        async create(input) {
          calls.directCreated = input;
          return row({ title: input.title, body: input.body, tier: input.tier, private: input.private });
        },
      },
      memoryService: {
        async remember() { calls.normalRemembered = true; assert.fail('private text must bypass normal memory service'); },
      },
      decideMemoryCandidate(candidate) {
        return decideMemoryCandidate(candidate, { kill: 'off', now: new Date('2026-11-23T04:00:00.000Z') });
      },
    });
    const response = await memoryHandle('memory.remember', req('/api/memory/memory.remember', { text, confirmed: true }), value);
    const payloadText = await response.text();
    assert.equal(response.status, 200, `${text} should be kept in the private T2 path`);
    assert.equal(JSON.parse(payloadText).data.item.badge, 'private');
    assert.equal(payloadText.includes(text), false, 'private input must not be returned as plaintext');
    assert.equal(calls.directCreated.tier, 'sensitive');
    assert.equal(calls.directCreated.private, true);
    assert.deepEqual(calls.directCreated.tokens, []);
    assert.equal(calls.normalRemembered, false);
  }

  for (const text of ['password is hunter2', 'OTP 482913']) {
    let stored = false;
    const { value } = context({
      memoryStore: { async create() { stored = true; assert.fail('raw secret must never be stored'); } },
      memoryService: { async remember() { stored = true; assert.fail('raw secret must never reach MemoryService'); } },
    });
    const response = await memoryHandle('memory.remember', req('/api/memory/memory.remember', { text, confirmed: true }), value);
    assert.equal(response.status, 422, `${text} must be refused by real findSecrets()`);
    assert.equal((await response.json()).error.code, 'raw_secret_refused');
    assert.equal(stored, false);
  }

  const { value } = context({
    memoryStore: {},
    memoryService: {
      async remember(candidate) {
        const verdict = decideMemoryCandidate(candidate, { kill: 'off', now: new Date('2026-11-23T04:00:00.000Z') });
        return { verdict, memory: row({ title: verdict.title, body: verdict.body, tier: verdict.tier, private: verdict.private }) };
      },
    },
  });
  const normalResponse = await memoryHandle('memory.remember', req('/api/memory/memory.remember', { text: 'doodh lana', confirmed: true }), value);
  const normalPayload = await normalResponse.json();
  assert.equal(normalResponse.status, 200);
  assert.equal(normalPayload.data.item.body, 'doodh lana');
  assert.equal(normalPayload.data.item.badge, undefined);
});
