# connect
STATUS: built
WHAT IT IS: Read-only connected-device status panel, without a pairing flow.
WHAT IT CAN DO:
- List active devices through owner RLS and display safe name/kind/paired/last-seen status.
- Project online state using a bounded freshness window.
WHAT IT CANNOT DO / LIMITS:
- Never selects or returns device tokens, token hashes, permissions, secrets, or auth metadata.
- Pairing/QR/token generation is deliberately not implemented; S17 must provide a registered L2-or-lower pairing flow first.
- No api/ file, table, migration, or service-role key.
HOW IT WORKS:
`src/handler.mjs` exports `handle(action, request, context)` and `CONNECT_ACTIONS`; its PostgREST projection is limited to `id,name,kind,paired_at,last_seen,revoked_at`, with RLS via the owner bearer and anon key.
INPUTS / OUTPUTS:
GET `devices.list` -> safe `{ devices: [{ id, name, kind, pairedAt, lastSeenAt, online }] }`.
USES / USED BY:
Uses only existing owner session/RLS and shell contracts; dependencies are listed in manifest.json. LEAD/Antigravity mounts the UI and actions.
POWER LEVEL & CONFIRMATION:
Read is L0. Pairing is not callable from this bundle; separate S17/S22 approval and confirmation required.
EXAMPLES:
Show a paired Android phone as Online/Last seen without revealing its token or permissions.
KNOWN ISSUES:
New-device CTA remains visibly disabled until S17 pairing contract, power registration, and route are accepted.
CHANGE LOG:
- 2026-11-23 - Folder-First knowledge and planned manifest refreshed for D2 shell bundle 3 - 0.1.0.
- 2026-11-23 - Implemented D2 shell bundle 3, added component/handler/tests and updated implementation knowledge; version 0.2.0.
