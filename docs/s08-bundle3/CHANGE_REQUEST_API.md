# CR-S08-B3-API — Tasks/Reminders mutation + clash contracts

**Owner:** LEAD / S00 for API contract; Antigravity mounts implementation after acceptance.
**Base:** P31.
**Scope:** extend only the existing `api/tasks/index.ts` function. Do not add an `api/` file, edit `vercel.json`, or modify `packages/contracts/` in this squad patch.

## 1. Existing route/function constraint

P31 `vercel.json` already rewrites both `/api/tasks/:action` and `/api/reminders/:action` to the same `/api/tasks` function. The current dispatcher selects the action from the rewritten `action` query parameter or matched path. Keep those rewrites unchanged and mount every action below into the one existing `api/tasks/index.ts` function. No new serverless function file is permitted.

Client paths authored in this bundle:

- `POST /api/tasks/tasks.delete`
- `POST /api/reminders/reminders.update`
- `POST /api/reminders/reminders.complete`
- `POST /api/reminders/reminders.delete`

Existing endpoints whose payload/behavior must be extended:

- `POST /api/tasks/tasks.create` — accept nullable `ends_at`, `allow_clash`.
- `POST /api/tasks/tasks.natural-add` — parser returns `ends_at`; accept `allow_clash` and `allow_duplicate`.
- `POST /api/tasks/tasks.update` — accept nullable `ends_at` and `allow_clash`.
- `POST /api/reminders/reminders.create` — accept `allow_duplicate`.
- `POST /api/reminders/reminders.cancel` — replace swallowed job-cancel failure with the transactional state/job function below.

## 2. Exact JSON schemas

All fields are JSON request bodies. `confirmed` is always required for mutation actions and must be `true` after the user has explicitly acted. UUID fields are owner-scoped by the bearer JWT + RLS, not by a client-supplied owner ID.

### `tasks.create`

```json
{
  "title": "meeting",
  "due_at": "2026-11-24T09:30:00.000Z",
  "ends_at": "2026-11-24T10:30:00.000Z",
  "priority": 2,
  "repeat_rule": null,
  "time_zone": "Asia/Kolkata",
  "confirmed": true,
  "allow_clash": false
}
```

`ends_at` is nullable/optional; if present it must be ISO-8601 and strictly after `due_at`. `allow_clash` defaults false.

### `tasks.natural-add`

```json
{
  "text": "kal shaam 3 se 4 baje meeting",
  "confirmed": true,
  "allow_clash": false,
  "allow_duplicate": false
}
```

Parser output `kind=task` carries `due_at`, nullable `ends_at`, priority, repeat and zone. Reminder-intent phrases route to `reminders.create`, not a task. Sensitive input stays a 409 privacy response.

### `tasks.update`

```json
{
  "id": "00000000-0000-4000-8000-000000000001",
  "title": "meeting",
  "due_at": "2026-11-24T09:30:00.000Z",
  "ends_at": "2026-11-24T10:30:00.000Z",
  "priority": 2,
  "repeat_rule": null,
  "time_zone": "Asia/Kolkata",
  "confirmed": true,
  "allow_clash": false
}
```

### `tasks.delete`

```json
{
  "id": "00000000-0000-4000-8000-000000000001",
  "confirmed": true
}
```

Success: HTTP 200 `{ "ok": true, "data": { "deleted": true, "id": "..." } }`. It is a hard delete, not a status change. Return 404 for no owner-visible row.

### `reminders.create`

```json
{
  "text": "Call Sam",
  "remind_at": "2026-11-24T09:30:00.000Z",
  "repeat_rule": null,
  "time_zone": "Asia/Kolkata",
  "confirmed": true,
  "allow_duplicate": false
}
```

### `reminders.update`

```json
{
  "id": "00000000-0000-4000-8000-000000000002",
  "text": "Call Sam",
  "remind_at": "2026-11-24T10:00:00.000Z",
  "repeat_rule": "FREQ=WEEKLY",
  "time_zone": "Asia/Kolkata",
  "confirmed": true,
  "allow_duplicate": false
}
```

The new `text` must pass the *same shared sensitivity classifier* used by parser/create. Health, medicine, financial, credential, private family and uncertain private text returns HTTP 409 `privacy_confirmation`; no reminder/job write occurs.

### `reminders.complete`

```json
{ "id": "00000000-0000-4000-8000-000000000002", "confirmed": true }
```

Success returns the updated reminder with `state: "done"`.

### `reminders.delete`

