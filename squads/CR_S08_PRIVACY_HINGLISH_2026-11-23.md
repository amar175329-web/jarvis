# CR-S08-PRIVACY-HINGLISH — Shared classifier correction (P31)

**Owner:** LEAD / S08
**Raised by:** D1b after LEAD privacy regression report
**Scope:** One existing shared file plus its tests and knowledge note. No API, database or UI changes.

## Why

LEAD's 25 Hinglish probes found false negatives for medicine misspellings and wellbeing/self-harm phrases. A broad generic `report` term also classified ordinary `report bhejni hai` as health-sensitive.

## Exact files

1. `features/core-workspace/task-manager/src/sensitivity.mjs`
2. `features/core-workspace/task-manager/tests/sensitivity.test.mjs`
3. `features/core-workspace/task-manager/KNOWLEDGE.md`
4. `features/core-workspace/task-manager/manifest.json` (version metadata only; no new unit id)

## Requested change

- Add deterministic Roman Hinglish patterns for self-harm phrasing (`khud ko hurt`, `khud ko harm`, `khud ko nuksan`, `hurt myself`, `self-harm`) and short emotional-distress phrases (`udaas/udas`, `dukhi`, `bahut/bohot udaas`, `sad hoon`, `upset hoon`). Mark them private before any normal task/log projection.
- Add bank/account balance questions (`bank balance`, `account balance`, `balance kitna/kitne/kitni`, `paisa kitna`, `paise kitne`, and equivalent bank/account phrasing) as private.
- Expand medicine spellings to include `dwai`, `dawai`, `dawaai`, `davai`, `dava`, `daava`, `dawa`, `goli`, `goliyan`, and common forms already covered.
- Replace generic `report` matching with specific `medical report`, `lab report`, `test report` and Devanagari equivalents. Ordinary `report bhejni hai` must remain non-private.
- Keep unknown/non-text values fail-closed.

## Tests requested

Retain all existing S08 sensitivity tests and add these exact probes:
- Private: `khud ko hurt karna hai`, `main bahut udaas hoon`, `bank balance kitna hai`, `dwai leni hai`, `daava lena hai`, `davai leni hai`, `dava lena hai`, `goli leni hai`, `dawai leni hai`.
- Non-private: `report bhejni hai`, `gym jaana`.

## Acceptance / notes

The P31 delta adds the patterns and tests and records this change in the S08 KNOWLEDGE file. The combined S08/S09/S05/S10 Node test command is recorded in the Bundle 3 report. Live API or database effects are not part of this CR.
