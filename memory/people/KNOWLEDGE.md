# people
STATUS: planned
WHAT IT IS: Parivar, dost, contacts: naam, rishta, kaam, janmdin. Doosron ki nazuk baatein nahi.
WHAT IT CAN DO:
- (planned) `memories` table ki kind = person. Naam, rishta, kaam, janmdin. Doosron ki nazuk jaankari nahi.
- (planned) Retention: kabhi nahi mitti; contact phone/address private=haan.
- (planned) Privacy: phone number, address, email = private=haan, chat model ko tabhi jaate hain jab Amit us baat ke liye maange. Minor ki jaankari kabhi nahi.
WHAT IT CANNOT DO / LIMITS:
- Abhi kuch bana nahi hai: sab neeche likha design hai (status planned).
- Asli data sirf Supabase (table `memories`) mein, git mein kabhi nahi (decision 006).
- NEVER list (memory/rules) yahan bhi lagu: secrets, OTP, card/bank, ID numbers, paise ke ank, sehat, abuse, minor, self-harm.
HOW IT WORKS: Folder sirf pehchaan hai. Rows `memories` (kind=person) mein, packages/memory ke through. Likhna policy se guzarta hai; dhoondhna MemoryStore.search() se; Amit Memory screen se dekh/edit/delete/export kar sakta hai.
INPUTS / OUTPUTS: In/Out: MemoryStore (packages/memory). Table: memories (+ memory_links). Events: memory.saved / memory.updated / memory.forgotten.
USES / USED BY: Uses: packages.memory. Used by: memory.engine, S07 chat (recall), features.core-workspace.memory.
POWER LEVEL & CONFIRMATION: L0 folder. Likhna = memory.write-fact (L3: karo, phir batao; private ya andaza ho to pehle poochho).
EXAMPLES:
- "Rahul meri team mein hai" -> person.
- "Rahul ka birthday 14 March" -> person + routine tarikh.
KNOWN ISSUES: Abhi kuch bana nahi hai.
CHANGE LOG:
- (append-only) folder-first: created as planned, version 0.0.1. Owner: S09.
- 2026-11-10 - S09: Folder-First step 2: poori KNOWLEDGE.md likhi (design, limits, rules). Code abhi nahi, status planned - 0.1.0
