-- Run after 0001..0004. Prepared locally only; Antigravity applies it to the real Supabase project.
-- Atomic per-owner fixed-window event limit. The API calls the RPC with service_role; clients cannot call it.
create table public.event_rate_limits (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  hits integer not null check (hits >= 1)
);

alter table public.event_rate_limits enable row level security;
create policy owner_all on public.event_rate_limits for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke all on public.event_rate_limits from anon, authenticated;

create or replace function public.consume_event_rate_limit(
  p_owner_id uuid, p_limit integer default 60, p_window_seconds integer default 60
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  t timestamptz := clock_timestamp();
  n integer;
begin
  if p_owner_id is null or p_limit < 1 or p_window_seconds < 1 or p_window_seconds > 3600 then
    raise exception 'invalid event rate-limit arguments';
  end if;
  insert into public.event_rate_limits(owner_id, window_started_at, hits)
    values (p_owner_id, t, 1)
  on conflict (owner_id) do update set
    window_started_at = case
      when event_rate_limits.window_started_at <= t - make_interval(secs => p_window_seconds) then t
      else event_rate_limits.window_started_at end,
    hits = case
      when event_rate_limits.window_started_at <= t - make_interval(secs => p_window_seconds) then 1
      else event_rate_limits.hits + 1 end
  returning hits into n;
  return n <= p_limit;
end $$;

revoke all on function public.consume_event_rate_limit(uuid, integer, integer) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.consume_event_rate_limit(uuid, integer, integer) to service_role;
    grant all on public.event_rate_limits to service_role;
  end if;
end $$;

-- Atomic kill-switch write + audit. A server endpoint performs the owner/device capability check first.
create or replace function public.set_system_kill(
  p_owner_id uuid, p_kill boolean, p_changed_by text, p_reason text default null
) returns public.system_state
language plpgsql security definer set search_path = public as $$
declare s public.system_state;
begin
  if p_owner_id is null or p_changed_by is null or length(p_changed_by) = 0 then
    raise exception 'invalid kill-switch arguments';
  end if;
  update public.system_state
    set kill = p_kill, changed_by = left(p_changed_by, 100)
    where owner_id = p_owner_id and id = 1
    returning * into s;
  if not found then return null; end if;
  insert into public.activity_log(owner_id, actor, action, target, detail, ok)
    values (p_owner_id, left(p_changed_by, 100), case when p_kill then 'kill_switch.enabled' else 'kill_switch.disabled' end,
      'system_state', jsonb_build_object('reason', left(coalesce(p_reason, ''), 500), 'epoch', s.epoch), true);
  return s;
end $$;
revoke all on function public.set_system_kill(uuid, boolean, text, text) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.set_system_kill(uuid, boolean, text, text) to service_role;
  end if;
end $$;
