# boot-sequence
STATUS: built
WHAT IT IS: Reusable shell startup sequence matching the existing approved Boot visual language.
WHAT IT CAN DO:
- Show the four existing boot status messages with reduced-motion support.
- Allow the user to skip the overlay; remove it after the startup sequence.
WHAT IT CANNOT DO / LIMITS:
- No backend requests, model call, persisted state, or action execution.
- No app/src/components/Boot.tsx, App.tsx, or global shell edits in this patch; Antigravity swaps the mount.
HOW IT WORKS:
`src/boot-policy.mjs` owns the sequence strings/timing thresholds; `ui/BootSequence.tsx` handles visibility and the browser reduced-motion preference.
INPUTS / OUTPUTS:
No routes, tables, events, or writes. Output is a display-only startup overlay.
USES / USED BY:
Uses only existing owner session/RLS and shell contracts; dependencies are listed in manifest.json. LEAD/Antigravity mounts the UI and actions.
POWER LEVEL & CONFIRMATION:
L0 display-only.
EXAMPLES:
When reduced motion is enabled, the overlay does not animate or render.
KNOWN ISSUES:
Antigravity must replace the existing `<Boot />` mount with `<BootSequence />`, not mount both.
CHANGE LOG:
- 2026-11-23 - Folder-First knowledge and planned manifest refreshed for D2 shell bundle 3 - 0.1.0.
- 2026-11-23 - Implemented D2 shell bundle 3, added component/handler/tests and updated implementation knowledge; version 0.2.0.
