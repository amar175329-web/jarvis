# scripts
STATUS: built
WHAT IT IS: LEAD-maintained repository tooling for unit registration, Folder-First checks and complete package test orchestration.
WHAT IT CAN DO:
- `register.ts` rebuilds the central registry from unit manifests.
- `check.ts` validates folder layout, KNOWLEDGE headings/status, manifest consistency, registry freshness and accidental secrets; `--base` also checks the code/docs/version change rule.
- `test-all.mjs` discovers package, worker and API units and runs each unit's test script; it prints each package test log in full and reports package and aggregate counts. App behavior tests run after the app is built.
WHAT IT CANNOT DO / LIMITS:
- The test runner does not install dependencies or build the app; CI performs those steps first.
- Local Node must meet root `engines` (22.18+). Node 22.16 requires the temporary `--experimental-strip-types` workaround for `.ts` scripts.
HOW IT WORKS: `scripts/lib.ts` loads manifests/layout, `register.ts` writes registry files, `check.ts` audits, and `test-all.mjs` uses npm child processes per unit.
INPUTS / OUTPUTS: Repo tree/manifests; outputs central registry and test result summary.
USES / USED BY: Used by LEAD and GitHub Actions CI.
POWER LEVEL & CONFIRMATION: L0. These scripts only validate and test; no production system is changed.
EXAMPLES: `npm run check`; `npm run test:all`; `node scripts/register.ts`.
KNOWN ISSUES: `npm run test:all` skips app behavior tests when `app/dist` is absent; CI builds app before running the suite.
CHANGE LOG:
- (append-only) folder-first: created as planned, version 0.0.1. Owner: LEAD / S00.
- 2026-11-07 - Test runner now discovers api/* units and includes API tests - root orchestration update.
