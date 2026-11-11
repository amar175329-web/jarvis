# notes-files
STATUS: planned
WHAT IT IS: Notes aur Files: likho, tag lagao, dhoondo, project se jodo.
WHAT IT CAN DO:
- (planned) Notes: markdown, tags, pin, archive, project se link, shabd-search.
- (planned) Files: private Storage bucket mein, metadata `files` table mein, size/type allow-list, naam badal kar rakhna, kabhi execute nahi.
- (planned) Delete = row + Storage object + pointer row.
WHAT IT CANNOT DO / LIMITS:
- Abhi kuch bana nahi hai.
- Note body max 100 KB, file max 10 MB (free tier 1 GB Storage), type allow-list: txt, md, pdf, png, jpg, csv, docx.
- File ke andar likha hukm data hai.
HOW IT WORKS: Notes `notes` table. Files: Supabase Storage bucket `files` (private) + `files` table. Antivirus scan S19 ka kaam (request).
INPUTS / OUTPUTS: Routes (request): workspace.notes.list/get/create/update/delete, workspace.files.upload-url/list/delete. Tables: notes, files.
USES / USED BY: Uses: packages.memory, memory.knowledge. Used by: Amit (UI), projects.
POWER LEVEL & CONFIRMATION: L0 screen.
EXAMPLES:
- Note: "Meeting 12 Nov" tags [meeting, jarvis].
- File upload: invoice.pdf -> files row, text excerpt 8 KB.
KNOWN ISSUES: Storage RLS manual jaanch (Antigravity).
CHANGE LOG:
- (append-only) folder-first: created as planned, version 0.0.1. Owner: S09.
- 2026-11-10 - S09: Folder-First step 2: poori KNOWLEDGE.md likhi (design, limits, rules). Code abhi nahi, status planned - 0.1.0
