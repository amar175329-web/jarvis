# chat API
STATUS: built
WHAT IT IS: Server-side authenticated chat endpoints for threads and messages, connecting owner sessions, RLS thread storage, model gateway streaming, and metadata-only event logging.
WHAT IT CAN DO:
- `POST /api/chat/threads.list`: lists owner-scoped threads, newest first.
- `POST /api/chat/threads.create`: creates an owner-scoped thread.
- `POST /api/chat/messages.list`: lists messages in a thread in sequence order.
- `POST /api/chat/messages.send`: accepts an owner chat message and returns stream ticket.
- `POST /api/chat/messages.stream`: opens authenticated Server-Sent Events (SSE) stream for response deltas.
- Emits strictly metadata-only events (`chat.thread.created`, `chat.message.created`, `chat.message.started`, `chat.message.delta`, `chat.message.completed`, `chat.message.error`, `chat.attachment.referenced`).
- Bypasses models locally for self-harm/care signals and displays clear "model set nahi" Hindi guidance when model slots are empty.
WHAT IT CANNOT DO / LIMITS:
- No service-role key is ever passed to `createRlsChatThreadStore`; database RLS is always enforced with the owner's access token.
- Raw message content, deltas, transcripts, and storage references are never written to the events table.
- Model provider adapters stream only authenticated SSE frames to the owner.
HOW IT WORKS: Route handlers authenticate via `readOwnerSession` from `api/auth`. Database calls use `createRlsChatThreadStore`. Model streaming calls `handleMessage` with `callStream` on the model gateway and streams SSE frames `chat.message.started`, `chat.message.delta`, `chat.message.completed`, `chat.message.error`.
INPUTS / OUTPUTS: HTTP POST requests with JSON bodies defined in `packages/contracts/src/routes.ts`. Standard `{ok:true,data}` / `{ok:false,error}` responses and SSE stream responses.
USES / USED BY: Uses `api/auth`, `packages/chat`, `packages/model-gateway`, `packages/events`, `packages/safety`, and `packages/contracts`; used by web `app` and clients.
POWER LEVEL & CONFIRMATION: L0. Chat handlers route messages and queries; tool actions dispatch only through the verified harness runner.
EXAMPLES: `POST /api/chat/threads.list` returns `{ ok: true, data: { threads: [...] } }`.
KNOWN ISSUES: Thread sequence uses per-process serialization until database-side sequence generator is provisioned.
CHANGE LOG:
- (append-only) 2026-11-13 - Built chat API endpoints with RLS thread store, SSE streaming, and metadata-only events (Bundle P10) - version 0.1.0.
