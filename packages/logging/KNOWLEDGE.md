# logging
STATUS: built
WHAT IT IS: एक जैसे structured logs (हर लाइन एक JSON), secrets का अपने-आप छिपना, request id, और health की रिपोर्ट।
WHAT IT CAN DO:
- `createLogger({service, level})` -> debug/info/warn/error और `child({request_id,...})`। हर field print होने से पहले `redact()` से गुज़रता है। (built)
- `redact`: नाम से छिपाता है (password, token, authorization, api_key, service_role, cookie, pepper, `*_key` ...) और रूप से भी (JWT, `sb_secret_`, `sk-`, `AIza`, `ghp_`, `Bearer ...`, database URL का password)। Error को सपाट करता है, गोलाकार संदर्भ काटता है, बड़ी चीज़ें छोटी करता है। (built)
- Sinks: `consoleSink` (warn/error stderr पर), `memorySink` (tests); `toActivityRow` warn/error को `activity_log` की पंक्ति में बदलता है। टूटा हुआ sink program नहीं तोड़ता। (built)
- `newRequestId()` -> `req_` + 16 hex। (built)
- Health: `runHealth(checks)` -> ok / degraded / down (critical check फेल = down, बाकी = degraded; हर check का समय-सीमा); `toHealthResponse` contracts के `system.health` के हिसाब से (ठीक = 200 {status, ts}, वरना 503 `unavailable`, कोई ब्योरा बाहर नहीं); `dbSizeCheck` (400 MB पर चेतावनी, decision 009)। (built)
WHAT IT CANNOT DO / LIMITS:
- Logs कहीं जमा नहीं करता (शुरू में सिर्फ़ stdout/stderr)। `activity_log` में असली लिखना जोड़ने वाले (api/worker) का काम है।
- Redaction पूरी गारंटी नहीं: नया तरह का secret जिसका नाम और रूप दोनों अलग हों बच सकता है। नया रूप दिखे तो `redact.ts` में जोड़िए और test भी।
- Log में prompts, जवाब, निजी संदेश मत डालिए; यह पैकेज उन्हें पहचान नहीं सकता।
- Health सिर्फ़ रिपोर्ट बनाता है; checks (जैसे database की असली query) बुलाने वाला देगा।
HOW IT WORKS: `src/redact.ts`, `src/logger.ts`, `src/health.ts`। Log की एक लाइन: `{ts, level, service, msg, request_id?, ...fields}`। समय `Clock` से (tests में पक्का)।
INPUTS / OUTPUTS: In: message और fields। Out: JSON लाइन; `HealthReport`; API का health जवाब। Test: `npm test` (12 tests)।
USES / USED BY: Uses: packages.shared, packages.contracts। Used by: worker.jobs, packages.model-gateway; आगे api/ और सारे squads।
POWER LEVEL & CONFIRMATION: L0।
EXAMPLES: `log.info('job done', {job:'x', service_role: key})` -> `service_role` की जगह `[REDACTED]`।
KNOWN ISSUES: `/api/system/health` का असली route अभी नहीं बना (api/ बाकी); `toHealthResponse` उसके लिए तैयार है।
CHANGE LOG:
- (append-only) folder-first: created as planned, version 0.0.1. Owner: S00.
- 2026-11-07 - logger, redaction, health, request id बने; 12 tests pass; planned -> built - 0.1.0
