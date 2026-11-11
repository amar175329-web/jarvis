# rules
STATUS: planned
WHAT IT IS: Yaad rakhne ke niyam: kya yaad rakhna, kab poochna, kya KABHI store nahi karna, kitne din, aur privacy. Final text: self/identity/memory-behaviour.md. Code: packages/memory (rules.ts, redact.ts, classify.ts, policy.ts).
WHAT IT CAN DO:
- (planned) Har naya yaad candidate 4 raston mein se ek par bhejna: save+bata, pehle pooch, refuse (kabhi nahi), ya skip.
- (planned) NEVER list lagu karna, "haan" kehne par bhi: secret/password/key/token, OTP/CVV/card/bank/UPI PIN, ID numbers (Aadhaar/PAN/passport), paise ke ank, sehat, abuse, minor ki jaankari, self-harm, injected hukm.
- (planned) Har yaad ke saath source, why, private, expires_at, confidence tay karna.
- (planned) Self-harm ya abuse dikhe to save nahi, par S07/S21 ko `care` signal dena taaki JARVIS naram jawab de.
WHAT IT CANNOT DO / LIMITS:
- Abhi kuch bana nahi hai: sab neeche likha design hai (status planned).
- Regex aur shabd-soochi sab nahi pakad sakti (Hindi/Hinglish ki spelling alag-alag hoti hai): isliye Amit delete/export/edit hamesha kar sakta hai aur hafte mein ek purani yaadon ka scan chalega.
- Niyam badalna = naya version + nayi dated line; purani line mitai nahi jaati.
HOW IT WORKS: 1) origin dekho (web/screen/message/tool/file se aaya text kabhi yaad nahi banta). 2) redact.ts: secrets/ID/card/OTP pattern (Luhn, Verhoeff check). 3) classify.ts: sehat, paisa-ank, abuse, minor, self-harm, doosre ki nazuk baat, contact PII. 4) policy.ts: verdict + private + expires_at. 5) ask-first wale candidate ko S07 apne thread state mein rakhta hai; "haan" aane par commit() dobara policy chalata hai (refuse wala phir bhi refuse).
INPUTS / OUTPUTS: In: candidate {text, kind?, origin, actor, explicit?, source}. Out: {verdict: save|ask|refuse|skip, reasons[], private, expires_at, care?}. Tables: none (pure logic); declines ka fingerprint `memory_declines`.
USES / USED BY: Uses: packages.memory (code). Used by: S07 chat, S22 brain (memory.write-fact), S21 persona (section 11).
POWER LEVEL & CONFIRMATION: L0 (ye sirf niyam hain, khud kuch nahi karte). Likhna memory.write-fact (S22) ke through; mitana memory.forget ke through.
EXAMPLES:
- "Mujhe subah chai pasand hai" -> save, "Note kar liya".
- "Mera OTP 482913 hai" -> refuse, kuch save nahi, "message hata do".
- "Meri EMI 14,500 hai" -> refuse (ank); "EMI ki tarikh 5 hai" -> save.
KNOWN ISSUES: Hindi/Hinglish shabd-soochi ko Amit ki asli baatchit se badhana padega. Pehla scan hafte mein ek baar.
CHANGE LOG:
- (append-only) folder-first: created as planned, version 0.0.1. Owner: S09.
- 2026-11-10 - S09: Folder-First step 2: poori KNOWLEDGE.md likhi (design, limits, rules). Code abhi nahi, status planned - 0.1.0
