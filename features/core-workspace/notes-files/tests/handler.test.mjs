import test from 'node:test';
import assert from 'node:assert/strict';
import { handle as notesHandle } from '../src/handler.mjs';

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function req(path, body) { return new Request(`https://jarvis.test${path}`, body === undefined ? { method: 'POST' } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
function ctx(overrides = {}) {
  const calls = { powers: [], db: [], upload: null };
  const value = {
    ownerId: OWNER,
    classifyMemoryText(text) { return { categories: /family|mother|maa|parivar/i.test(text) ? ['family'] : [], care: null }; },
    findMemorySecrets(text) { return /password\s*(?:is|hai|=|:)\s*\S+/i.test(text) ? [{ kind: 'password', start: 0, end: 8 }] : []; },
    async runPower(args) { calls.powers.push(args); return args.run(); },
    async db(args) { calls.db.push(args); return []; },
    async storageCreateUploadUrl(path, mime, size) { calls.upload = { path, mime, size }; return { url: 'https://storage.example/signed-upload', headers: { 'content-type': mime, 'x-upsert': 'false' } }; },
    ...overrides,
  };
  return { value, calls };
}

test('notes.list masks family-related text with private badge and does no hidden write', async () => {
  const note = { id: ID, title: 'My mother', body_md: 'Family detail not for normal UI', tags: [], pinned: false, status: 'active', created_at: '2026-11-22T10:00:00Z', updated_at: '2026-11-22T10:00:00Z', revision: 1, private: false, tier: 'normal', no_embed: false };
  const { value, calls } = ctx({ db: async (args) => { calls.db.push(args); return args.method === 'GET' && args.table === 'notes' ? [note] : []; } });
  const response = await notesHandle('workspace.notes.list', req('/api/notes-files/workspace.notes.list'), value);
  const text = await response.text(); const parsed = JSON.parse(text);
  assert.equal(response.status, 200);
  assert.equal(parsed.data.normal.length, 0);
  assert.equal(parsed.data.private[0].badge, 'private');
  assert.equal(text.includes('My mother'), false);
  assert.equal(text.includes('Family detail'), false);
  assert.equal(calls.db.some((entry) => entry.method === 'PATCH'), false);
  assert.equal(calls.powers[0].readOnly, true);
  assert.equal(calls.db[0].query.owner_id, `eq.${OWNER}`);
});

test('files.list is private by default; filename and excerpt never leave handler', async () => {
  const { value } = ctx({ db: async () => [{ id: ID, name: 'tax-return.pdf', text_excerpt: 'sensitive content', mime: 'application/pdf', size_bytes: 1234, status: 'ready', created_at: '2026-11-22T10:00:00Z' }] });
  const response = await notesHandle('workspace.files.list', req('/api/notes-files/workspace.files.list'), value);
  const text = await response.text(); const parsed = JSON.parse(text);
  assert.equal(parsed.data.normal.length, 0);
  assert.equal(parsed.data.private[0].label, 'Private item');
  assert.equal(text.includes('tax-return.pdf'), false);
  assert.equal(text.includes('sensitive content'), false);
});

test('files.upload-url creates private metadata and returns an owner-token signed upload only', async () => {
  const { value, calls } = ctx({ db: async (args) => { calls.db.push(args); return args.method === 'POST' ? [{ id: args.body.id, created_at: '2026-11-22T10:00:00Z' }] : []; } });
  const response = await notesHandle('workspace.files.upload-url', req('/api/notes-files/workspace.files.upload-url', { name: 'notes.txt', mime: 'text/plain', size_bytes: 24, confirmed: true }), value);
  const parsed = await response.json();
  assert.equal(response.status, 200);
  assert.equal(parsed.data.private, true);
  assert.equal(parsed.data.upload.url, 'https://storage.example/signed-upload');
  assert.equal(calls.db[0].body.private, true);
  assert.equal(calls.db[0].body.tier, 'sensitive');
  assert.equal(calls.db[0].body.no_embed, true);
  assert.equal(calls.db[0].body.status, 'uploading');
  assert.equal(calls.upload.path.startsWith(`${OWNER}/`), true);
  assert.equal(calls.powers[0].confirmed, true);
});

test('raw credential-like filenames are refused', async () => {
  const { value, calls } = ctx();
  const response = await notesHandle('workspace.files.upload-url', req('/api/notes-files/workspace.files.upload-url', { name: 'password is ExampleSecret!9.txt', mime: 'text/plain', size_bytes: 10, confirmed: true }), value);
  assert.equal(response.status, 422);
  assert.equal(calls.db.length, 0);
});

test('upload completion quarantines file and never creates excerpt or normal-tier record', async () => {
  const { value, calls } = ctx({ db: async (args) => {
    calls.db.push(args);
    if (args.method === 'GET') return [{ id: ID, revision: 1, status: 'uploading' }];
    if (args.method === 'PATCH') return [{ id: ID, status: 'quarantined' }];
    return [];
  } });
  const response = await notesHandle('workspace.files.complete-upload', req('/api/notes-files/workspace.files.complete-upload', { id: ID, sha256: 'a'.repeat(64), confirmed: true }), value);
  const parsed = await response.json();
  assert.equal(parsed.data.status, 'quarantined');
  assert.equal(calls.db[1].body.private, true);
  assert.equal(calls.db[1].body.no_embed, true);
  assert.equal(calls.db[1].body.text_excerpt, null);
});
