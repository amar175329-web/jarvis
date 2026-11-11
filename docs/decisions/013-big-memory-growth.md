# Big memory: plan to grow beyond Supabase free tier
Status: Accepted (LEAD, Amit's request 10 Nov 2026; numbered 013 because 011 = home-news-owner)

Decision: Amit expects a VERY large memory. All memory access goes through ONE interface (packages/memory MemoryStore), never direct table calls from other squads. Start on Supabase (halfvec 768, retention, purge). LEAD tells Amit when to connect a bigger store. Candidates: Neon (Postgres, same SQL + pgvector, easiest move, first choice) or Turso (SQLite, different SQL, later). Move only after a verified export, with the same contract test (src/testing/contract.ts).

Warn: 320 MB, 24,000 memories, search p95 400 ms. ALARM "connect a bigger store": 400 MB, 30,000 memories, or 3 daily search probes all >= 700 ms (packages/memory/src/growth.ts). Or Amit says so.

Unchanged: memory data never in git; every row has owner_id, source, why, private, expires_at; delete/export/edit always work; kill switch + model-gateway budget apply; keys server only; a second store has no Supabase RLS, so only server code with a secret key may touch it, plus a B-cannot-read-A test.
Note: decisions 007 and 012 have been merged into 012 (012 won).
