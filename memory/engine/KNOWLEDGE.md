# engine
STATUS: planned
WHAT IT IS: Memory ka engine: likhna (ingest), dhoondhna (recall), badalna, bhoolna, redaction, embeddings. Code ghar: packages/memory. Ye folder sirf pehchaan aur KNOWLEDGE ke liye.
WHAT IT CAN DO:
- (planned) Ek hi MemoryStore interface ke peeche sab: create/get/update/list/search/forget/export/stats. Pehla ghar Supabase, baad mein Neon ya Turso.
- (planned) Hybrid search: shabd (tokens) + vector (768-dim) + taaza-pan + bharosa. Vector na ho (kill/budget/key/off) to sirf shabd, jawab phir bhi aata hai.
- (planned) Chat ke liye recall(): chhota "card" (hamesha) + sawaal ke hisaab se yaadein, character budget ke andar.
- (planned) Size nigrani: 400 MB, ~30k yaadein, ya search dheema = REPORT/banner mein "ab bada store jodo".
WHAT IT CANNOT DO / LIMITS:
- Abhi kuch bana nahi hai: sab neeche likha design hai (status planned).
- Koi bahari memory service (Honcho/mem0 cloud) nahi. Data sirf Amit ke Supabase mein.
- Model gateway mein abhi embed() nahi hai: CONTRACT REQUEST. Tab tak vector search band, shabd search chalta.
HOW IT WORKS: Likhna: policy -> row (embedding khali) -> job `memory.embed` baad mein batch mein. Padhna: card + tokens + (zaroorat par) vector -> rerank -> budget. Bhoolna: hard delete (row, links, derived saaransh) turant. Detail: packages/memory/docs/.
INPUTS / OUTPUTS: Interface: MemoryStore, MemoryService (S07 ke liye). Routes (request): /api/memory/*. Events: memory.saved (hai) + memory.updated, memory.forgotten, memory.exported (request). Tables: memories, memory_links, memory_declines.
USES / USED BY: Uses: packages.db, packages.model-gateway, packages.events. Used by: S07 chat, S22 brain, S08, features.core-workspace.memory.
POWER LEVEL & CONFIRMATION: L0 folder. Powers (S22): memory.write-fact L3, memory.forget (request: default L2), data.share-personal L0-L2.
EXAMPLES:
- recall("Rahul ka kaam kya hai?") -> person row + card, 1 vector call se kam.
- Gateway budget khatam -> recall shabd-only, `degraded: keyword_only`.
KNOWN ISSUES: pgvector halfvec pglite mein test hona baaki (Antigravity). Embedding model abhi tay nahi (Amit ka jawab chahiye).
CHANGE LOG:
- (append-only) folder-first: created as planned, version 0.0.1. Owner: S09.
- 2026-11-10 - S09: Folder-First step 2: poori KNOWLEDGE.md likhi (design, limits, rules). Code abhi nahi, status planned - 0.1.0
