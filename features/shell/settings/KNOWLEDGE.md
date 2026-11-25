# settings
STATUS: built
WHAT IT IS: Owner-scoped general shell preferences page; model/provider settings, billing, budgets, credentials and private data remain outside this feature.
WHAT IT CAN DO:
- Read and update allowlisted language, timezone, and reduced-motion preferences in the existing `settings` table.
- Support Hindi, Hinglish, and English, with Asia/Kolkata or UTC timezone options.
WHAT IT CANNOT DO / LIMITS:
- Reject unknown keys/values and never read or write provider keys, model config, pricing, health, money, family, password, or other private content.
- No table/migration/api file; uses the owner JWT plus Supabase anon key and existing RLS.
HOW IT WORKS:
`src/settings-policy.mjs` validates and normalizes the strict `shell.preferences` shape. `src/handler.mjs` exports `handle(action, request, context)` and routes writes through `context.executePower`.
INPUTS / OUTPUTS:
GET `settings.read` -> `{ preferences }`. POST `settings.update` requires `{ preferences, confirm: true }` and the registered power.
USES / USED BY:
Uses only existing owner session/RLS and shell contracts; dependencies are listed in manifest.json. LEAD/Antigravity mounts the UI and actions.
POWER LEVEL & CONFIRMATION:
Read is L0. Update requires the proposed `settings.update` power, seed L0, explicit confirmation, and an audit why string.
EXAMPLES:
Change language to Hinglish or enable reduced motion; model provider controls remain in the dedicated S13 feature.
KNOWN ISSUES:
LEAD must mount actions in the existing shared function and route/page in App.tsx; no shell wiring is in this patch.
CHANGE LOG:
- 2026-11-23 - Folder-First knowledge and planned manifest refreshed for D2 shell bundle 3 - 0.1.0.
- 2026-11-23 - Implemented D2 shell bundle 3, added component/handler/tests and updated implementation knowledge; version 0.2.0.
