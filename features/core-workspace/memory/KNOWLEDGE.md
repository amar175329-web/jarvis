# memory
STATUS: planned
WHAT IT IS: Memory screen: Amit dekhta hai JARVIS ne kya yaad rakha, kyun (why), kahan se (source), aur sab control uske haath mein.
WHAT IT CAN DO:
- (planned) Category ke hisaab se list; private wali alag; "kyun yaad hai?" har row par.
- (planned) Edit (revision check), delete (confirm), "sab bhool jao" (2 kadam + app tap), export (JSON).
- (planned) Size meter: kitni yaadein, kitne MB, aur 400 MB / 30k par banner.
WHAT IT CANNOT DO / LIMITS:
- Abhi kuch bana nahi hai.
- UI approved look se alag nahi banega: wahi cards, tokens, icons. Naya design nahi.
- Voice se "sab bhool jao" nahi: app par tap chahiye.
HOW IT WORKS: Reads/writes sirf /api/memory/* ke through (owner session + RLS). Delete se pehle exact item dikhta hai. Export download owner session se.
INPUTS / OUTPUTS: Routes (request): memory.list, memory.get, memory.update, memory.forget, memory.forget-all, memory.export, memory.stats. Events: memory.updated, memory.forgotten, memory.exported.
USES / USED BY: Uses: packages.memory, api. Used by: Amit (UI).
POWER LEVEL & CONFIRMATION: L0 screen; Amit ke apne haath ke kaam (edit/delete) JARVIS ke powers nahi.
EXAMPLES:
- Row par "Kyun?" dabao -> "Amit ne kaha tha, 3 Nov".
- Sab bhool jao -> count dikhao -> app par tap -> delete.
KNOWN ISSUES: Abhi kuch bana nahi hai.
CHANGE LOG:
- (append-only) folder-first: created as planned, version 0.0.1. Owner: S09.
- 2026-11-10 - S09: Folder-First step 2: poori KNOWLEDGE.md likhi (design, limits, rules). Code abhi nahi, status planned - 0.1.0
