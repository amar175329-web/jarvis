# JARVIS Connection Map (P22 Audit)

Audit date: 2026-11-21 (UTC)
Branch audited: `s07-round5d` (`1ae9406`) -> fixed on `s07-round5e`
Rule compliance: Real Supabase project `jusgrcmltnnlntasukdt` was NEVER modified; Production deployment & Production env were NEVER modified; no secrets/tokens/keys printed.

---

## Galat Jud / Mismatches (Sabse Upar)

1. **[GALAT - Production, Amit ko karna hai]** Vercel Production (`dpl_CnTswGF7mMf7b1f7x42teH7PDRah`) **CLI se dirty branch `s07-round5b`** (`commit 254963c`, `gitDirty: '1'`, `source: 'cli'`) par deploy hua tha — configured `productionBranch: main` se GitHub ke zariye NAHI. Aur yeh `s07-round5d` (`1ae9406`) / `s07-round5e` ke security fixes se peeche hai.
2. **[GALAT - Production env, Amit ko karna hai]** `OWNER_ENTRY_KEY` sirf Vercel **Preview** (`id=UNm7TfuIJZnndkYW`) mein set hai; **Production** mein MISSING hai (Production mein 10 vars, Preview mein 11 vars).
3. **[GALAT - Production/Preview env sharing, Amit ko karna hai]** Vercel mein `SUPABASE_URL` (`id=71bYVnKfC5YXqmkG`), `SUPABASE_ANON_KEY` (`id=nTER1IyUTYZqhaHY`), `SUPABASE_SERVICE_ROLE_KEY` (`id=GG7XyE9bBiD378Wy`), `OWNER_EMAIL` (`id=xl7yu0o5oeg5WWTg`), `OWNER_PASSWORD` (`id=NxWvSGsqEnPMIkXi`) sab **ek hi shared record** hain (`targets=['production', 'preview']`), isliye Production aur Preview dono ek hi Supabase project (`tvlwybezgnlyoczegtsi` / `jarvis-test`) ko dekh rahe hain.
4. **[GALAT - Supabase CLI token, Amit ko karna hai]** `~/.supabase/access-token` sirf asli project `jusgrcmltnnlntasukdt` (`amar175329-web's Project`, `ap-northeast-1`) dikhata hai (`orgs: []`), `jarvis-test` (`tvlwybezgnlyoczegtsi`) is token ke scope mein NAHI hai.
5. **[GALAT - jarvis-test Auth, Amit ko karna hai]** `jarvis-test` (`tvlwybezgnlyoczegtsi`) mein `disable_signup: false` (signups ON hain — `SECURITY_CHECKLIST.md` mein Amit ke accepted known risk ke roop mein darj, isliye bina permission badla nahi gaya). Saath hi Auth mein sirf `test_user_a@example.com` aur `test_user_b@example.com` hain (koi alag Amit email user nahi).
6. **[GALAT - jarvis-test DB tracking]** `jarvis-test` mein `supabase_migrations.schema_migrations` table exist NAHI karti (sabhi 16 repo migrations `0001`..`0050` raw SQL / `psql` se apply hui thi, `supabase db push` se nahi).
7. **[THEEK KIYA GAYA - jarvis-test DB, B7]** `jarvis-test` mein `public.jobs` par `anon` ko full table privileges (`DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE`) mile hue the, aur `public.jobs` + `public.event_rate_limits` par `FORCE ROW LEVEL SECURITY` OFF tha (baaki 27 tables par ON). **Allowed range mein fix kiya gaya.**

---

## Connection Map Table (B6)

