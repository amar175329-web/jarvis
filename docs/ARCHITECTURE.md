# ARCHITECTURE (S00) - एक नज़र में
```
Amit (web, phone, voice)
   |            \
   v             v
 app/ (Vite+React)   android/ (Kotlin)  -- login as Amit, anon key + RLS
   |  /api/<group>/<action>                |  claim_phone_command()
   v                                       v
 api/ (Vercel serverless, thin)  ---->  Supabase (Postgres + Auth + Realtime)
   |                                       ^   tables, RLS, kill switch, queue
   v                                       |
 worker/ (always-on jobs, host = open decision 007) -- service_role key, server only
```
- Events: one envelope in table `events` (id, type dot.case, source, ts, payload, correlation_id, version, realtime). Only `system_state, phone_commands, tasks, reminders` push live. No heartbeats/typing events (free realtime = 2M messages/month).
- Kill switch: DB flag `system_state.kill` + `epoch`. Every actor checks it before acting; unknown = stop (fail-closed). Policy lives in packages/brain (S22), enforcement in harness/permissions, switch+audit in packages/safety.
- Thin routes: long LLM thinking and agent runs do NOT run in Vercel routes (time limit); they run in worker/ or on the phone.
- Time: stored UTC, shown Asia/Kolkata.
- Registry: every folder has manifest.json + KNOWLEDGE.md; scripts/register builds self/registry; scripts/check is the wall (CI).
