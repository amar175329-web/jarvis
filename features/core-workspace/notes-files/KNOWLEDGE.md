# notes-files
STATUS: broken
WHAT IT IS: S09 notes and files workspace draft for owner-only Markdown notes, tags, project links and quarantined file metadata.
WHAT IT CAN DO:
- Create, list, update and delete notes through the owner-scoped handler; classify content before persistence.
- Treat files as private by default, create metadata-only quarantine records and avoid preview or text extraction before S19 scanning exists.
- Keep private note/file records out of normal lists and expose only a generic `Private item` with a `private` badge.
WHAT IT CANNOT DO / LIMITS:
- This is not a built or production-ready feature. LEAD shared-function mounting, S22 power acceptance, the database migration and the owner-JWT Storage adapter remain pending.
- No file preview, download, OCR, extraction, embedding or model call is available for private/quarantined content.
- Decision 014 and Decision 015 are policy references, and the Supabase private Storage bucket is a resource name; neither is a registry unit ID.
HOW IT WORKS:
- `src/handler.mjs` checks note/file content through the memory workspace privacy adapter, which reuses S08 `classifySensitivity()` and the real `packages/memory` classifier/secret detector injected by the host.
- Notes use the proposed `notes` table. Files use the private Supabase Storage bucket and the `files` metadata table; the named bucket is infrastructure, not a manifest link.
- LEAD mounts plain handlers in the existing shared API function with owner bearer/RLS context; no new file is added under `api/`.
INPUTS / OUTPUTS: Input: owner-scoped note fields, tags, project references and file metadata. Output: normal note records or generic private placeholders and quarantined file metadata.
USES / USED BY: Uses registry units `packages.memory` and `features.core-workspace.memory`; `memory.graph` provides the knowledge-link concept. Used by Projects and the owner UI after acceptance.
POWER LEVEL & CONFIRMATION: L0 owner screen; each action requires its registered S22 power, fail-closed kill switch and metadata-only audit reason.
EXAMPLES: A family-related note is classified private and hidden from the normal notes list; an uploaded file stays quarantined until S19 scanning exists.
KNOWN ISSUES: No accepted Storage adapter or S19 scanner. The private bucket name and the source path `features/core-workspace/memory/src/privacy.mjs` are plain descriptive references, not registry IDs.
CHANGE LOG:
- 2026-11-22: Initial S09 bundle draft added; notes/file privacy and quarantine boundaries recorded.
- 2026-11-23: P29 delta: remove non-unit manifest links and record policy/resource/source references as plain text.
