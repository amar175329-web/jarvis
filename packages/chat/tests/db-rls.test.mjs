// PGlite integration test in the same style as packages/memory/tests/db-rls.test.mjs.
// It skips only when the package has not been installed; the SQL static tests still run.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
let PGlite;
try { ({ PGlite } = await import('@electric-sql/pglite')); } catch { /* skip below */ }

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const migration = fs.readFileSync(new URL('../../db/migrations/0034_chat_threads.sql', import.meta.url), 'utf8');
async function boot() {
  const db = new PGlite();
  await db.exec(`create schema auth;
    create table auth.users (id uuid primary key);
    insert into auth.users (id) values ('${A}'), ('${B}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role anon; create role authenticated; create role service_role;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  await db.exec(migration);
  await db.exec('grant usage on schema public to authenticated, anon');
  return db;
}
async function as(db, uid, fn) {
  await db.exec('set role authenticated');
  await db.query('select set_config($1, $2, false)', ['request.jwt.claim.sub', uid]);
  try { return await fn(); } finally { await db.exec('reset role'); }
}

test('PGlite: B cannot read A threads, messages or attachment references', { skip: !PGlite && 'pglite not installed; run npm ci in packages/chat' }, async () => {
  const db = await boot();
  let ids;
  await as(db, A, async () => {
    const thread = (await db.query("insert into public.chat_threads (title) values ('x') returning id")).rows[0].id;
    const message = (await db.query("insert into public.chat_messages (thread_id, role, content, sequence) values ($1, 'user', 'x', 1) returning id", [thread])).rows[0].id;
    const attachment = (await db.query("insert into public.chat_attachment_refs (thread_id, message_id, storage_ref, mime_type) values ($1, $2, 'private://a/file', 'image/png') returning id", [thread, message])).rows[0].id;
    ids = { thread, message, attachment };
  });
  await as(db, B, async () => {
    for (const table of ['chat_threads', 'chat_messages', 'chat_attachment_refs']) {
      assert.equal((await db.query(`select count(*)::int n from public.${table}`)).rows[0].n, 0, `${table} leaked A rows`);
    }
    await assert.rejects(() => db.query("insert into public.chat_messages (thread_id, owner_id, role, content, sequence) values ($1, $2, 'user', 'x', 2)", [ids.thread, A]));
    await assert.rejects(() => db.query("insert into public.chat_attachment_refs (thread_id, message_id, owner_id, storage_ref, mime_type) values ($1, $2, $3, 'private://cross', 'text/plain')", [ids.thread, ids.message, B]));
  });
  await as(db, A, async () => {
    assert.equal((await db.query('select count(*)::int n from public.chat_threads')).rows[0].n, 1);
    assert.equal((await db.query('select count(*)::int n from public.chat_messages')).rows[0].n, 1);
    assert.equal((await db.query('select count(*)::int n from public.chat_attachment_refs')).rows[0].n, 1);
  });
  await db.close();
});

test('migration 0034 force-enables owner RLS on all three chat tables', () => {
  for (const table of ['chat_threads', 'chat_messages', 'chat_attachment_refs']) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`, 'i'));
    assert.match(migration, new RegExp(`create policy ${table}_owner_all[\\s\\S]*?owner_id = auth\\.uid\\(\\)[\\s\\S]*?with check \\(owner_id = auth\\.uid\\(\\)\\)`, 'i'));
  }
});
