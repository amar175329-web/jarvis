-- S09 MEMORY. Migration 0032: the functions packages/memory calls (SupabaseMemoryStore).
-- All are SECURITY INVOKER: they run as the caller, so Row Level Security still applies. Every one also filters owner_id = p_owner by hand (worker runs as service_role, which skips RLS).
-- Failures use PostgREST codes: PT409 = conflict, PT404 = not found.

create or replace function public.memory_json(m public.memories) returns jsonb language sql immutable set search_path = public as $$
  select to_jsonb(m) - 'embedding' - 'owner_id' $$;

create or replace function public.memory_create(p_owner uuid, p_row jsonb, p_supersedes uuid default null) returns jsonb
language plpgsql security invoker set search_path = public, extensions as $$
declare r public.memories;
begin
  if p_supersedes is not null then   -- retire the old active row first (one active row per subject_key)
    update public.memories set status = 'superseded', valid_to = now(), embedding = null, embedding_model = null, embedded_at = null where id = p_supersedes and owner_id = p_owner;
    if not found then raise exception 'memory to supersede not found' using errcode = 'PT404'; end if;
  end if;
  insert into public.memories (owner_id, kind, title, body, source, confidence, why, private, subject, subject_key, tags, pinned, ref_type, ref_id, tokens, expires_at)
  values (p_owner, p_row->>'kind', p_row->>'title', p_row->>'body', p_row->>'source', coalesce((p_row->>'confidence')::real, 0.8), p_row->>'why',
          coalesce((p_row->>'private')::boolean, false), coalesce(p_row->>'subject', 'amit'), p_row->>'subject_key',
          array(select jsonb_array_elements_text(coalesce(p_row->'tags', '[]'::jsonb))), coalesce((p_row->>'pinned')::boolean, false),
          p_row->>'ref_type', nullif(p_row->>'ref_id', '')::uuid, array(select jsonb_array_elements_text(coalesce(p_row->'tokens', '[]'::jsonb))), nullif(p_row->>'expires_at', '')::timestamptz)
  returning * into r;
  if p_supersedes is not null then update public.memories set superseded_by = r.id where id = p_supersedes and owner_id = p_owner; end if;
  return public.memory_json(r);
end $$;

-- hybrid candidates: words (tokens, GIN) + vector (HNSW). Ranking is done in TypeScript so every store ranks the same way.
-- The two candidate queries repeat their filters on purpose: a shared CTE would be materialised and the vector index would not be used.
create or replace function public.memory_search(p_owner uuid, p_tokens text[], p_embedding text default null, p_kinds text[] default null,
  p_limit integer default 40, p_allow_private boolean default false, p_now timestamptz default now())
returns table (memory jsonb, sim real, kw real)
language sql stable security invoker set search_path = public, extensions as $$
  with kwc as (
    select m.id from public.memories m
    where cardinality(coalesce(p_tokens, '{}')) > 0 and m.tokens && p_tokens
      and m.owner_id = p_owner and m.status = 'active' and (m.expires_at is null or m.expires_at > p_now) and (p_allow_private or not m.private) and (p_kinds is null or m.kind = any(p_kinds))
    order by (select count(*) from unnest(p_tokens) t where t = any(m.tokens)) desc limit least(greatest(p_limit, 1), 100)
  ), vec as (
    select m.id from public.memories m
    where p_embedding is not null and m.embedding is not null
      and m.owner_id = p_owner and m.status = 'active' and (m.expires_at is null or m.expires_at > p_now) and (p_allow_private or not m.private) and (p_kinds is null or m.kind = any(p_kinds))
    order by m.embedding <=> p_embedding::extensions.halfvec(768) limit least(greatest(p_limit, 1), 100)
  ), ids as (select id from kwc union select id from vec)
  select public.memory_json(m),
         case when p_embedding is not null and m.embedding is not null then (1 - (m.embedding <=> p_embedding::extensions.halfvec(768)))::real end,
         (select count(*) from unnest(coalesce(p_tokens, '{}')) t where t = any(m.tokens))::real / greatest(cardinality(coalesce(p_tokens, '{}')), 1)
  from public.memories m join ids on ids.id = m.id
  where m.owner_id = p_owner $$;

create or replace function public.memory_touch(p_owner uuid, p_ids uuid[], p_now timestamptz default now()) returns void
language sql security invoker set search_path = public as $$
  update public.memories set last_used_at = p_now, use_count = use_count + 1 where owner_id = p_owner and id = any(p_ids) $$;

