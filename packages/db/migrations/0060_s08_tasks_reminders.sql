alter table public.tasks
  add column if not exists repeat_rule text,
  add column if not exists time_zone text not null default 'Asia/Kolkata';

alter table public.reminders
  add column if not exists time_zone text not null default 'Asia/Kolkata',
  add column if not exists approved_decision_id uuid null
    references public.decisions(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tasks_repeat_rule_s08_ck'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_repeat_rule_s08_ck
      check (repeat_rule is null or repeat_rule in (
        'FREQ=DAILY', 'FREQ=WEEKLY', 'FREQ=MONTHLY',
        'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'
      )) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'reminders_repeat_rule_s08_ck'
      and conrelid = 'public.reminders'::regclass
  ) then
    alter table public.reminders
      add constraint reminders_repeat_rule_s08_ck
      check (repeat_rule is null or repeat_rule in (
        'FREQ=DAILY', 'FREQ=WEEKLY', 'FREQ=MONTHLY',
        'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'
      )) not valid;
  end if;
end $$;

create index if not exists tasks_owner_due_s08_idx
  on public.tasks(owner_id, due_at)
  where status in ('todo', 'doing') and due_at is not null;

create index if not exists reminders_owner_due_s08_idx
  on public.reminders(owner_id, remind_at)
  where state = 'pending';

create index if not exists reminders_approval_s08_idx
  on public.reminders(approved_decision_id)
  where approved_decision_id is not null;
