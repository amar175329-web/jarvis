# Folder-First rule; KNOWLEDGE.md replaces README.md
Status: Accepted (Amit)

Context: Things were being built "without thinking" and JARVIS could not know itself.

Decision: Order: folder -> KNOWLEDGE.md -> manifest (planned) -> register -> code. KNOWLEDGE.md is updated in the same change as code.

Consequences: scripts/check enforces it. No empty scaffolding: subfolders appear only with real code.
