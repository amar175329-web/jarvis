# D2 Shell Bundle (3) — Report

Date: 2026-11-23
Base: `jarvis-repo-P31.zip`
Scope: eight shell features
Build state: **feature-local implementation complete; production integration awaits LEAD/Antigravity CR acceptance**

## Summary

D2 built the following feature folders using Folder-First (manifest + KNOWLEDGE before implementation):

| Feature | Result | Main boundary |
|---|---|---|
| `global-search` (S00) | Curated local search UI + index + tests | Navigation/feature metadata only; no private-record search or model/network call |
| `notifications` (S00) | Safe event metadata reader + unread cursor + panel | Fixed allowlisted labels, owner RLS; read/unread only, no reminder firing |
| `boot-sequence` (S00) | Approved-style boot overlay + reduced-motion support | Display only; Antigravity swaps existing Boot mount |
| `sidebar-nav` (S00) | Reusable approved navigation + utility slots | Shell callbacks injected; no Sidebar.tsx changes |
| `settings` (S13) | General preferences page + owner-RLS handler | Language, timezone and reduced-motion allowlist only |
| `connect` (S17) | Safe paired-device list page + owner-RLS handler | No tokens/permissions; pairing remains disabled pending S17 contract |
| `profile-status` (S17) | Profile status projection/component | Verified session email + sanitized aggregate device status only |
| `power-off` (S22) | Fail-closed power state policy/UI + server handler | Owner + explicit confirmation + registered power; only `kill:true`; no automatic resume |

## Power-off safety notes

- UI starts blocked and does not reveal the application until `GET /api/system/kill.get` confirms valid `kill:false` and an integer epoch.
- `kill:true`, missing state, malformed state, API failure, or failed post-write verification keeps the full-screen blocked/off state.
- The handler accepts only POST `system.power-off` and requires `{ kill:true, confirm:true }`; `kill:false`, missing confirmation, unknown fields, missing owner auth, missing power adapter, or missing state verification are rejected.
- The feature has no resume payload, boot reset, timer, or auto-reenable branch. A separate explicit owner recovery path remains governed by LEAD/S22 and the existing safety policy.
- Critical integration caveat: P31's existing `/api/system/kill.set` wrapper currently writes through `setKillSwitch` without this feature's `executePower` adapter. LEAD must mount the new module in existing `api/system/index.ts`; do not consider PowerOff production-wired until that CR is accepted.
- Existing `KillSwitch.tsx` currently allows an owner click to change `kill:true` to `kill:false` without a second confirmation. CR requests an explicit confirmation for that manual recovery; D2 did not edit the component.

## Privacy and security

- All new server handlers are plain `features/shell/*/src` modules with `handle(action, request, context)`; no `api/` file added.
- User-owned reads use owner bearer + Supabase anon key under RLS. Device response excludes token hashes and permissions. Notifications response excludes event payload/source/detail. Settings handler only writes `shell.preferences`.
- No cloud/local model calls or new dependencies. No service-role key in app/UI. No new DB table or migration.
- Notifications do not send, queue, poll or fire reminders; D1a owns the worker/firing.
- Device pairing remains disabled until S17 provides a separate approved pairing contract and S22 power.

## CRs delivered

- `squads/CR_D2_SHELL_BUNDLE3_2026-11-23.md` — shared function routes, S22 seeds, owner auth/RLS, exact UI mounts, power-off and scope boundaries.
- `squads/CR_D2_NEWS_PLACEMENT_2026-11-23.md` — News under Insights > News & Briefing (preferred), More/sidebar fallback, no Home changes.
- `squads/ANTIGRAVITY_BUILD_PROMPT_D2_BUNDLE3_2026-11-23.md` — complete mount/build instructions.

## Research / dependencies

No external library or source code was reused. Shell features are small deterministic UI and policy modules; adding a dependency would not improve this bundle. No research licence was relied upon and no third-party code was copied. This follows the team's warning that stars/licence fields in the research inventory are unverified.

## Node tests

Command:

```bash
node --test \
  features/shell/global-search/tests/*.test.mjs \
  features/shell/notifications/tests/*.test.mjs \
  features/shell/boot-sequence/tests/*.test.mjs \
  features/shell/sidebar-nav/tests/*.test.mjs \
  features/shell/settings/tests/*.test.mjs \
  features/shell/connect/tests/*.test.mjs \
  features/shell/profile-status/tests/*.test.mjs \
  features/shell/power-off/tests/*.test.mjs
```

Result: **35 passed, 0 failed**.

Test coverage includes local Unicode/Hinglish search, navigation allowlists, fixed notification projections, unread cursor handling, owner RLS/anon key usage, settings allowlist/power gating, device projection secret exclusion, profile projection, boot order/reduced motion, and PowerOff fail-closed/explicit-confirm/kill-true-only behaviour, and default-disabled navigation for routes not mounted yet.

Not run in this environment: `npm ci`, Vite/TypeScript build, Zod/PGlite, live Supabase/RLS integration, Playwright/browser test at 390px, and Vercel deployment. These are not marked PASS.

## Changed files

Feature-local code, tests, styles and docs only:

- `features/shell/KNOWLEDGE.md`
- `features/shell/{global-search,notifications,boot-sequence,sidebar-nav,settings,connect,profile-status,power-off}/KNOWLEDGE.md`
- the matching eight `manifest.json` files (status `built`, version `0.2.0`)
- each feature's `src/`, `tests/`, and `ui/` files
- the three squad CR/report/prompt files above

No changes to `self/registry/*.json` are included. The patch also leaves `api/`, `app/src/components/HomePage.tsx`, `Sidebar.tsx`, `App.tsx`, `Topbar.tsx`, `KillSwitch.tsx`, `vercel.json`, `packages/contracts`, and migrations untouched.

## State snapshot

1. Bundle (3) feature code exists in eight Folder-First shell folders.
2. All 34 feature-local Node tests pass.
3. Notifications only reads safe events and marks read/unread; no reminder firing.
4. Settings is restricted to general UI preferences; Connect lists safe devices only; pairing remains disabled.
5. PowerOff is fail-closed and emits only confirmed `kill:true`; it has no self-resume path.
6. LEAD must wire existing shared functions and add rewrites; no new API function is created.
7. Antigravity must mount components into existing approved shell slots and test 390px.
8. News placement CR recommends Insights > News & Briefing; Home remains unchanged.
9. Registry JSON is intentionally omitted for Antigravity regeneration.
