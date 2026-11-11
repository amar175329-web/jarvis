# SQUAD S00 - ARCH
Phase: 1   |   Run in: Claude Opus 5.5   |   Depends on: -

## You cover (UI items)
Foundation / architecture for everyone

## Your deliverables (S00 owns the FOUNDATION; no features, no UI changes)
Final decisions already made (do not reopen): folder structure = ui/JARVIS-folder-structure-v12.html + FOLDER_REVIEW_v11_to_v12.md; FOLDER_FIRST_RULE.md is mandatory; database = Supabase (Postgres/Auth/Realtime); autonomy = L0-L4 only; routes = /api/<group>/<action>; free-tier first.

1. REPO + FOLDERS: apply v12 exactly (folders only with manifest.json + KNOWLEDGE.md for planned things; no empty scaffolding). START_HERE.md, AGENTS.md/CLAUDE.md/GEMINI.md pointers, .gitignore (memory data, secrets, .env), scripts/ (new-feature, register, check).
2. ENVIRONMENTS + SECRETS: dev / preview / prod, .env.example (names only), vault design, where each key lives (Vercel env, Supabase, Android), rotation, never in chats or git. Step-by-step setup for Amit (Supabase, Vercel, GitHub) in simple Hindi.
3. DATABASE (Supabase): full schema + migrations for users, settings, tasks, reminders, memories (+ pgvector for recall), powers, decisions, activity_log, events, devices, device_apps, phone_commands, bots, skills, plugins, connectors, capabilities, sessions. Row-level security (single owner), indexes, seed data, retention rules (log cleanup so the 500 MB free limit is not hit).
4. AUTH: single-owner login (Amit), device pairing tokens (phone/TV/PC), API tokens for agents/machine-agent, scopes, revoke.
5. EVENT BUS + REALTIME: one event envelope (id, type, source, ts, payload, correlation_id, version), dot.case names, which events are realtime vs only stored, offline queue + replay for the phone, idempotency keys, rate limits (free-tier realtime thrift).
6. CONTRACTS: API list, request/response schemas (zod), one error format, versioning, generated TS + Kotlin types (contracts/generated), contract tests.
7. MANIFEST SYSTEM: manifest-schema (autonomy_default L0-L4, owner_squad, phase, status ladder planned/built/tested/live/broken/deprecated), register script, registry-builder (self/registry + graph.json), check script that enforces FOLDER_FIRST_RULE, status.json only from test evidence.
8. KILL SWITCH + AUDIT PLUMBING: one global flag (DB + realtime broadcast) every worker/phone/agent checks before acting; audit table; (policy content belongs to S22, not you).
9. PHONE COMMAND PROTOCOL (with S16A/S16B): phone_commands table, states (queued, sent, running, done, failed, cancelled), timeouts, ack.
10. WHERE THINGS RUN: Vercel = web + API; the always-on WORKER (scheduler, bots, voice, terminals) CANNOT run on Vercel serverless - propose a free/cheap host and a fallback (Vercel cron / Supabase cron / Android foreground service); also keep-alive so the free Supabase project is not paused after a week of inactivity. Give Amit 2 options with honest free-tier limits.
11. MODEL GATEWAY PLUMBING: key storage, usage/cost table, per-model budget caps (logic is S07/S13).
12. DEPLOY + CI: Vercel preview/prod, GitHub Actions (free) running check + tests, Android APK build steps, how Antigravity works inside the repo (rules in command-center/rules).
13. LOGGING + OBSERVABILITY: structured logs, error format, health endpoint, status page data for self/health.
14. BACKUP + EXPORT: DB backup/restore, memory export to markdown (Obsidian-ready, built later by S09), data export.
15. UI MIGRATION: static index.html -> Vite+React+TS with ZERO visual change; screenshot comparison test at 390px and desktop.
16. LOCALE + TIME: store UTC, show Asia/Kolkata, Hindi/Hinglish/English text handling, date formats.
17. TESTING BASELINE: manifest-check, contract tests, smoke tests, self-truth eval skeleton.
18. DOCS: ARCHITECTURE.md, SETUP.md, RUNBOOK.md, docs/decisions/ (one file per decision), plus a one-page "what I decided and why" for LEAD.
Work order: 1 -> 2 -> 3 -> 4 -> 5/6 -> 7/8/9 -> 10 -> 12 -> 15 -> rest. Small steps; one question at a time to Amit; explain every term in simple Hindi.

## How to start
1. Read MASTER_CONTEXT.md, then reply in 5 lines: what you understood + what you will build first + ONE question if needed.
2. Wait for Amit's answer/extra instructions, then work in small steps.
3. Output real files (full code with paths) and short specs. End big answers with a STATE SNAPSHOT.
4. When your part is finished, output the REPORT (format below).

## REPORT FORMAT (use exactly when your part is finished)
SQUAD: <id name>
STATUS: DONE | PARTIAL | BLOCKED
WHAT IS READY: (files/specs/code produced, with paths)
CONTRACTS I DEFINE: (API routes, events, tables)
NEEDS FROM OTHER SQUADS:
DECISIONS TAKEN (with reason):
OPEN QUESTIONS FOR AMIT:
ANTIGRAVITY BUILD PROMPT: (ready-to-paste prompt that builds my part from my files)
NEXT STEP I RECOMMEND:
