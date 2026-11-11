# English rules, Hindi explanations; scripts in TypeScript with zero dependencies
Status: Accepted (S00)

Context: Agents follow English rules more reliably. A bootstrap needs to run before any install.

Decision: Rules/KNOWLEDGE headings in English; Hindi/Hinglish allowed in explanations. scripts/*.ts run directly with Node >= 22.18 (type stripping), no npm install.

Consequences: If CI uses an older Node, bump it first. Later code can use a normal TypeScript toolchain.
