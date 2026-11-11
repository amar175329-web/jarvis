# events
STATUS: built
WHAT IT IS: JARVIS का strict event envelope, registry, offline outbox और database persistence adapter. हर event एक validated envelope में जाता है।
WHAT IT CAN DO:
- Envelope में `id`, dot.case `type`, `source`, UTC `ts`, object `payload`, optional `correlation_id`, version और server intake के लिए required `idempotency_key` होता है। Payload 16 KB से छोटा होना चाहिए।
- Registry unapproved type और malformed payload reject करती है। S21 के छह approved voice/persona events metadata-only और stored-only हैं।
- `EventOutbox` idempotency key के साथ enqueue करता है, insertion order में flush करता है और failed/network/429/5xx send पर event को queue में रखता है। Browser IndexedDB adapter उपलब्ध है; Android समान `OutboxStore` contract लागू कर सकता है।
- Supabase adapter `events` में owner-scoped idempotent insert/list करता है। Event intake 60/minute/owner database RPC limit जाँचता है; RPC unavailable हो तो write fail-closed है।
- `events` table Realtime publication में नहीं है। Live classified events भी event history में लिखते हैं; phone/app live updates अपनी चार allowed tables से लेते हैं।
WHAT IT CANNOT DO / LIMITS:
- Browser IndexedDB adapter है; native Android Room/SQLite adapter अभी Android squad का काम है।
- Production event writes/rate limit के लिए migration `0005_event_rate_limits.sql` Antigravity को real Supabase पर apply करनी होगी; इस bundle ने remote DB नहीं छुआ।
- Event को action नहीं माना जाता। Event intake किसी command/tool को execute नहीं करता।
HOW IT WORKS:
1. `src/envelope.ts`, `registry.ts`, `validate.ts` schema और type/payload validation करते हैं।
2. `src/outbox.ts` `OutboxStore` interface पर enqueue/ordered replay करता है; `src/indexeddb.ts` IndexedDB adapter है और `eventHttpTransport` same-origin cookie transport देता है।
3. `src/store.ts` service-role PostgREST adapter idempotent insert/list करता है; `src/emit.ts` validation, required key, rate-limit और DB insert orchestrate करता है।
4. Rate limit `consume_event_rate_limit` (migration 0005) से atomic 60 calls/60 seconds per owner है।
INPUTS / OUTPUTS: In: event envelope + idempotency key; Out: accepted/duplicate result or bad_request/payload_too_large/rate_limited/unavailable. Routes `/api/system/events.emit` and `.list`.
USES / USED BY: Uses `packages.db`, `packages.shared`; used by API, app, worker and Android client adapters.
POWER LEVEL & CONFIRMATION: L0. Events are records only, not commands.
EXAMPLES: A queued event replayed after a network outage uses the same key; server replies duplicate=true for the existing row and the client removes the queue entry.
KNOWN ISSUES:
- Android durable storage adapter and background sync lifecycle remain to be implemented by S16A.
- Registry changes require S00/LEAD approval plus matching tests.
CHANGE LOG:
- (append-only) folder-first: created as planned, version 0.0.1. Owner: S00.
- 2026-11-07 - Envelope, approved event registry, strict validation and live-via-table policy; 21 event types - 0.1.0.
- 2026-11-07 - IndexedDB outbox, ordered replay, Supabase idempotent store, DB rate limit and six S21 metadata-only events; event tests expanded - 0.2.0.
