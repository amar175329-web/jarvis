-- S07 CHAT reply claim & idempotency
-- Adds reply_to_message_id to chat_messages with a unique partial index per (thread_id, reply_to_message_id)
-- to ensure only one assistant reply is generated per user message.

alter table public.chat_messages
  add column if not exists reply_to_message_id uuid references public.chat_messages(id) on delete set null;

create index if not exists chat_messages_reply_to_idx
  on public.chat_messages(reply_to_message_id);

create unique index if not exists chat_messages_thread_reply_to_idx
  on public.chat_messages(thread_id, reply_to_message_id)
  where reply_to_message_id is not null;
