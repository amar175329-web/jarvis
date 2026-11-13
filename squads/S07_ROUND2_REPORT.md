SQUAD: S07 CHAT
STATUS: PARTIAL

WHAT IS READY:
- Care bypass: `packages/chat/src/care.ts` adds fixed warm Hinglish care reply for self-harm/abuse phrases (Roman + Devanagari). `handleMessage()` returns it locally before memory recall/model routing; no `needs_model`, private slot or model call on this path. The response says “main yahin hoon”, asks the user to bring a trusted person close, and names India emergency 112 + Tele-MANAS 14416.
- CR-1 gateway stream seam: `packages/model-gateway/src/types.ts` adds optional `Provider.invoke({onChunk})`; `src/gateway.ts` adds `registerProvider()` and `callStream()` while keeping `call()`. Existing gate order remains kill -> model allow-list -> provider -> usage read + worst-case budget -> key -> timeout/provider -> usage record. Prompts, deltas, output and keys are not logged.
- Three fetch/SSE provider adapters: `packages/chat/src/providers.ts` now forwards each provider delta, and `registerChatProviderAdapters()` registers Anthropic/OpenAI/Gemini adapters with the gateway. It adds no model IDs, prices or keys.
- CR-3 actual harness bridge: `packages/chat/src/power-runner.ts` imports and delegates to the existing harness `executePower()`. Harness is unchanged. Confirmation is checked before dispatch; harness remains the only execution path. Tests cover kill ON, L2 missing confirmation and audit-log failure with `executed=true` preserved.
- Thread history: `handleMessage()` loads recent messages through `ChatThreadStore`; history is chronologically framed as DATA, T2 is excluded without a typed purpose, T3 secrets are redacted, and the full serialized history frame (including JSON/DATA framing) fits the configured token budget.
- RLS-only chat storage adapter: `packages/chat/src/thread-store.ts` writes/reads `public.chat_messages` using the owner access token + anon key. It has no service-role key, no MemoryService DB path, and no events-table storage. Existing migration 0034 remains unchanged and keeps FORCE RLS on all three chat tables.
- CR-2: `packages/events/src/registry.ts` registers seven strict metadata-only `chat.*` names. `chat.message.delta` stores only `index`; delta text remains on the authenticated stream response. No chat content, attachment storage refs or transcripts are registry fields.
- CR-4: `packages/contracts/src/routes.ts` adds owner-authenticated Zod schemas for thread list/create, message list, send and stream-frame response.
- Static integration tests: `packages/chat/tests/integration-contract.test.mjs` checks route auth/schema presence and metadata-only event payloads without depending on external Zod installation. `packages/chat/tests/chat.test.ts` adds care, live streaming, provider registration, thread store/history and real harness adapter tests.
- Contract request ledger updated: `packages/chat/docs/CONTRACT_REQUESTS.md`. Knowledge-indexed `KNOWLEDGE.md` files remain byte-for-byte at their baseline versions so `register/check` metadata stays in sync without editing the excluded `self/registry` path. No chat UI redesign; `app/src/components/Chat.tsx` remains unchanged.

CONTRACTS I DEFINE:
- Entry point remains `handleMessage(input, deps)`; care path returns `{status:'care', text: CARE_REPLY}` locally.
- Gateway: `registerProvider(provider)`, `Provider.invoke(..., onChunk?)`, `callStream(request, onChunk)`; legacy `call(request)` stays compatible.
- Provider registration: `registerChatProviderAdapters(gateway, fetcher?)` registers `anthropic`, `openai`, and `gemini`; model allow-list and prices remain gateway settings.
- Power: `createHarnessPowerRunner()` adapts the existing `executePower({reg,powerId,store,ownerId,confirmed?,run,onDecisionLog?})` signature.
- Thread API schemas (all `auth: 'owner'`): `chat.threads.list`, `chat.threads.create`, `chat.messages.list`, `chat.messages.send`, `chat.messages.stream`.
- Event names: `chat.thread.created`, `chat.message.created`, `chat.message.started`, `chat.message.delta`, `chat.message.completed`, `chat.message.error`, `chat.attachment.referenced`. All registry payloads are metadata-only.
- Storage: existing migration `0034_chat_threads.sql` tables `chat_threads`, `chat_messages`, `chat_attachment_refs`; S07 Round 2 made no database/migration changes.

NEEDS FROM OTHER SQUADS:
- API/server squad: instantiate `registerChatProviderAdapters()` during gateway composition; connect owner-session middleware to the five route schemas; wire the `handleMessage()` events to an authenticated SSE response; implement thread list/create/read controllers. Routes here are schemas, not deployed HTTP handlers.
- Amit/S13: keep private slot blank until provider, model, tier, private-data approval and official price settings are explicitly chosen. No value was guessed or inserted.
- DB/API owners: current per-process thread sequence serialization prevents same-process insert races; multiple server instances still need a database-side sequence allocator/RPC or equivalent concurrency-safe contract.
- Dependency/runtime owners: restore npm registry access/install `zod`, `zod-to-json-schema` and `@electric-sql/pglite`, then run contract generation, events tests and PGlite A/B RLS integration.

