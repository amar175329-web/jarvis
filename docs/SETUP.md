# SETUP: JARVIS पहली बार चालू करना (सरल हिंदी)
नियम: कोई भी password या secret key किसी chat में paste मत करना। Keys सिर्फ Vercel/Supabase की settings में डालनी हैं।

## A. खाते सुरक्षित करो (15 मिनट)
1. GitHub, Vercel, Supabase पर **2FA (दो-स्तरीय सुरक्षा) चालू** करो। Recovery codes कागज़ पर लिखकर रखो, repo या chat में नहीं।
2. GitHub पर **private** repository बनाओ, नाम `jarvis`। इस repo की फ़ाइलें upload करो।

## B. Supabase (database + login)
1. Current JARVIS project में migrations `0001` से `0004` पहले ही apply और verify हो चुकी हैं। **उन्हें दोबारा न चलाएँ और `system_state` row को manually recreate न करें।**
2. Authentication -> Users में Amit का owner account मौजूद होना चाहिए। Signup अभी ON है (Amit ने यह जोखिम स्वीकार किया है); API का `OWNER_EMAIL` guard केवल configured owner को JARVIS access देता है।
3. `0005_event_rate_limits.sql` इस bundle का नया local draft है। इसे production Supabase पर केवल Antigravity apply और verify करेगा; इस bundle ने remote DB पर कोई SQL नहीं चलाया।
4. नया, बिल्कुल fresh Supabase project बनाने की अलग स्थिति में ही migrations को migration क्रम में apply करें; पहले से चल चुके migrations कभी replay न करें। Optional `0002_schedule.sql` केवल `pg_cron` enable होने पर है।

## C. Keys निकालना
Supabase -> Settings -> API: तीन चीज़ें दिखेंगी: Project URL, `anon` key, `service_role` key।
- `service_role` = **मास्टर चाबी**। सिर्फ server (Vercel env) में।
- `anon` और URL browser/phone में जा सकते हैं (data की सुरक्षा RLS करता है)।

## D. Vercel
1. Vercel -> Add New -> Project -> अपना GitHub `jarvis` repo चुनो।
2. Settings -> Environment Variables में `.env.example` के नाम एक-एक करके भरो (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, OWNER_EMAIL, CRON_SECRET, DEVICE_TOKEN_PEPPER; AI keys जब चाहिए)। CRON_SECRET और DEVICE_TOKEN_PEPPER के लिए 40+ अक्षर की random string बनाओ।
3. Deploy।

## E. बनाए रखना
- Free Supabase project **7 दिन बिना इस्तेमाल के रुक (pause) जाता है**, और free plan में रोज़ का backup नहीं मिलता। इसलिए: रोज़ की ping (api/system/health) और हफ़्ते में एक बार export (docs/RUNBOOK.md)।
- Database 400 MB के पास पहुँचे तो JARVIS चेतावनी देगा (db_size_mb)।


## Migration state — LEAD bundle 2026-11-07
- Real Supabase पर `0001`–`0004` applied और verified हैं; कोई squad उन्हें replay न करे।
- `0005_event_rate_limits.sql` local-only draft है: per-owner database rate limiting और atomic kill-state + activity audit RPC जोड़ता है। Antigravity ही production में apply/verify करेगा।
- `SUPABASE_SERVICE_ROLE_KEY` और `DEVICE_TOKEN_PEPPER` केवल server environment में रखें; `DEVICE_TOKEN_PEPPER` कम से कम 32 characters का random secret होना चाहिए.
