# knowledge-base
STATUS: planned
WHAT IT IS: Personal Knowledge Base: Amit ka apna "Second Brain". Notes aur files ek jagah, search se milte hain.
WHAT IT CAN DO:
- (planned) Capture: note/clip/file jodna. Organize: PARA (Projects, Areas, Resources, Archive) jaise tags. Distill: chhota saaransh. Express: chat mein jawab ke saath source dikhana.
- (planned) Search: shabd + (agar Amit ne haan kaha) semantic.
- (planned) Obsidian export baad mein (sirf plan: packages/memory/docs/OBSIDIAN_EXPORT_PLAN.md).
WHAT IT CANNOT DO / LIMITS:
- Abhi kuch bana nahi hai.
- Folder-vault sync, Obsidian plugin, web clipper v1 mein nahi.
- Poora note kisi bahari service ko nahi jaata.
HOW IT WORKS: Data model: packages/memory/docs/WORKSPACE_MODEL.md. Notes -> `notes`, pointer row memories(kind=knowledge). Distill JARVIS kare to knowledge.second-brain (L2, pehle poochho).
INPUTS / OUTPUTS: Routes (request): workspace.notes.*, workspace.files.*, workspace.search. Tables: notes, files.
USES / USED BY: Uses: packages.memory, memory.knowledge. Used by: Amit (UI), S07 recall.
POWER LEVEL & CONFIRMATION: L0 screen; JARVIS ka saaransh likhna L2.
EXAMPLES:
- "Is note ko Jarvis project mein daalo" -> link + tag.
KNOWN ISSUES: Abhi kuch bana nahi hai.
CHANGE LOG:
- (append-only) folder-first: created as planned, version 0.0.1. Owner: S09.
- 2026-11-10 - S09: Folder-First step 2: poori KNOWLEDGE.md likhi (design, limits, rules). Code abhi nahi, status planned - 0.1.0
