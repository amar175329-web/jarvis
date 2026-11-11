# TRD - Tech stack decisions (living doc)
STATUS: DRAFT v0.1 | OWNER: S00 | Source of truth for each decision = docs/decisions/NNN-*.md. This file is the index.

| Layer | Choice | Why / limit | Decision file |
|---|---|---|---|
| Database + Auth + Realtime | Supabase (Postgres, RLS forced on all tables) | free tier: 500 MB, pauses after 7 idle days, no daily backup | 001, 009 |
| Web app | Vite + React (app/) | login as Amit, anon key only | 010 |
| Phone app | Kotlin (android/) | claims commands via claim_phone_command(), anon key + login | 010 |
| API | Vercel serverless, thin routes (api/<group>/<action>) | time limit: no long LLM runs in routes | 003 |
| Worker | always-on jobs (worker/jobs), service_role, server only | host not final | 007 |
| Contracts | zod 3.23.8 in packages/contracts, generated JSON + Kotlin | one shape for web + phone | 003 |
| Events | one envelope, stored; only 4 tables push live | free realtime = 2M msgs/month | 009 |
| AI | packages/model-gateway only; unpriced model refused; kill switch + budget | no direct model calls anywhere else | - |
| Brain | packages/brain (policy), harness/permissions (enforce), packages/safety (kill + audit) | split agreed with S22 | 002 |
| Memory vectors | 768-dim pgvector | free-tier size | 009 |
| Voice | Fish Audio TTS (free-period), device voice fallback | S21 | - |
| Language/time | Hindi (Devanagari) voice, UTC stored, Asia/Kolkata shown | | 005 |
| Tests/CI | node --test per package, scripts/check.ts is the wall | | 004 |

## Rules
Secrets: service_role only in api/ and worker/ (check.ts fails the build otherwise). Memory data never in git.
## Open
Worker host (007) | real login method beyond owner session | backup method (S19) | paid Supabase when memories pass ~30k.
