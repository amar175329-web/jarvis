# graph
STATUS: planned
WHAT IT IS: Memory Graph: yaadon, notes, files, projects, tasks aur logon ko jodne wale rishte (links).
WHAT IT CAN DO:
- (planned) Table `memory_links` (src, rel, dst) se: person-works_on-project, note-about-project, derived_from (saaransh kis se bana).
- (planned) Bhoolte waqt derived_from wale saaransh bhi mit jaate hain.
- (planned) Graph screen ke liye 1-2 kadam ke padosi nikalna (limit ke saath).
WHAT IT CANNOT DO / LIMITS:
- Abhi kuch bana nahi hai: sab neeche likha design hai (status planned).
- Alag graph database nahi (decision 001: ek hi Postgres). Gehri graph-search (3+ kadam) v1 mein nahi.
HOW IT WORKS: links sirf Amit ya JARVIS (policy se guzar kar) banata hai; type allow-list: memory, note, file, project, task, person. Dono taraf ka owner_id wahi hona chahiye (DB check).
INPUTS / OUTPUTS: Table: memory_links. In/Out: MemoryStore.link/unlink/neighbors.
USES / USED BY: Uses: packages.memory. Used by: features.core-workspace.knowledge-base, projects.
POWER LEVEL & CONFIRMATION: L0 folder. Link banana memory.write-fact ke andar.
EXAMPLES:
- Rahul --works_on--> Jarvis launch.
KNOWN ISSUES: Abhi kuch bana nahi hai.
CHANGE LOG:
- (append-only) folder-first: created as planned, version 0.0.1. Owner: S09.
- 2026-11-10 - S09: Folder-First step 2: poori KNOWLEDGE.md likhi (design, limits, rules). Code abhi nahi, status planned - 0.1.0
