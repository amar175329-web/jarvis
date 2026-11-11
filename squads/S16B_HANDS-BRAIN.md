# SQUAD S16B - HANDS-BRAIN
Phase: 1   |   Run in: Claude Opus 5.5   |   Depends on: S00, S16A, S21, S22

## You cover (UI items)
Phone control agent loop, media control, safety

## Your deliverables
- Agent loop: observe (screen tree + screenshot->vision) -> plan -> act -> verify, step limits, recovery.
- Recipes: YouTube open/search/play/pause/next/like/subscribe (with confirm), app-specific flows; voice trigger; KILL SWITCH.
- Safety policy + confirmation rules + full action log to S05; command JSON schema shared with S16A.

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