DECISIONS TAKEN (with reason):
- Care signal is resolved before memory recall and model routing so a person in crisis does not get a model-configuration question or private-data processing delay.
- Care response is fixed, warm and non-instructional: no method/plan language; it points to a trusted person and appropriate support numbers.
- The model config example remains unchanged and empty: FAST/NORMAL/DEEP/PRIVATE identities and prices are Amit/S13-owned decisions. Private model slot stays `null` in the router config until explicitly configured.
- Private T2/T3 context cannot reach a free/unknown model. An approved paid/safe private slot is required; absent that, the pipeline asks one question. Care is the fixed local exception and never reaches any model.
- Stream deltas are sent through `callStream` callbacks; event-table payloads only contain IDs, role, index, count, code and MIME metadata.
- `chat_messages` is separate from MemoryService and is accessed through the user's token so migration 0034 RLS remains the authorization boundary.
- Tool output remains data; dispatch stays exclusively inside the harness `executePower()` path.
- Local install/run environment is Node `v22.16.0` (repo asks `>=22.18`). Tests were run with `NODE_OPTIONS=--experimental-strip-types` so TS files can load. Npm registry DNS returned `EAI_AGAIN`; dependencies were not fabricated or vendored.
- No real key, provider API call, Supabase connection or migration was used.

OPEN QUESTIONS FOR AMIT:
- No code choice is needed to accept this patch. Before private chats can run through a model, Amit/S13 must select and approve the paid/safe private provider/model and provide its official price/settings; all slots intentionally remain blank until then.

ANTIGRAVITY BUILD PROMPT:
"Read `squads/S07_ROUND2_REPORT.md`, `packages/chat/KNOWLEDGE.md`, `packages/chat/docs/CONTRACT_REQUESTS.md`, `packages/model-gateway/KNOWLEDGE.md`, and the LEAD review. Integrate S07 into the API/server composition without changing S07's approved core contracts: call `registerChatProviderAdapters(gateway)` at gateway startup; provide an authenticated owner session and the owner access token to `createRlsChatThreadStore`; implement the owner-authenticated route handlers for `chat.threads.list/create`, `chat.messages.list/send/stream`; stream `handleMessage()` events only on the authenticated SSE response; route tool execution only through `createHarnessPowerRunner()` and harness `executePower()`. Keep `config-model-slots.example.json` blank until Amit/S13 explicitly chooses provider/model/tier/private approval and official pricing. Do not edit brain, memory, safety, harness, voice, DB migration 0034, app/Chat.tsx or other restricted files. Do not call real Supabase or live model APIs. Install the declared dependencies, run `npm run generate`, contract/events tests, PGlite A/B RLS test, package tests, register/check and full test-all; mark any unavailable check NOT RUN with the exact reason."

NEXT STEP I RECOMMEND:
- API/server integration should now consume these contracts and connect the authenticated SSE transport. In parallel, Amit/S13 can decide the paid/safe private model settings; keep PRIVATE slot disabled until that choice is explicit.

TEST / RUN RECORD:
- Requested baseline number in the prompt: 397 tests / 17 packages. That number was not reproduced from this attached ZIP in this environment.
- Plain `node scripts/test-all.mjs` on Node `v22.16.0`: NOT RUN to completion; `.ts` loader rejected TypeScript because root `package.json` requires Node `>=22.18`.
- Compatibility baseline before Round 2 edits: `NODE_OPTIONS=--experimental-strip-types node scripts/test-all.mjs` -> 293 passed across 17 packages; 7 package groups failed to start/complete because required external packages were missing. Treat 293 as the measured baseline, not 397.
- Package install: `npm install` was attempted package-by-package as requested. External registry requests failed with DNS `EAI_AGAIN`; offline cache did not contain Zod, `zod-to-json-schema`, PGlite or all app dependencies. No lockfile from this attempt is included in the patch.
- Final focused command: `NODE_OPTIONS=--experimental-strip-types node --test packages/chat/tests/*.test.ts packages/chat/tests/*.test.mjs packages/model-gateway/tests/gateway.test.ts` -> **58 PASS, 0 FAIL, 1 SKIP** (59 total). The 1 SKIP is the PGlite A/B RLS runtime test.
- Final full command: `NODE_OPTIONS=--experimental-strip-types node scripts/test-all.mjs` -> **328 passed**, 17 packages, **6 package groups failed**. The passing package counts include chat 36 and model-gateway 22. Failed groups are dependency-startup blockers: `api/system` (Zod), `packages/contracts` (Zod / `zod-to-json-schema`), `packages/db` (PGlite import), `packages/events` (Zod), `packages/logging` (Zod through contracts), and `worker/jobs` (PGlite import). Existing runnable tests in `packages/db` (9) and `worker/jobs` (7) did pass before their missing PGlite test modules stopped the package.
- `NODE_OPTIONS=--experimental-strip-types node scripts/register.ts` -> PASS, 167 units, 0 registry files rewritten. Knowledge-indexed `KNOWLEDGE.md` files were left unchanged so this check passes without touching the excluded `self/registry` path.
- `NODE_OPTIONS=--experimental-strip-types node scripts/check.ts` -> PASS, 167 units / 40 containers (rerun after restoring the knowledge-indexed docs to baseline).
- `packages/contracts npm run generate` -> NOT RUN (blocked at module load: missing `zod-to-json-schema`). `packages/contracts npm test` -> NOT RUN (blocked: missing `zod`). `packages/events npm test` -> NOT RUN (blocked: missing `zod`). Static route/event boundary tests DID RUN and PASS in the focused suite.
- PGlite A/B owner-isolation runtime test -> NOT RUN (SKIP: `@electric-sql/pglite` not installed; npm registry unavailable). Static migration FORCE-RLS assertions DID RUN and PASS.
- Strict TypeScript command for chat + model-gateway sources -> NOT PASS because imported packages need missing Zod and Node type definitions and there are existing `packages/memory` type errors (`embed.ts`, `policy.ts`). After correcting an S07 narrowing issue, no additional diagnostic pointed to `packages/chat/src` or `packages/model-gateway/src`.
- `git diff --check`: PASS. `git format-patch` exported; clean ZIP-baseline clone accepted it via `git am` (16 files applied cleanly, no conflicts), and the applied tree was clean.
- Live provider requests, actual model keys, real Supabase, production route deployment and migration application: NOT RUN by design.
