-- S05 Bundle (2): strengthen access + timeline indexes for the existing activity_log.
-- No new table and no chat-history copy are needed; chat_threads/chat_messages remain the source.
-- Antigravity applies only after LEAD accepts CR-S05-DB. Not applied by this patch.

begin;

create index if not exists activity_log_owner_action_ts_s05_idx
  on public.activity_log(owner_id, action, ts desc);

create index if not exists activity_log_owner_actor_ts_s05_idx
  on public.activity_log(owner_id, actor, ts desc);

-- 0001_core already creates the owner_all policy and enables/forces RLS;
-- repeat the hardening explicitly for this unit's storage contract.
alter table public.activity_log enable row level security;
alter table public.activity_log force row level security;

revoke all on public.activity_log from public, anon;
grant select, insert on public.activity_log to authenticated;
grant usage, select on sequence public.activity_log_id_seq to authenticated;

commit;
