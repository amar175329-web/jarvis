# Amit ka Gemini proxy: design (S13, 14 Nov 2026)
Maksad: free limit ka poora faayda, bina kisi provider ki terms todhe.

## Kya banega (aur kya NAHI)
- Alag server NAHI. Proxy = `packages/models` (registry + router) + gateway ke adapters, jo `api/chat` aur worker ke andar chalte hain. Wajah: phone 24x7 nahi chalta, aur Vercel Hobby par max 12 functions (10 use ho chuke).
- Ek Google account, ek Google project, free key = `GEMINI_FREE_API_KEY` (provider naam `gemini-free`). Paid key alag = `GEMINI_PAID_API_KEY` (`gemini-paid`). Dono ek hi adapter, alag key.

## Rotation: MODELS ke beech, accounts ke beech NAHI
- Official rate-limits page: limits "per project, not per API key" hain, aur RPD Pacific midnight par reset hota hai. Matlab zyada keys/accounts/projects bana kar limit badhana = abuse; hum ye nahi karenge, aur suggest bhi nahi karte.
- Har model ka apna RPD hai. Isliye rotation = ek project ke andar model badalna: 3.5-flash-lite -> 3.1-flash-lite (chhote kaam), 3.6-flash -> 3.8-flash (bade kaam), phir almost-zero. Ye router ka chain hai.
- Limit ke numbers: official page par nahi dikhte (AI Studio mein sirf owner ko). Registry ke 500/20 RPD third-party ceiling hain. Amit AI Studio > rate limits se 4 numbers dekh kar `settings models.limits_confirmed` mein daale; tab status `user_confirmed` hoga.
- 429 sach hai: provider 429 de to model us din ke liye "cooling" (agle Pacific midnight tak), chain agle par. RPM ke liye client-side token bucket (3.5/3.1 lite 10/min, 3.6/3.8 5/min: wahi third-party numbers, confirm hone tak).
- Free-request ginti ka din Pacific hona chahiye (gateway abhi IST se ginta hai): CR-2.

## Key safety
- Keys sirf server env (Vercel env / worker ~/.jarvis.env). app/, android/, features/ mein kabhi nahi (check.ts pehle se rokta hai). Logs, usage rows, errors mein key ya prompt nahi.
- Proxy sirf logged-in owner (Supabase session + OWNER_EMAIL) ke liye. Naya public endpoint nahi.
- Free aur paid key alag, taaki free project mein galti se billing na jude aur paid key free wale kaam mein na jaaye.

## Caching
- Paid Gemini: implicit caching khud hota hai (daam registry mein cache_read). Explicit cache ka storage $1/MTok/ghanta lagta hai: use nahi karenge.
- Free tier: kuch models par caching "free of charge" likha hai, par explicit API ki zarurat nahi: skip.
- Apna exact-match cache (baad mein, optional): sirf NON-private, same prompt + model, TTL 24 ghante, chhota size cap (Supabase free 500 MB). Private text kabhi cache nahi.

## Data aur terms (padhe hue)
- Gemini free tier: official pricing page kehta hai "Used to improve our products: Yes" => free par private text kabhi nahi. Paid tier: "No".
- Gemini API terms ka poora text is pass mein nahi padha (site automated access mana karti hai). Antigravity/Amit https://ai.google.dev/gemini-api/terms padh kar ek line `docs` mein likhe, tab tak sirf ek key + ek project.
- Anthropic commercial terms bhi nahi padhe: Haiku cloud hai, private data wahan jata hi nahi.

## Naye free / open models jodne ka darwaza (sab UNVERIFIED, abhi registry mein NAHI)
Har naye provider ke liye: (1) official daam + limit page URL, (2) data-use terms padhna, (3) checked_on, (4) tab status `verified`. Tab tak router/gateway refuse. "Open code" se Amit ka matlab agar open-weight models hain (Gemma 4 jo Gemini API par free listed hai, model id official page par nahi mila: `needs_model_id`) ya OpenCode agent, to bhi yehi darwaza.
