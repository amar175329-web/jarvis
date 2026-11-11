# CONTRACT REQUESTS (S09 -> S00/LEAD, aur doosre squads ko NEEDS)
Shared cheezein (contracts, MASTER_CONTEXT, docs/, migrations ke baaki, powers) sirf S00/LEAD badalta hai. Maine kuch nahi chheda.
| # | Kise | Kya | Kyun |
|---|---|---|---|
| CR-1 | S00/S13 (model-gateway) | `gateway.embed()` + `Provider.embed?()` (shape: src/embed.ts EmbedGateway), task `memory.embed`, wahi kill/budget/key/usage chain, free model ki request limit | Vector search ke bina chal nahi sakta. Abhi gateway sirf text deta hai |
| CR-2 | S00 (contracts/events) | events: `memory.updated {memory_id, kind}`, `memory.forgotten {count, all?}`, `memory.exported {count, format}`. Sab metadata, text nahi | Amit ke edit/delete/export ka record |
| CR-3 | S00 (contracts/routes) | route group `memory`: list, get, update, forget, forget-all, export, stats. Group `workspace`: notes.*, files.*, projects.*, search. Sab owner session | Memory screen aur Notes/Projects UI |
| CR-4 | S22 (powers 0020) | memory.forget autonomy_default 1 -> 2 (confirm ke baad karo; abhi L1 = sirf salah, Amit ka "bhool jao" bekaar). Naya `memory.forget-all` (L0 fixed, app tap), `memory.write-private` (tag personal, default L2), `memory.export` | Seedha Amit ke hukm ko power gate rok na de |
| CR-5 | S00 (worker/jobs) | jobs: `memory.embed` (~10 min), `memory.purge` (roz, service_role `purge_memory_rows`), `memory.health` (roz), `memory.rescan` (hafta). Handlers packages/memory se | Retention, embeddings, size alarm |
| CR-6 | LEAD | `docs/decisions/013-big-memory-growth.md` (draft GROWTH_AND_PORTABILITY.md); 011/007/012 numbering ki gadbad | Amit ne 011-big-memory-growth.md kaha, wo hai nahi |
| CR-7 | LEAD | **NEW FOLDER:** `packages/memory` (S09), manifest+KNOWLEDGE bane; layout/registry mein allowed | Engine ka code ghar; memory/ mein code nahi ja sakta (decision 006) |
| CR-8 | LEAD | docs/BACKEND_SCHEMA.md mein S09 ki rows: memories (naye columns), memory_links, memory_declines, notes, files, projects; functions memory_*; migrations 0030-0032 | Squad rule: sirf S00/LEAD docs/ badalta hai |
| CR-9 | LEAD | docs/SECURITY_CHECKLIST.md: "17 core tables" ke saath 5 nayi S09 tables ki RLS/force/test; SECURITY INVOKER wale memory functions | Ginti badli |
| NEEDS | S21 | persona.md section 11 ko memory-behaviour.md (FINAL) se jodo, "S09 se milana hai" hatao; care-tone self-harm/abuse par | memory ab final |
| NEEDS | S07 | docs/CHAT_INTERFACE.md ke hisaab se recall()/remember(); chat threads 0040s | Interface |
| NEEDS | S08 | task <-> project link `memory_links` se (tasks.project_id nahi) | Task table nahi badli |
| NEEDS | S19 | file antivirus/quarantine, weekly rescan, weekly export backup | Backup/safety |
