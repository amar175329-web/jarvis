-- Production state snapshot 2026-11-07: this migration (0004) is already applied and verified. Do not replay it.
-- Fresh databases only: run after 0001 and 0003 (plus optional 0002).
-- jobs: the worker's to-do queue (long/background work). The worker uses the service_role key; the owner can read and add jobs from the app.
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind ~ '^[a-z0-9]+(\.[a-z0-9-]+)+$'),
  payload jsonb not null default '{}'::jsonb check (pg_column_size(payload) < 16384),
  state text not null default 'queued' check (state in ('queued','running','done','failed','cancelled')),
  attempts integer not null default 0, max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  run_at timestamptz not null default now(),
  locked_by text, locked_until timestamptz,
  result jsonb, error text check (length(error) <= 2000),
  idempotency_key text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), finished_at timestamptz,
  constraint jobs_owner_idempotency_key_uq unique (owner_id, idempotency_key));
create index jobs_due_idx on public.jobs (run_at) where state = 'queued';
create index jobs_lease_idx on public.jobs (locked_until) where state = 'running';
create trigger jobs_touch before update on public.jobs for each row execute function public.touch_updated_at();

alter table public.jobs enable row level security;
create policy owner_all on public.jobs for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- claim_job: the worker takes the next due job. Fail-closed: no system_state row, or kill = true => nothing is handed out.
-- A job whose lease ran out (worker died) is taken again; after max_attempts it is marked failed instead.
create or replace function public.claim_job(p_worker text, p_lease_seconds integer default 60) returns public.jobs
language plpgsql security definer set search_path = public as $$
declare j public.jobs;
begin
  if p_worker is null or length(p_worker) = 0 then raise exception 'worker id required'; end if;
  update public.jobs set state = 'failed', error = 'lease expired too many times', finished_at = now(), locked_by = null, locked_until = null
   where state = 'running' and locked_until < now() and attempts >= max_attempts;
  select * into j from public.jobs
   where (state = 'queued' and run_at <= now() or state = 'running' and locked_until < now())
     and exists (select 1 from public.system_state s where s.owner_id = jobs.owner_id and s.id = 1 and s.kill = false)
   order by run_at limit 1 for update skip locked;
  if not found then return null; end if;
  update public.jobs set state = 'running', attempts = attempts + 1, locked_by = p_worker,
         locked_until = now() + make_interval(secs => greatest(p_lease_seconds, 5)) where id = j.id returning * into j;
  return j;
end $$;

-- heartbeat_job: a long job extends its lease. Returns false if the job is no longer ours (then the worker must stop).
create or replace function public.heartbeat_job(p_id uuid, p_worker text, p_lease_seconds integer default 60) returns boolean
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.jobs set locked_until = now() + make_interval(secs => greatest(p_lease_seconds, 5))
   where id = p_id and state = 'running' and locked_by = p_worker and locked_until >= now();
  get diagnostics n = row_count; return n = 1;
end $$;

-- finish_job: ok -> done. not ok -> queued again after p_retry_in_seconds, or failed when attempts are used up (or p_retry is false).
create or replace function public.finish_job(p_id uuid, p_worker text, p_ok boolean, p_result jsonb default null, p_error text default null, p_retry_in_seconds integer default 30, p_retry boolean default true) returns public.jobs
language plpgsql security definer set search_path = public as $$
declare j public.jobs;
begin
  select * into j from public.jobs where id = p_id and state = 'running' and locked_by = p_worker for update;
  if not found then return null; end if;
  if p_ok then
    update public.jobs set state = 'done', result = p_result, error = null, finished_at = now(), locked_by = null, locked_until = null where id = j.id returning * into j;
  elsif p_retry and j.attempts < j.max_attempts then
    update public.jobs set state = 'queued', error = left(p_error, 2000), run_at = now() + make_interval(secs => greatest(p_retry_in_seconds, 0)), locked_by = null, locked_until = null where id = j.id returning * into j;
  else
    update public.jobs set state = 'failed', error = left(p_error, 2000), finished_at = now(), locked_by = null, locked_until = null where id = j.id returning * into j;
  end if;
  return j;
end $$;

-- purge_old_jobs: finished jobs are kept 30 days (free 500 MB guard, decision 009).
create or replace function public.purge_old_jobs() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.jobs where state in ('done','failed','cancelled') and finished_at < now() - interval '30 days';
  get diagnostics n = row_count; return n;
end $$;

-- Only the server (service_role) may run these. Never the app, never anon.
revoke all on function public.claim_job(text, integer), public.heartbeat_job(uuid, text, integer), public.finish_job(uuid, text, boolean, jsonb, text, integer, boolean), public.purge_old_jobs() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.claim_job(text, integer), public.heartbeat_job(uuid, text, integer), public.finish_job(uuid, text, boolean, jsonb, text, integer, boolean), public.purge_old_jobs() to service_role;
  end if;
end $$;
