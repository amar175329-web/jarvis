# Tests ke cases (kya chal chuka, kya baaki)
Chala (sandbox, `node --test packages/memory/tests/`): 68 pass, 0 fail, 2 skip (pglite).
| Fayl | Kya jaanchta hai |
|---|---|
| rules.test.ts | secrets (OTP, card Luhn, Aadhaar, PAN, bank, UPI PIN, password, key) refuse, "haan" se bhi; jhoothe alarm nahi ("password manager", "pin code", UUID); NEVER topics (paise ank, sehat, minor, self-harm, abuse) refuse + care signal; allowed ("Rahul doctor hai", "EMI ki tarikh 5"); bahari text kabhi memory nahi; kill ON/unreadable; inferred ask + 90 din + 0.7; private contact + voice-only confirm nahi; doosron ki nazuk baat; gussa skip; tarikh expiry; lambi baat |
| store.test.ts + src/testing/contract.ts | har store ka contract: revision conflict, **user B, user A ka kuch nahi dekh/badal/mita sakta**, galat row refuse (why/inferred/lambi), private par vector nahi, keyword search private/kind/expiry, supersede, forget hard delete + derived, forgetAll exact ginti + declines saaf, export paging, purge |
| service.test.ts | event mein text nahi; refuse = kuch store nahi; decline fingerprint; supersede/dedupe; recall card + keyword bina embedding + private chhupi; vector tabhi jab allowed, kill/budget par shabd-search; stale secret wali row nahi dikhti; wrapper band nahi ho sakta; update policy+vector clear+conflict; forget confirm; findToForget kuch nahi mitata; export bina vector/tokens; embed batch off/kill/budget/private skip; growth thresholds |
| supabase.test.ts | har request mein owner filter + user bearer; rpc mein owner; vector sirf text; optimistic update; galat owner id; 403/503 |
| sql-static.test.mjs | meri range 0030-0039; har nayi table mein owner_id + RLS enable+force + policy + anon revoke; koi SECURITY DEFINER nahi; search_path; purge sirf service_role; halfvec+partial HNSW; private-no-vector; why zaroori; file path owner folder |
| db-rls.test.mjs (SKIP: pglite nahi) | asli "B, A ka nahi dekh sakta" har table + function par; DB ke niyam; forget derived |

## Baaki (Antigravity, test project par)
1. `npm i -D @electric-sql/pglite` phir db-rls.test.mjs (halfvec na mile to 0030 ka fallback).
2. SupabaseMemoryStore ko `runStoreContract` ke saath asli test project par (do user).
3. Storage bucket policy: B, A ki file nahi padh sakta.
4. Golden recall set (nijee data, git ke bahar): recall@5 keyword vs hybrid.
5. Hinglish shabd-soochi ke jhoothe alarm/chhoote: Amit ki asli baatchit se 200 vakya (nijee) -> precision/recall.
6. Load: 30k rows par search p95 (memory_search) aur HNSW build time, Supabase free compute par.
7. Gateway embed() aane par: kill ON, budget khatam, key gayab ke 3 raaste.
