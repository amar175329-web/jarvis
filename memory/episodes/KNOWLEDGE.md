# episodes
STATUS: planned
WHAT IT IS: Kaam ke episodes: kya hua, kab, kaise nipta. Chhote saaransh, kachchi baatchit nahi.
WHAT IT CAN DO:
- (planned) `memories` table ki kind = episode. Kya hua, kab, kaise nipta (chhote saaransh, poori baatchit nahi).
- (planned) Retention: 365 din, phir saaransh ya delete (size ke hisaab se).
- (planned) Privacy: private=haan agar kisi doosre ki nazuk baat ho; poori baatchit store nahi.
WHAT IT CANNOT DO / LIMITS:
- Abhi kuch bana nahi hai: sab neeche likha design hai (status planned).
- Asli data sirf Supabase (table `memories`) mein, git mein kabhi nahi (decision 006).
- NEVER list (memory/rules) yahan bhi lagu: secrets, OTP, card/bank, ID numbers, paise ke ank, sehat, abuse, minor, self-harm.
HOW IT WORKS: Folder sirf pehchaan hai. Rows `memories` (kind=episode) mein, packages/memory ke through. Likhna policy se guzarta hai; dhoondhna MemoryStore.search() se; Amit Memory screen se dekh/edit/delete/export kar sakta hai.
INPUTS / OUTPUTS: In/Out: MemoryStore (packages/memory). Table: memories (+ memory_links). Events: memory.saved / memory.updated / memory.forgotten.
USES / USED BY: Uses: packages.memory. Used by: memory.engine, S07 chat (recall), features.core-workspace.memory.
POWER LEVEL & CONFIRMATION: L0 folder. Likhna = memory.write-fact (L3: karo, phir batao; private ya andaza ho to pehle poochho).
EXAMPLES:
- "Kal Rahul ke saath demo hua, client ko pasand aaya" -> episode.
KNOWN ISSUES: Abhi kuch bana nahi hai.
CHANGE LOG:
- (append-only) folder-first: created as planned, version 0.0.1. Owner: S09.
- 2026-11-10 - S09: Folder-First step 2: poori KNOWLEDGE.md likhi (design, limits, rules). Code abhi nahi, status planned - 0.1.0
