# Local model plan (S13, 14 Nov 2026)
## Sach (Antigravity ki read-only report se)
Machine = Amit ka phone (Android ke andar PRoot Ubuntu, MediaTek Helio G96). RAM 7.6 GiB total, free sirf 1.5 GiB available, swap 2 GiB pehle se use, GPU nahi, disk 37 GB free, uptime 2 minute (24x7 nahi). Amit ke paas laptop/PC nahi.

## Faisla
1. Phone par local LLM abhi NAHI. Sabse chhota Gemma 4 (E2B) bhi ~1.5 GB (third-party: phone ke liye) se ~3 GB (Q4 GGUF) maangta hai; Google ka memory table is pass mein padh nahi paya. 1.5 GB free mein ye phone ko slow/garam karega, aur Amit ne bojh nahi chaha.
2. Isliye PRIVATE CHAT BAND rahegi (router: `private_needs_local`). Cloud par kabhi nahi. Ye Amit ka niyam hai (6).
3. Private cheezein SAVE karna (T2/T3: dawai, weight, paisa) model ke bina chalta hai: S09 ke rules (classify/policy/redact) kaafi hain. "Sirf information nikalna" ke liye bhi pehle rules; model sirf tab jab rules fail hon, aur wo bhi local ho tab.
4. Jab koi local host mile (laptop/PC, ya kabhi ek chhota paid server jo Amit kholne ko kahe): `llama-server` (llama.cpp) OpenAI-compatible, worker usi machine par ya private tunnel se. Auth `LOCAL_MODEL_TOKEN`. Worker har 60 sec health ping karke `settings models.local_health {ok, checked_at}` likhta hai; 3 min se purana = unhealthy = private chat band.
5. Model chunna tab: Antigravity us machine par free RAM naapta hai; model ka size + 1 GB se kam free ho to nahi. Naam/size official model page se confirm hoga, yaad se nahi. Gemma 4 E2B pehla candidate (Apache 2.0 bataya gaya, third-party), 1B se chhote models unverified.
6. CHOSEN (Amit ne kaha pehle local chuno): Gemma 3 270M instruct, Q4_K_M GGUF, llama.cpp, 2 threads, ctx 2048. Registry: local/gemma-3-270m-it, status unverified jab tak Antigravity official model card par size confirm na kare. Sirf extraction/classification (private info nikalna, JSON), khuli private salah nahi. Gemma 3 1B (~0.7 GB file, ~1.2 GB RAM) abhi bhi tight hai: tabhi jab 2.5 GB+ free ho.

## Phone-hi-phone option (sirf agar Amit zid kare)
Phone restart ke baad, saare apps band, `free -m` naapo. Agar 2.5 GB+ available ho to E2B Q4 try; warna nahi. Risk: swap thrash, phone garam, Anti-Gravity session mar sakta hai. Mera sujhav: mat karo.

## UPDATE 15 Nov 2026 (FINAL, Antigravity ne phone par chalaya)
- Jaankari nikaalna: rules.ts pehle (Devanagari + Roman, filler saaf), phir Gemma 3 1B fallback. 35 vaakya: rules 33/35, 1B 27/35, hybrid 33/35 (2 me galat sahejne ki jagah "samajh nahi aaya, dobara boliye").
- Gemma 3 270M private route se HATAYA (matibhram: "raat 9:00", "dadi ko call" jaise galat jawab).
- Model sirf request par start, 5 min idle par band, health ping 60 s (models.local_health). 30 min stability: 0 crash. Latency: rules ~0.001 s; 1B pehli request ~21 s, baad ki ~6.5 s.
- Private KHULI baatcheet 1B par "limited" (dheemi, saadharan).
- Upar ke "Faisla" 1-6 me 270M wala hissa ab purana hai.
