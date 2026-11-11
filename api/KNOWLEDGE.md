# api
STATUS: built
WHAT IT IS: Server route container. Each feature endpoint lives under a registered api/* unit and delegates to its package-level logic.
WHAT IT CAN DO:
- `api/auth` owns the Supabase owner session bridge.
- `api/system` owns system kill-switch and event intake/history routes.
- Root `test:all` discovers registered API unit tests.
WHAT IT CANNOT DO / LIMITS:
- This container holds no duplicated business logic; route ownership belongs to a specific api subunit or package.
- Password login and voice runtime are not implemented here.
HOW IT WORKS: Folder-First registration adds each `api/*` folder to the manifest layout, with its own `KNOWLEDGE.md`, `manifest.json`, tests and thin route handlers.
INPUTS / OUTPUTS: HTTP requests and standard `{ok:true,data}` / `{ok:false,error}` JSON responses.
USES / USED BY: Uses packages and auth services; used by web app and paired clients.
POWER LEVEL & CONFIRMATION: L0. Routes enforce identity/capability but do not autonomously execute user actions.
EXAMPLES: `/api/system/kill.set` delegates to `api/system`; `/api/auth/session.get` delegates to `api/auth`.
KNOWN ISSUES: Native Android UI/token storage remains Android squad scope.
CHANGE LOG:
- (append-only) folder-first: created as planned, version 0.0.1. Owner: LEAD / S00.
- 2026-11-07 - Registered api/auth and api/system units and added route/test discovery - container brought into built state.
