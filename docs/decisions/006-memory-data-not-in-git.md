# Personal memory data never in git
Status: Accepted (Amit)

Context: Vercel has no permanent disk; personal data must not be pushed.

Decision: memory/ in git holds only KNOWLEDGE.md and manifest.json per category. Real data lives in Supabase; markdown export is built later (S09). .gitignore + check enforce this.

Consequences: Folders are the organisation view, the database is the store.
