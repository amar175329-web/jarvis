# chat
STATUS: built (ROUND 1 PARTIAL: integration contracts remain open)
WHAT IT IS: S07 ka chat engine. Approved Chat UI ko badle bina message pipeline, privacy-aware model routing, provider adapters, thread contracts aur safe power hand-off ko own karta hai.
WHAT IT CAN DO:
- `handleMessage()` ek entry point hai: kill switch fail-closed -> input redaction aur web/file/tool DATA boundary -> brain depth router -> purpose-based MemoryService recall -> 7 approved prompt blocks + memory/reason -> model router -> model-gateway -> ordered chat events -> explicit-only MemoryService save -> one-line decision log.
- FAST/NORMAL/DEEP slots aur optional task-specific overrides (`chat`, `reasoning`, `summarize`, `code`, `creative`, `action`) settings se aate hain. Model names, provider selections aur `gateway_pricing_slots` blank hain; S07 price nahi banata. Gateway key lookup existing `.env.example` ke `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` names se karega.
- T2/T3 ya secret-detected context sirf `private` slot ko ja sakta hai jab tier `paid` aur `privateDataApproved=true` ho; warna ek sawal, gateway call zero. Free/unknown slot par private data kabhi nahi.
- T2 recall ka default nahi hai. Valid typed purpose `ask` (explicit question) ya allowed task-purpose se hi MemoryService recall ko pass hota hai.
- T3 secrets user/data prompt aur memory block se `memory/redact.ts` ke zariye redact hote hain. Writes sirf explicit request par MemoryService se; direct DB nahi.
- Anthropic, OpenAI, Gemini fetch/SSE Provider adapters; fake fetch/provider tests. Adapters key ko gateway ke `apiKey` argument se lete hain; key/env ka koi local fallback nahi.
- `PowerRunner` exact harness seam type; L2 confirmation brain wording se, Roman exact yes phrases map hote hain; silence yes nahi; money/health/secret ke liye phone voice + fingerprint.
- Thread/message/attachment-reference types aur migration 0034: owner default `auth.uid()`, composite owner references, forced RLS policies.
- Voice/attachments sirf opaque references; STT/TTS S21 ka hai.
WHAT IT CANNOT DO / LIMITS:
- Chat UI ko redesign ya modify nahi karta.
- Harness, brain, safety, memory, model-gateway, voice, events ya shared contracts ko modify nahi karta.
- Current `Provider.invoke()` ka return value final text hai. Adapters khud SSE consume karte hain, lekin gateway se chat tak true live token streaming ke liye CR-1 chahiye; abhi chat ordered chunks gateway completion ke baad emit karta hai.
- Model-gateway provider registry, events registry, authenticated chat API/routes aur harness `executePower()` abhi owner squads ke contract/integration ka intezar karte hain (CR-1..CR-4).
- Real API keys, live provider requests, real Supabase migration ya production deployment is bundle mein nahi.
HOW IT WORKS: One `handleMessage` pipeline. Kill switch pehla I/O hai; unavailable state bhi ON. Untrusted content redacted/framed as DATA before routing. Brain selects depth; memory is recalled only through service with optional typed purpose. Any private context is routed only to an explicitly approved paid/safe slot or paused with one short question. The gateway owns actual model key/budget checks. Memory writes are explicit and policy-controlled. Chat never executes a model-generated power; a caller must use the typed PowerRunner seam.
INPUTS / OUTPUTS: User text + typed untrusted data + attachment/voice references + trusted task/purpose metadata -> status/reply + `chat.message.*` ordered events + optional MemoryService result + metadata-only decision line. Migration 0034 creates `chat_threads`, `chat_messages`, `chat_attachment_refs`.
USES / USED BY: Uses `packages.brain`, `packages.memory`, `packages.model-gateway`, `packages.shared`, `packages.db`. Knows `packages.events`, `packages.harness`, `packages.voice`.
POWER LEVEL & CONFIRMATION: Chat itself does not raise autonomy and does not execute powers. L2+ hand-off needs `confirmed()` from brain. Exact Roman yes phrases accepted: `haan`, `kar do`, `bhej do`; silence is no. Money/health/secret needs phone voice yes then `Ab fingerprint lagao.`
EXAMPLES:
- Normal chat: blank FAST slot -> clear `needs_model` response, no guessed model.
- Health question: T2 is recalled only with typed purpose; private context uses only `private` paid+approved slot; otherwise one question and zero model calls.
- File/tool result: `asData()` wraps the content before it is put in the prompt; flagged instruction-like content is logged only as a boolean-style note.
KNOWN ISSUES:
- `Provider` contract buffers the returned text at gateway boundary. CR-1 requests provider registration + a stream-aware gateway call while preserving kill/allow-list/budget/key/usage controls.
- PGlite A/B thread RLS test is present but NOT RUN because `@electric-sql/pglite` could not be installed (network `EAI_AGAIN`). Static migration checks ran.
- Events and authenticated API routes require S00 registry/contracts work; harness `executePower()` requires S22/S00 integration.
- Project-wide tests report pre-existing missing dependencies and two memory static-guard conflicts with required migration 0034; see `squads/S07_ROUND1_REPORT.md`. No out-of-scope package was edited.
CHANGE LOG:
- 0.0.1: folder-first planned scaffold. Owner: S07.
- 0.1.0: added pipeline, privacy model router, provider adapters, power runner port, thread migration/types, tests and contract requests. Owner: S07.
