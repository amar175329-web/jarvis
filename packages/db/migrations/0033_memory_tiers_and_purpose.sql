-- S09 MEMORY round 2. T1/T2 tier enforcement and purpose-scoped retrieval.
-- Additive only: 0030-0032 are accepted history and are not edited. Never run manually on real Supabase.

alter table public.memories
  add column if not exists tier text not null default 'normal';

-- Preserve the meaning of existing private rows as T2.
update public.memories
set tier = case when private then 'sensitive' else 'normal' end;

alter table public.memories
  add constraint memories_tier_chk check (tier in ('normal', 'sensitive')) not valid,
  add constraint memories_tier_private_chk check ((tier = 'sensitive') = private) not valid,
  add constraint memories_tier_no_vector_chk check (tier <> 'sensitive' or embedding is null) not valid;

-- Active subject keys are unique within a tier; a T1 key must not collide with its T2 counterpart.
drop index if exists public.memories_subject_key_active_uq;
create unique index memories_subject_key_active_uq on public.memories (owner_id, kind, tier, subject_key) where subject_key is not null and status = 'active';

-- Keep normal keyword search indexed. T2 keyword matching is purpose-scoped and does not
-- place sensitive tokens in this general-purpose GIN index; T2 never gets a vector index.
drop index if exists public.memories_tokens_gin;
create index memories_tokens_gin on public.memories using gin (tokens) where tier = 'normal';

-- Keep the invariant even for older callers that only send private=true or tier=sensitive.
create or replace function public.memories_before_write() returns trigger
language plpgsql set search_path = public, extensions as $$
begin
  if new.private then new.tier := 'sensitive'; end if;
  if new.tier = 'sensitive' then new.private := true; end if;
  if tg_op = 'INSERT' then
    if new.tier = 'sensitive' then
      new.embedding := null; new.embedding_model := null; new.embedded_at := null;
    end if;
    return new;
  end if;
  if old.tier = 'sensitive' and new.tier <> 'sensitive' then
    raise exception 'T2 cannot be downgraded to T1; use forget and create a new non-sensitive memory if appropriate' using errcode = 'PT403';
  end if;
  if (new.title, new.body, new.tags, new.kind, new.private, new.tier, new.pinned, new.expires_at, new.status, new.confidence, new.source, new.why, new.subject_key)
     is not distinct from
     (old.title, old.body, old.tags, old.kind, old.private, old.tier, old.pinned, old.expires_at, old.status, old.confidence, old.source, old.why, old.subject_key) then
    return new; -- usage counters / embedding only: updated_at stays unchanged; CHECK rejects a vector added to T2
  end if;
  new.updated_at := now();
  if new.tier = 'sensitive' and old.tier <> 'sensitive' then
    new.embedding := null; new.embedding_model := null; new.embedded_at := null;
  elsif (new.title is distinct from old.title or new.body is distinct from old.body or new.tags is distinct from old.tags) and new.embedding is not distinct from old.embedding then
    new.embedding := null; new.embedding_model := null; new.embedded_at := null;
  end if;
  return new;
end $$;

-- Reconcile old `private` RPC argument with the tier contract.
create or replace function public.memory_create(p_owner uuid, p_row jsonb, p_supersedes uuid default null) returns jsonb
language plpgsql security invoker set search_path = public, extensions as $$
declare r public.memories; v_tier text;
begin
  v_tier := case
    when coalesce((p_row->>'private')::boolean, false) or p_row->>'tier' = 'sensitive' then 'sensitive'
    else 'normal' end;
  if p_supersedes is not null then
    update public.memories set status = 'superseded', valid_to = now(), embedding = null, embedding_model = null, embedded_at = null
    where id = p_supersedes and owner_id = p_owner;
    if not found then raise exception 'memory to supersede not found' using errcode = 'PT404'; end if;
  end if;
  insert into public.memories (owner_id, kind, title, body, source, confidence, why, tier, private, subject, subject_key, tags, pinned, ref_type, ref_id, tokens, expires_at)
  values (p_owner, p_row->>'kind', p_row->>'title', p_row->>'body', p_row->>'source', coalesce((p_row->>'confidence')::real, 0.8), p_row->>'why',
          v_tier, v_tier = 'sensitive', coalesce(p_row->>'subject', 'amit'), p_row->>'subject_key',
          array(select jsonb_array_elements_text(coalesce(p_row->'tags', '[]'::jsonb))), coalesce((p_row->>'pinned')::boolean, false) and v_tier = 'normal',
          p_row->>'ref_type', nullif(p_row->>'ref_id', '')::uuid, array(select jsonb_array_elements_text(coalesce(p_row->'tokens', '[]'::jsonb))), nullif(p_row->>'expires_at', '')::timestamptz)
  returning * into r;
  if p_supersedes is not null then update public.memories set superseded_by = r.id where id = p_supersedes and owner_id = p_owner; end if;
  return public.memory_json(r);
