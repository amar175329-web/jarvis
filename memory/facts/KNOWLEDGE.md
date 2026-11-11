# facts
STATUS: planned
WHAT IT IS: Pakki baatein aur Amit ke liye hue faisle, har ek ke saath source aur bharosa.
WHAT IT CAN DO:
- (planned) `memories` table ki kind = fact. Pakki baatein aur faisle (Supabase use karenge); har ek ke saath source aur bharosa.
- (planned) Retention: kabhi nahi; "ek baar ki zaroorat" = 14 din; andaza (inferred) 90 din jab tak dobara confirm na ho.
- (planned) Privacy: private=haan sirf jab Amit kahe ya baat nijee ho.
WHAT IT CANNOT DO / LIMITS:
- Abhi kuch bana nahi hai: sab neeche likha design hai (status planned).
- Asli data sirf Supabase (table `memories`) mein, git mein kabhi nahi (decision 006).
- NEVER list (memory/rules) yahan bhi lagu: secrets, OTP, card/bank, ID numbers, paise ke ank, sehat, abuse, minor, self-harm.
HOW IT WORKS: Folder sirf pehchaan hai. Rows `memories` (kind=fact) mein, packages/memory ke through. Likhna policy se guzarta hai; dhoondhna MemoryStore.search() se; Amit Memory screen se dekh/edit/delete/export kar sakta hai.
INPUTS / OUTPUTS: In/Out: MemoryStore (packages/memory). Table: memories (+ memory_links). Events: memory.saved / memory.updated / memory.forgotten.
USES / USED BY: Uses: packages.memory. Used by: memory.engine, S07 chat (recall), features.core-workspace.memory.
POWER LEVEL & CONFIRMATION: L0 folder. Likhna = memory.write-fact (L3: karo, phir batao; private ya andaza ho to pehle poochho).
EXAMPLES:
- "Hum Supabase use karenge" -> fact, amit_said.
- "Pehle Delhi tha, ab Pune" -> nayi fact purani ko supersede karti hai.
KNOWN ISSUES: Abhi kuch bana nahi hai.
CHANGE LOG:
- (append-only) folder-first: created as planned, version 0.0.1. Owner: S09.
- 2026-11-10 - S09: Folder-First step 2: poori KNOWLEDGE.md likhi (design, limits, rules). Code abhi nahi, status planned - 0.1.0
