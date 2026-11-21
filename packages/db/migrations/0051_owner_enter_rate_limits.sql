-- Migration 0051: Database-backed rate limiting for /api/auth/owner.enter
-- Replaces in-memory Map with atomic, multi-instance-safe Postgres counters.
-- Only service_role may execute the RPCs or touch the table; anon/authenticated have no access.

create table if not exists public.owner_enter_attempts (
  id bigint generated always as identity primary key,
  ip text not null,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists idx_owner_enter_attempts_created_at
  on public.owner_enter_attempts (created_at desc);

create index if not exists idx_owner_enter_attempts_ip_created_at
  on public.owner_enter_attempts (ip, created_at desc);

alter table public.owner_enter_attempts enable row level security;
alter table public.owner_enter_attempts force row level security;
revoke all on public.owner_enter_attempts from public, anon, authenticated;

create or replace function public.check_owner_enter_rate_limit(
  p_ip text,
  p_window_seconds integer default 600,
  p_ip_limit integer default 5,
  p_global_limit integer default 20
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ip text := left(coalesce(nullif(btrim(p_ip), ''), 'unknown'), 128);
  v_cutoff timestamptz;
  v_ip_count integer;
  v_global_count integer;
begin
  if p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400
     or p_ip_limit is null or p_ip_limit < 1
     or p_global_limit is null or p_global_limit < 1 then
    raise exception 'invalid owner_enter rate-limit arguments';
  end if;

  v_cutoff := clock_timestamp() - make_interval(secs => p_window_seconds);

  select
    count(*) filter (where ip = v_ip),
    count(*)
  into v_ip_count, v_global_count
  from public.owner_enter_attempts
  where created_at > v_cutoff;

  return jsonb_build_object(
    'allowed', (v_ip_count < p_ip_limit and v_global_count < p_global_limit),
    'ip_count', v_ip_count,
    'global_count', v_global_count
  );
end $$;

create or replace function public.record_owner_enter_failure(
  p_ip text,
  p_window_seconds integer default 600,
  p_ip_limit integer default 5,
  p_global_limit integer default 20
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ip text := left(coalesce(nullif(btrim(p_ip), ''), 'unknown'), 128);
  v_now timestamptz := clock_timestamp();
  v_cutoff timestamptz;
  v_prune_cutoff timestamptz;
  v_ip_count integer;
  v_global_count integer;
begin
  if p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400
     or p_ip_limit is null or p_ip_limit < 1
     or p_global_limit is null or p_global_limit < 1 then
    raise exception 'invalid owner_enter rate-limit arguments';
  end if;

  perform pg_advisory_xact_lock(hashtext('public.owner_enter_attempts'));

  v_cutoff := v_now - make_interval(secs => p_window_seconds);
  v_prune_cutoff := v_now - make_interval(secs => greatest(p_window_seconds, 3600));

  delete from public.owner_enter_attempts where created_at < v_prune_cutoff;
  insert into public.owner_enter_attempts(ip, created_at) values (v_ip, v_now);

  select
    count(*) filter (where ip = v_ip),
    count(*)
  into v_ip_count, v_global_count
  from public.owner_enter_attempts
  where created_at > v_cutoff;

  return jsonb_build_object(
    'ip_count', v_ip_count,
    'global_count', v_global_count,
    'blocked', (v_ip_count >= p_ip_limit or v_global_count >= p_global_limit)
  );
end $$;

revoke all on function public.check_owner_enter_rate_limit(text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.record_owner_enter_failure(text, integer, integer, integer) from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.owner_enter_attempts to service_role;
    grant execute on function public.check_owner_enter_rate_limit(text, integer, integer, integer) to service_role;
    grant execute on function public.record_owner_enter_failure(text, integer, integer, integer) to service_role;
  end if;
end $$;
