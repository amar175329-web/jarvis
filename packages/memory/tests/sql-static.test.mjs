// Static guard (runs everywhere, no database needed): my migrations keep the project rules. The real RLS test is db-rls.test.mjs (needs pglite).
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
const dir = path.resolve(import.meta.dirname, '../../db/migrations');
const mine = fs.readdirSync(dir).filter((f) => /^003[0-3]_/.test(f)).sort(); const sql = Object.fromEntries(mine.map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]));
const all = Object.values(sql).join('\n');
test('only my range 0030-0039 is used, and 0001..0020 are untouched by me', () => { assert.deepEqual(mine, ['0030_memory_core.sql', '0031_workspace.sql', '0032_memory_functions.sql', '0033_memory_tiers_and_purpose.sql']); const touched = [...sql['0030_memory_core.sql'].matchAll(/alter table public\.(\w+)/g)].map((m) => m[1]); assert.ok(touched.every((t) => t === 'memories' || t === 'memory_declines'), touched.join()); });
test('every new table: owner_id, RLS enabled AND forced, owner_all policy, anon revoked', () => {
  const created = [...all.matchAll(/create table public\.(\w+) \(/g)].map((m) => m[1]); assert.deepEqual(created.sort(), ['files', 'memory_declines', 'memory_links', 'notes', 'projects']);
  for (const t of created) {
    const block = all.slice(all.indexOf(`create table public.${t} (`)); const def = block.slice(0, block.indexOf(');') + 2); assert.match(def, /owner_id uuid not null default auth\.uid\(\) references auth\.users\(id\) on delete cascade/, t);
    const direct = new RegExp(`alter table public\\.${t} enable row level security`).test(all) && new RegExp(`alter table public\\.${t} force row level security`).test(all);
    const looped = /foreach t in array array\[([^\]]+)\]/.test(all) && [...all.matchAll(/foreach t in array array\[([^\]]+)\]/g)].some((m) => m[1].includes(`'${t}'`)) && /force row level security/.test(all) && /create policy owner_all/.test(all) && /revoke all on public\.%I from anon/.test(all);
    assert.ok(direct || looped, `${t}: RLS enable+force+policy+anon revoke`);
  }
});
test('no function is SECURITY DEFINER; every function pins search_path', () => { assert.ok(!/security definer/i.test(all)); const fns = all.split(/create or replace function/i).slice(1); assert.ok(fns.length >= 10); for (const f of fns) assert.match(f.split(/\$\$/)[0] + f.slice(0, 600), /set search_path/i); });
test('purge is service_role only; user functions are not granted to anon/public', () => { assert.match(all, /revoke all on function[\s\S]*purge_memory_rows[\s\S]*from public, anon/); const auth = all.match(/to authenticated;/g); assert.equal(auth?.length, 2); const grantAuth = all.slice(all.indexOf('grant execute'), all.indexOf('to authenticated;')); assert.ok(!grantAuth.includes('purge_memory_rows')); });
test('vector is halfvec(768) with partial HNSW; private rows can never hold a vector', () => { assert.match(all, /halfvec\(768\)/); assert.match(all, /hnsw \(embedding extensions\.halfvec_cosine_ops\) where embedding is not null/); assert.match(all, /memories_private_no_vector_chk/); });
test('new rows must say why, and the source is limited', () => { assert.match(all, /memories_why_chk/); assert.match(all, /source in \('amit_said','observed','inferred'\)/); });
test('files cannot point outside the owner folder or beyond 10 MB', () => { assert.match(all, /storage_path like owner_id::text \|\| '\/%'/); assert.match(all, /10485760/); });
test('no real memory data in migrations (no inserts into memories)', () => { const withoutMemoryCreateBodies = all.replace(/create (?:or replace )?function public\.memory_create[\s\S]*?end \$\$;/gi, ''); assert.ok(!/insert into public\.memories\s*\(/i.test(withoutMemoryCreateBodies)); });

test('0033 has explicit T1/T2 tier, private consistency, no-vector and purpose-only search', () => { const m = sql['0033_memory_tiers_and_purpose.sql']; assert.match(m, /add column if not exists tier text not null default 'normal'/); assert.match(m, /memories_tier_private_chk/); assert.match(m, /memories_tier_no_vector_chk/); assert.match(m, /tier = 'normal' or \(m\.tier = 'sensitive'/); assert.match(m, /p_purpose = 'plan_workout'/); assert.match(m, /p_purpose = 'day_status'/); assert.match(m, /p_purpose = 'medicine_reminder'/); assert.match(m, /p_purpose = 'budget'/); assert.match(m, /p_purpose = 'ask'/); assert.match(m, /drop function public\.memory_search\(uuid, text\[\], text, text\[\], integer, boolean, timestamptz\)/); assert.match(m, /where tier = 'normal'/); });
