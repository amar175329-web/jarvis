# Semantic search plan (768-dim, free tier, model-gateway ke raaste)
Status: PLAN + code taiyar (src/search.ts, embed.ts, migration 0030/0032). Model chunna nahi gaya (Amit ka jawab baaki).

## Seedhi baat
- Vector search = "matlab" se dhoondhna ("app kab release?" -> "Jarvis launch December"). Shabd-search sasta aur bina model ke chalta hai. Dono milakar (hybrid).
- **Ek dikkat jo Amit ko batani hai:** embedding banane ke liye memory ka text ek model ko bhejna padta hai. "Memory ka data bahari service mein nahi jayega" ke saath ye takraata hai. Isliye default **OFF** (`settings: memory.embeddings = off`). Tab sirf shabd-search. Amit "cloud" kahe to sirf **non-private, secret-free** text jaata hai (prepareEmbedText). Private kabhi nahi.

## Ladder (kam kharch pehle)
1. Card (pinned profile/preferences): koi search nahi, koi model nahi.
2. Shabd-search (`tokens` GIN index, Devanagari/Hinglish ke liye khud ke tokens): koi model nahi.
3. Vector: sirf jab (embeddings on) AND (shabd ke nateeje kam ya sawaal 4+ shabd ka) AND kill switch OFF AND gateway budget/key theek. Query ka vector cache (50). Chhote (<12 akshar) sawaal par vector nahi.
4. Kuch bhi fail: jawab shabd-search se; `degraded` flag S07 ko (kill_switch | budget_or_key | embed_failed | embeddings_off).

## Likhte waqt
Row pehle bina vector ke banti hai (`embedding_model` null). Worker job `memory.embed` har ~10 min batch (20 text) mein `runEmbedBatch` chalata hai: off/kill/budget par ruk jaata hai; private ya secret wali row ko "skipped" mark. Text badle to vector hat jaata hai (trigger + store), dobara banta hai.

## Vector ke tathya
- Column `halfvec(768)` (2 byte/number, float32 se aadha), HNSW cosine, partial index (sirf jahan vector hai).
- Alag models ke vectors aapas mein mel nahi khaate: har row par `embedding_model` ("provider/model@768"). Model badalna = sab dobara embed (job), ya pehle sirf naye model ke rows par search.
- 768 tak chhota kiya hua (Matryoshka) vector unit-length nahi hota: `l2normalize` hamesha.
- Document/query ke liye alag task type (retrieval_document / retrieval_query).

## Model ke vikalp (Antigravity official page se jaanch kare; mere paas network nahi tha, ye dusre-haath ki jaankari hai)
| Vikalp | 768 | Hindi/Hinglish | Text kahan jaata hai |
|---|---|---|---|
| Gemini embedding (free tier), outputDimensionality=768 | haan (chhota kiya hua) | achha | Google ko. Free tier ke data-use ke niyam official terms mein dekho |
| Local multilingual model (jaise multilingual-e5-base, 768) laptop worker par | haan (asli) | achha | kahin nahi. Par Vercel ke chat request ke time query-vector nahi ban sakta (laptop door) |
Meri salah: pehle OFF, phir Amit ka jawab. "cloud" = Gemini free (sirf non-private). "local" = sirf laptop worker mein document vectors + keyword fallback jab laptop band ho (query-time vector tabhi jab worker se chat chale).

## Gateway se kya chahiye (CONTRACT REQUEST CR-1)
`gateway.embed({provider, model, task:'memory.embed', texts, taskType, dim, estimatedInputTokens})` jo call() ki poori chain chalaye: kill -> model list -> budget -> key -> call -> usage record. `Provider.embed?()` optional. Free model ki request limit (`maxRequestsPerDay`) gateway ka hi hisaab.

## Free tier ka hisaab (anuman)
Likhna: ~1 vector/yaad, batch 20 => 30k yaadein = 1500 request kul, roz 100-300 yaad par roz <20 request. Padhna: chat turn par <=1 (cache + ladder se aadha). Asli limit Google ke official page se (ek jagah settings mein, code mein hard-code nahi).

## Quality kaise naapein (tune)
50 sawaal-jawab ka golden set Amit ki asli (nijee, git ke bahar) memory par: recall@5 keyword-only vs hybrid. Weights (rules.ts RANK) tab badlo. Abhi ke weights sirf shuruaati.
