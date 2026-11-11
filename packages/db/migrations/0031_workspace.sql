-- S09 MEMORY. Migration 0031: notes, files (metadata), projects, memory_links. Data model: packages/memory/docs/WORKSPACE_MODEL.md
-- Storage bucket `files` (private) and its storage.objects policies are made in the Supabase dashboard (checklist in the model doc): they need the storage schema, which a local test engine does not have.

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  goal text check (goal is null or length(goal) <= 1000),
  status text not null default 'active' check (status in ('active','paused','done','archived')),
  next_step text check (next_step is null or length(next_step) <= 300),
  due_at timestamptz,
  tags text[] not null default '{}' check (cardinality(tags) <= 12),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id, owner_id));
create unique index projects_name_uq on public.projects (owner_id, lower(name)) where status <> 'archived';
create index projects_status_idx on public.projects (owner_id, status);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  body_md text not null default '' check (length(body_md) <= 100000),
  tags text[] not null default '{}' check (cardinality(tags) <= 12),
  project_id uuid,
  pinned boolean not null default false,
  status text not null default 'active' check (status in ('active','archived')),
  source text not null default 'amit' check (source in ('amit','web_clip','import','jarvis')),
  no_embed boolean not null default false,          -- app sets true when a secret-like text is found or Amit marks it private: never sent to an embedding model
  tokens text[] not null default '{}' check (cardinality(tokens) <= 200),
  word_count integer not null default 0 check (word_count >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (project_id, owner_id) references public.projects (id, owner_id) on delete set null (project_id));
create index notes_owner_status_idx on public.notes (owner_id, status, updated_at desc);
create index notes_tokens_gin on public.notes using gin (tokens);
create index notes_project_idx on public.notes (owner_id, project_id) where project_id is not null;

create table public.files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  mime text not null check (mime in ('text/plain','text/markdown','application/pdf','image/png','image/jpeg','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  size_bytes bigint not null check (size_bytes between 0 and 10485760),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  storage_path text not null check (storage_path like owner_id::text || '/%' and storage_path !~ '\.\.'),
  project_id uuid,
  tags text[] not null default '{}' check (cardinality(tags) <= 12),
  status text not null default 'uploading' check (status in ('uploading','ready','failed','quarantined')),
  text_excerpt text check (text_excerpt is null or length(text_excerpt) <= 8192),
  no_embed boolean not null default false,
  tokens text[] not null default '{}' check (cardinality(tokens) <= 200),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id, owner_id), unique (storage_path),
  foreign key (project_id, owner_id) references public.projects (id, owner_id) on delete set null (project_id));
create index files_owner_idx on public.files (owner_id, created_at desc);
create index files_tokens_gin on public.files using gin (tokens);

-- one small graph table (decision 001: no separate graph database)
create table public.memory_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  src_type text not null check (src_type in ('memory','note','file','project','task','person')),
  src_id uuid not null,
  rel text not null check (rel ~ '^[a-z_]{2,40}$'),
  dst_type text not null check (dst_type in ('memory','note','file','project','task','person')),
  dst_id uuid not null,
  created_at timestamptz not null default now(),
  unique (owner_id, src_type, src_id, rel, dst_type, dst_id),
  check (not (src_type = dst_type and src_id = dst_id)));
create index memory_links_src_idx on public.memory_links (owner_id, src_type, src_id);
create index memory_links_dst_idx on public.memory_links (owner_id, dst_type, dst_id);

-- a link may only join things the same owner owns (links have no foreign keys because they point at 6 tables)
create or replace function public.memory_links_check() returns trigger language plpgsql set search_path = public as $$
declare ok boolean;
begin
  foreach ok in array array[
    case new.src_type when 'memory' then exists (select 1 from public.memories x where x.id = new.src_id and x.owner_id = new.owner_id)
                      when 'note' then exists (select 1 from public.notes x where x.id = new.src_id and x.owner_id = new.owner_id)
                      when 'file' then exists (select 1 from public.files x where x.id = new.src_id and x.owner_id = new.owner_id)
                      when 'project' then exists (select 1 from public.projects x where x.id = new.src_id and x.owner_id = new.owner_id)
                      when 'task' then exists (select 1 from public.tasks x where x.id = new.src_id and x.owner_id = new.owner_id)
                      else true end,
    case new.dst_type when 'memory' then exists (select 1 from public.memories x where x.id = new.dst_id and x.owner_id = new.owner_id)
                      when 'note' then exists (select 1 from public.notes x where x.id = new.dst_id and x.owner_id = new.owner_id)
                      when 'file' then exists (select 1 from public.files x where x.id = new.dst_id and x.owner_id = new.owner_id)
                      when 'project' then exists (select 1 from public.projects x where x.id = new.dst_id and x.owner_id = new.owner_id)
                      when 'task' then exists (select 1 from public.tasks x where x.id = new.dst_id and x.owner_id = new.owner_id)
                      else true end] loop
    if not ok then raise exception 'link endpoint not found for this owner' using errcode = 'PT404'; end if;
  end loop;
  return new;
end $$;
create trigger memory_links_guard before insert or update on public.memory_links for each row execute function public.memory_links_check();

-- cleanup: deleting a thing removes the links that point at it, and the memory "pointer" row of a note/file/project
create or replace function public.workspace_after_delete() returns trigger language plpgsql set search_path = public as $$
declare t text := tg_argv[0];
begin
  delete from public.memory_links where owner_id = old.owner_id and ((src_type = t and src_id = old.id) or (dst_type = t and dst_id = old.id));
  if t in ('note','file','project') then delete from public.memories where owner_id = old.owner_id and ref_type = t and ref_id = old.id; end if;
  return old;
end $$;
create trigger notes_cleanup after delete on public.notes for each row execute function public.workspace_after_delete('note');
create trigger files_cleanup after delete on public.files for each row execute function public.workspace_after_delete('file');
create trigger projects_cleanup after delete on public.projects for each row execute function public.workspace_after_delete('project');
create or replace function public.memories_after_delete() returns trigger language plpgsql set search_path = public as $$
begin delete from public.memory_links where owner_id = old.owner_id and ((src_type = 'memory' and src_id = old.id) or (dst_type = 'memory' and dst_id = old.id)); return old; end $$;
create trigger memories_cleanup after delete on public.memories for each row execute function public.memories_after_delete();

create trigger projects_touch before update on public.projects for each row execute function public.touch_updated_at();
create trigger notes_touch before update on public.notes for each row execute function public.touch_updated_at();
create trigger files_touch before update on public.files for each row execute function public.touch_updated_at();

do $$ declare t text; begin
  foreach t in array array['projects','notes','files','memory_links'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('create policy owner_all on public.%I for all using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
