-- PROPOSAL ONLY — do not apply until LEAD accepts CR-S08-B3-API and S22 CR.
-- Next migration number: 0061. Existing 0060 is already applied and MUST NOT be edited/replayed.
-- This migration adds nullable fields / a new allowed state; existing task/reminder rows are not rewritten.

alter table public.tasks
  add column if not exists ends_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tasks_ends_at_after_due_s08_b3_ck'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_ends_at_after_due_s08_b3_ck
      check (ends_at is null or (due_at is not null and ends_at > due_at)) not valid;
  end if;
end $$;

-- Replace the original inline `state IN ('pending','fired','cancelled')` check.
-- Existing valid rows already belong to this set; no data UPDATE is performed.
alter table public.reminders
  drop constraint if exists reminders_state_check;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'reminders_state_s08_b3_ck'
      and conrelid = 'public.reminders'::regclass
  ) then
    alter table public.reminders
      add constraint reminders_state_s08_b3_ck
      check (state in ('pending','fired','cancelled','done')) not valid;
  end if;
end $$;

-- Required shape for owner-scoped clash filtering.
create index if not exists tasks_owner_status_due_s08_b3_idx
  on public.tasks(owner_id, status, due_at);

-- The following owner-invoker RPCs make reminder row changes and queued-job changes
-- atomic. App calls them through the existing API function using the owner's
-- bearer JWT + anon key; RLS remains active. No service-role key or SECURITY DEFINER.

create or replace function public.s08_set_reminder_state(
  p_reminder_id uuid,
  p_state text
) returns setof public.reminders
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_reminder public.reminders;
begin
  if v_owner is null then raise exception 'owner session required'; end if;
  if p_state not in ('done','cancelled') then raise exception 'invalid reminder state'; end if;

  select * into v_reminder
    from public.reminders
   where id = p_reminder_id and owner_id = v_owner
   for update;
  if not found then raise exception 'reminder not found'; end if;
  if v_reminder.state <> 'pending' then raise exception 'reminder is not pending'; end if;

  if exists (
    select 1 from public.jobs
     where owner_id = v_owner
       and kind = 'reminders.fire'
       and payload ->> 'reminder_id' = p_reminder_id::text
       and state = 'running'
  ) then
    raise exception 'reminder job is already running';
  end if;

  update public.jobs
     set state = 'cancelled', finished_at = now(), locked_by = null, locked_until = null
   where owner_id = v_owner
     and kind = 'reminders.fire'
     and payload ->> 'reminder_id' = p_reminder_id::text
     and state = 'queued';

  update public.reminders
     set state = p_state
   where id = p_reminder_id and owner_id = v_owner
   returning * into v_reminder;
  return next v_reminder;
  return;
end;
$$;

create or replace function public.s08_replace_reminder(
  p_reminder_id uuid,
  p_text text,
  p_remind_at timestamptz,
  p_repeat_rule text,
  p_time_zone text,
  p_allow_duplicate boolean
) returns setof public.reminders
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_reminder public.reminders;
  v_job_id uuid;
  v_key text;
