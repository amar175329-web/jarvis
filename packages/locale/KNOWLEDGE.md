# locale
STATUS: built
WHAT IT IS: समय और भाषा के नियम। database में हमेशा UTC; दिखाते समय भारत का समय (Asia/Kolkata, UTC+5:30, कोई daylight saving नहीं); हिंदी, Hinglish और English में तारीख़, समय और अभिवादन।
WHAT IT CAN DO:
- UTC <-> भारत का समय: `toISTParts`, `istToUtc` (31 फ़रवरी जैसी नकली तारीख़ पर गलती), `startOfDayIST`, `startOfMonthIST`, `addDaysIST`, `parseISTDateTime("2026-11-07 17:10")` (हिंदी अंक भी चलते हैं)। (built)
- `formatDate` (short/long/full), `formatTime`, `formatDateTime`: en "5:10 PM", hi "शाम 5:10 बजे", hinglish "shaam 5:10 baje"। (built)
- `greeting` (सुबह 4-12, दोपहर 12-16, शाम 16-20, रात 20-4), `relativeDay` (आज/कल/बीता कल)। (built)
- `toDevanagariDigits`, `toAsciiDigits`, `formatINR` (₹12,34,567.50 वाली भारतीय grouping)। (built)
- `detectLanguage(text)` -> `hi` / `hinglish` / `en` (देवनागरी का अनुपात और आम Hinglish शब्दों से)। (built)
WHAT IT CANNOT DO / LIMITS:
- "कल शाम 5 बजे" जैसे वाक्य से समय निकालना (parsing) यहाँ नहीं; वह S12 scheduler का काम है। यहाँ सिर्फ़ सख़्त "YYYY-MM-DD HH:MM" है।
- Hinglish की तारीख़ में महीने और वार अंग्रेज़ी में हैं (लोग ऐसा ही लिखते हैं)। Roman Hindi में महीने/वार के नाम नहीं हैं।
- `detectLanguage` अंदाज़ा है, गारंटी नहीं: बहुत छोटे वाक्य ("ok", "theek hai") में गलत हो सकता है। शब्द-सूची छोटी है और बढ़ानी होगी।
- सिर्फ़ भारत का समय। दूसरा time zone नहीं।
HOW IT WORKS: बिना Intl और बिना library: IST = UTC+330 मिनट जोड़कर UTC के तरीक़ों से पढ़ना, इसलिए हर मशीन पर एक ही जवाब। हिंदी "कल" का मतलब बीता और आने वाला दोनों होता है, इसलिए बीते दिन के लिए "बीता कल" कहा जाता है। दिन और महीने की सीमाएँ भारत के आधी रात से (खर्चे की दैनिक सीमा भी इसी से)।
INPUTS / OUTPUTS: In: `Date` या text। Out: text, `Date`, parts। Test: `npm test` (10 tests)।
USES / USED BY: Uses: कुछ नहीं। Used by: packages.model-gateway (दिन/महीने की सीमा)। आगे: app, api, features।
POWER LEVEL & CONFIRMATION: L0।
EXAMPLES: `formatDateTime(d,'hi','full')` -> "शनिवार, 7 नवंबर 2026, शाम 5:10 बजे"; `formatINR(1234567.5)` -> "₹12,34,567.50"।
KNOWN ISSUES:
- UI में "Good morning, Amit!" अभी पक्का लिखा है (पुराने UI जैसा); `greeting()` से जोड़ना बाद में, ताकि pixel test न टूटे।
- Kotlin में यही नियम android/ में अलग लिखने होंगे (S16A); यहाँ के tests उनके लिए "सही जवाब" का नमूना हैं।
CHANGE LOG:
- (append-only) folder-first: created as planned, version 0.0.1. Owner: S00.
- 2026-11-07 - IST, तारीख़/समय/अभिवादन तीन भाषाओं में, अंक, ₹, भाषा-पहचान बने; 10 tests pass; planned -> built - 0.1.0
