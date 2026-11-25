-- PROPOSAL ONLY — S09 bundle 1. Do not apply until LEAD accepts and Antigravity runs it.
-- Adds an explicit T1/T2 privacy boundary to the existing workspace tables.
-- Existing owner_all policies from 0031 remain in place; RLS is reasserted ON + FORCED.

begin;

alter table public.projects
  add column if not exists private boolean not null default false,
  add column if not exists tier text not null default 'normal',
  add column if not exists no_embed boolean not null default false,
  add column if not exists revision integer not null default 1;

alter table public.notes
  add column if not exists private boolean not null default false,
  add column if not exists tier text not null default 'normal',
  add column if not exists revision integer not null default 1;

alter table public.files
  add column if not exists private boolean not null default true,
  add column if not exists tier text not null default 'sensitive',
  add column if not exists revision integer not null default 1;

-- Legacy notes that were already excluded from embedding are conservatively promoted to T2.
update public.notes
set private = true, tier = 'sensitive', no_embed = true, pinned = false, tokens = '{}', revision = greatest(revision, 1)
where no_embed = true or private = true or tier = 'sensitive';

-- There is no scanner yet. Existing and future file records remain private until S19 approves scanning.
update public.files
set private = true, tier = 'sensitive', no_embed = true, text_excerpt = null, tokens = '{}', status = 'quarantined', revision = greatest(revision, 1);

update public.projects
set private = true, tier = 'sensitive', no_embed = true, revision = greatest(revision, 1)
where private = true or tier = 'sensitive' or no_embed = true;

alter table public.projects alter column private set default false;
alter table public.projects alter column tier set default 'normal';
alter table public.projects alter column no_embed set default false;
alter table public.notes alter column private set default false;
alter table public.notes alter column tier set default 'normal';
alter table public.files alter column private set default true;
alter table public.files alter column tier set default 'sensitive';
alter table public.files alter column no_embed set default true;

-- Add constraints idempotently. A row cannot claim normal while being marked private (or vice versa).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'projects_private_tier_ck' and conrelid = 'public.projects'::regclass) then
    alter table public.projects add constraint projects_private_tier_ck check (private = (tier = 'sensitive'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'projects_tier_ck' and conrelid = 'public.projects'::regclass) then
    alter table public.projects add constraint projects_tier_ck check (tier in ('normal','sensitive'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'projects_revision_ck' and conrelid = 'public.projects'::regclass) then
    alter table public.projects add constraint projects_revision_ck check (revision >= 1);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'notes_private_tier_ck' and conrelid = 'public.notes'::regclass) then
    alter table public.notes add constraint notes_private_tier_ck check (private = (tier = 'sensitive'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'notes_tier_ck' and conrelid = 'public.notes'::regclass) then
    alter table public.notes add constraint notes_tier_ck check (tier in ('normal','sensitive'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'notes_revision_ck' and conrelid = 'public.notes'::regclass) then
    alter table public.notes add constraint notes_revision_ck check (revision >= 1);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'files_private_tier_ck' and conrelid = 'public.files'::regclass) then
    alter table public.files add constraint files_private_tier_ck check (private = (tier = 'sensitive'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'files_tier_ck' and conrelid = 'public.files'::regclass) then
    alter table public.files add constraint files_tier_ck check (tier in ('normal','sensitive'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'files_revision_ck' and conrelid = 'public.files'::regclass) then
    alter table public.files add constraint files_revision_ck check (revision >= 1);
  end if;
end $$;

create index if not exists projects_private_idx on public.projects (owner_id, updated_at desc) where private = true;
create index if not exists notes_private_idx on public.notes (owner_id, updated_at desc) where private = true;
create index if not exists files_private_idx on public.files (owner_id, created_at desc) where private = true;

-- No anonymous table access. Owner JWT + the existing owner_all policy is the app path.
do $$ declare t text; begin
  foreach t in array array['projects','notes','files'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, public', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

comment on column public.projects.private is 'T2: never in normal list/search/model context; render metadata-only until S19 vault.';
comment on column public.notes.private is 'T2: never in normal list/search/model context; render metadata-only until S19 vault.';
comment on column public.files.private is 'All file objects are T2 until S19 scanner/vault approves a lower tier.';

commit;
