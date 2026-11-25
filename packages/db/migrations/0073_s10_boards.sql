-- S10 Insights + Boards proposal. LOCAL REVIEW ONLY; Antigravity applies only after LEAD acceptance.
-- Reuses existing owner tasks. The board tables store metadata and task links only, never task text.
begin;

-- Composite uniqueness lets board-task links enforce that the linked task belongs to the same owner.
create unique index if not exists tasks_id_owner_s10_uq on public.tasks(id, owner_id);

create table if not exists public.s10_boards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create table if not exists public.s10_board_columns (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  unique (id, board_id, owner_id),
  foreign key (board_id, owner_id) references public.s10_boards(id, owner_id) on delete cascade
);

create table if not exists public.s10_board_task_links (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null,
  column_id uuid not null,
  task_id uuid not null,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (board_id, task_id),
  foreign key (board_id, owner_id) references public.s10_boards(id, owner_id) on delete cascade,
  foreign key (column_id, board_id, owner_id) references public.s10_board_columns(id, board_id, owner_id) on delete cascade,
  foreign key (task_id, owner_id) references public.tasks(id, owner_id) on delete cascade
);

create index if not exists s10_boards_owner_updated_idx on public.s10_boards(owner_id, updated_at desc);
create index if not exists s10_board_columns_owner_board_position_idx on public.s10_board_columns(owner_id, board_id, position);
create index if not exists s10_board_task_links_owner_board_position_idx on public.s10_board_task_links(owner_id, board_id, column_id, position);
create index if not exists s10_board_task_links_owner_task_idx on public.s10_board_task_links(owner_id, task_id);

alter table public.s10_boards enable row level security;
alter table public.s10_boards force row level security;
alter table public.s10_board_columns enable row level security;
alter table public.s10_board_columns force row level security;
alter table public.s10_board_task_links enable row level security;
alter table public.s10_board_task_links force row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 's10_boards' and policyname = 's10_boards_owner_all') then
    create policy s10_boards_owner_all on public.s10_boards for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 's10_board_columns' and policyname = 's10_board_columns_owner_all') then
    create policy s10_board_columns_owner_all on public.s10_board_columns for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 's10_board_task_links' and policyname = 's10_board_task_links_owner_all') then
    create policy s10_board_task_links_owner_all on public.s10_board_task_links for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
  end if;
end $$;

revoke all on public.s10_boards, public.s10_board_columns, public.s10_board_task_links from public, anon;
grant select, insert, update, delete on public.s10_boards, public.s10_board_columns, public.s10_board_task_links to authenticated;

commit;
