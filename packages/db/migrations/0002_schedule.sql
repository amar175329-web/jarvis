-- OPTIONAL, run after 0001, in the Supabase SQL editor. Needs the pg_cron extension (Dashboard -> Database -> Extensions -> pg_cron -> enable).
-- Daily cleanup of old logs (keeps the free 500 MB from filling). Not tested locally (pg_cron exists only on Supabase).
select cron.schedule('jarvis-purge-old-rows', '30 21 * * *', $$select public.purge_old_rows()$$);  -- 21:30 UTC = 03:00 IST
-- NOTE: do NOT rely on this job to stop the free project from pausing after 7 idle days; keep-alive is a real query from api/system/health (S00 part 10).
