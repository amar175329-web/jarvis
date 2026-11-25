# D2 Change Requests — Shell Bundle (3)

Date: 2026-11-23
Base: `jarvis-repo-P31.zip`
Owner: D2
Scope: `global-search`, `notifications`, `boot-sequence`, `sidebar-nav`, `settings`, `connect`, `profile-status`, `power-off`
Status: **proposed for LEAD / S00 / S13 / S17 / S22 acceptance**

D2 has added feature-local folders, `KNOWLEDGE.md`, manifests, UI components, plain handler modules, and Node tests. This patch does **not** edit `api/`, `vercel.json`, `HomePage.tsx`, `Sidebar.tsx`, `App.tsx`, contracts, migrations, or generated `self/registry/*.json`.

## CR-D2-SHELL-01 — S00/LEAD: mount shell actions in an existing function only

Vercel Hobby is already at the 12-function limit. Do not add any `api/` file. Extend the existing `api/tasks/index.ts` dispatcher and existing `api/system/index.ts` system handler only after LEAD accepts the module contracts below.

### Existing shared function routes

Append these rewrites to the existing `vercel.json` `rewrites` array (LEAD/Antigravity owns this edit; D2 did not edit `vercel.json`):

```json
{ "source": "/api/notifications/:action", "destination": "/api/tasks?action=:action" },
{ "source": "/api/settings/:action", "destination": "/api/tasks?action=:action" },
{ "source": "/api/devices/:action", "destination": "/api/tasks?action=:action" }
```

Mount the feature modules as follows:

| Path + method | Action | Module | Expected result |
|---|---|---|---|
| `GET /api/notifications/notifications.list` | `notifications.list` | `features/shell/notifications/src/handler.mjs` | `{ notifications, unreadCount }` |
| `POST /api/notifications/notifications.mark-read` | `notifications.mark-read` | same | `{ through }`; body `{ confirm: true }` |
| `GET /api/settings/settings.read` | `settings.read` | `features/shell/settings/src/handler.mjs` | `{ preferences }` |
| `POST /api/settings/settings.update` | `settings.update` | same | `{ preferences }`; body `{ preferences, confirm: true }` |
| `GET /api/devices/devices.list` | `devices.list` | `features/shell/connect/src/handler.mjs` | `{ devices }` |

The modules export `handle(action, request, context)` and action arrays: `NOTIFICATION_ACTIONS`, `SETTINGS_ACTIONS`, and `CONNECT_ACTIONS`.

**Dispatcher placement is important:** route these five actions before the existing `request.method !== 'POST'` guard and before `bodyJson(request)` consumes the body. The current `api/tasks/index.ts` requires POST + JSON for every action, so merely appending rewrites will not work. GET actions must be allowed with no request body. POST bodies must be passed untouched to their feature module.

Inject a shared context with:

- `requireOwner(request)`: existing `readOwnerSession` result, including the verified owner ID, access token, optional rotated cookie, and fail-closed auth status.
- `supabase: { url, anonKey, fetch }`: only public anon key + the owner's bearer token for these modules. Never pass the service-role key to a client or UI component.
- `executePower(args)`: existing packages/brain + packages/harness adapter. Preserve the supplied `powerId`, `ownerId`, `confirmed`, `why`, and `run`. Write a metadata-only `decisions` intent before execution and update its result after; fail closed if the registry or audit write is unavailable.
- For `devices.list`, inject `now()` only if LEAD wants deterministic online status tests; no write power is involved.

The feature modules use PostgREST under the user's bearer so existing owner RLS applies. `settings.owner_id` defaults to `auth.uid()`. Keep `notifications.read_through` and `shell.preferences` as existing `settings` keys; no schema/migration is requested.

### Required route behaviour and privacy

- `notifications.list` selects only `events(id,type,ts)` and filters to the hardcoded type allowlist in `notifications-policy.mjs`. Fixed labels only; do not return `payload`, `source`, `detail`, free text, or unknown event types.
- `notifications.mark-read` requires `confirm:true`, writes only `settings.notifications.read_through`, and calls `executePower` with `notifications.mark-read` and a one-line why. It changes read state only; it must never schedule, deliver, poll, or fire reminders. Reminder firing remains D1a-owned.
- `settings.read/update` handles only the strict `shell.preferences` allowlist: `language` (`hi|hinglish|en`), `timeZone` (`Asia/Kolkata|UTC`), and `reduceMotion` (boolean). Do not expose model/provider settings, API keys, budgets, billing, or private profile records.
- `devices.list` selects only `id,name,kind,paired_at,last_seen,revoked_at`, under owner RLS. Never select or return `token_hash`, permissions, auth secrets, or raw credentials.
- Preserve `{ ok:true,data }` / `{ ok:false,error }`, `cache-control: no-store`, owner cookie rotation, and existing error conventions.

## CR-D2-SHELL-02 — S22 + S00: connect PowerOff through the existing system route

D2 adds `features/shell/power-off/src/handler.mjs`, which exports `handle(action, request, context)` and `POWER_OFF_ACTIONS=['system.power-off']`. Do not create `api/system/*` files; mount it through the existing `api/system/index.ts` / `api/system/kill.set.ts` path.

For `POST /api/system/kill.set` with `kill:true`:

1. Require a verified owner session (no device session for this UI operation).
2. Require body `{ kill: true, confirm: true, reason?: string }`; reject missing confirmation, `kill:false`, extra keys, and malformed reasons.
3. Dispatch `system.power-off` through the S22 registry and `packages/harness` `executePower` adapter. The supplied one-line why is: `Amit ne shell se JARVIS power-off confirm kiya`.
4. Inside `run`, call the existing atomic `set_system_kill` path / `setKillSwitch` with `kill:true`. Do not duplicate the kill table or RPC.
5. Require an acknowledged persisted `{ kill:true, epoch: integer >= 0 }` before returning success. If owner auth, registry, kill-state read, audit write, RPC, or persisted-state verification fails, return unavailable/blocked and keep the UI fail-closed.
6. Keep existing `GET /api/system/kill.get` as the state source. Missing/malformed/unreadable kill state must be treated as ON/blocked.

