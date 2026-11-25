# CR-S09-PRIVACY-HINGLISH — Memory classifier correction (P31)

**Owner:** LEAD / S09
**Raised by:** D1b after LEAD privacy regression report
**Scope:** Existing `packages/memory` classifier only; no memory schema, route, model or storage changes.

## Exact files

1. `packages/memory/src/classify.ts`
2. `packages/memory/tests/rules.test.ts`
3. `packages/memory/KNOWLEDGE.md`
4. `packages/memory/manifest.json` (version metadata only; no new unit id)

## Requested change

- Extend medicine/health phrase vocabulary with Roman Hinglish variants `dwai`, `dawa`, `daava`, `dava`, `davai`, `dawaai`, `goli`, `goliyan`, and `goliyaan`.
- Extend `SELF_HARM` with `khud ko hurt`, `khud ko harm`, `khud ko nuksan`, and `khud ko chot`; these must retain `care: 'self_harm'`.
- Extend `EMOTION` for `udaas/udas`, `bahut/bohot udaas`, `dukhi`, `bahut/bohot dukhi`, and related existing English phrases.
- Extend sensitive financial phrase detection for bank/account balance and `paisa/paise kitna/kitne` questions, without requiring a numeric amount.
- Remove broad `gym` from the `HEALTH` category so a neutral `gym jaana` note is not marked T2. Keep `gym` in the separate FITNESS intent/tag helper so exercise-purpose routing still works.

## Tests requested

Retain all pre-existing memory tests and add the same Hinglish private and benign-negative probes listed in `CR_S08_PRIVACY_HINGLISH_2026-11-23.md`. Assert `care === 'self_harm'` for the self-harm probe and assert the expected emotion/financial categories.

## Acceptance / notes

The P31 delta updates the real S09 classifier and its real rules test. S05's existing `privacy.ts` calls this classifier directly; an S05 integration test verifies that the shared projection now masks these cases. No copied regex classifier was introduced in S05 or S10.
