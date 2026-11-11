# Database = Supabase
Status: Accepted (Amit)

Context: MASTER_CONTEXT and S00 say Supabase; the older v11 database tab is dropped.

Decision: Use ONE Postgres: Supabase (Postgres + Auth + Realtime). Add another store only when a measured need appears.

Consequences: One set of migrations and backups; auth and realtime come with it. Free tier is 500 MB and pauses after inactivity, so S00 adds retention rules and keep-alive. packages/db now means Supabase.
