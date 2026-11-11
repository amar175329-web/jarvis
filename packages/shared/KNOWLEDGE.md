# shared
STATUS: built
WHAT IT IS: सबका साझा छोटा code, बिना किसी library के: नकली-हो-सकने वाली घड़ी, kill switch पढ़ने का fail-closed तरीका, retry की प्रतीक्षा का हिसाब।
WHAT IT CAN DO:
- `Clock`, `systemClock`, `fixedClock` (tests में समय पक्का करना), `sleep(ms, signal)` जो abort पर तुरंत जागे। (built)
- Kill switch: `KillSwitchReader`, `readKillFailClosed`, `assertNotKilled`, `KilledError`। पढ़ न सके या जवाब अजीब हो तो माना जाता है कि kill switch चालू है। (built)
- `NonRetryableError` (दोबारा कोशिश बेकार), `backoffMs` (आधा-पूरा jitter के साथ बढ़ती प्रतीक्षा, सीमा तक), `newId`। (built)
WHAT IT CANNOT DO / LIMITS:
- सिर्फ़ छोटे औज़ार हैं। बड़ा कोई काम यहाँ नहीं रखना; उसका अपना package बने।
- Kill switch को खुद database से नहीं पढ़ता; पढ़ने वाला (`KillSwitchReader`) बाहर से आता है।
HOW IT WORKS: `src/index.ts` में सब कुछ। Kill switch का नियम: पढ़ने में गलती, या `kill` boolean न हो, या `epoch` पूर्णांक न हो = चालू माना जाएगा (database के fail-closed नियम जैसा)।
INPUTS / OUTPUTS: छोटे functions और types। Test: `npm test` (6 tests)।
USES / USED BY: Uses: कुछ नहीं। Used by: packages.logging, packages.model-gateway, worker.jobs।
POWER LEVEL & CONFIRMATION: L0।
EXAMPLES: `await assertNotKilled(reader)` हर काम से पहले; kill चालू हो तो `KilledError` आता है।
KNOWN ISSUES: Kotlin में यही नियम android/ में अलग लिखना होगा (S16A)।
CHANGE LOG:
- (append-only) folder-first: created as planned, version 0.0.1. Owner: S00.
- 2026-11-07 - Clock, kill-switch reader (fail-closed), backoff, errors बने; 6 tests pass; planned -> built - 0.1.0
