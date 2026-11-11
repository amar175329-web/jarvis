# LEAD review: S22 BRAIN (2026-11-10) - ACCEPTED with LEAD fixes

## Verified by running (not trusting the report)
- brain tests: 65/65 pass. Full test:all: 13 of 14 packages pass (258 tests). Only packages/db fails (see Open 1).
- Powers seed: 77 powers, no duplicate ids, none with default/current > max_level, no non-reversible or pay/send/delete/install/share power above L2.
- Migration 0020 applied on local Postgres (pglite): 77 rows, cap constraint rejects current > max_level, re-run is safe (no duplicates). NOT run on real Supabase.
- Gate: kill ON or unreadable = deny; unknown power = deny. Voice yes-words exact match only; silence = no_answer.

## LEAD fixes (S22's zip failed `npm run check`)
1. 4 manifests used kind "folder" (not allowed) and missed fields: fixed.
2. 4 stub KNOWLEDGE.md files missed the required headings: rewritten (all headings present).
3. brain manifest status "partial" and bad "uses" links: now status built, uses packages.safety + packages.db.
4. contracts-proposal/ top-level folder was an orphan: moved to packages/brain/proposals/.
5. packages/brain had no package.json so test:all skipped it: added; test:all now runs 65 brain tests.
6. CONTRACT REQUEST accepted: packages/contracts/src/brain.ts (Power, GateRequest/Result, ConfirmNeeded/Answered, SecretHandle) and 5 brain.* events in packages/events registry (metadata only). `terminal-strip.update` NOT added (not a brain event; S06/S03 proposes it). contracts regenerated.

## Open
1. packages/db db.test.mjs: 65 PASS, then "permission denied for table system_state" at the end on my pglite 0.2.17. Same failure before S22 was added, so not S22's. Antigravity must run it on their setup and fix or confirm.
2. `tags` (money/secret/health) exist only in powers.seed.json, NOT in the powers table or 0020. If the brain loads powers from the DB, tags are lost, so "voice then fingerprint" and the L2 clamp for risky powers would not apply. CONTRACT REQUEST for S22: migration 0021 adds `tags text[]`, or the brain loads tags from the seed file. Max_level caps still hold either way (checkout 0, vault.reveal 0, vault.use-secret 2).
3. No power has a health tag yet (Amit's question).
4. Not wired: harness/permissions calling gate(), safety kill state into gate(), real model, real phone.
5. S22 did not read Antigravity's 73 research files line by line.
6. handoff/REPORT.md and README_FOR_LEAD.md in the S22 zip are old (say nothing built, 19 powers). Use REPORT_FINAL.md only.

## Routing (not refused, to the squads)
S15 browser-use, Boards own browser, reverse-api | S16A ARTEMIS phone pilot, fingerprint signal | S17 all-device connect | S18 Orca, Codebase Memory, Graphify, 21st MCP, Teardown, Anatomy, Agent Skills | S12 Activepieces + "har baar" rule | S21 hey-jev tags, Humanizer, wording + confirm flow check | S19 Strix (local only), Vaultwarden, owner credential storage | S06/S03 terminal strip UI | S10 Boards | S07 docs/S07_SYSTEM_PROMPT_BLOCKS.md | harness/permissions: call gate() before every power.
LICENCE: Strix, Immich, Dub, Documenso, Vaultwarden are AGPL-3.0. Do not copy their code into JARVIS.
