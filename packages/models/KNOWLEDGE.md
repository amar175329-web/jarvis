# models
STATUS: built
WHAT IT IS: Model registry + router + INR helper + local model (phone). Registry = har model ka tier, official daam (input/output/cache), request limit, privacy-level, source URL aur checked_on. Router = task x depth x privacy se model ki ORDERED list (chain). Local hissa = Amit ke phone par private jaankari nikaalna (rules pehle, phir Gemma 3 1B). Call khud nahi karta: cloud calls model-gateway se jaati hain.
WHAT IT CAN DO:
- registry/models.json validate karna; toModelSpecs() sirf verified models gateway ko deta hai, baaki unknown_model (refuse). Daam ke dated steps. (built)
- routeModel(): private -> sirf local (na ho to refuse, cloud kabhi nahi); free -> agla free -> almost-zero (notice); paid_big tabhi jab Amit ne setting + model dono khole, sirf heavy+DEEP kaam par. runChain(): chain ko gateway se try karta hai, kill switch par ruk jaata hai. (built)
- readFx(): INR rate sirf env INR_PER_USD ya settings fx.inr_per_usd se, hardcoded nahi. (built)
- Local: rules.ts (Devanagari + Roman, filler saaf, sudhaar ke shabd pakadta hai) -> Gemma 3 1B fallback; checkMismatch galat/banaye hue shabd pakadta hai; shak par "samajh nahi aaya, dobara boliye". run.sh model sirf request par start karta hai, 5 min idle par band; health ping har 60 s (models.local_health). local-router.ts (routeModelRequest, executePrivateRequest) private rasta. (built)
WHAT IT CANNOT DO / LIMITS:
- Asli provider call, usage padhna, settings table padhna: api/chat aur worker (S07) jodte hain. Chat abhi router nahi chalata (S07 round 5, CR-1). CR-3/CR-4/015 ho chuke hain, aur CR-2 poora hua (cache daam, bracket aur Pacific reset_tz ab gateway me wired hain).
- Free Gemini limits (500/20) official nahi, third-party ceiling: Amit AI Studio se confirm kare.
- Phone par RAM kam (~1.5 GB free): 1B pehli request ~21 s, baad ki ~6.5 s; khuli private baatcheet "limited". Rules ka 94% test vaakyon par sudhara gaya: asli % Amit ke bole vaakyon par baaki.
HOW IT WORKS: types.ts/registry.ts/router.ts/fx.ts (S13 registry + router). local-types.ts/health.ts/local-runner.ts/local-router.ts/health-ping.ts + local/rules.ts + local/run.sh (phone local model).
INPUTS / OUTPUTS: In: registry JSON, settings, usage, budget, keys-present, models.local_health. Out: Route {chain, notices} ya refused. Tables (migration 0050): model_registry, model_price_checks, model_usage naye columns. Settings keys: models.prefs, models.paid_big_enabled, models.local_health, fx.inr_per_usd, models.limits_confirmed.
USES / USED BY: Uses: packages.model-gateway (types), packages.shared. Used by: api/chat, packages/chat (S07), worker.
POWER LEVEL & CONFIRMATION: L1. paid_big kholna, budget badhana, private ko cloud par bhejna: kabhi apne aap nahi.
EXAMPLES: "hi" -> FAST -> gemini-free 3.5-flash-lite. Free limit khatam -> agla free -> almost-zero + notice. "kal subah 8 baje dawai leni hai" -> rules.ts 1 ms me {dawai leni hai, kal subah 8:00 baje}.
KNOWN ISSUES: free RPD numbers unverified; OpenAI Luna unverified (refused); chat abhi router nahi chalata (S07 round 5, CR-1); CR-3/CR-4/015 ho chuke hain, CR-2 gateway wiring sampann.
CHANGE LOG:
- (append-only) folder-first: created as planned, version 0.0.1. Owner: S13.
- 2026-11-14 - registry, router, fx, runChain, 10 tests; planned -> built - 0.1.0
- 2026-11-15 - local model (rules + 1B) merged with registry/router, 43 tests - 0.2.0
- 2026-11-16 - CR-2: toModelSpecs me cache daam, resetTz aur bracket pass kiya; Haiku 5.5 >100K pricing updated from official docs - 0.2.1
