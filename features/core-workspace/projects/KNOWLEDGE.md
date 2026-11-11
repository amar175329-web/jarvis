# projects
STATUS: planned
WHAT IT IS: Projects: Amit ke kaam, unka goal, status, agla kadam, aur judi hui cheezein.
WHAT IT CAN DO:
- (planned) Project: naam, goal, status (active/paused/done/archived), agla kadam, due_at, tags.
- (planned) Links: notes, files, tasks (task table nahi badalti; `memory_links` se jodte hain).
- (planned) Project ka chhota saaransh memory/projects mein aata hai.
WHAT IT CANNOT DO / LIMITS:
- Abhi kuch bana nahi hai.
- Tasks ka asli data S08 ka (task-manager); yahan sirf link.
- Gantt/board nahi (boards S10).
HOW IT WORKS: Table `projects`. Project badalne par pointer row (memory.projects) update. Delete project: links hatenge, notes/files bachte hain (unlinked).
INPUTS / OUTPUTS: Routes (request): workspace.projects.list/get/create/update/delete. Table: projects, memory_links.
USES / USED BY: Uses: packages.memory, memory.projects. Used by: Amit (UI), S08 (task link).
POWER LEVEL & CONFIRMATION: L0 screen.
EXAMPLES:
- "Jarvis launch" project, next step "memory migration test".
KNOWN ISSUES: tasks.project_id ki jagah link table: S08 ko batana hai.
CHANGE LOG:
- (append-only) folder-first: created as planned, version 0.0.1. Owner: S09.
- 2026-11-10 - S09: Folder-First step 2: poori KNOWLEDGE.md likhi (design, limits, rules). Code abhi nahi, status planned - 0.1.0