begin
  if v_owner is null then raise exception 'owner session required'; end if;
  if p_text is null or length(btrim(p_text)) = 0 or length(p_text) > 500 then raise exception 'invalid reminder text'; end if;
  if p_remind_at is null or p_time_zone is null or length(p_time_zone) > 64 then raise exception 'invalid reminder schedule'; end if;
  if p_repeat_rule is not null and p_repeat_rule not in ('FREQ=DAILY','FREQ=WEEKLY','FREQ=MONTHLY','FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR') then raise exception 'invalid repeat rule'; end if;

  select * into v_reminder
    from public.reminders
   where id = p_reminder_id and owner_id = v_owner
   for update;
  if not found then raise exception 'reminder not found'; end if;
  if v_reminder.state <> 'pending' then raise exception 'only pending reminders can be edited'; end if;

  if coalesce(p_allow_duplicate, false) = false and exists (
    select 1 from public.reminders other_reminder
     where other_reminder.owner_id = v_owner
       and other_reminder.id <> p_reminder_id
       and other_reminder.state = 'pending'
       and lower(btrim(other_reminder.text)) = lower(btrim(p_text))
       and date_trunc('minute', other_reminder.remind_at) = date_trunc('minute', p_remind_at)
  ) then
    raise exception 'duplicate_reminder';
  end if;

  if exists (
    select 1 from public.jobs
     where owner_id = v_owner
       and kind = 'reminders.fire'
       and payload ->> 'reminder_id' = p_reminder_id::text
       and state = 'running'
  ) then
    raise exception 'reminder job is already running';
  end if;

  update public.jobs
     set state = 'cancelled', finished_at = now(), locked_by = null, locked_until = null
   where owner_id = v_owner
     and kind = 'reminders.fire'
     and payload ->> 'reminder_id' = p_reminder_id::text
     and state = 'queued';

  update public.reminders
     set text = btrim(p_text), remind_at = p_remind_at,
         repeat_rule = p_repeat_rule, time_zone = p_time_zone
   where id = p_reminder_id and owner_id = v_owner
   returning * into v_reminder;

  v_key := 'reminders.fire:' || p_reminder_id::text || ':' ||
    to_char(p_remind_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  insert into public.jobs as existing_job(owner_id, kind, payload, state, run_at, idempotency_key, max_attempts)
  values (v_owner, 'reminders.fire', jsonb_build_object('reminder_id', p_reminder_id), 'queued', p_remind_at, v_key, 5)
  on conflict (owner_id, idempotency_key) do update
    set payload = excluded.payload,
        state = 'queued', run_at = excluded.run_at,
        attempts = 0, max_attempts = excluded.max_attempts,
        locked_by = null, locked_until = null,
        result = null, error = null, finished_at = null
    where existing_job.state = 'cancelled'
  returning id into v_job_id;

  if v_job_id is null then raise exception 'reminder job could not be replaced'; end if;
  return next v_reminder;
  return;
end;
$$;

create or replace function public.s08_delete_reminder(
  p_reminder_id uuid
) returns table(id uuid)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_reminder public.reminders;
  v_deleted_id uuid;
begin
  if v_owner is null then raise exception 'owner session required'; end if;
  select * into v_reminder
    from public.reminders
   where reminders.id = p_reminder_id and reminders.owner_id = v_owner
   for update;
  if not found then raise exception 'reminder not found'; end if;

  if exists (
    select 1 from public.jobs
     where owner_id = v_owner
       and kind = 'reminders.fire'
       and payload ->> 'reminder_id' = p_reminder_id::text
       and state = 'running'
  ) then
    raise exception 'reminder job is already running';
  end if;

  update public.jobs
     set state = 'cancelled', finished_at = now(), locked_by = null, locked_until = null
   where owner_id = v_owner
     and kind = 'reminders.fire'
     and payload ->> 'reminder_id' = p_reminder_id::text
     and state = 'queued';

  delete from public.reminders
   where reminders.id = p_reminder_id and reminders.owner_id = v_owner
   returning reminders.id into v_deleted_id;
  id := v_deleted_id;
  return next;
end;
$$;

-- Restrict RPC execution to logged-in owners; functions are SECURITY INVOKER and
-- every select/update/delete remains subject to owner_all RLS on both tables.
revoke all on function public.s08_set_reminder_state(uuid, text) from public, anon;
revoke all on function public.s08_replace_reminder(uuid, text, timestamptz, text, text, boolean) from public, anon;
revoke all on function public.s08_delete_reminder(uuid) from public, anon;
grant execute on function public.s08_set_reminder_state(uuid, text) to authenticated;
grant execute on function public.s08_replace_reminder(uuid, text, timestamptz, text, text, boolean) to authenticated;
grant execute on function public.s08_delete_reminder(uuid) to authenticated;

-- End of PROPOSAL. No API/worker/power code is applied by this file.
