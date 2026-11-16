-- S07 CHAT reply claim status
-- Adds status column to chat_messages ('pending' | 'done') to enable DB-level claiming
-- before invoking models, preventing concurrent spend across multiple server instances.

alter table public.chat_messages
  add column if not exists status text not null default 'done' check (status in ('pending','done'));

create index if not exists chat_messages_thread_status_idx
  on public.chat_messages (thread_id, status);
