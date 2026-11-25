# notifications
STATUS: built
WHAT IT IS: Owner-scoped notifications reader with fixed safe labels and an unread cursor. This is only the shell display/read-state surface; it never fires reminders.
WHAT IT CAN DO:
- Read allowlisted event metadata (`id`, `type`, `ts`) through the owner bearer and Supabase anon key under RLS.
- Project fixed labels and derive unread state from `settings.notifications.read_through`.
- Mark the visible list read after explicit confirmation and the registered `notifications.mark-read` power.
WHAT IT CANNOT DO / LIMITS:
- Never selects or returns event payload, source, detail, or free-text summary. Unknown event types are dropped.
- No reminder polling, scheduling, worker, firing, or notification delivery. D1a owns reminder firing.
- No service-role key in this feature or browser bundle; no new table, migration, or api/ file.
HOW IT WORKS:
`src/handler.mjs` exports `handle(action, request, context)` and `NOTIFICATION_ACTIONS`. `context.requireOwner` validates the owner session; Supabase requests use the owner access token plus anon key so RLS scopes the data. Read cursor uses the existing `settings` table.
INPUTS / OUTPUTS:
GET `notifications.list` -> `{ notifications: [{ id, title, createdAt, unread }], unreadCount }`. POST `notifications.mark-read` requires `{ confirm: true }` and the injected `executePower` adapter.
USES / USED BY:
Uses only existing owner session/RLS and shell contracts; dependencies are listed in manifest.json. LEAD/Antigravity mounts the UI and actions.
POWER LEVEL & CONFIRMATION:
List is L0 read-only. Mark-read is a proposed S00/S22 registered power, seed at L0, explicit confirmation retained; handler fails closed without `executePower`.
EXAMPLES:
A `device.paired` event becomes the fixed label `Device connected`; payload text is never read.
KNOWN ISSUES:
LEAD must mount these actions in the existing shared serverless function and approve routes. No reminder event/worker is implemented here.
CHANGE LOG:
- 2026-11-23 - Folder-First knowledge and planned manifest refreshed for D2 shell bundle 3 - 0.1.0.
- 2026-11-23 - Implemented D2 shell bundle 3, added component/handler/tests and updated implementation knowledge; version 0.2.0.
