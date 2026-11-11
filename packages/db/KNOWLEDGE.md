# db
STATUS: built
WHAT IT IS: Supabase (Postgres + Auth + Realtime) schema, migrations, RLS, queue functions and service-only operational RPCs. Production migration state reported by LEAD: 0001–0004 applied and verified. Migration 0005 in this bundle is prepared locally only.
WHAT IT CAN DO:
- 18 core tables from migrations 0001–0004; migration 0005 adds `event_rate_limits` for owner-scoped database rate limiting.
- RLS on owner data; power cap enforced in DB; fail-closed kill switch row and trigger cancel waiting/running phone commands and bump epoch.
- Phone command queue with claim/expiry/idempotency/kill_epoch; worker jobs queue with claim/heartbeat/finish/purge routines.
- Migration 0004 functions `claim_job`, `heartbeat_job`, `finish_job`, `purge_old_jobs` explicitly revoke PUBLIC/anon/authenticated and grant EXECUTE only to service_role.
- Migration 0005 adds service-role-only `consume_event_rate_limit` and `set_system_kill`; the latter writes kill state and audit activity in one transaction.
- Realtime publication remains limited to `system_state`, `phone_commands`, `tasks`, `reminders`; the `events` table is not published.
WHAT IT CANNOT DO / LIMITS:
- This code bundle does not connect to or execute migrations on real Supabase. LEAD snapshot: 0001–0004 are already applied there. Only Antigravity applies migration 0005.
- Migration 0005 has been tested locally with PGlite only; production still needs apply/verify by Antigravity.
- Free Supabase retention/backup limits remain as existing setup documentation describes.
HOW IT WORKS: Plain SQL in `migrations/` is applied in order. `tests/db.test.mjs` uses PGlite locally; it asserts all four 0004 function privileges (service_role allowed; authenticated and anon denied), actual execute/deny behavior, migration 0005 rate limiting and atomic audit.
INPUTS / OUTPUTS: SQL migrations and service-side PostgREST calls. Tables include events and operational rate limit table. Event row contains owner, envelope data and idempotency key.
USES / USED BY: Used by API, worker, app and the squads that persist owner data.
POWER LEVEL & CONFIRMATION: L0. It enforces data permissions/safety; it does not initiate user actions.
EXAMPLES: A DB-read outage is treated as kill ON by application safety. An authenticated user cannot invoke the service_role-only job or rate-limit RPCs.
KNOWN ISSUES: LEAD must apply migration 0005 after verifying real project state; do not replay migrations 0001–0004.
CHANGE LOG:
- (append-only) folder-first: created as planned, version 0.0.1. Owner: S00.
- 2026-11-06 0.1.0: core schema, RLS, kill switch, phone queue, retention; local tests.
- 2026-11-07 0.1.1: migration 0003 events idempotency; existing LEAD production snapshot later confirmed migrations 0001–0004 applied.
- 2026-11-07 0.1.2: migration 0004 jobs queue and service_role-only function grants.
- 2026-11-07 0.1.3: migration 0005 local draft for event rate limit and atomic kill/audit; privilege tests cover all four migration 0004 functions. Not applied to production by this bundle.
