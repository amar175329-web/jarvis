# D2 Bundle (2) Report — P29

Date: 2026-11-23
Owner: D2
Scope: Quick Access (S06), Live Activity (S03), JARVIS Insight (S04), News (S06)
Base: uploaded `jarvis-repo-P29.zip`

## Result

Implemented four feature-local modules, feature-local UI components and Node tests. Folder-First was completed first: each feature folder contains `KNOWLEDGE.md` and `manifest.json`, then it was registered before implementation. The final manifests are `built` / `0.1.0` and the registration command reports 170 units; a second idempotence check rewrote 0 registry files.

No `api/` file, `vercel.json`, `HomePage.tsx`, `Sidebar.tsx`, `App.tsx`, `packages/contracts`, migration or shared power registry file was edited. Shared API mounting, S22 power registration and the News display placement are CRs only.

## Feature delivery

### Quick Access — S06

- Reuses existing `settings` table at key `home.quick-access`; no new table.
- Validates a maximum of eight unique shortcuts, safe HTTPS destinations and a small set of internal routes/icons.
- Rejects unsafe schemes, URL credentials, query strings, fragments, localhost/local/IP destinations and unsupported ports.
- List/save are plain feature-local `handle(action, request, context)` actions; save uses the explicit confirmation flag and registered manage power.
- UI preserves the existing four-column static card: first three shortcuts plus Add shortcut.
- Browser/app opening and edit UI remain shell callbacks; the component does not open links directly.

### Live Activity — S03

- Reads only bounded job/phone-command status metadata from existing tables.
- Returns fixed labels for a small allowlist of job kinds, max five rows; no payload, command, result, error, device name or arbitrary label is exposed.
- Stop intent is only offered for `queued` rows and requires explicit confirmation + a separate stop power. LEAD adapter must compare-and-set `queued` to `cancelled`.
- UI is presentational and uses approved sprite IDs; terminal tasks reuse the existing `i-code` sprite because `i-terminal` is not in the approved sprite sheet.

### JARVIS Insight — S04

- Seven-day deterministic aggregate; no model call, no local model dependency.
- Shared S08 `classifySensitivity()` checks task title + notes. A narrow feature-local family/finance/password deny-list supplements the shared classifier for the known categories missing from the shared helper.
- Activity counts require allowlisted actor/action, opaque or absent target and empty detail. All raw task/activity text stays server-side; only counts/bars and fixed Hindi/Hinglish tips return.
- Invalid timezone falls back to `Asia/Kolkata`; no fabricated percentage or personal text.

### News — S06

- Public-only allowlisted HTTPS headlines, max six. HTML/script markup and tracking query/hash are removed; output is bounded plain text.
- The feed adapter is invoked with zero owner/session arguments. `news.summarize` receives only normalized public `{source,title,summary,url,published_at}` DTOs, with explicit confirmation.
- No direct provider/model call is present. LEAD must wire the callback only through `packages/models` router and `packages/model-gateway`; if unavailable, summary stays “abhi band”.
- **Not mounted:** the approved HomePage and UI reference contain no News slot. Placement is intentionally left to LEAD acceptance rather than redesigning the approved page.

## Research reuse

Research figures/licences in Amit's archive are marked unverified. No project source code was copied and no external package/dependency was added; only high-level workflow/UI ideas were used. Therefore no external licence is being relied on for this private app implementation. Verify an upstream licence before adopting code in a future change.

