# JARVIS — MASTER CONTEXT (every squad reads this first)

## What JARVIS is
A personal AI companion / "AI operating system" for ONE user, Amit. It should feel like Iron Man's JARVIS: proactive, calm, smart, loyal, speaks naturally (Hindi / Hinglish / English as Amit does). It can chat, remember, plan the day, run bots, control a browser, and CONTROL AMIT'S ANDROID PHONE (open apps, play/pause YouTube, subscribe, tap/scroll/type, read the screen, calls/messages with confirmation).

## Status
- UI is FINAL and approved (white + ice-blue theme, 218px sidebar, Home + More Features pages, custom SVG icon system, HUD effects). Live: https://jarvis-lovat-one.vercel.app . Reference copy: ui/JARVIS-ui-reference.html
- Everything else (logic, backend, memory, personality, phone control, bots, browser, integrations) is still to be built.

## How the team works (important)
- Many separate CHATS, each is ONE squad (department) of JARVIS. You are one of them. You do not see the other chats.
- Claude squad chats = design + specs + real code files + build prompts.
- Claude chat "LEAD" = the project lead (Opus). It owns contracts, checks every squad's report, decides the build order and writes the Antigravity build sequence. LEAD makes all important decisions.
- ChatGPT chat "LINKER" = only checks that all features are connected to each other (APIs, events, data) and proposes the missing links. It does NOT make big decisions.
- Antigravity builds/deploys later from the finished outputs (Amit brings them).
- Amit copies your REPORT to LEAD; LEAD replies with the next prompt. Amit also talks to you directly and will explain things — ask him when something is unclear, never guess important decisions (max ONE question at a time).
- Your chat limit is small. So: work in SMALL steps, finish one piece before starting the next, and after every big answer end with a STATE SNAPSHOT (5-10 lines: what is done, what is next, key decisions) so work can continue in a fresh chat without loss.

## Rules
1. Never redesign the approved UI. New screens/features must reuse the same look (cards, tokens, icons).
2. Stay inside your squad's scope. If you need something from another squad, write it under NEEDS FROM OTHER SQUADS (do not invent their internals).
3. Shared contracts (API routes, event names, data schemas) are owned by LEAD/S00. Propose changes, do not silently change.
4. Stack defaults (override only if Amit says): TypeScript, Vite+React, Vercel serverless API routes, Supabase (Postgres/Auth/Realtime), Android = Kotlin. LLM calls go through one model router (S07/S13).
5. Safety: confirm before risky actions (payments, sending messages, deleting, installing), log every action, always a kill switch.
6. Real working output only: complete code files with paths, not pseudo-code. Mobile first (no overflow at 390px).
7. Be concise. Hindi/English mix is fine when talking to Amit; code and file names in English.

## Naming
Squad IDs: S00..S22 (see squads/). Event names: dot.case (task.created, phone.command, activity.logged). API routes: /api/<group>/<action> (group-based, e.g. /api/customize/skills.list).

## Brain policy
S22 BRAIN owns how JARVIS thinks and uses power (thinking loop, depth router, power registry, autonomy levels L0-L4 ONLY (no low/medium/high labels), proactivity). Every squad that ACTS (S07, S16B, S12, S14, S15) must follow S22's policy. See BRAIN_AND_PHASES.md.

## Folder-First rule (mandatory)
No code for any new thing before its folder + KNOWLEDGE.md + manifest(planned) exist. See FOLDER_FIRST_RULE.md and FOLDER_REVIEW_v11_to_v12.md (folder structure v12: ui/JARVIS-folder-structure-v12.html). Database = Supabase (decided, docs/decisions/001).
