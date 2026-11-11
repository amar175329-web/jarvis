# memory
STATUS: built (local tests pass; Supabase par abhi nahi chalaya)
WHAT IT IS: Memory ka code ghar (S09): MemoryStore interface, Supabase adapter, rules/redaction/policy, hybrid search, chat recall, export, growth check. Zero dependency (sirf Node + fetch).
WHAT IT CAN DO:
- Policy: `decide()` candidate ko save / ask / refuse / skip mein baantta hai (src/policy.ts, redact.ts, classify.ts). Niyam: self/identity/memory-behaviour.md.
- Store: `MemoryStore` interface + `InMemoryStore` (reference) + `SupabaseMemoryStore` (PostgREST, owner filter har request mein) + `runStoreContract` (Neon/Turso ko ye pass karna hoga).
- `MemoryService`: card(), recall() (card -> shabd -> vector ladder), remember(), decline(), update(), findToForget(), forget(), forgetAll(), exportAll().
- Embeddings: `Embedder`, `gatewayEmbedder`, `runEmbedBatch` (private/secret kabhi nahi, kill/budget par ruk jaata). Hybrid rank (search.ts). Growth alarm (growth.ts: 400 MB / 30k / slow search).
- Migrations 0030-0032 (packages/db/migrations): naye columns, halfvec(768)+HNSW, notes/files/projects/links, functions.
WHAT IT CANNOT DO / LIMITS:
- Abhi tak: asli Supabase par nahi chala; pglite test (db-rls.test.mjs) sandbox mein SKIP; gateway mein embed() nahi (CR-1), isliye vector search band, shabd-search chalta.
- Shabd-soochi aur patterns sab nahi pakadte (Hinglish spelling); weekly rescan job baaki (CR-5).
- Abhi kuch bana nahi hai: sab neeche likha design hai (status planned).
- Asli Supabase par kuch nahi chalata. Model gateway ke bina koi model call nahi.
HOW IT WORKS: Service -> policy -> MemoryStore (Supabase). Padhna: recall(); likhna: remember(); bhoolna: hard delete. Detail: docs/ (SEMANTIC_SEARCH_PLAN, CHAT_INTERFACE, WORKSPACE_MODEL, GROWTH_AND_PORTABILITY, OBSIDIAN_EXPORT_PLAN, LEARNED_FROM, TEST_PLAN, CONTRACT_REQUESTS).
INPUTS / OUTPUTS: In: Candidate {text, kind, origin, actor, explicit, ...}, RecallOptions. Out: Verdict, Recall {block, card, items, degraded}, ExportRecord (JSONL). Events (metadata only): memory.saved/updated/forgotten/exported.
USES / USED BY: Uses: packages.db (tables), packages.model-gateway (embed), packages.events. Used by: S07, S22, memory.*, features.core-workspace.*.
POWER LEVEL & CONFIRMATION: L0 (library: khud kuch nahi karta).
EXAMPLES:
- `await svc.remember({text:'Mujhe subah chai pasand hai', origin:'chat', actor:'jarvis', kind:'preference'})` -> save.
- `await svc.recall({text:'Rahul ka kaam?'})` -> block + degraded.
KNOWN ISSUES: Naya package: LEAD ki haan chahiye (CR-7). halfvec pglite mein test hona baaki. Embedding model Amit ke jawab par.
CHANGE LOG:
- (append-only) folder-first: created as planned, version 0.0.1. Owner: S09.
- 2026-11-10 - S09: code likha (policy, store, service, embed, growth, supabase adapter), 68 tests pass, docs/ likhi; status built - 0.1.0