```json
{ "id": "00000000-0000-4000-8000-000000000002", "confirmed": true }
```

Success: `{ "deleted": true, "id": "..." }`. It must cancel any queued `reminders.fire` job and hard-delete the reminder in one DB transaction. If job cancellation fails, transaction fails and API returns an error; never swallow this error.

### `reminders.cancel` (existing route)

```json
{ "id": "00000000-0000-4000-8000-000000000002", "confirmed": true }
```

Return the updated reminder. Use the same transactional `s08_set_reminder_state(..., 'cancelled')` DB function; remove `.catch(() => undefined)` from current job cancellation path.

## 3. Time-clash response semantics

### Tasks

Check on server for `tasks.create`, `tasks.natural-add` when kind is task, and `tasks.update`, after power+kill gate authorizes the mutation and immediately before DB write. Candidate rows must be owned by the session owner and have `status IN ('todo','doing')` and non-null `due_at`. Exclude the task being updated.

Interpret intervals as half-open `[due_at, ends_at)`. If **both** candidate and existing task have `ends_at`, clash iff `candidate.start < existing.end && existing.start < candidate.end`. If **either** has no end, treat that entry as a point and flag only when both `due_at` timestamps fall in the exact same minute (floor to minute). Do not clash against `done`, `cancelled`, or deleted rows. Enforce `ends_at > due_at` server-side regardless of client validation.

Do not silently skip clash checks. Skip only when both `allow_clash === true` and the same request has `confirmed === true`; this is the owner’s explicit “Phir bhi banao” response after a clash warning. A forged `allow_clash` without confirmation has no effect.

On conflict return HTTP 409:

```json
{
  "ok": false,
  "error": {
    "code": "time_clash",
    "message": "Is samay par doosra task scheduled hai.",
    "details": {
      "clashes": [
        {
          "id": "00000000-0000-4000-8000-000000000099",
          "title": "meeting",
          "due_at": "2026-11-24T09:30:00.000Z",
          "ends_at": "2026-11-24T10:30:00.000Z"
        }
      ]
    }
  }
}
```

This details array is owner-only response data. Never copy titles, times or task/reminder text into `decisions`, logs, telemetry, thrown audit messages or `why` fields. Use generic metadata-only audit reasons.

### Reminders

Only warn when a pending reminder has the same normalized exact text and the same minute as the new reminder. Case-fold and trim only; do not use fuzzy/semantic similarity. Different reminder text at the same minute is allowed. Skip only when `allow_duplicate === true && confirmed === true`. Return HTTP 409 code `duplicate_reminder` with minimal duplicate metadata; do not log text.

## 4. Exact insertion/update locations inside current `api/tasks/index.ts`

1. Near the existing top-level constants, add `ends_at` to `TASK_SELECT`; add `ends_at` to `safeTask(row)`.
2. Extend `validateTaskInput(body)` to validate `ends_at` and return `ends_at: body.ends_at ?? null`; reject if end is present without due time or `ends_at <= due_at`.
3. Add server-only helpers immediately after `validateTaskInput`:
   - `minuteKey(iso)`
   - `findOpenTaskClashes(c, owner, candidate, excludeId?)`
   - `assertTaskClashAllowed(...)` that returns the HTTP 409 clash response unless both `allow_clash` and `confirmed` are true.
   - `findReminderDuplicate(c, owner, text, remindAt, excludeId?)` and `assertReminderDuplicateAllowed(...)`.
   - Page through all owner-visible open task rows using PostgREST `Range` headers (do not silently cap clash detection at the UI’s 200-row list limit). Query only `id,title,due_at,ends_at,status`, and only return clash titles/times in the 409 response.
4. In `tasks.create`, run `validateTaskInput`; inside `runMutation(...run)` invoke `assertTaskClashAllowed` directly before INSERT, then store `ends_at`.
5. In `tasks.natural-add`, pass parser `ends_at` through into task INSERT; for reminder kind call `assertReminderDuplicateAllowed` before `createReminder`. Forward request `allow_clash` / `allow_duplicate`. Do not write any parsed title to the decisions row.
6. In `tasks.update`, include `ends_at` in validation/patch; inside `runMutation(...run)` read the owner-visible current task, evaluate candidate clash with `excludeId=body.id`, then PATCH and return `safeTask`.
7. Insert four switch cases immediately after `tasks.cancel` and immediately before `reminders.list`/create as appropriate: `tasks.delete`, `reminders.update`, `reminders.complete`, `reminders.delete`. Each calls existing `runMutation`; do not inline a different auth or kill-switch path.
8. Replace the body of existing `reminders.cancel` run callback with the transactional `s08_set_reminder_state` RPC; return the updated row. Remove the current `.catch(() => undefined)` on `jobs` cancellation.
9. Extend `createReminder`/`reminders.create` with duplicate check before insertion. Existing initial create already creates a `reminders.fire` job; do not implement worker firing or Android notifications in this CR.
10. Map expected conflict exceptions/responses to HTTP 409 (`time_clash`, `duplicate_reminder`, `privacy_confirmation`) rather than the current generic 503 outer catch. Do not include request text in error output.

