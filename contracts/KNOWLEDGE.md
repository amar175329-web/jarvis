# contracts
STATUS: planned
WHAT IT IS: API, events, schemas, handoff
WHAT IT CAN DO:
- (planned) Hold: generated, manifest-schema
WHAT IT CANNOT DO / LIMITS:
- Nothing is built yet. Everything above is planned.
HOW IT WORKS: Container folder (an area, not a single thing). Rule: put logic only in its ONE home; never duplicate it here. generated/ now holds the OUTPUT of packages/contracts (routes.json, kotlin/JarvisContracts.kt); never edit it by hand, run `npm run generate` in packages/contracts. manifest-schema/ already exists.
INPUTS / OUTPUTS: Not written yet.
USES / USED BY: Not applicable.
POWER LEVEL & CONFIRMATION: Not applicable (container).
EXAMPLES: Not written yet.
KNOWN ISSUES: None known (nothing built).
CHANGE LOG:
- (append-only) folder-first: created as planned, version 0.0.1. Owner: LEAD / S00.
- 2026-11-07 - generated/ added (output of packages/contracts).
