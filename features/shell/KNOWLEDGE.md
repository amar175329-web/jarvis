# shell
STATUS: built (D2 shell bundle 3; shell integration pending LEAD/Antigravity)
WHAT IT IS: Container for sidebar navigation, search, notifications, boot UI, general settings, device connection/profile status, and the emergency power-off surface.
WHAT IT CAN DO:
- Hold the eight implemented feature units: global-search, notifications, boot-sequence, sidebar-nav, settings, connect, profile-status, and power-off.
- Keep each feature's logic in its own feature folder; this root is not a second implementation.
WHAT IT CANNOT DO / LIMITS:
- It does not edit HomePage.tsx, Sidebar.tsx, App.tsx, vercel.json, contracts, api/, or migrations.
- It does not create new serverless functions, tables, workers, reminder firing logic, or model calls.
HOW IT WORKS: Feature-local React components and plain handler modules export `handle(action, request, context)` plus action lists where server-side work is required. LEAD mounts those actions into existing shared functions and Antigravity mounts components into the approved shell.
INPUTS / OUTPUTS: Existing owner session, owner-RLS settings/events/devices projections, S22 power adapters, and shell navigation callbacks.
USES / USED BY: S00 shell, S13 general preferences, S17 devices/profile, S22 kill switch and app-level power gating.
POWER LEVEL & CONFIRMATION: Read/display actions are L0. Settings update, notification read cursor and emergency power-off are proposed registered powers; all start L0 until S22 seeds/approves them. Risky writes require explicit confirmation.
EXAMPLES: Search `settings kholo`; view safe event notifications; list paired devices; explicitly power off JARVIS.
KNOWN ISSUES: Route rewrites and page integration are CRs only. `system.power-off` must be connected to the existing system kill route through `executePower`; no re-enable action is provided. News placement is separately proposed under Insights > News & Briefing without modifying Home.
CHANGE LOG:
- 2026-11-23 - D2 shell bundle 3 implementation and feature-local test coverage added; 0.2.0.
