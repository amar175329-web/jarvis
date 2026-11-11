-- 0021 (LEAD, from S22 gap + S09 CR-4). Tags column so risky powers keep their rules when loaded from the DB; memory powers fixed. Re-run safe. Do NOT run on real Supabase before a test project.
alter table public.powers add column if not exists tags text[] not null default '{}';
update public.powers set tags = array['money'] where id = 'browser.checkout-payment';
update public.powers set tags = array['money'] where id = 'money.finance-app';
update public.powers set tags = array['message'] where id = 'outreach.sales-email';
update public.powers set tags = array['message'] where id = 'messages.send-call';
update public.powers set tags = array['personal'] where id = 'data.share-personal';
update public.powers set tags = array['secret'] where id = 'vault.use-secret';
update public.powers set tags = array['secret'] where id = 'vault.reveal-secret';
update public.powers set tags = array['secret'] where id = 'vault.view-entry-names';
update public.powers set tags = array['personal'] where id = 'memory.forget';
update public.powers set tags = array['message'] where id = 'bot.social-post';
update public.powers set tags = array['message'] where id = 'esign.send-document';
update public.powers set tags = array['personal'] where id = 'memory.forget-all';
update public.powers set tags = array['personal'] where id = 'memory.write-private';
update public.powers set tags = array['personal'] where id = 'memory.export';
update public.powers set autonomy_default = 2, autonomy_current = case when autonomy_current = 1 then 2 else autonomy_current end where id = 'memory.forget' and max_level >= 2;
do $$ declare v_owner uuid := (select id from auth.users order by created_at limit 1); begin
  if v_owner is null then raise exception 'no owner user yet'; end if;
  insert into public.powers (owner_id,id,name,owner_squad,description,autonomy_default,autonomy_current,max_level,needs_confirm,reversible,tags) values
  (v_owner,'memory.forget-all','Memory: forget everything (app tap only)','S09',null,0,0,0,true,false,array['personal']),
  (v_owner,'memory.write-private','Memory: write private memory','S09',null,2,2,2,true,true,array['personal']),
  (v_owner,'memory.export','Memory: export all','S09',null,2,2,2,true,true,array['personal'])
  on conflict (owner_id,id) do nothing;
end $$;
