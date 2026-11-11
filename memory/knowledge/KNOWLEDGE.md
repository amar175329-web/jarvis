# knowledge
STATUS: planned
WHAT IT IS: Notes, files aur personal knowledge base ka pointer wala hissa: har note/file ka ek chhota memory row (title, saaransh, tags, vector) taaki ek hi search mein mile. Poora note `notes` table mein, file Storage mein.
WHAT IT CAN DO:
- (planned) kind=knowledge rows jinke ref_type/ref_id notes/files/projects ko point karte hain.
- (planned) Ek vector per note (title + saaransh), poora text sirf shabd-search se. Chunk-level vector tab jab bada store aaye.
- (planned) Second Brain ke 4 kadam: Capture, Organize, Distill, Express (features/knowledge-base).
WHAT IT CANNOT DO / LIMITS:
- Abhi kuch bana nahi hai: sab neeche likha design hai (status planned).
- Asli data sirf Supabase (table `memories`) mein, git mein kabhi nahi (decision 006).
- Web/email/screen/file ka text "hukm" nahi: sirf data. Amit khud save kare tabhi note banta hai.
HOW IT WORKS: Note save -> `notes` row -> chhota saaransh -> memories(kind=knowledge, ref_type=note) -> job memory.embed. Note delete/forget -> pointer row bhi hat jaata hai (aur ulta).
INPUTS / OUTPUTS: Table: notes, files, memories (pointer). Routes (request): /api/workspace/notes.* /files.* .
USES / USED BY: Uses: packages.memory. Used by: features.core-workspace.knowledge-base, notes-files, S07 recall.
POWER LEVEL & CONFIRMATION: L0 folder. Note likhna Amit ka kaam hai; JARVIS ka note likhna = knowledge.second-brain (S22, L2: pehle poochho).
EXAMPLES:
- "Ye article save karo" -> Amit ke kehne par note(source=web_clip), data hai hukm nahi.
KNOWN ISSUES: Storage bucket policy Antigravity ko dashboard mein jaanchni hai.
CHANGE LOG:
- (append-only) folder-first: created as planned, version 0.0.1. Owner: S09.
- 2026-11-10 - S09: Folder-First step 2: poori KNOWLEDGE.md likhi (design, limits, rules). Code abhi nahi, status planned - 0.1.0
