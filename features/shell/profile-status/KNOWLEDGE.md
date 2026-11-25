# profile-status
STATUS: built
WHAT IT IS: Small owner-session and connected-device status summary for the existing profile slot.
WHAT IT CAN DO:
- Display the verified session email and a count of online/total devices from the safe devices projection.
- Offer a callback to open Connect.
WHAT IT CANNOT DO / LIMITS:
- Does not fetch its own user data or infer identity; consumes only a verified session prop and already-sanitized device projection.
- No private profile details, new route, table, or model call.
HOW IT WORKS:
`src/profile-policy.mjs` maps verified session/device props into a display-safe status view; `ui/ProfileStatus.tsx` renders it.
INPUTS / OUTPUTS:
Inputs: verified owner email (optional), sanitized device online flags, optional Connect callback. Output: status summary only.
USES / USED BY:
Uses only existing owner session/RLS and shell contracts; dependencies are listed in manifest.json. LEAD/Antigravity mounts the UI and actions.
POWER LEVEL & CONFIRMATION:
L0 read/display-only.
EXAMPLES:
Show `Personal workspace · session active` and `1 of 2 devices online`.
KNOWN ISSUES:
Antigravity supplies session data from the existing owner auth state and sanitized `devices.list` response.
CHANGE LOG:
- 2026-11-23 - Folder-First knowledge and planned manifest refreshed for D2 shell bundle 3 - 0.1.0.
- 2026-11-23 - Implemented D2 shell bundle 3, added component/handler/tests and updated implementation knowledge; version 0.2.0.
