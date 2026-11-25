# quick-access
STATUS: built
WHAT IT IS: Approved Home Quick Access card with owner-managed shortcuts for apps, websites and JARVIS workspace destinations.
WHAT IT CAN DO:
- (built) Display a bounded list of safe shortcuts using the existing Home card tokens and icon sprite names.
- (built) Validate, add, edit and reorder shortcut definitions in the existing owner-scoped `settings` table; no new table.
- (built) Emit open/manage intents for the shell to execute only through registered powers.
WHAT IT CANNOT DO / LIMITS:
- Cannot directly open apps, navigate the browser, or mutate settings outside the shared power gate.
- Cannot store credentials, URL query strings, fragments, javascript/data schemes, or private URL content.
- Does not add an API function, schema, migration, dependency or model call.
HOW IT WORKS: LEAD mounts the plain feature handler in the shared `api/tasks/index.ts` function and injects owner-scoped settings read/write adapters plus `executePower`. UI callbacks are intents only; S00/S16 route them through the registered browser/app power.
INPUTS / OUTPUTS: Input: validated shortcut list (id, label, icon, https URL or known internal destination). Output: up to 8 normalized shortcuts. Existing table: `settings`, key `home.quick-access`.
USES / USED BY: Uses `api.tasks`; used by the Home shell and S00/S16 app/browser navigation.
POWER LEVEL & CONFIRMATION: Reads use `home.quick-access.read`; edits use `home.quick-access.manage`, both start L0/fail-closed. Shell navigation runs through its own registered power. No action bypasses the kill switch or audit wrapper.
EXAMPLES: Show YouTube/Browser/Projects shortcuts; add a trusted HTTPS shortcut; reorder Browser before YouTube.
KNOWN ISSUES: No API route or shell mount exists until LEAD accepts the CR. The approved HomePage currently shows only the existing four-tile Quick Access card.
CHANGE LOG:
- 2026-11-23 - P29 bundle (2) implemented feature-local UI, guarded handler and Node tests; no API/schema/app-shell edits - version 0.1.0.
- (append-only) 2026-11-23 - P29 Folder-First specification for owner-scoped shortcuts, no new table/API function - version 0.0.2.
