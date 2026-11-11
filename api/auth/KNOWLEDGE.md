# auth API
STATUS: built
WHAT IT IS: Server-side Supabase Auth session bridge and one-owner guard. It accepts a token already issued by Supabase Auth; it does not receive or store passwords.
WHAT IT CAN DO:
- `POST /api/auth/session.create`: verifies the access token with Supabase Auth, requires exact configured `OWNER_EMAIL`, then sets a Secure, HttpOnly, SameSite=Lax cookie.
- `GET /api/auth/session.get`: validates the owner cookie, refreshes an expired session when a refresh token is present, and rotates the cookie.
- `POST /api/auth/session.delete`: revokes the remote session when possible and always clears the local cookie.
- Rejects invalid/non-owner identities, cross-origin session creation, malformed/oversized body and incomplete configuration; tokens never appear in JSON responses or logs.
WHAT IT CANNOT DO / LIMITS:
- Password login, signup UI, password reset, OAuth UI and password storage are intentionally not implemented. Supabase Auth owns credential handling.
- Signup remains enabled by Amit's accepted decision; `OWNER_EMAIL` still restricts JARVIS API access to one owner identity.
- Session cookies require HTTPS because they are Secure. There is no separate server-side session table.
HOW IT WORKS: `index.ts` verifies tokens through `/auth/v1/user`, checks owner email, stores access/optional refresh token in an HttpOnly cookie, refreshes with `/auth/v1/token`, rotates the cookie even when refresh is triggered through a system API, and clears on logout. Route modules are thin wrappers. `readOwnerSession` is reused by system APIs.
INPUTS / OUTPUTS: Reads `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `OWNER_EMAIL`; receives `{access_token, refresh_token?}`. Routes: `/api/auth/session.create`, `/api/auth/session.get`, `/api/auth/session.delete`.
USES / USED BY: Uses Supabase Auth; used by `api/system` and future owner-only routes.
POWER LEVEL & CONFIRMATION: L0. It establishes identity only; it does not authorize a device to impersonate the owner.
EXAMPLES: A signed-up second account can authenticate with Supabase but receives 403 from session.create because its email differs from `OWNER_EMAIL`.
KNOWN ISSUES: A browser login UI / Supabase client integration is a later app task. Do not add password handling to these routes.
CHANGE LOG:
- (append-only) 2026-11-07 - Folder-First registration before code - 0.0.1.
- 2026-11-07 - Three owner session routes, cookie refresh/clear and 10 auth tests added - 0.1.0.
