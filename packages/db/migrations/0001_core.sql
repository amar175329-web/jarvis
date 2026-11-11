-- JARVIS core schema (Supabase Postgres). Owner: S00. Run in Supabase SQL editor (or `supabase db push`).
-- Rules baked in:
--   * ONE owner (Amit). Every row has owner_id = auth.uid(); Row Level Security lets only that user see/change it.
--   * The master key (service_role) is only for server code (api/, worker/). Phone/web use the owner's login.
--   * Kill switch is fail-closed: if anything is unclear, risky work does NOT run.
--   * Free tier is 500 MB: logs have retention (see purge_old_rows), embeddings are small (768 dims).
create schema if not exists extensions;
create extension if not exists vector with schema extensions;

-- ---------- helpers ----------
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- tables ----------
create table public.settings (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key text not null, value jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now(),
  primary key (owner_id, key));

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null, notes text, due_at timestamptz,
  status text not null default 'todo' check (status in ('todo','doing','done','cancelled')),
  priority smallint not null default 2 check (priority between 1 and 3),
  focus_today boolean not null default false,
  source text not null default 'amit',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  text text not null, remind_at timestamptz not null, repeat_rule text,
  state text not null default 'pending' check (state in ('pending','fired','cancelled')),
  task_id uuid references public.tasks(id) on delete set null,
  created_at timestamptz not null default now(), fired_at timestamptz);

-- memory: categories match memory/ folders. embedding is optional; S09 may change the dimension BEFORE real data exists.
create table public.memories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('profile','person','project','episode','fact','preference','routine','knowledge')),
  title text not null, body text not null,
  source text, confidence real not null default 0.8 check (confidence between 0 and 1),
  tags text[] not null default '{}', embedding extensions.vector(768),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), expires_at timestamptz);
create index memories_kind_idx on public.memories (owner_id, kind);
create index memories_embedding_idx on public.memories using hnsw (embedding extensions.vector_cosine_ops);

-- powers: autonomy is a number 0-4 (shown as L0-L4). max_level is the CAP; current can never exceed it (S22 fills the data).
create table public.powers (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null check (id ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$'),
  name text not null, owner_squad text not null default 'S22', description text,
  autonomy_default smallint not null check (autonomy_default between 0 and 4),
  autonomy_current smallint not null check (autonomy_current between 0 and 4),
  max_level smallint not null check (max_level between 0 and 4),
  needs_confirm boolean not null default true, reversible boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (owner_id, id),
  constraint current_within_cap check (autonomy_current <= max_level and autonomy_default <= max_level));

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  trace_id uuid, power_id text, level smallint check (level between 0 and 4),
  request text, why text not null, result text, created_at timestamptz not null default now());
create index decisions_created_idx on public.decisions (owner_id, created_at desc);

create table public.activity_log (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ts timestamptz not null default now(), actor text not null, action text not null, target text,
  detail jsonb not null default '{}'::jsonb, decision_id uuid references public.decisions(id) on delete set null, ok boolean not null default true);
create index activity_log_ts_idx on public.activity_log (owner_id, ts desc);

-- events: the envelope every squad uses. realtime=true only for the few events that must reach the screen/phone instantly.
create table public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type text not null check (type ~ '^[a-z0-9]+(\.[a-z0-9-]+)+$'),
  source text not null, ts timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb check (pg_column_size(payload) < 16384),
  correlation_id uuid, version smallint not null default 1, realtime boolean not null default false);
create index events_type_ts_idx on public.events (owner_id, type, ts desc);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null, kind text not null check (kind in ('phone','tv','computer','agent','machine-agent')),
  token_hash text, permissions jsonb not null default '{}'::jsonb,
  paired_at timestamptz not null default now(), last_seen timestamptz, revoked_at timestamptz);

create table public.device_apps (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  package text not null, label text, installed boolean not null default true, updated_at timestamptz not null default now(),
  primary key (device_id, package));

-- kill switch: exactly ONE row. epoch goes up on every change; commands remember the epoch they were created in.
create table public.system_state (
  id smallint primary key default 1 check (id = 1),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kill boolean not null default false, epoch integer not null default 0,
  changed_at timestamptz not null default now(), changed_by text);

create table public.phone_commands (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  command jsonb not null check (pg_column_size(command) < 16384),
  state text not null default 'queued' check (state in ('queued','sent','running','done','failed','cancelled','expired')),
  idempotency_key text, kill_epoch integer not null default 0,
  created_at timestamptz not null default now(), expires_at timestamptz not null default now() + interval '2 minutes',
  claimed_at timestamptz, finished_at timestamptz, result jsonb, error text, decision_id uuid references public.decisions(id) on delete set null,
  unique (owner_id, idempotency_key));
create index phone_commands_queue_idx on public.phone_commands (device_id, state, created_at);

create table public.bots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key text not null, name text not null, config jsonb not null default '{}'::jsonb, enabled boolean not null default false,
  created_at timestamptz not null default now(), unique (owner_id, key));

-- skills, plugins, connectors, MCP, agents, integrations: one table (kind says which)
create table public.library_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('skill','plugin','connector','mcp','agent','integration')),
  key text not null, name text not null, manifest jsonb not null default '{}'::jsonb, config jsonb not null default '{}'::jsonb,
  enabled boolean not null default false, installed_at timestamptz not null default now(), unique (owner_id, kind, key));

