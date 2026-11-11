# FOLDER-FIRST RULE (JARVIS) - mandatory for every agent: Antigravity, Claude Code, Codex, Hermes, OpenCode, squads, LEAD
Put a copy at repo root and in command-center/rules/. AGENTS.md / CLAUDE.md / GEMINI.md must point here.

## Hinglish summary (Amit)
Koi bhi nayi cheez (feature, tool, skill, plugin, MCP, agent, bot, app, recipe, device) banne se PEHLE:
1. Uska folder banega.
2. Folder ke andar KNOWLEDGE.md likhi jayegi: ye kya hai, kya kar sakta hai, kaise karta hai, kya nahi kar sakta.
3. Phir manifest.json (status: planned) -> register.
4. Uske BAAD hi code banega.
5. Jaise-jaise cheez banti hai, KNOWLEDGE.md badhti rehti hai (kabhi purani line mitai nahi jati, sirf judti hai).
Isse JARVIS ko apne baare me sab pata rehta hai aur koi cheez "bina soche" nahi banti.

## The rule (English, for agents)
No code for a new thing before its folder and knowledge exist.

ORDER (never skip, never reorder):
1. FOLDER   - create it in its ONE home (features/ for UI, library/<kind>/ for things, packages/ for engine, etc.). Check first that it does not already exist elsewhere.
2. KNOWLEDGE.md - write it BEFORE code, from the template below. Even if short.
3. manifest.json - status "planned". Fill id, kind, group, owner_squad, phase, does, uses, knows, autonomy_default (L0-L4), version.
4. REGISTER   - run `scripts/register` (builds self/registry, graph, checks that everything it "uses" exists). Commit this step alone: "folder-first: <name>".
5. BUILD      - now write code, tests. Status moves planned -> built -> tested -> live only with evidence (status.json from tests).
6. GROW       - every change that adds/removes/changes behaviour updates KNOWLEDGE.md (append to Change log) and bumps manifest version IN THE SAME CHANGE.

## KNOWLEDGE.md template (fixed headings, so JARVIS can parse it)
# <name>
STATUS: planned | built | tested | live | broken | deprecated
WHAT IT IS: 1-2 plain lines.
WHAT IT CAN DO: bullet list of capabilities (only things that are real at the current status; mark future ones "(planned)").
WHAT IT CANNOT DO / LIMITS: honest list.
HOW IT WORKS: steps, ladder (try A, else B), models/tools used, data it reads/writes.
INPUTS / OUTPUTS: routes, events in and out, tables.
USES / USED BY: other folders (must match manifest "uses" and "knows").
POWER LEVEL & CONFIRMATION: default autonomy level L0-L4, when to ask Amit.
EXAMPLES: 2-3 real examples (Hinglish commands ok).
KNOWN ISSUES:
CHANGE LOG: (append-only) date - what changed - version.

## Enforcement (scripts/check, runs in CI and before every merge)
- Folder without manifest.json + KNOWLEDGE.md -> FAIL.
- KNOWLEDGE.md missing any heading -> FAIL.
- Status above "planned" while KNOWLEDGE.md has empty CAN DO or HOW IT WORKS -> FAIL.
- Code changed in a folder but KNOWLEDGE.md and manifest.version not touched -> FAIL.
- Folder with no group / unknown "uses" -> FAIL (orphan).
- KNOWLEDGE.md replaces the old README.md (one file, not two).

## How JARVIS uses it
registry-builder indexes all KNOWLEDGE.md files into self/registry. When Amit asks "tum kya kar sakte ho / X kaise kaam karta hai", JARVIS answers from these files (only "live" things are claimed as abilities). If it is not written there: "pata nahi / abhi bana nahi". JARVIS may only PROPOSE KNOWLEDGE.md edits (self/proposals/); agents and Amit apply them.

## Do not create empty scaffolding
A planned thing gets only: folder + manifest.json + KNOWLEDGE.md. Subfolders (ui/, logic/, tests/) are created when real code arrives, not before.