| Research item | CSV mapping | Licence shown in research (unverified) | Used for | Safety rationale |
|---|---|---|---|---|
| Coucou (#7) | LO, S06 | MIT (unverified) | Quick Access: compact action/permission capsule idea | No code/dependency or project data copied; first-party shortcut schema + local validation only. |
| Herdr (#27) | LO, S06 | “Open Source” (not an SPDX licence; unverified) | Live Activity: concise active/queued/status helper pattern | No code/dependency copied; only generic status labels from owner-scoped local metadata. |
| Second Brain (#5) | SEEKHO, S09 | “Open Architecture” (not an SPDX licence; unverified) | JARVIS Insight: weekly synthesis / review workflow idea | No code/dependency copied; deterministic private-data aggregation stays local/server-side and no model is called. |
| News | No applicable LO/SEEKHO row for this feature in the reviewed decision list | N/A | No external project reuse | Public feed is normalized first-party code; any optional summary is public-only and routed through approved model gateway. |
| Life Dashboard (#60) | PEHLE-SE-ADVANCED / reference | Research licence unverified | Not reused as code | Existing approved Home already provides its own static design; no additional dependency needed. |

## Changed files

- `features/home/quick-access/KNOWLEDGE.md`, `manifest.json`, `src/model.mjs`, `src/handler.mjs`, `tests/quick-access.test.mjs`, `ui/QuickAccessCard.tsx`, `ui/quick-access.css`
- `features/home/live-activity/KNOWLEDGE.md`, `manifest.json`, `src/project.mjs`, `src/handler.mjs`, `tests/live-activity.test.mjs`, `ui/LiveActivityCard.tsx`, `ui/live-activity.css`
- `features/home/jarvis-insight/KNOWLEDGE.md`, `manifest.json`, `src/insight.mjs`, `src/handler.mjs`, `tests/insight.test.mjs`, `ui/JarvisInsightCard.tsx`, `ui/jarvis-insight.css`
- `features/home/news/KNOWLEDGE.md`, `manifest.json`, `src/normalize.mjs`, `src/handler.mjs`, `tests/news.test.mjs`, `ui/NewsCard.tsx`, `ui/news.css`
- `squads/CR_D2_BUNDLE2_2026-11-23.md`
- `squads/CR_D2_RECENT_ACTIVITY_DELTA_2026-11-23.md`
- `squads/D2_BUNDLE2_REPORT_2026-11-23.md`
- Generated registry outputs under `self/registry/` from `scripts/register.ts`.

Exact diff is included in `JARVIS_D2_BUNDLE2_P29.patch`.

## Tests and checks

Run:

```bash
node --test \
  features/home/quick-access/tests/*.test.mjs \
  features/home/live-activity/tests/*.test.mjs \
  features/home/jarvis-insight/tests/*.test.mjs \
  features/home/news/tests/*.test.mjs
```

Result observed: **25 passed, 0 failed**.

Registry check:

```bash
node --experimental-strip-types scripts/register.ts
```

Result observed: `REGISTER OK: 170 units, 0 agent office(s) created, 4 registry file(s) rewritten.` The current runtime is Node 22.16.0 while the repository asks for >=22.18; Node's experimental strip-types flag was needed to run the `.ts` registration script.

Not run: `npm ci`, full app TypeScript/Vite build, browser/mobile 390px test, Zod integration tests, PGlite/database RLS tests, live Supabase verification, actual model-router/gateway call, Vercel deployment. Do not treat these as PASS.

## Recent Activity delta

Separate file: `JARVIS_D2_RECENT_ACTIVITY_DELTA_after_bundle1.patch`.

It changes only classifier-input construction so an `OPAQUE_TARGET` is omitted from classifier text while the existing independent `targetPrivate` guard remains. Added two tests: numeric UUID target with empty detail remains visible for allowlisted actor/action; `metformin lena` target remains `Private activity`. The accepted Bundle 1 test suite passed **10/10**.

Important baseline caveat: the supplied P29 zip itself has only Recent Activity `KNOWLEDGE.md` and `manifest.json`, not its accepted Bundle 1 source files. Thus the small delta patch targets the already-accepted Bundle 1 source tree after it has been merged into the P29 branch. It is not a patch that can apply directly to the raw P29 zip without that prerequisite. This avoids re-sending/replacing Bundle 1.

## Change Requests

See `CR_D2_BUNDLE2_2026-11-23.md` and `CR_D2_RECENT_ACTIVITY_DELTA_2026-11-23.md`. LEAD owns API route mounting, owner/RLS adapters, S22 powers, cloud public-news adapter, data fetching and News slot approval.

## Antigravity build prompt

Apply `JARVIS_D2_BUNDLE2_P29.patch` to the exact P29 baseline. Do not overwrite unrelated P29 changes. Keep every new handler under its feature folder as a plain module; do not add `api/` functions, change `vercel.json`, edit `HomePage.tsx`, `Sidebar.tsx`, `App.tsx`, change contracts, create migrations or add dependencies. Implement the approved CRs in the existing `api/tasks/index.ts` function only, preserving owner-session + anon-key/user-bearer RLS pattern and `executePower` decision logging. Add all seven S22 power seeds at L0; max L2 and explicit confirmation for save/stop/news summarization; fail closed if auth, registry, audit, gateway or kill switch is unavailable. Quick Access uses existing `settings`; Live Activity selects metadata only and stops queued rows by compare-and-set; Insight uses shared sensitivity + allowlists and returns aggregates only; News reads allowlisted public feeds with no owner data passed to cloud model, and cloud summary goes only through models router + model-gateway after confirmation. Mount the three existing Home cards into their corresponding approved static slots. Do not mount News until LEAD separately approves its placement. Validate 390px width and run the Node tests; report every test not run.

## STATE SNAPSHOT

- P29 preserved; only four D2 feature folders, generated registry, and D2 CR/report files changed.
- Quick Access, Live Activity, JARVIS Insight and News feature folders are built and registered.
- 25/25 Node tests pass; registry reports 170 units.
- Recent Activity UUID/privacy delta is a separate patch; 10/10 tests pass on accepted Bundle 1 tree.
- No new tables, migrations, API files, model dependencies or shell edits.
- LEAD still must mount actions inside existing `api/tasks/index.ts` and seed powers in S22.
- Quick/Live/Insight cards have exact existing Home slots; News has no approved slot yet.
- News cloud summary remains disabled until explicit confirm + routed gateway wiring.
