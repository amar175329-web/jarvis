# Worker host: portable program, laptop first, AWS later (Consolidated 007 + 012)
Status: Accepted (Amit, 2026-11-07; 012 won and incorporated 007)

Context: Vercel serverless cannot run an always-on process; on Hobby, cron is once a day with hour-level timing. Exact-time reminders (5:10 PM) and long bot/agent runs need something else. Decision 007 proposed Phase 1 without an always-on server. Amit has an AWS account on the free plan and a Cloudflare account. Cloudflare Workers Free allows only 10 ms CPU per request/cron, so it cannot run the heavy worker; it is fine for light jobs (keep-alive). The AWS free plan gives credits for 6 months or until they run out; after that the account closes unless upgraded (data kept 90 days).

Decision:
1. Phase 1 needs NO always-on server:
   - Reminders: Android alarm on the phone (S16A/S08) + Supabase pg_cron for server-side checks.
   - Keep-alive + purge: daily Vercel cron calling api/system/health.
2. The worker is written as a plain, portable Node program that talks only to Supabase and can also run in Docker. It never depends on one host.
3. Phase 1 host: Amit's laptop, no cost.
4. Later host (Phase 2): a small AWS server, only after Amit confirms the credit end date; a budget alert is set first.
5. Cloudflare is used only for light jobs, never for the worker.

Consequences: Zero hosting cost now; moving the worker later needs no code change, only a new place to start it. If the AWS free plan ends, the worker returns to the laptop or another host.
