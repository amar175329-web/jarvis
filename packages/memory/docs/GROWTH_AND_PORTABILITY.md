# Badi memory: size, alarm, aur Neon/Turso par jaana
**Note:** Amit ne "docs/decisions/011-big-memory-growth.md" padhne ko kaha. Repo mein 011 = `011-home-news-owner.md` hai; aisi koi file nahi (007 aur 012 dono "worker-host" hain, ye bhi LEAD ke dekhne layak). Maine decision 009 (free-tier guards) aur Amit ke sandesh ke 400 MB / ~30k / slow-search ke aadhaar par neeche ka draft likha. LEAD ise `docs/decisions/013-big-memory-growth.md` bana de (CONTRACT REQUEST CR-6).

## Decision 013 (DRAFT): memory badi hone par
1. Memory hamesha `MemoryStore` interface ke peeche. Shuru: Supabase. Neon (Postgres+pgvector) ya Turso (libSQL vectors) baad mein sirf naya adapter; upar ka code nahi badlega.
2. Adapter tabhi chalega jab `runStoreContract` (src/testing/contract.ts) poora pass kare, isolation test samet.
3. **ALARM jab koi ek:** database >= 400 MB, ya yaadein >= 30,000, ya search ke pichhle 3 daily probes sab >= 700 ms. **WARN:** 320 MB, 24,000, p95 >= 400 ms, ya 500+ vectors ka intezaar. Alarm par REPORT/app banner mein saaf: "Ab bada store jodna chahiye".
4. Data bahar nahi: bada store bhi Amit ka apna account/instance; export (JSONL) pehle.

## Size ka anuman (naapna padega; `memory_stats()` asli ginti deta hai)
- Ek yaad: vector 1.5 KB (halfvec 768) + text ~1 KB + tokens/index ~1-2 KB + HNSW ~2-3 KB => ~5-8 KB. 30k yaadein ~ 150-240 MB sirf memories. Baaki tables (events, logs, notes) bhi 500 MB mein hain: isliye 400 MB total ka alarm.
- float32 vector hota to double: isliye halfvec abhi (data khaali, badalna sasta).
- Note ke chunk-level vectors sabse tezi se badhate: isliye v1 mein ek vector per note.

## Nigrani (job `memory.health`, roz)
`stats()` + ek timed probe search -> p95 history (settings key `memory.probes`, aakhri 14) -> `checkGrowth()` -> alarm par `activity.logged` (area memory) + app banner. (CR-5: job S00 chalaye.)

## Bada store jodne ka plan (jab alarm bajey)
- **Tiers:** hot = Supabase (profile, preferences, people, routines, pinned, private, taaza episodes); cold = Neon/Turso (purane episodes, knowledge chunks, file text). `TieredMemoryStore` ek naya adapter jo `MemoryStore` hi implement kare; search dono mein, rank ek jaisa.
- **Move:** `exportPage` se pages -> naye store par `create` (vector `embedding_model` ke saath copy; dobara embed nahi) -> ginti + checksum milao -> tab Supabase se hard delete. Beech mein dono padhte hain.
- **Chunk vectors** (notes/files) tab, cold store mein.
- Pehle sasta ilaaj: purani episodes ka saaransh, expired purge, superseded 90 din, vector sirf kaam ki rows par.
- Neon vs Turso: Neon = wahi Postgres, SQL/migrations aur RLS ki tarah sochna aasan; Turso = SQLite style, sasta, par RLS nahi (owner filter adapter ka kaam, aur tests zaroori). Meri salah pehle Neon.
