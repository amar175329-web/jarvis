# memory
STATUS: built (round 2 code produced; validation evidence is recorded in squad/S09-memory/REPORT.md)
WHAT IT IS: Memory ka code ghar (S09): MemoryStore interface, Supabase adapter, rules/redaction/policy, hybrid search, chat recall, export, growth check. Zero dependency (sirf Node + fetch).
WHAT IT CAN DO:
- Policy: `decide()` T1/T2/T3 ko save / ask / refuse / skip mein baantta hai (src/policy.ts, redact.ts, classify.ts). Niyam: self/identity/memory-behaviour.md v1.1.0.
- Store: `MemoryStore` interface + `InMemoryStore` (reference) + `SupabaseMemoryStore` (PostgREST, owner filter har request mein) + `runStoreContract` (Neon/Turso ko ye pass karna hoga).
- `MemoryService`: card(), recall() (card -> shabd -> vector ladder), remember(), decline(), update(), findToForget(), forget(), forgetAll(), exportAll().
- Embeddings: `Embedder`, `gatewayEmbedder`, `runEmbedBatch` (private/secret kabhi nahi, kill/budget par ruk jaata). Hybrid rank (search.ts). Growth alarm (growth.ts: 400 MB / 30k / slow search).
- Migrations 0030-0033 (packages/db/migrations): 0033 adds tier, T2 no-vector and purpose-scoped DB search; 0030-0032 remain unchanged.
WHAT IT CANNOT DO / LIMITS:
- Validation: real Supabase is not used. PGlite availability and every executed command/output are recorded in the S09 Round 2 report. Gateway embed() is still not wired (CR-1), so current runtime may remain keyword-only.
- Shabd-soochi aur patterns sab nahi pakadte (Hinglish spelling); weekly rescan job baaki (CR-5). S19 at-rest encryption and S08 reminder creation are not implemented by S09.
- T2 compaction hook exists, but no scheduled worker or approved private summarizer is connected; no compaction runs automatically yet.
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

- 2026-11-11 - S09 Round 2: T1/T2 tier, typed-purpose recall, T2 no-vector enforcement, no T2 events, medicine reminder hand-off, deep-feeling/crisis rules, and guarded workout/weight history compaction hook; docs updated - 0.2.0.
