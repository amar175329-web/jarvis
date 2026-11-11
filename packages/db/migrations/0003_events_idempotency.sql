-- Production state snapshot 2026-11-07: this migration (0003) is already applied and verified. Do not replay it.
-- Fresh databases only: run after 0001 (and optional 0002).
-- events: duplicate protection. The same (owner_id, idempotency_key) can be stored only once.
-- Old rows and events without a key keep idempotency_key = null (Postgres allows many nulls in a unique constraint).
alter table public.events add column idempotency_key text;
alter table public.events add constraint events_owner_idempotency_key_uq unique (owner_id, idempotency_key);
