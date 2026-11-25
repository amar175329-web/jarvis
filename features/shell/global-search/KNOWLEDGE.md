# global-search
STATUS: built
WHAT IT IS: Local-only search over a curated allowlist of navigation destinations and feature metadata. It never queries owner records, chat contents, tasks, files, or remote services.
WHAT IT CAN DO:
- Search currently mounted and CR-approved destinations with English, Hindi, and Roman-Hinglish aliases.
- Return a destination identifier and a short public description; let the shell own the actual route transition.
WHAT IT CANNOT DO / LIMITS:
- No private record or full-text owner-data search.
- No cloud/local model call, no network request, and no new dependency.
- No HomePage.tsx, Sidebar.tsx, App.tsx, or vercel.json edits; LEAD mounts this component.
HOW IT WORKS:
`src/search-index.mjs` scores a small frozen public index. The result list is UI-only; navigation callbacks are injected by the shell.
INPUTS / OUTPUTS:
Input: query string. Output: `{ id, label, description, destination }[]` from a curated static allowlist.
USES / USED BY:
Uses only existing owner session/RLS and shell contracts; dependencies are listed in manifest.json. LEAD/Antigravity mounts the UI and actions.
POWER LEVEL & CONFIRMATION:
L0 read/display/navigation; no mutation and no power call.
EXAMPLES:
`settings kholo`, `सेटिंग`, or `settings` all surface the Settings route.
KNOWN ISSUES:
Route IDs must be mapped by LEAD when App.tsx route registration is expanded; this package deliberately does not edit App.tsx.
CHANGE LOG:
- 2026-11-23 - Folder-First knowledge and planned manifest refreshed for D2 shell bundle 3 - 0.1.0.
- 2026-11-23 - Implemented D2 shell bundle 3, added component/handler/tests and updated implementation knowledge; version 0.2.0.
