# LEAD REVIEW - S07 chat round 1 (GPT)
Verdict: ACCEPTED (core engine). Not final: streaming/providers/events/API contracts still open.
Verified by running: patch applies clean (git am) on S09-round2 base; scope clean (packages/chat + migration 0034 + registry); register 167 units; check 40 containers; chat 24/24 (incl. pglite A/B RLS, which GPT could not run); full suite 386 tests / 17 packages after LEAD fix.
LEAD fix: memory sql-static test hard-coded old migration list -> range 0030-0033 (so 0034 chat migration does not break S09 test).
Adversarial probe (free-only model config): salary, diabetes, weight, self-harm, typo'd password, spaced PAN, parent BP, phone number, workout, mother's medicine -> gateway NOT called (needs_model). Plain weather question -> called. Privacy routing holds.
Gaps for round 2:
1. Self-harm message with no private model slot returns the "private model configured nahi" question. Must instead give a fixed warm care reply (no model needed) per memory-behaviour.md.
2. No private paid model slot is configured, so every personal message is blocked until Amit/S13 sets one (Amit decision: which paid provider, price from official page).
3. Streaming is fake (chunks after gateway returns). Needs gateway stream seam (CR-1).
CONTRACT REQUEST decisions: CR-3 (executePower) RESOLVED: now on jarvis-v2 (fc74f99), wire PowerRunner to it. CR-1 gateway provider registration + stream seam: ACCEPT, owner S00/S13 round (GPT), small. CR-2 chat.* metadata-only events: ACCEPT. CR-4 chat API routes: ACCEPT, after CR-1/2.
