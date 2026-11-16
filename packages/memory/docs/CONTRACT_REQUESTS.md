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

## S09 Round 2 — 2026-11-11

1. **S00/LEAD — memory DB contract update:** migration `0033_memory_tiers_and_purpose.sql` adds `memories.tier` (`normal|sensitive`), enforces `tier='sensitive'` iff `private=true`, enforces no T2 vector, changes `memory_search` from the old `p_allow_private` boolean to `p_purpose` (`plan_workout|day_status|medicine_reminder|budget|ask`), and scopes the subject-key unique index by tier. Review/accept the new RPC signature before any environment migration. Do not run against real Supabase from this bundle.
2. **S08 — medicine reminder contract:** consume `MedicineReminderRequest` from `MemoryService.remember()`. Payload includes memory row ID, T2/private flag, medicine label + time, explicit lock-screen visible label, and `needs_time_confirmation`. Amit chose medicine name + time to be visible on lock screen. The hand-off is not a created reminder; S08 must confirm AM/PM if needed, store protected reminder content and create OS notification through its own flow.
3. **S19 — server-side T2 encryption:** implement the S19-owned key/vault interface and follow `SENSITIVE_ENCRYPTION_PLAN.md`. Current migration does not encrypt body/title.
4. **S21 — persona alignment:** update `self/identity/persona.md` to use memory behaviour v1.1.0, care tone for self-harm/abuse, no diagnosis labels, and short Hinglish `Note kar liya (private).` acknowledgement. S09 did not edit the S21-owned file.
5. **LEAD/S00 — Decision 014 child-media/location exception:** accepted Decision 014 currently forbids child photos, school addresses and child live location. Amit asked for explicit-command storage of photos/school address and one-time location facts. Keep the accepted prohibition unchanged until LEAD explicitly updates the shared decision; S09 continues to refuse child photo/school address and does not implement live tracking.
6. **S22/S13 — history compaction job:** connect `compactSensitiveHistory()` only to a private summarizer approved for T2 and a scheduled worker. Current S09 hook is guarded and inert without that dependency. It must not send T2 to an unapproved provider.
7. **S03/S16 — live-location capability:** any ability to inspect a family member's live location is outside S09 memory. S09 stores only a one-off location memory when Amit explicitly asks to remember it; no background tracking worker was added.
