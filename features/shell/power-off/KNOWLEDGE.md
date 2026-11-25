# power-off
STATUS: built
WHAT IT IS: Owner-confirmed, persistent emergency OFF switch surface, using the existing `system_state` kill record and system API.
WHAT IT CAN DO:
- Read kill state; when `kill=false` is verified, show an explicit confirm dialog.
- Request only `kill:true` with mandatory `confirm:true`, through the `system.power-off` S22 power adapter.
- Keep the entire app blocked when kill is ON, malformed, or unreadable.
WHAT IT CANNOT DO / LIMITS:
- There is no `kill:false` payload, resume function, boot reset, timer, fallback, or silent re-enable path in this feature.
- An OFF state persists in existing `system_state`; a separate owner-confirmed S22 `system.power-resume` action must be implemented/accepted by LEAD before re-arming is possible.
- No new table, migration, API file, or browser-side service key.
HOW IT WORKS:
`src/power-off-policy.mjs` validates the persisted kill/epoch pair fail-closed. `src/handler.mjs` accepts only POST `system.power-off`, requires owner auth and explicit confirm, then calls the injected `executePower` and `setKillSwitch` adapters. The existing kill RPC remains owned by `api/system`.
INPUTS / OUTPUTS:
GET uses existing `/api/system/kill.get`. POST delegates existing `/api/system/kill.set` route after LEAD wires it through this handler; body is exactly `{ kill: true, confirm: true, reason?: string }`.
USES / USED BY:
Uses only existing owner session/RLS and shell contracts; dependencies are listed in manifest.json. LEAD/Antigravity mounts the UI and actions.
POWER LEVEL & CONFIRMATION:
S22 `system.power-off`: proposed seed L0, max L2, `needs_confirm=true`, non-reversible for this feature. No silent re-arm. Any resume route is separate, owner-only, explicit L2 with its own audit.
EXAMPLES:
If kill state cannot be read, render the full-screen blocked state and prevent the application from appearing.
KNOWN ISSUES:
Current system route does not itself call this feature handler/executePower. LEAD must adapt the existing api/system dispatcher; this patch adds no api file and does not claim full production activation until CR acceptance.
CHANGE LOG:
- 2026-11-23 - Folder-First knowledge and planned manifest refreshed for D2 shell bundle 3 - 0.1.0.
- 2026-11-23 - Implemented D2 shell bundle 3, added component/handler/tests and updated implementation knowledge; version 0.2.0.
