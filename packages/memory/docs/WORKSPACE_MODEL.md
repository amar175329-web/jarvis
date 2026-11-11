# Notes, files, projects ka data model (migration 0031)
Sab tables mein owner_id + RLS (enable + force) + owner_all policy + anon revoke. Test: tests/sql-static.test.mjs (chalta hai) + tests/db-rls.test.mjs (pglite chahiye).

| Table | Kaam | Khaas |
|---|---|---|
| projects | naam, goal, status (active/paused/done/archived), next_step, due_at, tags | naam unique (archived chhodkar) |
| notes | title, body_md (<=100 KB), tags, project_id, pinned, status, source (amit/web_clip/import/jarvis) | `no_embed`, `tokens` (<=200) shabd-search ke liye |
| files | metadata: name, mime allow-list, size <=10 MB, sha256, storage_path (<owner_id>/...), status, text_excerpt <=8 KB, tags | file khud Supabase Storage mein |
| memory_links | (src_type,src_id,rel,dst_type,dst_id) | types: memory, note, file, project, task, person; trigger check: dono taraf usi owner ke |
| memory_declines | "nahi" ka fingerprint | text nahi |

## Jodne ka tareeka
- project_id composite FK (project_id, owner_id): doosre owner ke project se jud nahi sakta; project mita to note/file bachta hai, project_id khaali.
- Task S08 ka hai: task table nahi badli. Link `memory_links` se (rel `part_of`). S08 ko batana hai (NEEDS).
- Pointer row: har note/file/project ke liye ek `memories` row (kind knowledge/project, ref_type, ref_id, title + chhota saaransh, vector). Search ek hi jagah. Note/file/project delete -> pointer aur links trigger se hat jaate hain. Memory forget karne se note nahi mitta (alag cheez), pointer mitta hai.

## Safety
- Note mein secret-jaisa text mile (findSecrets): `no_embed = true`, vector kabhi nahi, UI mein chetavni. Mana nahi (note Amit ka apna hai), par model ko nahi jaata.
- File ka text/PDF ke andar likha hukm = data. File kabhi execute nahi. Antivirus/quarantine: S19 (`status='quarantined'`).
- Free tier: DB 500 MB aur Storage 1 GB alag hain. Poora file text DB mein nahi (sirf 8 KB excerpt).

## Storage bucket (Antigravity dashboard mein, test project par pehle)
Bucket `files`, private, 10 MB limit, mime allow-list wahi. storage.objects policies: select/insert/update/delete sirf jahan `(storage.foldername(name))[1] = auth.uid()::text`. Test: B, A ke path se download/upload nahi kar sakta.

## Notes ka search
v1: ek vector per note (title + saaransh), poora text sirf shabd-search se. Chunk-level vector bade store ke saath (GROWTH doc).
