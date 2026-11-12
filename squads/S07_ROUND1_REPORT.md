SQUAD: S07 CHAT
STATUS: PARTIAL

WHAT IS READY:
- Folder-First complete: `packages/chat/KNOWLEDGE.md` + `manifest.json` were committed before code. Package is now `built`, version `0.1.0`.
- One `handleMessage()` pipeline in `packages/chat/src/pipeline.ts`: kill check first (ON/unreadable fail-closed), redact + DATA boundary via `brain/injection.ts`, depth route, typed-purpose recall, seven approved prompt blocks + memory block + one-line memory reason, model route, gateway call, ordered reply events, explicit-only MemoryService save, one-line decision log.
- Model router in `src/model-router.ts`: FAST/NORMAL/DEEP plus optional task overrides (`chat`, `reasoning`, `summarize`, `code`, `creative`, `action`). Slots are blank; no model names, tiers, prices or cost estimates have been invented. Private data can only use `private` slot when it is explicitly `paid` and `privateDataApproved=true`; otherwise the pipeline asks one question and makes no gateway call.
- T2 is not default recall. `MemoryService.recall({text,purpose})` receives a purpose only for a valid typed purpose. T3 secrets are redacted by `memory/redact.ts` before prompt construction. Recall content and full saved-memory records are not returned from `handleMessage()`.
- Anthropic, OpenAI and Gemini fetch/SSE Provider adapters in `src/providers.ts`; tests use fake fetch streams. Keys are accepted only from the gateway `apiKey` input; no local key fallback or logging.
- `PowerRunner` seam matches `executePower({reg,powerId,store,ownerId,confirmed?,run,onDecisionLog?})`. L2 confirmation uses brain confirmation helpers; exact Roman yes phrases map to the approved answers, silence is no, sensitive powers require phone voice + fingerprint.
- Thread/message/attachment reference types and `packages/db/migrations/0034_chat_threads.sql` are ready. Migration forces owner RLS on all three tables, uses `auth.uid()` owner defaults, and composite owner foreign keys.
- `packages/chat/docs/CONTRACT_REQUESTS.md` lists the required gateway, events, harness and API contracts. `app/src/components/Chat.tsx` and all restricted folders remain unchanged.
- Folder registry validation: `NODE_OPTIONS=--experimental-strip-types npm run register` PASS (167 units); `NODE_OPTIONS=--experimental-strip-types npm run check` PASS (167 units / 40 containers; diff rule skipped because no `--base` was supplied). These commands updated only generated `self/registry/{knowledge-index,status,units}.json` metadata for the new package.

CONTRACTS I DEFINE:
- Main entry: `handleMessage(input: ChatInput, deps: ChatDependencies): Promise<HandleMessageResult>`.
- `ChatInput` supports user text, trusted task type, typed memory purpose, web/file/tool/screen/message data, attachment references, and S21 voice references.
- `ModelRouterConfig`: blank `fast`, `normal`, `deep`, `private` slots plus optional task overrides. Private routing never falls back to a free/unknown slot.
- `PowerRunner.executePower(args)` uses the agreed harness input and result shape. S07 does not execute powers itself.
- Live chat transport event names requested from S00: `chat.message.started`, `chat.message.delta`, `chat.message.completed`, `chat.message.error`; plus thread/message-created and attachment-referenced metadata events. Delta text is transport-only, not an events-table payload.
- Migration tables: `chat_threads`, `chat_messages`, `chat_attachment_refs`; owner is `auth.uid()` and every table has ENABLE + FORCE RLS.

NEEDS FROM OTHER SQUADS:
- CR-1 S00/S13: register the three provider adapter factories inside `model-gateway`, and add a stream-aware gateway seam while keeping kill/allow-list/budget/key/timeout/usage controls. Current gateway returns a completed text object, so true token-by-token delivery is not connected yet.
- CR-2 S00: register the metadata-only `chat.*` event names listed in `docs/CONTRACT_REQUESTS.md`. Never persist chat text, delta text, file content, storage refs or transcripts in the events table.
- CR-3 S22/S00: export the agreed `executePower()` from the harness; it must keep the gate, kill re-check and audit inside the harness.
- CR-4 S00: approve authenticated chat thread/message/stream API contracts. Attachment and voice payloads remain opaque references; S21 owns voice conversion.
- Amit/S13: fill provider/model/tier/private-data approval and official price settings. S07 deliberately leaves all model identity and price slots blank.

