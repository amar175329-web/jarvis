# model-gateway
STATUS: built
WHAT IT IS: हर AI model बुलाने का एक ही दरवाज़ा। हर call का क्रम पक्का: kill switch -> model सूची में है? -> खर्चे की सीमा -> key -> call -> usage दर्ज। (Router की समझ, यानी कौन सा model कब, S13/S07 की है; यहाँ सिर्फ़ plumbing है।)
WHAT IT CAN DO:
- `createGateway({...}).call(request)` -> `{ok:true,text,usage,warning?}` या `{ok:false,code,message}`। Codes: `kill_switch_on`, `unknown_model`, `unknown_provider`, `unpriced_model`, `budget_exceeded`, `no_key`, `provider_error`, `timeout`। (built)
- खर्चे की सीमा (`Budget`): रोज़ की और महीने की (भारत की आधी रात से), हर model की रोज़ की सीमा, और free models की रोज़ के requests की सीमा। Call से पहले "सबसे बुरा खर्चा" (अनुमानित input + पूरा output) जोड़कर देखा जाता है, इसलिए सीमा पार करने वाली call होती ही नहीं। 80% पर चेतावनी। (built)
- बिना कीमत वाला (non-free) model मना: कीमत हम अंदाज़े से नहीं भरते। (built)
- Keys: `envKeys()` env से पढ़ता है (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, नाम `.env.example` वाले)। Key न हो तो बताता है कौन सा variable भरना है, कीमत कभी नहीं। (built)
- Usage: `model_usage` table में हर call (असफल भी, ok=false) दर्ज; `supabaseUsageStore` (service_role, इस महीने की अधिकतम 5000 पंक्तियाँ पढ़ता है) और `memoryUsageStore` (tests)। (built)
- Timeout (default 60 s), और logs में prompt, जवाब या key कभी नहीं। (built)
WHAT IT CANNOT DO / LIMITS:
- असली providers (Anthropic/OpenAI/Gemini के adapters) अभी नहीं हैं; `Provider` interface है, adapters S13/S07 लिखेंगे। Tests नकली provider से हैं।
- कीमतें और सीमाएँ (`ModelSpec`, `Budget`) कहीं से भरी नहीं गई हैं। इन्हें Amit/S13 settings में तय करें; कीमत देखने की ज़िम्मेदारी भरने वाले की है।
- Usage पढ़ना/लिखना सीधा Supabase REST है; पढ़ना न हो सके तो खर्च बंद (fail-closed)।
- कई कॉल एक साथ हों तो सीमा थोड़ी पार हो सकती है (दोनों ने एक ही usage देखी); एक user और धीमी रफ़्तार के लिए ठीक, भारी concurrency में lock चाहिए।
- Provider ने fail हुई call का पैसा लिया हो तो वह दर्ज नहीं होता (tokens 0)।
S21/S13/S07 interface only: `AudioModelAdapter` declares transcribe/speak input/output types using audio references and metadata. No audio provider, adapter implementation, routing, or gateway invocation is added in this bundle.
HOW IT WORKS: `src/gateway.ts` (क्रम), `src/budget.ts` (हिसाब), `src/keys.ts`, `src/stores.ts`, `src/types.ts`। सब बाहर से जोड़ा जाता है (kill switch reader, usage store, keys, providers), इसलिए worker, api, कहीं भी चलेगा।
INPUTS / OUTPUTS: In: `{provider, model, task?, input, maxOutputTokens, estimatedInputTokens}`। Out: `GatewayResult`। Table: `model_usage`। Test: `npm test` (18 tests)।
USES / USED BY: Uses: packages.shared, packages.logging, packages.locale। Used by: packages.models (S13), features जो model बुलाते हैं।
POWER LEVEL & CONFIRMATION: L1 (पैसा खर्च कर सकता है, इसलिए सीमा के भीतर ही)। बड़ी सीमा बढ़ाना Amit की पुष्टि से।
EXAMPLES: Gemini free model पर 2 requests/दिन की सीमा है तो तीसरी call `budget_exceeded` देती है और model तक पहुँचती ही नहीं।
KNOWN ISSUES: ऊपर की "LIMITS" वाली बातें (adapters, कीमतें, concurrency) ही खुली चीज़ें हैं।
CHANGE LOG:
- (append-only) folder-first: created as planned, version 0.0.1. Owner: S00.
- 2026-11-07 - gateway, budget, keys, usage stores बने; 18 tests pass; planned -> built - 0.1.0
- 2026-11-07 - Added type-only AudioModelAdapter contract for S21/S13/S07; no implementation wired - 0.1.1