**No automatic resume:** the new PowerOff module has no `kill:false` payload, no reset-on-boot, no timer, and no resume action. `PowerOff` starts in blocked state until `kill.get` verifies `kill:false`; `kill:true` remains persisted in `system_state` and renders a full-screen off state.

### Existing KillSwitch path requires explicit human intent

P31's existing `app/src/components/KillSwitch.tsx` currently toggles `/api/system/kill.set` directly, without a confirmation dialog when changing `kill:true` to `kill:false`. D2 did not edit that file. LEAD/S22 should require a separate, explicit owner confirmation before re-enabling the kill switch, retain the existing owner-only restriction and atomic audit, and never clear the kill flag on app boot, deploy, refresh, worker start, or service recovery. The repo's `packages/brain/src/failure.ts` states JARVIS itself must not turn the kill switch OFF; the owner remains the only recovery authority. Do not route a re-arm through the generic action gate in a way that lets an agent bypass the ON state.

## CR-D2-SHELL-03 — S22: seed the shell powers

Seed these powers at L0. No power auto-enables from feature registration. `executePower` must receive and log the one-line why supplied by the feature handler; failure to load power/kill state or persist the intent log blocks the write.

| Power ID | Owner | Default / current | Max | Confirm | Reversible | Purpose |
|---|---|---:|---:|---|---|---|
| `notifications.mark-read` | S00 | L0 / L0 | L2 | yes | yes | Advance the owner read-through cursor only |
| `settings.update` | S13 | L0 / L0 | L2 | yes | yes | Update allowlisted shell preferences only |
| `system.power-off` | S22 | L0 / L0 | L2 | yes | no | Set existing kill switch to ON after explicit owner confirmation |

No power is required for local search, navigation, boot display, profile projection, notifications read, settings read, or device status read (all L0). Pairing is not implemented; S17 must submit a separate power/contract before a future pairing flow is enabled.

**Re-arm policy:** do not silently insert a resume capability through this CR. S22 must separately decide/document the existing owner-only recovery mechanism; it must never be callable by a model/agent, worker, startup effect, or remote content. The kill remains ON until Amit explicitly invokes the approved manual recovery mechanism.

## CR-D2-SHELL-04 — S13: shell preference ownership boundary

Accept `shell.preferences` as a small presentation-only key stored in the existing owner settings table. It must not overlap or overwrite S13's model providers, model router, price/budget, plugins, secrets, or private-data preferences. If the existing settings page uses a broader shared key, LEAD must keep this key namespaced and merge only this allowlist.

## CR-D2-SHELL-05 — S17: connected-device panel boundary

Accept `devices.list` as a read-only safe projection. Pairing remains disabled in this bundle. S17 must provide its separate pairing token lifecycle, owner/device proof, revoke/recovery behaviour, and S22 power before D2 exposes a pairing action.

## Integration mount points (Antigravity-owned; no D2 shell edits)

1. **Topbar search:** replace only the current static search input with `features/shell/global-search/ui/GlobalSearch.tsx`; map its destination callback to the existing router. Search remains local to the curated allowlist.
2. **Topbar notifications:** replace the static bell button with `features/shell/notifications/ui/NotificationsPanel.tsx`; keep the current bell sprite/token placement.
3. **Sidebar navigation:** replace the current `nav-label` + `.nav` content with `features/shell/sidebar-nav/ui/SidebarNav.tsx`; preserve the brand, approved spacing, device pill, profile slot, and surrounding sidebar.
4. **Sidebar utilities:** replace only the disabled `.sidebar-tools` block with `features/shell/sidebar-nav/ui/SidebarUtilities.tsx`, with callbacks to Connect and Settings. It embeds the `PowerOff` trigger.
5. **Profile slot:** mount `features/shell/profile-status/ui/ProfileStatus.tsx` in the existing profile slot. Supply `data.user` from existing `/api/auth/session.get` and the sanitized `devices.list` result. Never fetch or display extra private profile data.
6. **Pages/routes:** Antigravity expands the shell's route state for Settings and Connect, mounts `SettingsPage` and `ConnectPanel`, and maps sidebar/search destinations. Do not add a page route for notifications; it is a topbar panel.
7. **Boot:** replace the existing `<Boot />` mount with `<BootSequence />`; never mount both. Keep the existing approved boot art/tokens and reduced-motion behaviour.
8. **Power-off:** mount via `SidebarUtilities`. It blocks the entire viewport immediately until `kill.get` verifies `kill:false`; do not make the application visible while state is unreadable or `kill:true`.

At 390px, verify no horizontal overflow in search results, notifications panel, Settings cards, Connect devices, profile summary, and the sidebar utilities. D2 did not run a browser viewport test; Antigravity must run it after mount.

## Explicitly out of scope

- No new `api/` files/functions; no change to Hobby's 12-function count.
- No direct edits by D2 to `vercel.json`, `api/`, `packages/contracts`, `app/src/components/HomePage.tsx`, `Sidebar.tsx`, `App.tsx`, `Topbar.tsx`, `KillSwitch.tsx`, migrations, or generated `self/registry/*.json`.
- No reminder firing or worker integration (D1a owns it).
- No device pairing implementation (S17 owns it).
- No cloud/local model call and no third-party library/dependency.
