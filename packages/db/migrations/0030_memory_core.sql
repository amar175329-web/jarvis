-- S09 MEMORY. Migration 0030: memories table grows up (additive; 0001 is never edited).
-- Safe only while memories holds NO vectors (the guard below stops otherwise). Run on a TEST project first (Antigravity), never on real Supabase by hand.
-- Why halfvec(768): 2 bytes per number instead of 4, about half the size of the vector and its index (free tier is 500 MB). Needs pgvector 0.7+ (Supabase has it).
-- Fallback if a local test engine lacks halfvec: keep vector(768) and use vector_cosine_ops; nothing else in this file changes.

do $$ begin
  if exists (select 1 from public.memories where embedding is not null) then
    raise exception '0030 refused: memories already hold vectors. Changing the vector type needs a re-embed plan (S09), not this migration.';
  end if;
end $$;

drop index if exists public.memories_embedding_idx;
alter table public.memories alter column embedding type extensions.halfvec(768) using null;

alter table public.memories
  add column if not exists why text,
  add column if not exists private boolean not null default false,
  add column if not exists subject text not null default 'amit',
  add column if not exists subject_key text,
  add column if not exists pinned boolean not null default false,
  add column if not exists status text not null default 'active',
  add column if not exists superseded_by uuid references public.memories(id) on delete set null,
  add column if not exists valid_to timestamptz,
  add column if not exists revision integer not null default 1,
  add column if not exists ref_type text,
  add column if not exists ref_id uuid,
  add column if not exists tokens text[] not null default '{}',
  add column if not exists embedding_model text,
  add column if not exists embedded_at timestamptz,
  add column if not exists last_used_at timestamptz,
  add column if not exists use_count integer not null default 0;

-- Rules in the database too (mirror of packages/memory/src/store.ts validateNew). NOT VALID = checked for every new/changed row, old rows (none expected) are not re-checked.
alter table public.memories
  add constraint memories_source_chk check (source in ('amit_said','observed','inferred')) not valid,
  add constraint memories_why_chk check (why is not null and length(btrim(why)) between 3 and 200) not valid,
  add constraint memories_inferred_conf_chk check (source <> 'inferred' or confidence <= 0.7) not valid,
  add constraint memories_title_len_chk check (length(btrim(title)) between 1 and 200) not valid,
  add constraint memories_body_len_chk check (length(btrim(body)) >= 1 and length(body) <= case when kind in ('episode','knowledge') then 2000 else 1000 end) not valid,
  add constraint memories_tags_chk check (cardinality(tags) <= 12) not valid,
  add constraint memories_subject_chk check (subject in ('amit','other')),
  add constraint memories_status_chk check (status in ('active','superseded')),
  add constraint memories_ref_chk check ((ref_type is null) = (ref_id is null) and (ref_type is null or ref_type in ('note','file','project'))),
  add constraint memories_tokens_chk check (cardinality(tokens) <= 64),
  add constraint memories_private_no_vector_chk check (not private or embedding is null);

-- indexes (small first; the vector index is partial so private/unembedded rows cost nothing there)
create index if not exists memories_status_kind_idx on public.memories (owner_id, status, kind);
create index if not exists memories_tokens_gin on public.memories using gin (tokens);
create index if not exists memories_pending_embed_idx on public.memories (owner_id, created_at) where embedding_model is null and private = false and status = 'active';
create index if not exists memories_pinned_idx on public.memories (owner_id) where pinned and not private and status = 'active';
create index if not exists memories_expires_idx on public.memories (owner_id, expires_at) where expires_at is not null;
create unique index if not exists memories_subject_key_active_uq on public.memories (owner_id, kind, subject_key) where subject_key is not null and status = 'active';
create index memories_embedding_idx on public.memories using hnsw (embedding extensions.halfvec_cosine_ops) where embedding is not null;

-- updated_at must NOT change when only the usage counters change (recall touches rows; "how old is this fact" must stay true)
create or replace function public.memories_before_write() returns trigger language plpgsql set search_path = public, extensions as $$
begin
  if tg_op = 'INSERT' then
    if new.private then new.embedding := null; end if;
    return new;
  end if;
  if (new.title, new.body, new.tags, new.kind, new.private, new.pinned, new.expires_at, new.status, new.confidence, new.source, new.why, new.subject_key)
     is not distinct from
     (old.title, old.body, old.tags, old.kind, old.private, old.pinned, old.expires_at, old.status, old.confidence, old.source, old.why, old.subject_key) then
    return new;                                   -- counters / embedding only: keep updated_at
  end if;
  new.updated_at := now();
  if new.private then new.embedding := null; new.embedding_model := null; new.embedded_at := null; end if;
  if (new.title is distinct from old.title or new.body is distinct from old.body or new.tags is distinct from old.tags) and new.embedding is not distinct from old.embedding then
    new.embedding := null; new.embedding_model := null; new.embedded_at := null;   -- text changed: the old vector is wrong
  end if;
  return new;
end $$;
drop trigger if exists memories_touch on public.memories;
create trigger memories_before_write before insert or update on public.memories for each row execute function public.memories_before_write();

-- "nahi" answers: only a fingerprint (hash of words), never the text. Lets JARVIS stop asking the same thing for 180 days.
create table public.memory_declines (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fingerprint text not null check (fingerprint ~ '^f1:[0-9a-f]{1,14}$'),
  created_at timestamptz not null default now(),
  primary key (owner_id, fingerprint));

alter table public.memory_declines enable row level security;
alter table public.memory_declines force row level security;
create policy owner_all on public.memory_declines for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke all on public.memory_declines from anon;
