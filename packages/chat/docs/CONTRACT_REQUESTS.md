# CONTRACT REQUESTS (S07 -> S00/LEAD, S13, S22)

ROUND 2 STATUS (2026-11-13): CR-1, CR-2, CR-3 and CR-4 were integrated against the LEAD-approved interfaces. Ownership stays with S00/S22 for their shared components; S07 made only the explicitly approved Round 2 file changes.

| # | Status | Kise | Contract delivered |
|---|---|---|---|
| CR-1 | COMPLETE (S07 adapter + gateway seam) | S00/S13 (`packages/model-gateway`) | `registerProvider`, `Provider.invoke.onChunk`, and `callStream()` preserve kill -> allow-list -> worst-case budget -> key -> timeout -> usage. Existing `call()` remains; gateway logs never contain prompts, deltas, output or keys. |
| CR-2 | COMPLETE (metadata-only registry) | S00 (`packages/events`) | Seven `chat.*` names are registered with strict metadata schemas only. Delta content and attachment storage refs are not event fields; live delta text exists only on authenticated stream transport. |
| CR-3 | COMPLETE (production adapter) | S22/S00 (`packages/harness`) | `createHarnessPowerRunner()` imports the existing `executePower` and maps the approved input/result. Harness stays untouched; chat never invokes `run` directly. |
| CR-4 | COMPLETE (schemas only) | S00 (`packages/contracts`, API routes) | Owner-authenticated Zod contracts now define thread list/create, message list, send and SSE stream frames. HTTP handlers/auth middleware remain API/server ownership. |

## Round 2 boundary
- `packages/chat` owns chat orchestration, provider adapter factories, care reply, RLS thread adapter and PowerRunner adapter.
- Only the LEAD-approved Round 2 paths were edited: `packages/chat/*`, `packages/model-gateway/*`, `packages/events/src/registry.ts`, and `packages/contracts/src/routes.ts`.
- No migration, harness, brain, memory, safety, voice, app or real Supabase changes were made. `app/src/components/Chat.tsx` remains read-only.
