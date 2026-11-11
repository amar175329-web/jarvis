# contracts
STATUS: built
WHAT IT IS: API contracts: route paths, methods, auth requirements, request/response Zod schemas, error codes and generated Kotlin/JSON Schema.
WHAT IT CAN DO:
- Contracts include core system/auth/phone routes, three owner session routes (`auth.session.create|get|delete`) and the approved S21 `/api/voice/transcribe` and `/api/voice/speak` endpoints.
- `system.events.emit` requires `idempotency_key`; event envelope schema stays shared with `packages/events`.
- Voice routes carry an uploaded audio reference or text metadata; raw audio bytes are not part of JSON contract. Both are kill-sensitive.
- Kotlin types and `contracts/generated/routes.json` are produced by `npm run generate`; tests check paths, schemas, error format, route coverage and critical generated fields. Generator execution remains part of the normal npm test once dependencies are installed.
WHAT IT CANNOT DO / LIMITS:
- These are contracts only; voice route implementations and audio-provider adapter are not part of this bundle. S21 owns voice runtime on its branch; S13/S07 supply later model adapters.
- Kotlin output is generated but needs the Android project to compile it.
- Password login is not part of the auth contract; current session bridge accepts a Supabase-issued token only.
HOW IT WORKS: `src/routes.ts` defines route schema and auth/kill metadata; common event types are imported from `packages/events`; generator emits JSON Schema/Kotlin; tests enforce route naming, schema validity and generated outputs.
INPUTS / OUTPUTS: In: zod schemas. Out: `contracts/generated/routes.json`, `contracts/generated/kotlin/JarvisContracts.kt`. Test: `npm test`.
USES / USED BY: Uses `packages.events`, `packages.shared`; used by API, app, worker and Android clients.
POWER LEVEL & CONFIRMATION: L0. Contracts define boundaries only.
EXAMPLES: Event emit without an idempotency key is invalid. Voice transcribe accepts `audio_ref` and `mime_type`, not `audio_bytes`.
KNOWN ISSUES: The six S21 voice/persona events are stored-only; metadata must stay under the shared 16 KB event payload bound. No audio adapter implementation is included.
CHANGE LOG:
- (append-only) folder-first: created as planned, version 0.0.1. Owner: S00.
- 2026-11-07 - 13 core routes, unified errors, Kotlin + JSON Schema generator - 0.1.0.
- 2026-11-07 - Owner session, idempotency-required event intake and approved S21 voice route contracts; JSON Schema and Kotlin artifacts updated for this contract surface; generator runtime could not be executed in this offline build environment - 0.2.0.
