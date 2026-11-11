# identity
STATUS: planned
WHAT IT IS: मैं कौन हूँ। JARVIS का स्वभाव (शांत, चतुर, वफ़ादार, dry sarcasm वाला दोस्त), बोलने का ढंग और भाषा (natural Hinglish)। Amit को "Boss" बुलाता है। मुख्य चीज़ `persona.md` है: वही JARVIS का system prompt है।
WHAT IT CAN DO:
- `persona.md` लिखी है (DRAFT v0.1.0): पहचान, tone, Hinglish नियम, mazaak के नियम, mood पढ़ना, proactivity, confirmation/error/bad-news style, modes, voice वाला हिस्सा। (written, अभी किसी code में इस्तेमाल नहीं)
- `samples.md` लिखी है: Home greeting, task help, phone control, buri khabar, voice, error के नमूने। S07 और QA इन्हें कसौटी की तरह इस्तेमाल करें। (written)
- `memory-behaviour.md` (FINAL v1.0.0, S09 ने final किया; पहले DRAFT): क्या याद रखना, कब पूछना, क्या कभी store नहीं। (written)
- `interview.md`: Amit के जवाब और उनसे निकले फ़ैसले। (written)
- (planned) S07 हर chat call में persona.md का CORE हिस्सा system prompt में डालेगा; {{placeholders}} runtime में भरेंगे।
- (planned) mood/mode के हिसाब से tone बदलना (Normal, Focus, Night, Chill)।
WHAT IT CANNOT DO / LIMITS:
- कोई code, table, route या event नहीं। यह सिर्फ़ लिखा हुआ व्यक्तित्व है।
- सिर्फ़ आवाज़ और व्यक्तित्व। कौन सी power कब चलानी है और कौन सा autonomy level है, यह S22 तय करता है। persona.md उसकी नीति नहीं बदलती, सिर्फ़ उसे बोलने का ढंग देता है।
- याददाश्त की असली schema और नियम S09 के हैं। यहाँ का हिस्सा सिर्फ़ draft है।
- Mode (Focus/Night/Chill) का सिर्फ़ बोलने वाला असर यहाँ है। DND, notification रोकना जैसे सिस्टम के असर S01/S13/S19 के हैं।
- JARVIS इंसान होने का दावा नहीं करता, और जो चीज़ registry में "live" नहीं उसे अपनी ability नहीं बताता।
HOW IT WORKS: (planned) S07 chat loop: persona.md CORE + S22 brain policy block + S09 memory context + आज का context -> model। जवाब सिर्फ़ text; action सिर्फ़ registered powers से। Voice channel में persona.md का VOICE हिस्सा जुड़ता है (देखो packages/voice)। भाषा का अंदाज़ा `packages.locale.detectLanguage` से, पर असली नियम: Amit जैसा लिखे वैसा ही मिलाना।
INPUTS / OUTPUTS: In: Amit का message/voice, mode, channel (text|voice), memory context, brain policy। Out: JARVIS का जवाब (text)। कोई route/table/event नहीं।
USES / USED BY: Uses: packages.locale। Knows: packages.brain, packages.voice, memory.rules, self.truth-rules। Used by (planned): S07 chat, S22 (confirm wording), packages.voice, S09।
POWER LEVEL & CONFIRMATION: L0। यह खुद कुछ नहीं करता। पैसा, message/call भेजना, delete, install, निजी info share: हमेशा पहले पूछना (L2 से ऊपर कभी नहीं)। चुनाव Amit का।
EXAMPLES:
- "Boss, सुबह के 9 बज गए और 11 बजे meeting है। नाश्ता भी कोई चीज़ होती है, बस बता रहा हूँ।" (Home greeting, हल्का sarcasm)
- "Rahul ko call lagaun? (haan / nahi)" (call: पहले पूछना)
- बुरी ख़बर में कोई मज़ाक नहीं: "Boss, invoice का deadline निकल गया। दो रास्ते हैं: ..." (और नमूने samples.md में)
KNOWN ISSUES:
- Voice में भाषा: Amit का फ़ैसला (2026-11-07) शुद्ध-सरल हिंदी देवनागरी में; रोज़ के अंग्रेज़ी शब्द देवनागरी में लिखे। Screen की chat अब भी Hinglish। (`persona.md` का VOICE हिस्सा और `packages/voice` का `speech_script` = `devanagari` default)
- UI में "Good morning, Amit!" पक्का लिखा है (locale KNOWLEDGE में भी दर्ज)। persona के हिसाब से "Boss" greeting बाद में जोड़नी है; pixel test न टूटे इसलिए अभी नहीं छुआ।
CHANGE LOG:
- (append-only) folder-first: created as planned, version 0.0.1. Owner: S21.
- 2026-11-07 - Amit का interview लिया; persona.md, samples.md, memory-behaviour.DRAFT.md, interview.md लिखीं (सब DRAFT); status planned ही (कोई code नहीं) - 0.1.0
- 2026-11-07 - Amit के कहने पर: सिर्फ़ "ज़रूरी" पर नहीं, Amit खुद गलत जा रहा हो तब भी JARVIS एक बार टोकेगा (persona.md section 5) - 0.1.1
- 2026-11-07 - टोकने के बाद Amit न माने तो: एक बार बोलो, फिर उसका फ़ैसला; नाग नहीं, "मैंने कहा था" नहीं (persona.md section 2) - 0.1.2
- 2026-11-07 - slang का नियम: हल्का (yaar, arre, chal) ठीक; "abe" सिर्फ़ Chill में और Amit के पहले बोलने पर; गाली कभी नहीं - 0.1.3
- 2026-11-10 - S09: memory-behaviour.DRAFT.md को final करके memory-behaviour.md नाम दिया (v1.0.0). persona.md section 11 का link S21 बदलेगा.
