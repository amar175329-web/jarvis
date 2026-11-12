# CONTRACT REQUESTS (S07 -> S00/LEAD, S13, S22)
Shared gateway interfaces, event registry, routes and harness implementation remain owned by their squads. S07 has not modified those folders.

| # | Kise | Kya | Kyun |
|---|---|---|---|
| CR-1 | S00/S13 (`packages/model-gateway`) | Register the S07 Anthropic/OpenAI/Gemini adapter factories in the gateway provider map, then add a stream-aware call (`callStream` or `Provider.invoke` `onChunk`) that preserves kill -> allow-list -> budget -> key -> timeout -> usage; retain `call()` compatibility. Provider chunks must never be logged. | `Provider.invoke()` currently returns only `{text,tokensIn,tokensOut}` and the gateway has no S07 adapters registered. S07 adapters consume provider SSE but the gateway buffers until completion, so neither model calls nor true token-by-token UI delivery are connected until this contract lands. |
| CR-2 | S00 (`packages/events`) | Register metadata-only event names: `chat.thread.created {thread_id}`, `chat.message.created {thread_id,message_id,role}`, `chat.message.started {thread_id,message_id}`, `chat.message.delta {thread_id,message_id,index}`, `chat.message.completed {thread_id,message_id,chunk_count}`, `chat.message.error {thread_id,message_id,code}`, `chat.attachment.referenced {thread_id,message_id,attachment_id,mime_type}`. | Event registry rejects unregistered names. Never put chat text, delta text, file content, storage refs, voice transcripts or secrets into the events table. Live delta text stays on the authenticated chat stream transport. |
| CR-3 | S22/S00 (`packages/harness`) | Export the agreed `executePower({reg,powerId,store,ownerId,confirmed?,run,onDecisionLog?})` returning `{executed,gate,result?,error?,decisionLog}`. Keep the permission gate, kill re-check and audit inside the harness. | Existing harness currently exposes `checkPowerPermission` only. S07 contains only a typed `PowerRunner` port and fake-runner tests; it does not edit or bypass the harness. |
| CR-4 | S00 (`packages/contracts`, API routes) | Approve `/api/chat/threads.*`, `/api/chat/messages.*`, and authenticated streaming route contracts using migration 0034. Attachments and voice stay opaque references owned by storage/S21. | S07 supplies thread/message/attachment types and the local schema. Shared route contracts are not silently added by this squad. |

## Implementation boundary
- `packages/chat` owns the chat orchestration and provider adapters.
- `packages/db/migrations/0034_chat_threads.sql` is the only database change in this bundle; never apply it to real Supabase from this worktree.
- `app/src/components/Chat.tsx` is read-only and remains unchanged.
