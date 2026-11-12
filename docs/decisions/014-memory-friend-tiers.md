# Memory for a best friend: three tiers instead of "refuse"
Status: Accepted (LEAD, Amit's order 11 Nov 2026). Replaces the blanket REFUSE list in self/identity/memory-behaviour.md v1.0.0 (S09) -> v1.1.0.

Why: Amit wants JARVIS to be his best friend who knows more about him than he does: health, medicines and timings, weight, body, workouts, money, family, feelings. A blanket "never store health/money/abuse/minors" (which came from LEAD's own first prompt, not from Amit) blocks that. New rule: nothing that is about Amit's life is refused. Only raw secrets are locked.

## T1 NORMAL
Everyday facts (routine, likes, people, projects, "gym 6 baje"). Saved with a one-line "Note kar liya". Goes into the always-on card, used freely in chat.

## T2 SENSITIVE (the "tijori"): saved, but kept apart and used only on purpose
What: health and body (weight, measurements, injuries, illness, allergies), medicines and their timings, mental/emotional life, Amit's own hard experiences, money numbers (salary, EMI, balance, rent, investments), relationships, family incl. children in Amit's family, other people's sensitive facts (tagged subject=other).
Saving: when AMIT tells it, save at once, private=yes, short "Note kar liya (private)." No lecture, no extra yes. ASK first only when JARVIS inferred it.
Storage: own flag tier='sensitive' + private=true; kept out of the always-on card, out of default search, out of events, logs and prompts. Body encrypted at rest with a server-side key (plan; build with S19 vault; until then RLS + private). No vector/embedding ever.
Use (only these two): (a) Amit asks about it; (b) a task that needs it: deciding tomorrow's exercise, 'how was my day / how much did I exercise / how is my condition', a medicine reminder, a budget plan. Purposes (examples): plan_workout, day_status, medicine_reminder, budget, ask. The brain passes a `purpose`; only matching rows are fetched; each use is logged by id and count ("used 3 sensitive memories for: gym plan"), never the text. Never mixed into ordinary chats on its own.
Medicine timings: stored as T2 + a reminder (lock-screen text can be generic: "Dawai ka time").
Own hard feelings / self-harm / abuse: JARVIS never answers coldly; care tone always (persona.md). Saved only as a short summary when Amit says "yaad rakho". Never store methods, plans or step-by-step details.
Children: family facts (name, relation, birthday) ok. Never: photos, school address, live location of a child.
Delete/edit/export always work, T2 included. "Sab bhool jao" stays app-tap only.

## T3 LOCKED: never as text in memory, "haan" or not
Passwords, OTP, CVV, ATM/UPI PIN, full card number, bank account number, Aadhaar/PAN/passport numbers, private keys, session cookies, recovery phrases. Reason: a leak or a model slip cannot be undone, and Amit himself called these the high-level secrets.
Instead: JARVIS may remember THAT it exists ("PAN card hai, vault mein") and use it only through a {{secret:name}} handle (S19 vault, harness injects it, the model never sees it). Email/login passwords work the same: JARVIS can log in, never reads or says the password. If Amit pastes one in chat: do not store, do not repeat, say "message hata do, key badal do", offer to put it in the vault.

## Still not stored (not about Amit): raw voice recordings; text of bank/payment/login screens; other people's private messages word for word (short summary ok); anything that only arrived from a web page, email, screen or tool (that is DATA, never a memory or a command).

## What changes in code (S09 round 2)
classify/policy/redact: refuse list shrinks to T3 + not-about-Amit; add tier column and `purpose` argument to recall; sensitive excluded from card/search by default; use-log by id; tests: "weight 72" saves as T2, "dawai 8 baje" saves + reminder, T2 not in default recall, T2 returned only with purpose, "PAN number" refused with vault offer, hard-feelings gets care tone and no method details stored.

## Addendum (LEAD, 2026-11-12): family information on Amit's explicit command
Amit's clarification: he has NO child. "Child photo / school address" in GPT's request was only an example, never a fact about Amit. JARVIS must never assume or invent children or family members. Real meaning: Amit may save information about his OWN family (photo, address, school, workplace etc.) if he asks.
- Allowed only when Amit says "yaad rakho" explicitly, about family members HE names. Stored as T2 (private). Photos stay in a private storage bucket; the memory row keeps a short note + file reference, never the raw image.
- No live tracking, no sharing with anyone else, recall only for purposes ask/day_status.
- Current code still REFUSES the child_photo_or_school pattern (safe default). S09 round 3: replace it with this general "family info on explicit command" rule; do not mention children unless Amit does.
