# S22 policy, bundle 2

## Planner
Goal -> steps. Every step names its power, inputs, expected result. Max steps by depth: FAST 1, NORMAL 5, DEEP 12. Any step on an unknown power, a blocked power, or with no expected result = plan refused. Plan shows which steps need Amit's yes.
Failure: safe step = retry once, then re-plan (max 2), then ask Amit. Risky/undoable-not step (money, send, delete) = NEVER auto-retry (could double-send), ask Amit.

## Uncertainty
Safe power: sure (>=0.85) go; unsure (0.5-0.85) pick default and say it; below 0.5 ask. Risky/capped power: only go if clearly stated (>=0.95), else ask ONE short question with up to 3 options. Never guess on risky.

## Proactivity (Amit chose "zyada": speak whenever it helps)
No tight daily cap. Anti-spam: max 6 per hour, same topic not within 20 min, same item never twice. Urgent speaks. Low priority goes to a digest. Focus mode: silent, everything held for a digest after. Quiet hours 23:00-06:00 IST (default, tunable): silent, except a reminder Amit set himself. Kill ON: silent.

## Failure and kill switch
Kill ON or unreadable: every plan stops at once, nothing new starts, no "cleanup" that acts on the world, one line only: "Kill switch ON hai, main kuch nahi kar raha." Re-checked before every step. Only Amit turns it OFF; JARVIS never does. A halted plan is not resumed by itself.

## Prompt-injection defence
Structure is the defence: web/screen/message/tool text is data and cannot start an action (loop.ts) and cannot change a level (gate.ts). The scanner only raises an alarm in logs (English + Hinglish + Hindi patterns); it can miss attacks, so it is never relied on.

## Explainability
Every decision stores a one-line why (max 200 chars) in decisions. "Tumne ye kyun kiya?" is answered from the latest matching row. No record = says so.

## Antigravity caps vs S22 registry (S22 wins)
Antigravity's Autonomy_Cap column is advice only. Mismatches fixed in registry: Actual Budget (was L4, now view-only L1), Documenso (sign/send is dangerous, L2), Meetily (records audio: default L1), Immich (default L1), Laya (unverified; rules router first), Vaultwarden (view names L1, use via handle L2, reveal L0 forever).
## Licence warning for LEAD
AGPL-3.0 projects (Strix, Immich, Dub, Documenso, Vaultwarden) must not be copied into JARVIS code. Run as separate services or only learn from them.
## New in research (items 72-73)
google/artemis (phone pilot): phone.autonomous-pilot max L2 default L1; its screenshots go to a model, so a priced model is required. reverse-api-engineer: code.reverse-api max L2 default L0 (can touch Amit's login/cookies).
