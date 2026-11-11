# JARVIS - START HERE
JARVIS is a personal AI companion / "AI operating system" for ONE user (Amit): proactive, calm, loyal; Hindi / Hinglish / English. It chats, remembers, plans the day, runs bots, controls a browser and controls Amit's Android phone (with confirmation for risky things).

## Read in this order
1. squads/MASTER_CONTEXT.md - what the project is and how the team works
2. FOLDER_FIRST_RULE.md - mandatory rule for every new thing
3. command-center/rules/RULES.md - rules for every agent
4. squads/BRAIN_AND_PHASES.md - how JARVIS thinks, L0-L4, phases
5. The KNOWLEDGE.md of the folder you are about to touch

## The map (6 layers + support)
- features/  what the user SEES (screens + thin glue). Never put logic here that belongs elsewhere.
- library/   everything plugged in: tools, apps, recipes, skills, plugins, mcp, integrations, models, agents, bots, devices, themes, automations
- packages/  engine code (brain policy, harness, db, events, realtime, voice, safety, ...)
- memory/    categories for what JARVIS knows about Amit (data lives in the database, never in git)
- self/      what JARVIS knows about ITSELF (registry, health, ledger, truth rules)
- command-center/  terminals + the work of every agent; JARVIS is the master here
- worker/    the always-on server part (Vercel serverless cannot run it)
- app/ api/ android/  the web app, the API routes (/api/<group>/<action>), the Kotlin phone app
- contracts/ config/ infra/ scripts/ tests/ docs/ squads/  contracts, settings, setup, tools, tests, decisions, team specs

## Commands (Node >= 22.18, no installs needed)
- npm run new-feature -- <path> --owner S01 --does "one plain line"   (creates folder + KNOWLEDGE.md + manifest, then registers)
- npm run register   (validates manifests, creates agent offices, rebuilds self/registry)
- npm run check      (enforces the Folder-First rule; run before every merge; CI passes --base origin/main)

## Decisions already made (docs/decisions/)
Database = Supabase | autonomy = L0-L4 only | routes = /api/<group>/<action> | Folder-First + KNOWLEDGE.md | English rules, Hindi explanations ok | memory data never in git | free-tier first.

## Status
Only folders, manifests (status: planned) and KNOWLEDGE.md exist. Nothing is built yet. Do not claim otherwise.
