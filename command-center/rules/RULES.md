# Rules for every agent (Antigravity, Claude Code, Codex, Hermes, OpenCode, squads, LEAD)
These rules are written in English because agents follow English rules more reliably. Hindi/Hinglish is fine in explanations to Amit.

1. FOLDER-FIRST (mandatory): folder -> KNOWLEDGE.md -> manifest.json (planned) -> `npm run register` -> only then code. See FOLDER_FIRST_RULE.md. Use `npm run new-feature`.
2. ONE HOME per thing: UI only in features/, a plugged-in thing only in library/<kind>/, engine code only in packages/, personal memory structure in memory/, JARVIS's self-knowledge in self/, agent/terminal work in command-center/. Check it does not exist elsewhere before creating it.
3. AUTONOMY is L0-L4 ONLY (L0 observe, L1 suggest, L2 act after Amit confirms, L3 act then tell, L4 act silently for safe+reversible only). There is no risk field. Payments, sending messages/calls, deleting, installing and sharing personal data never go above L2. S22 owns the policy.
4. KILL SWITCH always works. Every action is logged with a one-line "why".
5. SECRETS and PERSONAL DATA never go into git or chats. Only .env.example (names only). memory/ in git holds only KNOWLEDGE.md and manifest.json.
6. TRUTH: only things with status "live" may be claimed as abilities. status changes only from test evidence. JARVIS may only PROPOSE edits to KNOWLEDGE.md/manifests (self/proposals/); agents and Amit apply them.
7. CONTRACTS (API routes /api/<group>/<action>, event names dot.case, schemas) are owned by LEAD/S00. Propose changes; never silently change.
8. Never redesign the approved UI.
9. Before every merge run `npm run register` then `npm run check`. Both must pass.
