-- S13 PREFS+MODELS (range 0050s). NEW file: never edit applied migrations. Draft: NOT applied to any real project.
-- Antigravity applies to jarvis-test first, after LEAD accepts the REPORT and Amit says yes.

-- 1) per-owner model registry copy (the git file packages/models/registry/models.json is the default; Amit's switches live here)
create table if not exists public.model_registry (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,                                  -- 'provider/model'
  entry jsonb not null,                              -- full ModelEntry, validated in app code (packages/models)
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (owner_id, id),
  constraint model_registry_tier_ok check (entry->>'tier' in ('free','almost_zero','paid_big','local'))
);

-- 2) price/limit check history: where a number came from and when it was looked at
create table if not exists public.model_price_checks (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  model_id text not null, checked_on date not null, source_url text not null,
  price jsonb, limits jsonb, note text, created_at timestamptz not null default now()
);
create index if not exists model_price_checks_idx on public.model_price_checks (owner_id, model_id, checked_on desc);

-- 3) usage rows learn about cache tokens, tier and fallback (cost tracking per tier)
alter table public.model_usage add column if not exists cache_read_tokens integer not null default 0;
alter table public.model_usage add column if not exists cache_write_tokens integer not null default 0;
alter table public.model_usage add column if not exists tier text;
alter table public.model_usage add column if not exists fallback_from text;
create index if not exists model_usage_model_day_idx on public.model_usage (owner_id, provider, model, ts desc);

-- 4) DB-level guard: a paid_big model can be switched on only after Amit set settings key 'models.paid_big_enabled' = true
create or replace function public.model_registry_guard() returns trigger language plpgsql as $$
begin
  if new.enabled and new.entry->>'tier' = 'paid_big' and not exists (
       select 1 from public.settings s where s.owner_id = new.owner_id and s.key = 'models.paid_big_enabled' and s.value = 'true'::jsonb) then
    raise exception 'paid_big model needs settings models.paid_big_enabled = true (set by Amit)';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists model_registry_guard_t on public.model_registry;
create trigger model_registry_guard_t before insert or update on public.model_registry for each row execute function public.model_registry_guard();

-- 5) RLS: owner only, same as every table
do $$
declare t text;
begin
  foreach t in array array['model_registry','model_price_checks'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists owner_all on public.%I', t);
    execute format('create policy owner_all on public.%I for all using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t);
  end loop;
end $$;
revoke all on public.model_registry, public.model_price_checks from anon;

-- settings keys used (table public.settings, jsonb value; no new table needed):
--   models.prefs            {"day_limit_inr":null,"month_limit_inr":null,"show_inr":false}   (null = not set by Amit: models refused)
--   models.paid_big_enabled true | false (default absent = false)
--   models.local_health     {"ok":false,"checked_at":"<iso>","host":"<label>"}   (written by worker; older than 3 min = not healthy)
--   fx.inr_per_usd          {"inr_per_usd":<number>,"checked_on":"YYYY-MM-DD","source":"<where Amit/worker got it>"}
--   models.limits_confirmed {"gemini-free/gemini-3.5-flash-lite":{"rpd":<n>,"confirmed_on":"YYYY-MM-DD"}, ...}  (Amit's AI Studio numbers)
