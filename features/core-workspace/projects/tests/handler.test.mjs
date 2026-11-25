import test from 'node:test';
import assert from 'node:assert/strict';
import { handle as projectsHandle } from '../src/handler.mjs';

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function req(path, body) { return new Request(`https://jarvis.test${path}`, body === undefined ? { method: 'POST' } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
function ctx(overrides = {}) {
  const calls = { powers: [], db: [] };
  const value = {
    ownerId: OWNER,
    classifyMemoryText(text) { const categories = []; if (/family|mother|maa|parivar/i.test(text)) categories.push('family'); if (/salary|money|paisa|paise|emi/i.test(text)) categories.push('money_figure'); return { categories, care: null }; },
    findMemorySecrets(text) { return /password\s*(?:is|hai|=|:)\s*\S+/i.test(text) ? [{ kind: 'password', start: 0, end: 8 }] : []; },
    async runPower(args) { calls.powers.push(args); return args.run(); },
    async db(args) { calls.db.push(args); return []; },
    ...overrides,
  };
  return { value, calls };
}

test('sensitive project is T2/no_embed and only generic placeholder is returned', async () => {
  const { value, calls } = ctx({ db: async (args) => { calls.db.push(args); return args.method === 'POST' ? [{ id: ID, ...args.body, created_at: '2026-11-22T10:00:00Z', updated_at: '2026-11-22T10:00:00Z' }] : []; } });
  const response = await projectsHandle('workspace.projects.create', req('/api/projects/workspace.projects.create', { name: 'Family budget', goal: 'salary and paisa planning', confirmed: true }), value);
  const text = await response.text(); const parsed = JSON.parse(text);
  assert.equal(response.status, 200);
  assert.equal(parsed.data.badge, 'private');
  assert.equal(text.includes('Family budget'), false);
  assert.equal(text.includes('salary and paisa'), false);
  const inserted = calls.db.find((entry) => entry.method === 'POST');
  assert.equal(inserted.body.private, true);
  assert.equal(inserted.body.tier, 'sensitive');
  assert.equal(inserted.body.no_embed, true);
});

test('private project cannot be downgraded on update', async () => {
  const existing = { id: ID, name: 'Family plan', goal: 'Private goal', next_step: '', status: 'active', tags: [], due_at: null, revision: 4, private: true, tier: 'sensitive', no_embed: true };
  const { value, calls } = ctx({ db: async (args) => {
    calls.db.push(args);
    if (args.method === 'GET') return [existing];
    if (args.method === 'PATCH') return [{ ...existing, ...args.body, revision: 5 }];
    return [];
  } });
  const response = await projectsHandle('workspace.projects.update', req('/api/projects/workspace.projects.update', { id: ID, revision: 4, name: 'New public name', private: false, confirmed: true }), value);
  const parsed = await response.json();
  assert.equal(parsed.data.badge, 'private');
  const patch = calls.db.find((entry) => entry.method === 'PATCH');
  assert.equal(patch.body.private, true);
  assert.equal(patch.body.tier, 'sensitive');
  assert.equal(patch.body.no_embed, true);
});

test('project list masks family-related legacy entries without hidden writes', async () => {
  const legacy = { id: ID, name: 'My mother project', goal: 'family plans', status: 'active', next_step: '', tags: [], revision: 1, private: false, tier: 'normal', no_embed: false };
  const { value, calls } = ctx({ db: async (args) => { calls.db.push(args); return args.method === 'GET' ? [legacy] : []; } });
  const response = await projectsHandle('workspace.projects.list', req('/api/projects/workspace.projects.list'), value);
  const text = await response.text(); const parsed = JSON.parse(text);
  assert.equal(parsed.data.normal.length, 0);
  assert.equal(parsed.data.private[0].badge, 'private');
  assert.equal(text.includes('My mother project'), false);
  assert.equal(text.includes('family plans'), false);
  assert.equal(calls.db.some((entry) => entry.method === 'PATCH'), false);
  assert.equal(calls.db[0].query.owner_id, `eq.${OWNER}`);
});
