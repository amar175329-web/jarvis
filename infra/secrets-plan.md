# Secrets plan (S00)
RULE: a secret lives in exactly one place per environment and never in git, chats, screenshots or KNOWLEDGE.md. scripts/check.ts and CI (gitleaks) block known key shapes.

| Secret | Who may read it | Where it lives |
|---|---|---|
| SUPABASE_SERVICE_ROLE_KEY (master key) | api/ and worker/ only | Vercel env (server), worker host env. NEVER app/, android/, features/ |
| SUPABASE_ANON_KEY / SUPABASE_URL | browser + phone app (public by design; RLS protects data) | Vercel env, Android build config |
| AI model keys | api/ and worker/ only | Vercel env, worker env |
| CRON_SECRET | api cron routes | Vercel env; routes reject calls without it |
| DEVICE_TOKEN_PEPPER | api/ only | Vercel env; device tokens are stored as SHA-256(pepper + ":" + token) |
| Amit's login | Amit | Supabase Auth, 2FA on, signups disabled |

Environments: local (.env, git-ignored), preview (Vercel preview env, separate Supabase project later if needed), production.
Rotation: if a key is ever pasted anywhere public, rotate it the same day (Supabase: Settings -> API; model keys: provider dashboard), update Vercel env, redeploy.
Phone/TV/agents: the phone signs in as Amit (token in Android Keystore). TV/agents get a device token (shown once, only its hash is stored, revocable via devices.revoked_at).
Accounts: 2FA on GitHub, Vercel, Supabase, Anthropic/OpenAI/Google; keep recovery codes OFFLINE (paper or password manager), never in the repo.
