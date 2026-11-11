# system API
STATUS: built
WHAT IT IS: Server-side system endpoints for owner/device identity, kill-switch control and durable event intake/history.
WHAT IT CAN DO:
- `GET /api/system/kill.get` returns the current state to the owner or a paired device. Missing/unreadable/malformed state returns 503 with all actions treated as blocked.
- `POST /api/system/kill.set` writes state and an activity audit atomically via `set_system_kill`; a device can only set `kill=true`, owner alone can set false.
- Auth accepts the owner HttpOnly session or a paired device Bearer token; device token is pepper-hashed and looked up server-side. Service-role credentials never go to app/phone.
- `POST /api/system/events.emit` validates registered event schemas, requires `idempotency_key`, forces device source on server, checks a database-backed 60/minute owner limit, and persists duplicates idempotently.
- `POST /api/system/events.list` is owner-only and returns bounded, filtered event history.
WHAT IT CANNOT DO / LIMITS:
- It does not execute phone commands or turn the kill switch OFF from a device.
- Migration `0005_event_rate_limits.sql` is a new local migration draft and must be applied by Antigravity to the real project before event intake/rate limiting and atomic kill audit work in production.
- The events table remains outside Realtime publication; `realtime=true` is only metadata for event classification. Realtime stays on `phone_commands`, `system_state`, `tasks`, `reminders`.
- Android secure token storage and native kill UI remain the Android squad's client-side responsibility.
HOW IT WORKS: Thin route modules delegate to `index.ts`. Resolve owner session first, then validate device token hash. When Auth refresh rotates tokens, every successful owner system response returns the replacement HttpOnly cookie. All privileged DB calls use service-role server-side PostgREST. Kill state reads fail closed. Event persistence uses the `packages/events` store adapter and service-only RPC rate limit.
INPUTS / OUTPUTS: Routes: `/api/system/kill.get`, `/api/system/kill.set`, `/api/system/events.emit`, `/api/system/events.list`. Tables: `system_state`, `devices`, `events`, `event_rate_limits`, `activity_log`.
USES / USED BY: Uses `api.auth`, `packages.events`, `packages.safety`, `packages.db`; used by app and paired-device clients.
POWER LEVEL & CONFIRMATION: L0. Owner can explicitly turn OFF; paired device is ON-only. Event intake never triggers actions.
EXAMPLES: A phone sends an ON request with its paired token; an OFF request gets 403. If the event DB/rate-limit RPC is unavailable, the event stays in the client outbox and endpoint returns 503.
KNOWN ISSUES: Migration 0005 is not applied to production. A S16A Android client must implement durable local outbox and secure token storage.
CHANGE LOG:
- (append-only) 2026-11-07 - Folder-First registration before code - 0.0.1.
- 2026-11-07 - Kill switch and event REST routes, device authentication, idempotency/rate-limit integration and 15 API tests added - 0.1.0.