end $$;

-- Remove the boolean escape hatch completely. NULL purpose = T1 only.
revoke all on function public.memory_search(uuid, text[], text, text[], integer, boolean, timestamptz) from public, anon, authenticated, service_role;
drop function public.memory_search(uuid, text[], text, text[], integer, boolean, timestamptz);

create function public.memory_search(
  p_owner uuid,
  p_tokens text[],
  p_embedding text default null,
  p_kinds text[] default null,
  p_limit integer default 40,
  p_purpose text default null,
  p_now timestamptz default now()
)
returns table (memory jsonb, sim real, kw real)
language sql stable security invoker set search_path = public, extensions as $$
  with kwc as (
    select m.id from public.memories m
    where cardinality(coalesce(p_tokens, '{}')) > 0 and m.tokens && p_tokens
      and m.owner_id = p_owner and m.status = 'active' and (m.expires_at is null or m.expires_at > p_now)
      and (p_kinds is null or m.kind = any(p_kinds))
      and (p_purpose is null or p_purpose in ('plan_workout','day_status','medicine_reminder','budget','ask'))
      and (m.tier = 'normal' or (m.tier = 'sensitive' and (
        p_purpose = 'ask'
        or (p_purpose = 'plan_workout' and m.tags && array['workout','fitness','weight']::text[])
        or (p_purpose = 'day_status' and m.tags && array['health','workout','fitness','weight','medicine','medication','emotion']::text[])
        or (p_purpose = 'medicine_reminder' and m.tags && array['medicine','medication']::text[])
        or (p_purpose = 'budget' and m.tags && array['money','finance']::text[])
      )))
    order by (select count(*) from unnest(p_tokens) t where t = any(m.tokens)) desc
    limit least(greatest(p_limit, 1), 100)
  ), vec as (
    select m.id from public.memories m
    where p_embedding is not null and m.embedding is not null
      and m.owner_id = p_owner and m.status = 'active' and (m.expires_at is null or m.expires_at > p_now)
      and (p_kinds is null or m.kind = any(p_kinds))
      and (p_purpose is null or p_purpose in ('plan_workout','day_status','medicine_reminder','budget','ask'))
      and (m.tier = 'normal' or (m.tier = 'sensitive' and (
        p_purpose = 'ask'
        or (p_purpose = 'plan_workout' and m.tags && array['workout','fitness','weight']::text[])
        or (p_purpose = 'day_status' and m.tags && array['health','workout','fitness','weight','medicine','medication','emotion']::text[])
        or (p_purpose = 'medicine_reminder' and m.tags && array['medicine','medication']::text[])
        or (p_purpose = 'budget' and m.tags && array['money','finance']::text[])
      )))
    order by m.embedding <=> p_embedding::extensions.halfvec(768)
    limit least(greatest(p_limit, 1), 100)
  ), ids as (select id from kwc union select id from vec)
  select public.memory_json(m),
         case when p_embedding is not null and m.embedding is not null then (1 - (m.embedding <=> p_embedding::extensions.halfvec(768)))::real end,
         (select count(*) from unnest(coalesce(p_tokens, '{}')) t where t = any(m.tokens))::real / greatest(cardinality(coalesce(p_tokens, '{}')), 1)
  from public.memories m join ids on ids.id = m.id
  where m.owner_id = p_owner
$$;

revoke all on function public.memory_search(uuid, text[], text, text[], integer, text, timestamptz) from public, anon;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.memory_search(uuid, text[], text, text[], integer, text, timestamptz) to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.memory_search(uuid, text[], text, text[], integer, text, timestamptz) to service_role;
  end if;
end $$;
