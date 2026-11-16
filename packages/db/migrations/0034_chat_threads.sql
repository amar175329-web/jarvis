-- S07 CHAT round 1. Owner-scoped thread/message/attachment-reference storage.
-- Chat content is runtime data only; no sample conversations or personal content belong in git.
-- Local validation only. Do not apply to real Supabase from this bundle.

create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  sequence bigint not null check (sequence >= 0),
  created_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (thread_id, sequence),
  foreign key (thread_id, owner_id) references public.chat_threads(id, owner_id) on delete cascade
);

create table if not exists public.chat_attachment_refs (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null,
  message_id uuid not null,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  storage_ref text not null,
  file_name text,
  mime_type text not null,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  created_at timestamptz not null default now(),
  foreign key (thread_id, owner_id) references public.chat_threads(id, owner_id) on delete cascade,
  foreign key (message_id, owner_id) references public.chat_messages(id, owner_id) on delete cascade
);

create index if not exists chat_threads_owner_updated_idx on public.chat_threads(owner_id, updated_at desc);
create index if not exists chat_messages_owner_thread_sequence_idx on public.chat_messages(owner_id, thread_id, sequence);
create index if not exists chat_attachment_refs_owner_message_idx on public.chat_attachment_refs(owner_id, message_id);

alter table public.chat_threads enable row level security;
alter table public.chat_threads force row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_messages force row level security;
alter table public.chat_attachment_refs enable row level security;
alter table public.chat_attachment_refs force row level security;

create policy chat_threads_owner_all on public.chat_threads
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy chat_messages_owner_all on public.chat_messages
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy chat_attachment_refs_owner_all on public.chat_attachment_refs
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

revoke all on public.chat_threads, public.chat_messages, public.chat_attachment_refs from public, anon;
grant select, insert, update, delete on public.chat_threads, public.chat_messages, public.chat_attachment_refs to authenticated, service_role;
