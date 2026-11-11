# Obsidian export: baad mein (sirf PLAN, koi code nahi)
Kab: memory + notes ka export (JSONL) pakka chalne ke baad (v2).
- **Shape:** ek zip: `Notes/<project>/<title>.md` (frontmatter: id, tags, project, created, updated, source), `People/<naam>.md`, `Projects/<naam>.md`, `Memory/<kind>/<id>.md` (frontmatter: why, source, confidence, private). Links `[[wikilink]]` memory_links se (person -> project).
- **Private:** default mein shamil nahi; Amit alag se chune. Export sirf Amit ke login se, download hone ke baad server par kuch nahi rakhta.
- **Sirf ek taraf:** JARVIS -> Obsidian. Wapas import (Obsidian -> JARVIS) tab jab zaroorat ho: import bhi policy (secret/never-list) se guzregi.
- **Safety:** frontmatter mein vector/tokens nahi. File ke naam saaf (path traversal nahi). Export ka event `memory.exported` (ginti, format).
- **Git:** export Amit ke device par jaata hai, repo mein kabhi nahi.
- Pehle JSONL (v1, `MemoryService.exportAll`) = asli bharosa; Markdown usi se banega.
