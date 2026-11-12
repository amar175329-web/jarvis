-- Storage policies for 'files' bucket (docs/WORKSPACE_MODEL.md).
-- Idempotent: drop policy if exists + create policy.
-- Local PGlite test engines without the 'storage' schema skip safely.
do $$ begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    return;
  end if;

  drop policy if exists "Owner files select" on storage.objects;
  drop policy if exists "Owner files insert" on storage.objects;
  drop policy if exists "Owner files update" on storage.objects;
  drop policy if exists "Owner files delete" on storage.objects;

  create policy "Owner files select" on storage.objects
    for select to authenticated
    using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);

  create policy "Owner files insert" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);

  create policy "Owner files update" on storage.objects
    for update to authenticated
    using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);

  create policy "Owner files delete" on storage.objects
    for delete to authenticated
    using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
end $$;
