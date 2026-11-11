# Free-tier guards (Supabase free: 500 MB, pause after 7 idle days, no daily backup, 2M realtime messages/month)
Status: Accepted (LEAD)

Decision: retention from day 1 (purge_old_rows), 400 MB warning (db_size_mb), realtime only on 4 tables, payload < 16 KB, small embeddings (768 dims), daily real-query keep-alive, weekly manual export until a paid plan. Keep-alive must be a REAL DB query (not assumed from pg_cron).

Consequences: free plan is enough for one user if these hold; revisit when memories pass ~30k.
