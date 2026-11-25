# sidebar-nav
STATUS: built
WHAT IT IS: Reusable navigation and bottom utility components for the already-approved sidebar layout.
WHAT IT CAN DO:
- Render the existing destinations and sprite icon IDs in their approved order.
- Expose navigation callbacks without owning router state.
- Provide a drop-in utilities block for Connect, Settings, and the PowerOff component.
WHAT IT CANNOT DO / LIMITS:
- Does not edit or redesign Sidebar.tsx; existing brand, device pill, profile and spacing remain shell-owned.
- Does not create destinations; disabled destinations remain disabled until LEAD registers their routes.
HOW IT WORKS:
`src/nav-items.mjs` is the canonical ordered, static item list. `SidebarNav` renders it and `SidebarUtilities` renders the existing sidebar-tools slots.
INPUTS / OUTPUTS:
Inputs: active destination, `onNavigate`, optional disabled destination IDs, Connect/Settings callbacks. Output: accessible button navigation.
USES / USED BY:
Uses only existing owner session/RLS and shell contracts; dependencies are listed in manifest.json. LEAD/Antigravity mounts the UI and actions.
POWER LEVEL & CONFIRMATION:
L0 navigation only; PowerOff delegates its emergency action to S22 and the separate power-off handler.
EXAMPLES:
Antigravity replaces only the current nav-label/nav content and disabled sidebar-tools block with these components.
KNOWN ISSUES:
App.tsx currently has only home/today/tasks/more routes. LEAD must extend route state/handlers before enabling new destinations.
CHANGE LOG:
- 2026-11-23 - Folder-First knowledge and planned manifest refreshed for D2 shell bundle 3 - 0.1.0.
- 2026-11-23 - Implemented D2 shell bundle 3, added component/handler/tests and updated implementation knowledge; version 0.2.0.
