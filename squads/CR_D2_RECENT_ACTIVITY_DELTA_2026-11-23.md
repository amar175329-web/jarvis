# CR-D2-RA-01 — Recent Activity opaque-target classifier input correction

Owner: D2 / S05 Recent Activity
Status: proposed delta; no shared route, contract, API or database files edited.

## Exact change

In `features/home/recent-activity/src/handler.mjs`, retain the existing `OPAQUE_TARGET` pattern and `targetPrivate` decision. While preparing the string passed to the shared `classifySensitivity()` function, omit `row.target` whenever its trimmed value matches `OPAQUE_TARGET` (UUID, 1–20 digit opaque key, or `req_<hex>`). Keep non-opaque target text in the classifier input. Actor, action and serialized detail remain classifier inputs.

```js
const target = typeof row.target === 'string' ? row.target.trim() : '';
const classifierTarget = target && !OPAQUE_TARGET.test(target) ? target : '';
return [row.actor, row.action, classifierTarget, detail]
  .filter((part) => part !== null && part !== undefined)
  .join(' ');
```

Do not remove the separate `targetPrivate = Boolean(target && !OPAQUE_TARGET.test(target))` guard. It continues to hide non-opaque targets independently of the classifier.

## Regression tests

1. Safe case: allowlisted `actor='api'`, `action='tasks.complete'`, `target='12345678-1234-1234-1234-123456789012'`, `detail={}` returns `Task completed`, `private=false`, with no raw target returned.
2. Private case: same allowlisted actor/action with `target='metformin lena'`, `detail={}` returns `Private activity`, `private=true`, and no raw target returned.

Run:

```bash
node --test features/home/recent-activity/tests/*.test.mjs
```

Observed on the accepted Bundle 1 source tree: 10/10 tests passed.

## Apply prerequisite / baseline note

The uploaded `jarvis-repo-P29.zip` snapshot contains only `features/home/recent-activity/KNOWLEDGE.md` and `manifest.json`; it does not contain the accepted Bundle 1 `src/handler.mjs` or `tests/handler.test.mjs`. Therefore the separate small delta patch is based on the accepted Bundle 1 source tree and applies after that accepted feature source is present in the P29 working branch. It is intentionally not expanded into a replacement Recent Activity implementation, to avoid overwriting P29 or re-sending Bundle 1.
