# Backend Schema - data structure (living doc)
STATUS: DRAFT v0.1 | OWNER: S00 | Truth = packages/db/migrations/*.sql. If this file and SQL differ, SQL wins and this file is fixed.

## Tables (migrations 0001-0005, S22 proposes 0020)
settings, tasks, reminders, memories (768-dim vector), powers, decisions, activity_log, events, devices, device_apps, system_state (kill + epoch), phone_commands, bots, library_items, capabilities, sessions, model_usage, jobs (0004), event_rate_limits (0005).
## S09 memory tables (migrations 0030-0032, LEAD added 0021 for powers)
memories (extra columns: why, private, subject, subject_key, pinned, status, superseded_by, valid_to, revision, ref_type, ref_id, tokens, embedding_model, embedded_at, last_used_at, use_count; embedding halfvec(768), never on private rows: DB check), memory_links, memory_declines, notes, files, projects. Functions (SECURITY INVOKER, owner filter inside): memory_create, memory_search, memory_touch, memory_forget, memory_forget_all, memory_stats; purge_memory_rows (service_role only). powers gets `tags text[]` (0021). Truth = the SQL files.
## Rules for every table
owner_id uuid default auth.uid(); RLS enable + force; policy owner_all (owner_id = auth.uid()); updated_at trigger where edited; retention for log-like tables.
## Key constraints
powers: autonomy 0-4; current <= max_level; default <= max_level. decisions: why not null. phone_commands: refused when kill ON or no system_state row; stores kill_epoch.
## Migration ranges
S00 0001-0019 | S22 0020-0029 | S09 0030-0039 | S07 0040s | others get a range from LEAD.
## Known gaps
powers.tags column added by LEAD in 0021 (tested on local Postgres only). Chat tables come with S07. Never run migrations on real Supabase before local test.