DECISIONS TAKEN (with reason):
- `handleMessage()` checks kill switch before reading input, memory or model: ON and unreadable both stop with the exact required line.
- Web/file/tool/screen/message content is redacted and wrapped with `asData()` before depth routing; it is never accepted as an order.
- A typed private-purpose request routes DEEP before recall. T2 is fetched only by MemoryService with that typed purpose; ordinary recall remains T1-only.
- Any T2/T3/secret-detected input uses only an explicitly approved paid/safe private slot. A free/unknown private slot is rejected; no quiet fallback is allowed.
- The returned pipeline result exposes only `memorySaved`/`memoryNotice`, not recalled T2 text or the full `MemoryService` save record.
- Provider adapters consume SSE, but gateway buffering means chat currently emits ordered chunks only after `gateway.call()` completes. CR-1 is required for true live model streaming.
- Model prices are not in S07 code or sample config. Gateway remains the only price/budget authority.
- No real provider request, key, Supabase connection or migration was used.

OPEN QUESTIONS FOR AMIT:
- Koi code choice abhi Amit se zaroori nahi. Provider/model names, tier, private-data approval and price values Amit/S13 settings mein hi fill karein; S07 ne blanks chhode hain.

ANTIGRAVITY BUILD PROMPT:
"Read `packages/chat/KNOWLEDGE.md`, `packages/chat/docs/CONTRACT_REQUESTS.md`, and `squads/S07_ROUND1_REPORT.md`. Keep all S07 implementation inside `packages/chat`, with migration 0034 as the only DB change. Do not edit brain, memory, safety, harness, voice, model-gateway, events, shared contracts or the approved Chat UI. Work through CR-1..CR-4 with their owning squads; wire provider adapters into the gateway without bypassing kill/allow-list/budget/key/usage checks; preserve metadata-only events; connect only the agreed `executePower` port; then add/enable the PGlite A/B RLS test and a true stream test. Do not invent model names or prices, do not add secrets, do not apply migrations to real Supabase. Run package tests, register/check and full test-all; mark every unrun check as NOT RUN with the reason."

NEXT STEP I RECOMMEND:
- S00/S13 should first settle CR-1 (gateway provider registration + streaming). In parallel S22/S00 can implement CR-3. Once CR-1..CR-4 are approved, run PGlite RLS tests locally and finish the end-to-end integration; do not redesign Chat UI.

TEST / RUN RECORD:
- Baseline before S07 implementation (Folder-First scaffold only): plain `node scripts/test-all.mjs` -> 18 tests passed, 16 package runners failed. Runtime is Node `v22.16.0`, while root `package.json` requires `>=22.18`; `.ts` test imports failed without Node's experimental type stripping. User-provided expectation of 363 PASS could not be verified in this environment.
- Post-change focused chat tests: `NODE_OPTIONS=--experimental-strip-types npm --prefix packages/chat test` -> 23 PASS, 0 FAIL, 1 SKIP (24 tests total).
- PGlite A/B RLS integration test: NOT RUN (SKIP). `npm ci --prefix packages/chat --ignore-scripts` timed out while downloading; dependency was not installed. Earlier package install attempt also returned registry `EAI_AGAIN`. Static migration/RLS checks DID RUN and PASS.
- Full repo, compatibility run: `NODE_OPTIONS=--experimental-strip-types node scripts/test-all.mjs` -> 282 passed across 17 packages; 8 packages reported failure. Missing `zod` / `zod-to-json-schema` blocked `api/system`, `packages/contracts`, `packages/events`, `packages/logging`, and `packages/model-gateway`. Missing `@electric-sql/pglite` blocked `packages/db` and `worker/jobs`. `packages/memory` had one static guard failure because its existing test hard-codes the old migration list and does not include the required S07 `0034_chat_threads.sql`; S07 did not edit memory files.
- Strict TypeScript check: `tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --skipLibCheck packages/chat/src/*.ts` -> NOT PASS due to 3 pre-existing errors in imported `packages/memory/src/embed.ts` and `packages/memory/src/policy.ts`; no error was reported in `packages/chat/src` itself.
- `git diff --check`: PASS.
- Real provider calls / real Supabase / live migration: NOT RUN by design.
