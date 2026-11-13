// Live end-to-end RLS and storage isolation verification against real Supabase.
// Reads credentials ONLY from ~/.jarvis.env or environment variables.
// NEVER prints secrets, keys, or passwords.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';

function loadEnv() {
  const env = { ...process.env };
  const envPath = path.join(os.homedir(), '.jarvis.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const k = trimmed.slice(0, idx).trim();
        const v = trimmed.slice(idx + 1).trim();
        if (!env[k] && v) env[k] = v;
      }
    }
  }
  return env;
}

const env = loadEnv();
const hasCredentials = Boolean(
  env.TEST_SUPABASE_URL &&
  env.TEST_SUPABASE_ANON_KEY &&
  env.TEST_SUPABASE_SERVICE_ROLE_KEY &&
  env.TEST_DB_URL
);

test('Real Supabase: full A/B RLS, chat, and storage isolation', { skip: !hasCredentials && 'real Supabase credentials not set in ~/.jarvis.env or env' }, async (t) => {
  // 1. Authenticate User A and User B
  const login = async (email, password) => {
    const res = await fetch(`${env.TEST_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'apikey': env.TEST_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) throw new Error(`Auth login failed: HTTP ${res.status}`);
    const data = await res.json();
    return { token: data.access_token, uid: data.user.id };
  };

  const userA = await login('test_user_a@example.com', 'TestPassword123!');
  const userB = await login('test_user_b@example.com', 'TestPassword123!');
  assert.ok(userA.uid && userB.uid, 'Both user A and B must have valid IDs');
  assert.notEqual(userA.uid, userB.uid, 'User A and User B must be different accounts');

  // 2. Storage Bucket 'files' B-A Isolation
  await t.test('storage: user B cannot read or upload to user A files', async () => {
    const testPayload = `isolation-test-${Date.now()}`;
    // User A uploads own file
    const upA = await fetch(`${env.TEST_SUPABASE_URL}/storage/v1/object/files/${userA.uid}/isolation.txt`, {
      method: 'POST',
      headers: { 'apikey': env.TEST_SUPABASE_ANON_KEY, 'Authorization': `Bearer ${userA.token}`, 'Content-Type': 'text/plain', 'x-upsert': 'true' },
      body: testPayload
    });
    assert.ok(upA.status === 200 || upA.status === 409, `Upload A status ${upA.status}`);

    // User A downloads own file
    const downA = await fetch(`${env.TEST_SUPABASE_URL}/storage/v1/object/authenticated/files/${userA.uid}/isolation.txt`, {
      headers: { 'apikey': env.TEST_SUPABASE_ANON_KEY, 'Authorization': `Bearer ${userA.token}` }
    });
    assert.equal(downA.status, 200);

    // User B attempts to download User A's file (must be 400/404/403)
    const downB = await fetch(`${env.TEST_SUPABASE_URL}/storage/v1/object/authenticated/files/${userA.uid}/isolation.txt`, {
      headers: { 'apikey': env.TEST_SUPABASE_ANON_KEY, 'Authorization': `Bearer ${userB.token}` }
    });
    assert.ok(downB.status === 400 || downB.status === 403 || downB.status === 404, 'User B must not download User A file');

    // User B attempts to upload into User A's folder (must be rejected)
    const upBtoA = await fetch(`${env.TEST_SUPABASE_URL}/storage/v1/object/files/${userA.uid}/injected.txt`, {
      method: 'POST',
      headers: { 'apikey': env.TEST_SUPABASE_ANON_KEY, 'Authorization': `Bearer ${userB.token}`, 'Content-Type': 'text/plain' },
      body: 'injected by B'
    });
    assert.ok(upBtoA.status === 400 || upBtoA.status === 403, 'User B must not upload into User A folder');

    // User B uploads into own folder
    const upB = await fetch(`${env.TEST_SUPABASE_URL}/storage/v1/object/files/${userB.uid}/own.txt`, {
      method: 'POST',
      headers: { 'apikey': env.TEST_SUPABASE_ANON_KEY, 'Authorization': `Bearer ${userB.token}`, 'Content-Type': 'text/plain', 'x-upsert': 'true' },
      body: 'User B content'
    });
    assert.ok(upB.status === 200 || upB.status === 409, `Upload B status ${upB.status}`);
  });

  // 3. Database RLS Isolation
  const client = new pg.Client({ connectionString: env.TEST_DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const as = async (uid, fn) => {
    await client.query(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
    try {
      return await fn();
    } finally {
      await client.query('reset role;');
    }
  };

  const escapeJson = (o) => JSON.stringify(o).replace(/'/g, "''");

  await t.test('db-rls: user B sees 0 rows of user A on all tables', async () => {
    let mId;
    const normalRow = escapeJson({
      kind: 'fact', title: 'real chai', body: 'chai pasand', source: 'amit_said',
      confidence: 1, why: 'Amit ne kaha', private: false,
      tier: 'normal', subject: 'amit', tags: [], tokens: ['real', 'chai']
    });
    const sensitiveRow = escapeJson({
      kind: 'fact', title: 'real wazan', body: 'wazan 72', source: 'amit_said',
      confidence: 1, why: 'Amit ne kaha', private: true,
      tier: 'sensitive', subject: 'amit', tags: ['health', 'weight'], tokens: ['real', 'wazan', '72']
    });

    // User A seeds data
    await as(userA.uid, async () => {
      mId = (await client.query(`select (public.memory_create('${userA.uid}'::uuid, '${normalRow}'::jsonb, null)->>'id') as id`)).rows[0].id;
      await client.query(`select public.memory_create('${userA.uid}'::uuid, '${sensitiveRow}'::jsonb, null);`);
      await client.query(`insert into public.projects (owner_id, name) values ('${userA.uid}', 'proj-${Date.now()}');`);
      await client.query(`insert into public.notes (owner_id, title) values ('${userA.uid}', 'note-${Date.now()}');`);
      await client.query(`insert into public.memory_declines values ('${userA.uid}', 'f1:d1e2f3', now()) on conflict do nothing;`);
    });

    // User B verifies isolation
    await as(userB.uid, async () => {
      for (const table of ['memories', 'projects', 'notes', 'files', 'memory_links', 'memory_declines']) {
        const count = (await client.query(`select count(*)::int c from public.${table}`)).rows[0].c;
        assert.equal(count, 0, `User B must see 0 rows in table ${table}`);
      }

      // Memory search returns 0
      const searchRes = (await client.query(`select count(*)::int c from public.memory_search('${userA.uid}'::uuid, array['wazan'], null, null, 10, 'ask')`)).rows[0].c;
      assert.equal(searchRes, 0, 'User B memory_search on User A must return 0');

      // Memory forget returns 0
      const forgetRes = (await client.query(`select (public.memory_forget('${userA.uid}'::uuid, '${mId}'::uuid)->>'deleted')::int d`)).rows[0].d;
      assert.equal(forgetRes, 0, 'User B memory_forget on User A memory must delete 0');

      // Direct update affects 0 rows
      const updateRes = (await client.query(`update public.memories set title='hacked' where id='${mId}'`)).rowCount;
      assert.equal(updateRes, 0, 'User B direct update on User A memory must affect 0 rows');

      // Memory create pretending to be A is denied by RLS
      await assert.rejects(
        () => client.query(`select public.memory_create('${userA.uid}'::uuid, '${normalRow}'::jsonb, null)`),
        /row-level security policy/i
      );
    });
  });

  await t.test('purpose gating and anonymous lockout', async () => {
    await as(userA.uid, async () => {
      // Without typed purpose, T2 sensitive memory is not returned
      const searchNoPurpose = (await client.query(`select count(*)::int c from public.memory_search('${userA.uid}'::uuid, array['wazan'], null, null, 10)`)).rows[0].c;
      assert.equal(searchNoPurpose, 0, 'T2 sensitive memory requires purpose to be returned');

      // With typed purpose, T2 sensitive memory is returned
      const searchWithPurpose = (await client.query(`select count(*)::int c from public.memory_search('${userA.uid}'::uuid, array['wazan'], null, null, 10, 'ask')`)).rows[0].c;
      assert.ok(searchWithPurpose >= 1, 'T2 sensitive memory returned with purpose');
    });

    // Anon role access denied
    await assert.rejects(
      async () => {
        try {
          await client.query('set role anon; select count(*) from public.memories;');
        } finally {
          await client.query('reset role;');
        }
      },
      /permission denied/i
    );
  });

  await t.test('chat RLS isolation (migration 0034)', async () => {
    let threadId;
    await as(userA.uid, async () => {
      threadId = (await client.query(`insert into public.chat_threads (owner_id, title) values ('${userA.uid}', 'A Private Chat') returning id`)).rows[0].id;
      await client.query(`insert into public.chat_messages (thread_id, owner_id, sequence, role, content) values ('${threadId}', '${userA.uid}', 1, 'user', 'Confidential chat content');`);
    });

    await as(userB.uid, async () => {
      const threadCount = (await client.query('select count(*)::int c from public.chat_threads')).rows[0].c;
      const msgCount = (await client.query('select count(*)::int c from public.chat_messages')).rows[0].c;
      assert.equal(threadCount, 0, 'User B must see 0 chat threads');
      assert.equal(msgCount, 0, 'User B must see 0 chat messages');

      // User B cannot insert into User A thread
      await assert.rejects(
        () => client.query(`insert into public.chat_messages (thread_id, owner_id, sequence, role, content) values ('${threadId}', '${userB.uid}', 2, 'user', 'Injected message');`),
        /violates foreign key constraint/i
      );
    });
  });

  await t.test('chat HTTP PostgREST flow: User A creates thread, User B cannot see or query it', async () => {
    // User A creates thread via PostgREST
    const createRes = await fetch(`${env.TEST_SUPABASE_URL}/rest/v1/chat_threads`, {
      method: 'POST',
      headers: {
        'apikey': env.TEST_SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${userA.token}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        owner_id: userA.uid,
        title: 'User A HTTP Thread',
      }),
    });
    assert.equal(createRes.status, 201, `Thread creation status ${createRes.status}`);
    const createdThreads = await createRes.json();
    const threadAId = createdThreads[0].id;
    assert.ok(threadAId, 'Thread ID must exist');

    // User A adds message
    const msgRes = await fetch(`${env.TEST_SUPABASE_URL}/rest/v1/chat_messages`, {
      method: 'POST',
      headers: {
        'apikey': env.TEST_SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${userA.token}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        owner_id: userA.uid,
        thread_id: threadAId,
        role: 'user',
        content: 'Confidential message via HTTP',
        sequence: 1,
      }),
    });
    assert.equal(msgRes.status, 201, `Message creation status ${msgRes.status}`);

    // User B attempts to read threads (must be empty or not contain threadAId)
    const listResB = await fetch(`${env.TEST_SUPABASE_URL}/rest/v1/chat_threads?id=eq.${threadAId}`, {
      method: 'GET',
      headers: {
        'apikey': env.TEST_SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${userB.token}`,
      },
    });
    assert.equal(listResB.status, 200);
    const threadsB = await listResB.json();
    assert.equal(threadsB.length, 0, 'User B must not see User A thread');

    // User B attempts to read messages in thread A (must return 0 messages)
    const msgListB = await fetch(`${env.TEST_SUPABASE_URL}/rest/v1/chat_messages?thread_id=eq.${threadAId}`, {
      method: 'GET',
      headers: {
        'apikey': env.TEST_SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${userB.token}`,
      },
    });
    assert.equal(msgListB.status, 200);
    const msgsB = await msgListB.json();
    assert.equal(msgsB.length, 0, 'User B must not see messages from User A thread');

    // User B attempts to inject a message into User A's thread (must fail)
    const injectResB = await fetch(`${env.TEST_SUPABASE_URL}/rest/v1/chat_messages`, {
      method: 'POST',
      headers: {
        'apikey': env.TEST_SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${userB.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        owner_id: userB.uid,
        thread_id: threadAId,
        role: 'user',
        content: 'Hacked by B',
        sequence: 2,
      }),
    });
    assert.ok(injectResB.status >= 400, 'User B must be rejected when inserting into User A thread');
  });

  await client.end();
});