## 5. Mutation safety requirements (all new and existing mutations)

- `readOwnerSession` remains the first identity check. All DB traffic continues through `db(c, owner, ...)` using `SUPABASE_ANON_KEY` and the owner’s bearer JWT; RLS owns row filtering. No service-role key in app/API.
- Keep every mutation behind existing `runMutation()` -> `loadPowers()` -> metadata-only `decisions` intent write -> `executePower()` -> live kill-switch read -> gate -> mutation. The executor’s kill read is deliberately **after** powers/audit and immediately before `run()`. Do not add kill reads to `loadPowers`, do not cache the kill state, and unreadable/ON must deny.
- L2 confirmation: every mutation requires `confirmed === true`, supplied only after the user’s explicit action. No automatic retry with confirmation. `allow_clash`/`allow_duplicate` are only honored together with `confirmed === true`.
- Audit/decision `request` and `why` contain only action ID and generic metadata. Never put title, reminder text, medicine labels, family/health/financial data, or clash details in audit/logging.
- Reminder update sensitivity check runs before DB/RPC writes and returns 409 without modifying either reminder or queued job.
- All changes to reminder row and queued `reminders.fire` rows are one transaction (migration RPCs). Never silently swallow job cancellation or enqueue errors.

## 6. Existing code sequence (pseudocode required by LEAD to mount)

```ts
// Inside each `runMutation({ ... run: async () => { ... } })` callback:
await assertTaskClashAllowed(c, owner, candidate, body.allow_clash === true, body.confirmed === true, excludeId);
const rows = await db(c, owner, 'tasks', ...);
return safeTask(rows[0]);

// reminders.update, after shared sensitivity classifier and schema validation:
const rows = await db(c, owner, 'rpc/s08_replace_reminder', {}, {
  method: 'POST',
  body: {
    p_reminder_id: body.id, p_text: normalizedText, p_remind_at: body.remind_at,
    p_repeat_rule: body.repeat_rule ?? null, p_time_zone: body.time_zone ?? TIME_ZONE,
    p_allow_duplicate: body.allow_duplicate === true && body.confirmed === true
  }
});
if (!rows[0]) throw new Error('reminder update transaction failed');
return safeReminder(rows[0]);

// reminders.complete/cancel:
// POST rpc/s08_set_reminder_state with p_reminder_id and p_state='done'|'cancelled'.
// reminders.delete:
// POST rpc/s08_delete_reminder; an RPC error aborts the transaction and is shown to owner.
```

The current `db()` helper only parses array responses. Keep each proposed SQL RPC `RETURNS SETOF` / `RETURNS TABLE` so PostgREST response is an array; do not relax RLS or introduce service-role access.

## 7. Required acceptance tests (NOT RUN by this UI/parser patch)

- `tasks.create`, `tasks.natural-add`, `tasks.update`: partial/overlapping range clash; half-open adjacent times do not clash; point collision in same minute; point vs range only same minute per rule; cancelled/done excluded; update excludes self; `allow_clash` only with `confirmed`.
- `reminders.create` and update: same text + same minute => 409; same text different minute => allowed; different text same minute => allowed; allow duplicate only confirmed.
- New actions: owner A cannot mutate owner B; all four new powers at L2/max 2; no `confirmed` => blocked; kill ON/unreadable => blocked; audit intent failure => blocked; kill state read occurs after the intent row and before mutation.
- `tasks.delete`: hard delete works for active/done/cancelled.
- `reminders.delete`: hard delete and queued job cancellation commit atomically; injected DB/job error leaves reminder and job unchanged and returns error.
- `reminders.update`: original queued job cancelled and exactly one new job enqueued; idempotency key includes reminder ID + new UTC time; repeated same edit is idempotent; injected insert failure rolls entire update back.
- reminder edit private text (health/medicine/financial/family/credentials/uncertain) => 409 and no row/job change.
