# history
STATUS: built
WHAT IT IS: Owner-only history view for stored JARVIS chat conversations, plus the Activity Logs tab provided by S05.
WHAT IT CAN DO:
- (built) List recent chat threads, paginate by update time, and select a conversation.
- (built) List completed messages for an owner-verified thread in chronological order, with sequence-based pagination.
- (built) Mask private messages and private thread titles with a generic label and `private` badge; normal title search only sees the redacted projection.
- (built) Render a mobile-first two-pane desktop / stacked mobile History page and expose Activity Logs as a tab.
WHAT IT CANNOT DO / LIMITS:
- No edit, delete, export, restore, or content indexing.
- No model calls. Private message bodies, health/medicine/money/family/feeling/location data and secrets are never sent to a cloud or local model.
- No access to another owner's threads: session owner + user bearer + PostgREST RLS are required.
- Pending/in-progress chat messages are omitted; only `status='done'` messages are returned.
HOW IT WORKS: `src/handler.ts` exports `handle(action, request, context)` for LEAD's existing shared API function. It imports the established owner-session verifier, requires the registered `history.read` power and a readable OFF kill switch, then queries `chat_threads` / `chat_messages` using the anon key plus the verified owner's bearer. Private projections use the S08 shared sensitivity function together with S09's real `classify()` and `findSecrets()` helpers through Activity Logs' privacy module.
INPUTS / OUTPUTS: `history.threads.list` accepts `{ before?, limit? }`; `history.messages.list` accepts `{ thread_id, before_sequence?, limit? }`. Both return owner-scoped `{ ok, data }` envelopes; private content is returned only as `Private message hidden`.
USES / USED BY: Uses `api.auth`, `packages.brain`, `packages.memory`, and `features.core-workspace.activity-logs`. S00 mounts `HistoryPage` in the existing shell; this feature does not edit `app/`.
POWER LEVEL & CONFIRMATION: Read route requires registered S22 power `history.read` and a confirmed healthy OFF kill-switch read. The route is observation-only and never writes chat content. No action is taken at L0/L1; an absent power, ON kill switch or unreadable kill switch blocks access.
EXAMPLES: Open History, select a conversation, and see normal messages; sensitive messages appear as `Private message hidden` with a `private` badge.
KNOWN ISSUES: LEAD must mount both action modules into the existing `api/tasks/index.ts` shared function; S22 must seed `history.read`; S00 must wire the History nav/Page import. These integrations are requested by CRs and are not changed in this feature patch.
CHANGE LOG:
- (append-only) 2026-11-23: S05 built P31 history handler, privacy projection, API client and History page. Owner: S05.


Power behaviour: L0/L1 are observation-only. If the registered read power reaches L2, the handler returns `confirmation_required` until the owner submits `confirmed: true`; the UI exposes an explicit confirm action. A missing power or unreadable/ON kill switch always fails closed.