-- forget = HARD delete: the row, its vector, its links, and every memory derived from it
create or replace function public.memory_forget(p_owner uuid, p_id uuid) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare v_derived uuid[]; v_links integer := 0; v_n integer; v_d integer := 0; v_main integer := 0;
begin
  if not exists (select 1 from public.memories where id = p_id and owner_id = p_owner) then return jsonb_build_object('deleted', 0, 'derived_deleted', 0, 'links_deleted', 0); end if;
  select coalesce(array_agg(src_id), '{}') into v_derived from public.memory_links where owner_id = p_owner and rel = 'derived_from' and dst_type = 'memory' and dst_id = p_id and src_type = 'memory';
  delete from public.memory_links where owner_id = p_owner and ((src_type = 'memory' and (src_id = p_id or src_id = any(v_derived))) or (dst_type = 'memory' and (dst_id = p_id or dst_id = any(v_derived))));
  get diagnostics v_n = row_count; v_links := v_n;
  delete from public.memories where owner_id = p_owner and id = any(v_derived); get diagnostics v_d = row_count;
  delete from public.memories where owner_id = p_owner and id = p_id; get diagnostics v_main = row_count;
  return jsonb_build_object('deleted', v_main, 'derived_deleted', v_d, 'links_deleted', v_links);
end $$;

create or replace function public.memory_forget_all(p_owner uuid, p_expected integer) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare v_count integer; v_links integer;
begin
  select count(*) into v_count from public.memories where owner_id = p_owner;
  if v_count <> p_expected then raise exception 'expected % memories but there are %', p_expected, v_count using errcode = 'PT409'; end if;
  delete from public.memory_links where owner_id = p_owner and (src_type = 'memory' or dst_type = 'memory'); get diagnostics v_links = row_count;
  delete from public.memories where owner_id = p_owner;
  delete from public.memory_declines where owner_id = p_owner;
  return jsonb_build_object('deleted', v_count, 'derived_deleted', 0, 'links_deleted', v_links);
end $$;

create or replace function public.memory_stats(p_owner uuid) returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'memories', (select count(*) from public.memories where owner_id = p_owner),
    'with_vector', (select count(*) from public.memories where owner_id = p_owner and embedding is not null),
    'pending_embeddings', (select count(*) from public.memories where owner_id = p_owner and embedding_model is null and not private and status = 'active'),
    'private_count', (select count(*) from public.memories where owner_id = p_owner and private),
    'table_mb', round((pg_total_relation_size('public.memories') / 1048576.0)::numeric, 1),
    'db_mb', round((pg_database_size(current_database()) / 1048576.0)::numeric, 1),
    'notes', (select count(*) from public.notes where owner_id = p_owner),
    'files', (select count(*) from public.files where owner_id = p_owner),
    'projects', (select count(*) from public.projects where owner_id = p_owner)) $$;

-- daily retention job (worker, service_role only)
create or replace function public.purge_memory_rows(p_owner uuid, p_now timestamptz default now()) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare a integer; b integer; c integer;
begin
  delete from public.memories where owner_id = p_owner and expires_at is not null and expires_at + interval '7 days' < p_now; get diagnostics a = row_count;
  delete from public.memories where owner_id = p_owner and status = 'superseded' and valid_to is not null and valid_to + interval '90 days' < p_now; get diagnostics b = row_count;
  delete from public.memory_declines where owner_id = p_owner and created_at + interval '180 days' < p_now; get diagnostics c = row_count;
  return jsonb_build_object('expired', a, 'superseded', b, 'declines', c);
end $$;

-- who may call what (Supabase grants new functions to everyone by default: close that first)
revoke all on function public.memory_json(public.memories), public.memory_create(uuid, jsonb, uuid), public.memory_search(uuid, text[], text, text[], integer, boolean, timestamptz),
  public.memory_touch(uuid, uuid[], timestamptz), public.memory_forget(uuid, uuid), public.memory_forget_all(uuid, integer), public.memory_stats(uuid), public.purge_memory_rows(uuid, timestamptz) from public, anon;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.memory_json(public.memories), public.memory_create(uuid, jsonb, uuid), public.memory_search(uuid, text[], text, text[], integer, boolean, timestamptz),
      public.memory_touch(uuid, uuid[], timestamptz), public.memory_forget(uuid, uuid), public.memory_forget_all(uuid, integer), public.memory_stats(uuid) to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.memory_json(public.memories), public.memory_create(uuid, jsonb, uuid), public.memory_search(uuid, text[], text, text[], integer, boolean, timestamptz),
      public.memory_touch(uuid, uuid[], timestamptz), public.memory_forget(uuid, uuid), public.memory_forget_all(uuid, integer), public.memory_stats(uuid), public.purge_memory_rows(uuid, timestamptz) to service_role;
  end if;
end $$;
