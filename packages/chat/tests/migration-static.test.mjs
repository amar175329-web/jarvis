import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(new URL('../../db/migrations/0034_chat_threads.sql', import.meta.url), 'utf8');
test('migration has thread, message and attachment-reference tables with owner defaults', () => {
  for (const table of ['chat_threads', 'chat_messages', 'chat_attachment_refs']) assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, 'i'));
  assert.equal((sql.match(/owner_id uuid not null default auth\.uid\(\)/g) ?? []).length, 3);
});
test('migration enforces composite owner references and RLS is forced', () => {
  assert.match(sql, /foreign key \(thread_id, owner_id\) references public\.chat_threads\(id, owner_id\)/i);
  assert.match(sql, /foreign key \(message_id, owner_id\) references public\.chat_messages\(id, owner_id\)/i);
  for (const table of ['chat_threads', 'chat_messages', 'chat_attachment_refs']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(sql, new RegExp(`alter table public\\.${table} force row level security`, 'i'));
    assert.match(sql, new RegExp(`create policy ${table}_owner_all[\\s\\S]*?owner_id = auth\\.uid\\(\\)`, 'i'));
  }
});
test('chat text is schema-only, no fixture transcript is embedded in migration', () => {
  assert.match(sql, /content text not null/);
  assert.doesNotMatch(sql, /Amit ne kaha|meri dawai|salary|password is/i);
});
