# jobs
STATUS: built
WHAT IT IS: Worker का "लंबे काम" वाला हिस्सा: जो काम पीछे से, धीरे या समय पर चलने हैं उन्हें एक कतार (`jobs` table) से उठाकर सुरक्षित तरीक़े से चलाता है। एक सादा Node program है जो सिर्फ़ Supabase से बात करता है, इसलिए laptop पर भी चलेगा और बाद में AWS या Docker में भी (decision 012)।
WHAT IT CAN DO:
- कतार: migration 0004 (`jobs` table और functions `claim_job`, `heartbeat_job`, `finish_job`, `purge_old_jobs`; सिर्फ़ service_role चला सकता है, app नहीं)। (built, local Postgres पर tested; असली Supabase पर चली नहीं)
- `Worker`: एक बार में एक job; हर बार लेने से पहले kill switch (fail-closed); job के दौरान भी हर `killPollMs` पर देखता है और चालू होते ही job रोकता है (job कतार में लौटता है); lease और heartbeat (worker मर जाए तो job दोबारा उठता है); timeout; असफल होने पर बढ़ती प्रतीक्षा के साथ दोबारा, `max_attempts` के बाद failed; `NonRetryableError` पर तुरंत failed; अनजान kind पर तुरंत failed; `stop()` चल रहे काम को ख़त्म होने देता है। (built)
- Built-in jobs: `system.keepalive` (असली database query, free Supabase को सोने से बचाने के लिए) और `system.purge` (30 दिन से पुराने पूरे हुए jobs हटाना)। अपने आप हर 12 और 24 घंटे में लगते हैं (idempotency key से, दोबारा चलाने या दो worker होने पर भी एक ही बार)। (built)
- `SupabaseStore` (service_role, REST) और `discoverOwner`; `npm start` से चलता है (`src/main.ts`, SIGINT/SIGTERM पर शालीनता से रुकता है)। (built)
WHAT IT CANNOT DO / LIMITS:
- `npm start` असली Supabase पर अभी चलाया नहीं गया; migration 0004 भी वहाँ नहीं चली। Amit/LEAD की हाँ के बाद ही।
- सिर्फ़ 2 built-in jobs हैं। दूसरे squads अपने handlers (kind, dot.case) जोड़ेंगे।
- एक worker, एक job एक बार में। कई worker एक साथ चल सकते हैं (SKIP LOCKED) पर वह परखा नहीं गया।
- Laptop बंद/sleep हो तो worker रुकता है; lease ख़त्म होने के बाद जो job अधूरा था वह दोबारा चलेगा (इसलिए handlers को दोबारा चलने पर सुरक्षित होना चाहिए)।
- "ठीक 5:10 बजे" वाले reminders यहाँ नहीं; वे फ़ोन के alarm और scheduler (S12) के हैं (decision 007/012)।
HOW IT WORKS:
1. `src/worker.ts`: `tick()` = kill देखो -> recurring लगाओ -> `claim` -> handler चलाओ -> `finish`। `run()` इसे दोहराता है।
2. `src/supabase-store.ts`: REST calls; गलती में सिर्फ़ status और path, कभी key नहीं। `src/handlers.ts`: built-ins। `src/main.ts`: env से जोड़ना।
3. Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server-only, चैट में कभी नहीं), वैकल्पिक `WORKER_ID`, `LOG_LEVEL`।
4. Tests असली SQL (pglite + migrations 0001/0003/0004) के साथ चलते हैं: `npm install` फिर `npm test` (23 tests)।
INPUTS / OUTPUTS: In: `jobs` table की पंक्तियाँ। Out: job का `result` या `error`, logs। Events: अभी कोई नहीं छोड़ता।
USES / USED BY: Uses: packages.shared, packages.logging, packages.db। Used by: scheduler (S12), bots, और जो भी काम कतार में रखे।
POWER LEVEL & CONFIRMATION: L1 (handler जो करे वह उसकी अपनी सीमा; kill switch सब पर लागू)।
EXAMPLES: कतार में `{kind:'system.keepalive'}` -> worker उठाता है, database से असली query करता है, `done` लिखता है।
KNOWN ISSUES:
- `claim_job` सभी owners के jobs देखता है; अभी एक ही owner है (single-user)। कई users आने पर worker को owner के हिसाब से बाँटना होगा।
- Heartbeat/kill की जाँच असफल हो तो चुपचाप अगली बार कोशिश होती है; kill जाँच लगातार असफल रहे तो भी fail-closed होकर job रुकेगा।
CHANGE LOG:
- (append-only) folder-first: created as planned, version 0.0.1. Owner: S00.
- 2026-11-07 - migration 0004, Worker, SupabaseStore, built-in jobs, main बने; 23 tests pass (असली SQL के साथ); planned -> built - 0.1.0
