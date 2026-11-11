# Security Checklist (living doc)
STATUS: DRAFT v0.1 | OWNER: S19 (build) + S22/safety (kill, audit) + S00 (api, db) | UPDATED: 2026-11-10
One user (Amit). Tick an item only after it is tested by running, not by reading. [x] = seen in repo today, [ ] = to do, [?] = depends on Supabase dashboard setting, must be checked there.

## 1. Authentication
- [x] Passwords hashed: Supabase Auth handles password hashing (bcrypt/argon2); confirmed no custom password code exists (checked 2026-11-11).
- [x] Session expiry checked via Supabase API: JWT lifetime is 3600s (1 hour); cookie refresh rotation in api/auth (checked 2026-11-11).
- [x] Email verification checked via Supabase API: mailer_autoconfirm is false (email verification ON); password-reset expiry (mailer_otp_exp) is 3600s (1 hour) (checked 2026-11-11).
- [ ] Login rate limit (api/auth) - add (see 4).
- [ ] KNOWN RISK (Amit accepted, LEAD snapshot 8 Nov): Supabase sign-ups are ON (disable_signup=false confirmed 2026-11-11). Recommendation: Turn OFF sign-ups before public deployment; do not change directly without Amit's explicit action.
- [x] Confirm whether the GitHub repo is public or private: Confirmed PUBLIC (amar175329-web/jarvis). Scanned with gitleaks: 0 leaks found (checked 2026-11-11).
- [x] service_role never in app/, android/, features/ (check.ts fails the build).
- [ ] Real password login (S00 leftover) done with the above.
## 2. Ownership / IDOR
- [x] RLS enabled + FORCED on all 17 core tables + 5 S09 tables (memory_links, memory_declines, notes, files, projects), policy owner_id = auth.uid().
- [x] Tests: user B cannot read/insert as A (db.test.mjs) and on every S09 table + memory functions (packages/memory/tests/db-rls.test.mjs, run by LEAD on local Postgres 2026-11-11).
- [ ] Memory embeddings: text sent to a model API only if Amit says yes; free Gemini = Google may use it and humans may read it (terms, checked 2026-11-11 via a secondary source). Default OFF.
- [ ] Every api/ route: check owner before read/update/delete; test with a second user. Add one shared helper, no route-by-route copies.
- [ ] Tables added later (0020+, memory, chat) get the same RLS block + a B-cannot-see-A test.
## 3. Secure deployment
- [ ] HTTPS only + HSTS + security headers (no vercel.json yet).
- [x] .env / .env.* ignored in git; .env.example exists. [ ] Scan git history before first public push.
- [ ] Secrets only in server env vars (Vercel / worker host); plan in infra/secrets-plan.md.
- [!] Supabase DB network restrictions checked via API: dbAllowedCidrs is ["0.0.0.0/0", "::/0"] (DB is currently accessible from public internet; recommend restricting when static server IP is chosen) (checked 2026-11-11).
- [ ] Logs: login attempts, API errors, unusual traffic -> activity_log / packages/logging; alert rule.
## 4. Abuse protection
- [x] event rate limit in DB (0005); model-gateway budget + kill switch.
- [ ] Rate limits: login, account creation (disable signups: single owner), all api routes, AI generation (per hour/day cost cap).
- [ ] Bot/scrape guard: no list endpoints without limit; page size caps; optional CAPTCHA on login.
## 5. Secrets scan
- [x] Quick pattern scan of this repo (API-key / JWT / service_role patterns): nothing found, 2026-11-10.
- [ ] Full scan with a real tool (gitleaks) in CI, incl. history; rotate any key ever shared in a chat or file.
- [ ] Fish Audio key and model keys: server only, via gateway.
## 6. Input validation
- [x] contracts use zod .strict() for routes and events (unknown fields rejected).
- [ ] Every api/ route validates body, query and params with its contract; reject, never "fix".
- [ ] SQL: no string-built queries anywhere; parameters only.
- [ ] Command injection: no shell calls with user text; allow-list for phone/computer ops.
- [ ] Script injection: output escaping in app/; CSP header.
- [ ] Uploads: type + size allow-list, rename, never execute, scan; storage bucket private.
- [x] Prompt-injection defence rules exist (packages/brain/src/injection.ts); [ ] wire into S07/S15.

## How we work on it
Slowly, one section per step. S19 builds and tests each item; LEAD verifies by running; Antigravity applies. Add new risks here as they are found.
