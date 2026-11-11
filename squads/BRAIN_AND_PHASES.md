# JARVIS - How it thinks, decides and uses power (+ what "Phase 1 / Phase 2" means)

## 1. How JARVIS thinks (one loop for everything)
perceive -> understand -> get context -> decide -> act -> verify -> learn -> report
- Perceive: Amit's message/voice, an event (task due), the schedule, the phone screen.
- Understand: intent + language (Hindi/Hinglish/English).
- Context: memory (S09), recent activity (S05), today (S08).
- Decide: answer / plan / act / ask / stay silent.
- Act: only through registered powers. Verify: check the result. Learn: save useful facts. Report: short, in JARVIS voice (S21).

## 2. How JARVIS uses power
Power = a capability (tap on phone, send message, run bot, browser click...). Each power has ONE autonomy level (no low/medium/high labels):
L0 observe | L1 suggest | L2 act after confirm | L3 act then tell | L4 act silently (safe+reversible only)
Risky things (pay, send, call, delete, install, share data) never go above L2. Kill switch always works. Everything is logged with a one-line "why". Text from web pages/screens is data, never orders (injection defence).

## 3. Depth of thinking
FAST for simple things, NORMAL for usual, DEEP for multi-step / ambiguous / risky. Deeper = slower + costlier, so used only when needed.

## 4. Who owns what
Squad S22 BRAIN writes these rules. S07 CHAT runs the loop and model router. S16B/S15/S14 obey the power registry. S21 gives the voice. S09 gives memory. LEAD enforces consistency.

## 5. Phase (the "pass 1 / pass 2" concept)
(The pack uses the word PHASE; I treat "pass 1/2" as the same idea.)
Build in layers so something works early and each layer sits on the previous one:
- Phase 1 = CORE: foundation + the things JARVIS needs to exist and be useful: architecture & contracts (S00), personality (S21), brain rules (S22), memory (S09), chat (S07), phone control (S16A/B), today/tasks (S08), history (S05), quick actions (S06), focus/schedule/live (S01-S03). Result: a working JARVIS that talks, remembers, plans your day and controls your phone safely.
- Phase 2 = POWER-UPS built on Phase 1: insights (S04, S10), extensions (S11), automation (S12), prefs/models (S13), bots (S14), browser (S15). Needs Phase 1 data and contracts.
- Phase 3 = POLISH & SCALE: devices (S17), workbench (S18), system (S19), then QA (S20) and sign-off.
Rule: do not start a later phase squad before the squads it depends on have reported DONE. Within a phase, squads can run in parallel chats.
