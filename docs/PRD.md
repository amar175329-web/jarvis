# PRD - JARVIS features (living doc)
STATUS: DRAFT v0.1 | OWNER: LEAD (S00) + each squad fills its own section | UPDATED: 2026-11-10
RULE: one section per squad. A feature is only "done" when its section here, its folder KNOWLEDGE.md and its tests agree.

## 1. Product in one line
JARVIS = one owner's (Amit's) personal AI that talks (Hindi voice), remembers, acts on phone/web/computer, and speaks first when useful. Always under a kill switch and L0-L4 autonomy.

## 2. Users
One user only: Amit (owner). No sharing, no teams. Every table has owner_id + RLS.

## 3. Feature areas (owner squad -> status)
| Area | Squad | Status |
|---|---|---|
| Foundation: DB, events, contracts, worker, gateway, kill switch | S00 | ~80% |
| Persona + Hindi voice | S21 | ~70% |
| Brain: thinking, powers L0-L4, gate, confirm rules | S22 | accepted 2026-11-10 (not wired) |
| Memory + Knowledge | S09 | not started |
| Chat | S07 | not started |
| Phone hands (Android) | S16A / S16B | not started |
| Today, tasks, reminders | S08 | not started |
| Focus, schedule, live, quick, recent | S01, S02, S03, S05, S06 | not started |
| Boards, insights | S04, S10 | not started |
| Extend (plugins/tools), automation, prefs/models | S11, S12, S13 | not started |
| Bots, browser, devices, workbench | S14, S15, S17, S18 | not started |
| System (security, backup, export, diagnostics) | S19 | not started |
| QA | S20 | last |

## 4. Per-feature template (copy for each feature)
- Goal (1 line) | Who triggers (Amit / JARVIS on its own) | Power id + level (powers registry) | Confirm needed? (voice/tap/fingerprint) | Data touched (tables) | Success test | Not in scope.

## 5. Non-negotiables (from Amit)
Hindi voice (Devanagari); only "हाँ / कर दो / भेज दो" = yes, silence never; money/health/password = phone voice yes + fingerprint; password never shown to model; payment frozen at L0 until Amit unlocks; kill switch can only be turned ON by a device.

## 6. Open (Amit)
Payment unlock date | health powers wanted? | quiet hours 23:00-06:00 IST ok?