create table public.capabilities (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null, status text not null check (status in ('planned','built','tested','live','broken','deprecated')),
  manifest jsonb not null default '{}'::jsonb, synced_at timestamptz not null default now(), primary key (owner_id, id));

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('chat','agent-run','voice','phone-run')), title text,
  started_at timestamptz not null default now(), ended_at timestamptz, meta jsonb not null default '{}'::jsonb);

create table public.model_usage (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ts timestamptz not null default now(), provider text not null, model text not null, task text,
  tokens_in integer not null default 0, tokens_out integer not null default 0, cost_usd numeric(10,5) not null default 0, ok boolean not null default true);
create index model_usage_ts_idx on public.model_usage (owner_id, ts desc);

-- ---------- updated_at triggers ----------
create trigger tasks_touch before update on public.tasks for each row execute function public.touch_updated_at();
create trigger memories_touch before update on public.memories for each row execute function public.touch_updated_at();
create trigger powers_touch before update on public.powers for each row execute function public.touch_updated_at();
create trigger settings_touch before update on public.settings for each row execute function public.touch_updated_at();

-- ---------- kill switch logic (fail-closed) ----------
create or replace function public.system_state_on_change() returns trigger language plpgsql as $$
begin
  if new.kill is distinct from old.kill then
    new.epoch := old.epoch + 1; new.changed_at := now();
    if new.kill then  -- Off button pressed: everything waiting or running is cancelled right now
      update public.phone_commands set state = 'cancelled', finished_at = now(), error = 'kill switch'
       where owner_id = new.owner_id and state in ('queued','sent','running');
    end if;
  end if;
  return new;
end $$;
create trigger system_state_change before update on public.system_state for each row execute function public.system_state_on_change();

-- new commands: refused while kill is ON, or when there is no system_state row at all (fail-closed); they remember the epoch
create or replace function public.phone_commands_guard() returns trigger language plpgsql as $$
declare s public.system_state;
begin
  select * into s from public.system_state where owner_id = new.owner_id and id = 1;
  if not found then raise exception 'system_state missing: refusing to queue (fail-closed)'; end if;
  if s.kill then raise exception 'kill switch is ON: command refused'; end if;
  new.kill_epoch := s.epoch;
  return new;
end $$;
create trigger phone_commands_before_insert before insert on public.phone_commands for each row execute function public.phone_commands_guard();

-- the phone asks for its next command through THIS function only. It hands out nothing if killed, expired, from an older epoch, or state is missing.
create or replace function public.claim_phone_command(p_device uuid) returns public.phone_commands language plpgsql as $$
declare s public.system_state; c public.phone_commands;
begin
  select * into s from public.system_state where owner_id = auth.uid() and id = 1;
  if not found or s.kill then return null; end if;
  update public.phone_commands set state = 'expired', finished_at = now()
   where owner_id = auth.uid() and device_id = p_device and state = 'queued' and (expires_at <= now() or kill_epoch <> s.epoch);
  select * into c from public.phone_commands
   where owner_id = auth.uid() and device_id = p_device and state = 'queued' and expires_at > now() and kill_epoch = s.epoch
   order by created_at limit 1 for update skip locked;
  if not found then return null; end if;
  update public.phone_commands set state = 'sent', claimed_at = now() where id = c.id returning * into c;
  return c;
end $$;

-- ---------- retention (keeps the free 500 MB from filling). Called daily (see 0002_schedule.sql) ----------
create or replace function public.purge_old_rows() returns jsonb language plpgsql security definer set search_path = public as $$
declare e int; a int; d int; m int; p int; s int;
begin
  delete from public.events where ts < now() - interval '14 days';                       get diagnostics e = row_count;
  delete from public.activity_log where ts < now() - interval '90 days';                 get diagnostics a = row_count;
  delete from public.decisions where created_at < now() - interval '90 days';            get diagnostics d = row_count;
  delete from public.model_usage where ts < now() - interval '180 days';                 get diagnostics m = row_count;
  delete from public.phone_commands where state in ('done','failed','cancelled','expired') and coalesce(finished_at, created_at) < now() - interval '30 days'; get diagnostics p = row_count;
  delete from public.sessions where ended_at is not null and ended_at < now() - interval '30 days'; get diagnostics s = row_count;
  return jsonb_build_object('events', e, 'activity_log', a, 'decisions', d, 'model_usage', m, 'phone_commands', p, 'sessions', s);
end $$;
revoke all on function public.purge_old_rows() from public, anon, authenticated;

-- how full is the free 500 MB? (the app shows a warning at 400 MB)
create or replace function public.db_size_mb() returns numeric language sql stable as $$ select round(pg_database_size(current_database()) / 1048576.0, 1) $$;

-- ---------- Row Level Security: only the owner sees or changes anything ----------
do $$
declare t text;
begin
  foreach t in array array['settings','tasks','reminders','memories','powers','decisions','activity_log','events','devices','device_apps','system_state','phone_commands','bots','library_items','capabilities','sessions','model_usage'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('create policy owner_all on public.%I for all using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t);
  end loop;
end $$;
-- the public (not logged-in) key can touch nothing
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;

-- ---------- realtime: ONLY these tables push live (free tier = 2M messages/month; no heartbeats, no typing events) ----------
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.system_state, public.phone_commands, public.tasks, public.reminders;
  end if;
end $$;

-- first-login helper: Amit's app calls this once after signing in. Creates the single kill-switch row (kill = OFF).
create or replace function public.init_owner() returns void language sql as $$
  insert into public.system_state (id) values (1) on conflict (id) do nothing;
$$;
