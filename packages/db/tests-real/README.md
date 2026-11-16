# Real Supabase Verification Tests

This test suite executes end-to-end RLS isolation, chat threads RLS, and private storage bucket isolation against a live Supabase project using real authenticated users A and B.

## Kaise dobara chalate hain (How to re-run)

```bash
# Ensure ~/.jarvis.env (0600) has TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY, TEST_SUPABASE_SERVICE_ROLE_KEY, TEST_DB_URL
node --test packages/db/tests-real/real-supabase.test.mjs
```
