# CR-S09-CURSOR-PAGINATION — Replace 200-row list cap with cursor/keyset pagination

**Raised by:** Antigravity (P34c, proposal only — no handler code changed)  
**Target Squad:** S09 (`notes-files`, `projects`) + LEAD (`packages/contracts`)  
**Status:** PROPOSED

## Problem
Currently `features/core-workspace/notes-files/src/handler.mjs` (`listNotes`, `listFiles`) and `features/core-workspace/projects/src/handler.mjs` (`list`) hardcode `limit: '200'` without pagination cursors. Once Amit has more than 200 notes, files, or projects, older rows become unreachable from the list views.

## Proposal (Keyset / Cursor Pagination)
1. Accept optional query/body parameters on `workspace.notes.list`, `workspace.files.list`, and `workspace.projects.list`:
   - `limit`: integer `1..100` (default `50`)
   - `cursor`: opaque base64url keyset tuple `(updated_at|created_at, id)` matching the existing `ORDER BY (updated_at DESC, id DESC)` or `(created_at DESC, id DESC)`
2. Fetch `limit + 1` rows with PostgREST keyset filter (`or=(updated_at.lt.<ts>,and(updated_at.eq.<ts>,id.lt.<id>))`) and always keep `owner_id=eq.<ownerId>` forced.
3. Return `next_cursor: string | null` alongside `{ normal, private, counts }`.
4. Never leak private titles/filenames inside `next_cursor` (timestamps + UUID only).
5. Add composite indexes `(owner_id, updated_at DESC, id DESC)` / `(owner_id, created_at DESC, id DESC)` in a future additive migration if needed.
6. Update `packages/contracts/src/routes.ts` inputs/outputs for the 3 list routes and add pagination tests (page 1 → page 2, no duplicates, no skipped rows, Owner A vs B isolation).
