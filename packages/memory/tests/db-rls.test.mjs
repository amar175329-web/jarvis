// REAL isolation test: "user B cannot see user A's data" on every table I own + the functions. Needs @electric-sql/pglite (NOT installed in the S09 sandbox, so NOT RUN there).
// Run on Antigravity: npm i -D @electric-sql/pglite ; node --test packages/memory/tests/db-rls.test.mjs. If halfvec is missing in that pglite, see the fallback note at the top of 0030.
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
let PGlite, vector; try { ({ PGlite } = await import('@electric-sql/pglite')); ({ vector } = await import('@electric-sql/pglite/vector')); } catch { /* skip below */ }
const A = '00000000-0000-4000-8000-00000000000a', B = '00000000-0000-4000-8000-00000000000b';
const dir = path.resolve(import.meta.dirname, '../../db/migrations');
async function boot() {
  const db = new PGlite({ extensions: { vector } });
  await db.exec(`create schema if not exists extensions; create extension if not exists vector with schema extensions; create schema auth;
    create table auth.users (id uuid primary key, created_at timestamptz default now()); insert into auth.users (id) values ('${A}'),('${B}'); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role anon; create role authenticated; create role service_role; create schema cron; create function cron.schedule(a text, b text, c text) returns bigint language sql as $$ select 1::bigint $$;`);
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) { try { await db.exec(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { throw new Error(`${f}: ${e.message}`); } }
  await db.exec(` grant usage on schema public, extensions, auth to authenticated, anon; grant all on all tables in schema public to authenticated; grant execute on all functions in schema public to authenticated;`);
  return db;
}
const as = async (db, uid, fn) => { await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false)`); try { return await fn(); } finally { await db.exec('reset role'); } };
const row = (o = {}) => { const tier = o.tier ?? (o.private ? 'sensitive' : 'normal'); return JSON.stringify({ kind: 'fact', title: 'chai', body: 'chai pasand', source: 'amit_said', confidence: 1, why: 'Amit ne kaha', private: tier === 'sensitive', tier, subject: 'amit', tags: [], tokens: ['chai'], ...o, private: tier === 'sensitive', tier }); };
test('B cannot see or change A T1 or T2 memory on every S09 table and function', { skip: !PGlite && 'pglite not installed' }, async () => {
  const db = await boot();
  const ids = await as(db, A, async () => { const normal = (await db.query(`select (public.memory_create('${A}', $1::jsonb)->>'id') id`, [row()])).rows[0].id; const sensitive = (await db.query(`select (public.memory_create('${A}', $1::jsonb)->>'id') id`, [row({ title: 'wazan', body: 'wazan 72', tokens: ['wazan', '72'], private: true, tags: ['health','weight'] })])).rows[0].id; return { normal, sensitive }; }); const m = ids.normal;
  await as(db, A, async () => { await db.exec(`insert into public.projects (name) values ('p'); insert into public.notes (title) values ('n'); insert into public.memory_declines values (default,'f1:abc',now())`); });
  await as(db, B, async () => {
    for (const t of ['memories', 'projects', 'notes', 'files', 'memory_links', 'memory_declines']) assert.equal((await db.query(`select count(*)::int c from public.${t}`)).rows[0].c, 0, t);
    assert.equal((await db.query(`select count(*)::int c from public.memory_search('${A}', array['wazan'], null, null, 10, 'ask')`)).rows[0].c, 0);
    assert.equal((await db.query(`select (public.memory_forget('${A}', '${m}')->>'deleted')::int d`)).rows[0].d, 0);
    assert.equal((await db.query(`update public.memories set title='x' where id='${m}'`)).affectedRows, 0);
    await assert.rejects(() => db.query(`select public.memory_create('${A}', $1::jsonb)`, [row()]));
    await assert.rejects(() => db.query(`select public.memory_forget_all('${A}', 1)`));
  });
  await as(db, A, async () => { assert.equal((await db.query(`select count(*)::int c from public.memories`)).rows[0].c, 2); assert.equal((await db.query(`select count(*)::int c from public.memory_search('${A}', array['wazan'], null, null, 10)`)).rows[0].c, 0); assert.equal((await db.query(`select count(*)::int c from public.memory_search('${A}', array['wazan'], null, null, 10, 'ask')`)).rows[0].c, 1); });
  await assert.rejects(() => db.query(`set role anon; select count(*) from public.memories`));
});
test('rules in the database: T2 has no vector, inferred <= 0.7, why required, forget removes derived rows', { skip: !PGlite && 'pglite not installed' }, async () => {
  const db = await boot();
  await as(db, A, async () => {
    await assert.rejects(() => db.query(`select public.memory_create('${A}', $1::jsonb)`, [row({ why: '' })]));
    await assert.rejects(() => db.query(`select public.memory_create('${A}', $1::jsonb)`, [row({ source: 'inferred', confidence: 0.9 })]));
    const x = (await db.query(`select public.memory_create('${A}', $1::jsonb)->>'id' id`, [row()])).rows[0].id; const d = (await db.query(`select public.memory_create('${A}', $1::jsonb)->>'id' id`, [row({ title: 'saaransh', body: 'saaransh', kind: 'episode' })])).rows[0].id;
    await db.exec(`insert into public.memory_links (src_type,src_id,rel,dst_type,dst_id) values ('memory','${d}','derived_from','memory','${x}')`);
    const r = (await db.query(`select public.memory_forget('${A}','${x}') r`)).rows[0].r; assert.deepEqual([r.deleted, r.derived_deleted], [1, 1]);
    const p = (await db.query(`select public.memory_create('${A}', $1::jsonb)->>'id' id`, [row({ private: true, title: 'priv', body: 'priv baat', tags: ['health'] })])).rows[0].id;
    await assert.rejects(() => db.exec(`update public.memories set embedding = ('[' || array_to_string(array_fill(0.1::float4, array[768]), ',') || ']')::extensions.halfvec(768) where id='${p}'`), /memories_(?:private|tier)_no_vector_chk/); // DB refuses (stronger than silently nulling)
    assert.equal((await db.query(`select embedding is null n from public.memories where id='${p}'`)).rows[0].n, true); // trigger: private row never keeps a vector
  });
});