| Link | Kya Jud Raha Hai | Kaise Sabit Hua | Status |
|---|---|---|---|
| **B1: GitHub CLI (`gh`)** | Account `amar175329-web` -> repo `amar175329-web/jarvis` (public) | `gh auth status` -> logged in as `amar175329-web` | **THEEK** |
| **B1: Vercel CLI/API** | User `shehamar70-9192`, Team `shehamar70-9192s-projects` (`team_A6JCOsbCHQkawdxoopQUaYME`) | `GET /v2/user` (200) + `GET /v2/teams/team_A6JCOsbCHQkawdxoopQUaYME` (200) | **THEEK** |
| **B1: Supabase CLI token** | `~/.supabase/access-token` -> `orgs: []`, project `jusgrcmltnnlntasukdt` (`amar175329-web's Project`) | `GET https://api.supabase.com/v1/organizations` (200) + `/v1/projects` (200) | **GALAT** (sirf asli project dikhta hai, `jarvis-test` nahi) |
| **B2: GitHub <-> Vercel Repo** | Vercel project `jarvis` (`prj_xdB79cEa2qjiQTDOOG9V04c8kLrS`) <-> GitHub `amar175329-web/jarvis` | `GET /v9/projects/jarvis` -> `link: {type: "github", org: "amar175329-web", repo: "jarvis"}` | **THEEK** |
| **B2: Vercel Production Branch** | Configured `productionBranch: main`, lekin latest Production deploy `dpl_CnTswGF7mMf7b1f7x42teH7PDRah` branch `s07-round5b`, commit `254963c`, `gitDirty: '1'`, `source: 'cli'` | `GET /v9/projects/jarvis` + `GET /v6/deployments` | **GALAT** (CLI dirty deploy, `main` se nahi) |
| **B2: Vercel Preview Branches** | Non-`main` branches (`s07-round5b`, `s07-round5c`, `s07-round5d`, `s07-round5e`) par auto Git Preview + CLI Preview. Pre-P22 latest Preview: `1ae9406` (`s07-round5d`). P22 Preview: `dpl_C6PaHtN6TvCz1AvGrwzyANjKsJ9Z` (`s07-round5e`, `source: 'git'`, `gitDirty: None`) | `GET /v6/deployments` | **THEEK** |
| **B3: Vercel Env Vars (Production vs Preview)** | Production (10 vars): `GEMINI_API_KEY`, `INR_PER_USD`, `MODEL_DAY_LIMIT_INR`, `MODEL_MONTH_LIMIT_INR`, `OPENCODE_API_KEY`, `OWNER_EMAIL`, `OWNER_PASSWORD`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`. Preview (11 vars): same + `OWNER_ENTRY_KEY`. | `GET /v9/projects/{id}/env` | **GALAT** (`OWNER_ENTRY_KEY` Production mein missing) |
| **B3: Production & Preview Supabase Target** | `SUPABASE_URL` (`71bYVnKfC5YXqmkG`), `SUPABASE_ANON_KEY` (`nTER1IyUTYZqhaHY`), `SUPABASE_SERVICE_ROLE_KEY` (`GG7XyE9bBiD378Wy`) single shared `type=sensitive` records hain (`targets=['production', 'preview']`) | Vercel env record IDs identical for both targets; `jarvis-test` (`tvlwybezgnlyoczegtsi`) DB mein `chat_threads`/`chat_messages` writes (`2026-11-20 09:46:59+00`) + P22 Preview live test writes verified | **GALAT** (Prod & Preview share same DB; ref `tvlwybezgnlyoczegtsi`, `jusgrcmltnnlntasukdt` NAHI) |
| **B3: `~/.jarvis.env` Keys <-> `tvlwybezgnlyoczegtsi`** | `TEST_SUPABASE_URL` ref = `tvlwybezgnlyoczegtsi`; `TEST_SUPABASE_ANON_KEY` & `TEST_SUPABASE_SERVICE_ROLE_KEY` isi project ke hain | Anon -> `/auth/v1/settings` **200**, `/rest/v1/chat_threads` **401** (RLS/privs deny anon); Service -> `/auth/v1/admin/users` **200**, `/rest/v1/chat_threads` **200**, `/rest/v1/rpc/check_owner_enter_rate_limit` **200** | **THEEK** |
| **B4: GitHub Migrations <-> `jarvis-test` DB** | Repo `packages/db/migrations/`: `0001..0005, 0020..0021, 0030..0037, 0050` (+ new `0051`). DB mein `supabase_migrations.schema_migrations` table nahi hai, par sabhi 16 repo migrations ke objects (`chat_threads`, `chat_messages.status`, `storage.objects` policies, `model_registry`, etc.) DB mein maujood hain. Next free number: **`0051`** (ab applied). | `psql` schema inspection of tables, constraints, functions, storage policies | **GALAT** (tracking table missing, par schema objects synced; `0051` applied) |
| **B5: `jarvis-test` Auth Users & Signups** | Users: `test_user_a@example.com` (`90736d98-...`, confirmed, not banned) & `test_user_b@example.com` (`ced76cf6-...`, confirmed, not banned). `disable_signup: false` (ON), `mailer_autoconfirm: false`. | `GET /auth/v1/settings` (200) + `GET /auth/v1/admin/users` (200) | **GALAT** (signups ON; alag Amit owner user nahi, `test_user_a` hi hai) |
| **B5: `jarvis-test` RLS & Grants** | Pre-fix: 29/29 tables RLS ON, 27/29 RLS FORCED (`jobs` & `event_rate_limits` not forced), `anon` had grants on `public.jobs`. Post-B7 & 0051: **30/30 tables RLS ON + FORCED**, `anon` has **0 table grants**; `owner_enter_attempts` & its 2 RPCs are `service_role`-only (`anon=f, authenticated=f, service_role=t`). | `psql` queries on `pg_class`, `information_schema.role_table_grants`, `pg_proc` | **THEEK** (B7 mein fix kiya gaya) |
| **C7: Vercel Hobby 12-Function Limit** | `api/auth/owner.enter.ts` naya serverless function banata hai (10 -> **11** functions). `.vercelignore` ignores `api/chat/threads.*.ts` & `messages.*.ts`. | Vercel deployment `lambdaRuntimeStats: {"nodejs": 11}` (<= 12 limit) | **THEEK** (11/12 — rewrite zaroori nahi) |

---

## B7: Kya Theek Kiya Gaya vs Amit Ko Karna Hai

### Allowed Range Mein Theek Kiya Gaya (jarvis-test / Preview / GitHub)
1. **`jarvis-test` (`tvlwybezgnlyoczegtsi`) DB**:
   - `REVOKE ALL ON public.jobs FROM anon;` (ab `anon` ke paas `public` schema ki kisi bhi table par privilege nahi hai).
   - `ALTER TABLE public.jobs FORCE ROW LEVEL SECURITY;` aur `ALTER TABLE public.event_rate_limits FORCE ROW LEVEL SECURITY;` (ab sabhi 30/30 `public` tables par RLS enabled + forced hai).
   - Migration `0051_owner_enter_rate_limits.sql` apply ki gayi (`owner_enter_attempts` table + `check_owner_enter_rate_limit` & `record_owner_enter_failure` atomic RPCs, sirf `service_role` execute kar sakta hai).
2. **GitHub (`s07-round5e`) & Vercel Preview**:
   - `api/auth/index.ts` se in-memory `ipAttempts` Map hata kar DB-backed rate limit (per-IP 5/10m, global 20/10m, exponential delay max 5s, fail-closed 503) lagaya gaya aur clean Git Preview deploy (`dpl_C6PaHtN6TvCz1AvGrwzyANjKsJ9Z`, `gitDirty: None`) verify kiya gaya.

### Amit Ko Karna Hai (Production / Asli Project — Haath Nahi Lagaya)
- **Amit ko karna hai**: Vercel **Production** env mein `OWNER_ENTRY_KEY` add karein (abhi sirf Preview mein hai).
- **Amit ko karna hai**: Vercel **Production** ke `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OWNER_EMAIL`, `OWNER_PASSWORD` ko Preview se alag karein (abhi dono shared records hain aur `jarvis-test` par point kar rahe hain), jab Production asli Supabase par shift karna ho.
- **Amit ko karna hai**: Security fixes merge hone ke baad Vercel **Production** ko clean `main` branch se GitHub ke zariye re-deploy karein (abhi Production `s07-round5b` commit `254963c` dirty CLI deploy par hai).
- **Amit ko karna hai**: Public launch se pehle Supabase Auth mein `disable_signup = true` (signups OFF) karein aur asli owner account verify karein.
- **Amit ko karna hai**: Agar `supabase` CLI se `jarvis-test` manage karna ho to us org/account ka alag access token use karein (`~/.supabase/access-token` abhi sirf `jusgrcmltnnlntasukdt` dikhata hai).
