# app
STATUS: built
WHAT IT IS: Vite+React+TypeScript shell। पुराने HTML UI (`_reference/JARVIS-ui-reference.html`) का वही रूप, अब React components में। features/ का UI आगे इसी shell में जुड़ेगा।
WHAT IT CAN DO:
- Shell (Sidebar, Topbar), Home page और More Features page, पुराने UI जैसे ही। (built)
- Screenshot test: reference और नया app 390px (mobile) और 1440px (desktop) पर, Home और More दोनों, में कोई दिखने वाला फ़र्क नहीं (0 different pixels)। (built, `npm run test:visual`)
- Click के काम: Home/More बदलना, More में search से filter, chat में message भेजना और AI का "typing" जवाब, boot screen, card पर pointer की रोशनी। (built, 7 browser checks, `npm run test:behavior`)
WHAT IT CANNOT DO / LIMITS:
- चैट का जवाब नकली है ("Replies are not connected in this UI preview")। कोई API या database नहीं जुड़ा; login भी नहीं।
- More Features के सारे cards अभी सिर्फ़ दिखावटी placeholders हैं (पुराने UI जैसे)।
- Fonts Google से आते हैं; test में उन्हें बंद करके दोनों पेज एक जैसे fallback fonts पर तुलना किए जाते हैं।
- Vercel पर deploy अभी नहीं किया। Vercel project का root `app` रखना है, Build command `npm run build`, Output directory `dist`।
- Owner session पर `KillSwitch` component `/api/system/kill.get` से state पढ़ता है और `/api/system/kill.set` से explicit owner toggle करता है। 401/403/404 पर control छिपता है; अन्य read/write failures पर visible Safety ON/blocked रहता है। Pure safety policy के छह Node tests `npm run test` में चलते हैं।
- Browser test Playwright + Chromium चाहता है; यह सामान्य package suite में शामिल नहीं (manual/browser CI job में चलाएँ)।
HOW IT WORKS:
1. `src/ui.css`: पुराना CSS ज्यों का त्यों (एक अक्षर नहीं बदला)। यही pixel-perfect की गारंटी है; नया styling यहाँ मत जोड़िए, नई feature अपनी CSS अलग रखे।
2. `src/components/`: `Sprite` (icons, verbatim), `Sidebar`, `Topbar`, `HomePage`, `Chat`, `MorePage`, `Boot`। Markup पुराने HTML से mechanical तरीके से JSX में बदला गया, classes वही।
3. `src/App.tsx`: page (home/more) और search की state; pointer-glow।
4. Test: `npm test` pure kill-control policy tests चलाता है। Screenshot/click browser suite के लिए पहले `npm run build`, फिर `npm run test:visual` और `npm run test:behavior` (Playwright + Chromium चाहिए; अलग browser job)।
5. नियम: reference HTML को छूना नहीं; बदलाव UI का मतलब "reference बदले" तब ही होगा जब Amit कहे, और तब test भी साथ बदलेगा।
INPUTS / OUTPUTS: In: कुछ नहीं (अभी स्थिर)। Out: `dist/` (static site)।
USES / USED BY: Uses: react 18.3.1, vite 5.4.11। Later: packages.contracts (API), features/*। Used by: Vercel deploy।
POWER LEVEL & CONFIRMATION: L0 (सिर्फ़ दिखाता है, कुछ करता नहीं)।
EXAMPLES: `cd app && npm install && npm run build && npm run test:visual` -> ALL SAME: no visible difference।
KNOWN ISSUES:
- More का search खोजने के लिए DOM पर सीधे `display` बदलता है (पुराने UI जैसा)। जब features registry से बनेंगे तो इसे React state से बदलना होगा।
- चैट textarea पहली बार में CSS की ऊँचाई लेता है; टाइप करने पर 120px तक बढ़ता है (पुराने जैसा)।
- Screenshot में पहले एक बार 24 pixel (रंग में 1/255 का फ़र्क) और एक बार आधा-बना render दिखा; test अब 3 बार कोशिश करता है और 1/255 के फ़र्क को नज़रअंदाज़ करता है।
CHANGE LOG:
- (append-only) folder-first: created as planned, version 0.0.1. Owner: LEAD / S00.
- 2026-11-07 - #15 UI migration शुरू: plan लिखा (code से पहले)।
- 2026-11-07 - Vite+React+TS app बना; shell + Home + More; visual test 4/4 और behavior test 7/7 पास; status planned -> built - 0.1.0
- 2026-11-07 - Owner kill-switch component और fail-closed UI policy; six policy tests added; reference UI unchanged - app update.
