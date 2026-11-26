-- P34b S22 Powers Seed (FILE ONLY — DO NOT APPLY TO DB UNTIL AMIT APPROVES).
-- Registers ONLY the powers specified in accepted CRs:
--   - CR-S05-S22: history.read, activity-logs.read (L0/L0, max L2)
--   - CR-S08-B3-S22: tasks.delete, reminders.update, reminders.complete, reminders.delete (L2/L2, max L2)
--   - CR-S09-CR2: all 25 S09 powers (L0/L0, max L2; normalizes memory.forget, memory.forget-all, memory.export)
-- Does NOT include system.power-off (deferred to P34c).

begin;

do $$
declare
  v_owner uuid := (select id from auth.users order by created_at limit 1);
begin
  if v_owner is null then
    raise exception 'no owner user yet';
  end if;

  -- 1. S05 read powers (L0/L0, max L2) + S08 B3 mutation powers (L2/L2, max L2)
  insert into public.powers (
    owner_id, id, name, owner_squad, description,
    autonomy_default, autonomy_current, max_level, needs_confirm, reversible, tags
  )
  select v_owner, t.* from (values
    ('history.read', 'History: read owner chat history', 'S05', 'Read owner chat threads and masked messages', 0, 0, 2, true, true, array['personal']),
    ('activity-logs.read', 'Activity Logs: read owner activity metadata', 'S05', 'Read safe owner activity timeline metadata', 0, 0, 2, true, true, array['personal']),
    ('tasks.delete', 'Tasks: delete task', 'S08', 'Hard-delete an owner task after confirmation', 2, 2, 2, true, false, array['personal']),
    ('reminders.update', 'Reminders: update reminder', 'S08', 'Update an owner reminder and replace its queued job', 2, 2, 2, true, true, array['personal']),
    ('reminders.complete', 'Reminders: complete reminder', 'S08', 'Mark an owner reminder done and cancel its queued job', 2, 2, 2, true, true, array['personal']),
    ('reminders.delete', 'Reminders: delete reminder', 'S08', 'Hard-delete an owner reminder and cancel its queued job', 2, 2, 2, true, false, array['personal'])
  ) as t(id, name, owner_squad, description, autonomy_default, autonomy_current, max_level, needs_confirm, reversible, tags)
  on conflict (owner_id, id) do nothing;

  -- 2. S09 22 new powers (L0/L0, max L2, tags=['personal'])
  insert into public.powers (
    owner_id, id, name, owner_squad, description,
    autonomy_default, autonomy_current, max_level, needs_confirm, reversible, tags
  )
  select v_owner, t.* from (values
    ('memory.list', 'Memory: list', 'S09', 'List owner memory, normal/private separated', 0, 0, 2, true, true, array['personal']),
    ('memory.get', 'Memory: get', 'S09', 'Read one owner memory', 0, 0, 2, true, true, array['personal']),
    ('memory.remember', 'Memory: remember', 'S09', 'Save owner-requested memory', 0, 0, 2, true, true, array['personal']),
    ('memory.update', 'Memory: update', 'S09', 'Update owner memory with sticky T2', 0, 0, 2, true, true, array['personal']),
    ('memory.stats', 'Memory: stats', 'S09', 'Read owner memory count summary', 0, 0, 2, true, true, array['personal']),
    ('workspace.notes.list', 'Workspace Notes: list', 'S09', 'List normal and private note placeholders separately', 0, 0, 2, true, true, array['personal']),
    ('workspace.notes.get', 'Workspace Notes: get', 'S09', 'Read one owner note', 0, 0, 2, true, true, array['personal']),
    ('workspace.notes.create', 'Workspace Notes: create', 'S09', 'Create a classified owner note', 0, 0, 2, true, true, array['personal']),
    ('workspace.notes.update', 'Workspace Notes: update', 'S09', 'Update a classified owner note; T2 is sticky', 0, 0, 2, true, true, array['personal']),
    ('workspace.notes.delete', 'Workspace Notes: delete', 'S09', 'Hard-delete an owner note after confirmation', 0, 0, 2, true, false, array['personal']),
    ('workspace.files.list', 'Workspace Files: list', 'S09', 'List private file placeholders only', 0, 0, 2, true, true, array['personal']),
    ('workspace.files.upload-url', 'Workspace Files: upload-url', 'S09', 'Create a private owner Storage upload URL', 0, 0, 2, true, true, array['personal']),
    ('workspace.files.complete-upload', 'Workspace Files: complete-upload', 'S09', 'Complete and quarantine owner file upload', 0, 0, 2, true, true, array['personal']),
    ('workspace.files.delete', 'Workspace Files: delete', 'S09', 'Delete owner private Storage object and metadata', 0, 0, 2, true, false, array['personal']),
    ('workspace.search', 'Workspace: search', 'S09', 'Search normal-tier owner notes only', 0, 0, 2, true, true, array['personal']),
    ('workspace.projects.list', 'Workspace Projects: list', 'S09', 'List normal and private project placeholders separately', 0, 0, 2, true, true, array['personal']),
    ('workspace.projects.get', 'Workspace Projects: get', 'S09', 'Read one owner project', 0, 0, 2, true, true, array['personal']),
    ('workspace.projects.create', 'Workspace Projects: create', 'S09', 'Create a classified owner project', 0, 0, 2, true, true, array['personal']),
    ('workspace.projects.update', 'Workspace Projects: update', 'S09', 'Update owner project; T2 is sticky', 0, 0, 2, true, true, array['personal']),
    ('workspace.projects.delete', 'Workspace Projects: delete', 'S09', 'Delete owner project after confirmation', 0, 0, 2, true, false, array['personal']),
    ('workspace.projects.link-item', 'Workspace Projects: link-item', 'S09', 'Link project to an owner memory/note/file/task/project', 0, 0, 2, true, true, array['personal']),
    ('workspace.projects.unlink-item', 'Workspace Projects: unlink-item', 'S09', 'Remove owner project link after confirmation', 0, 0, 2, true, true, array['personal'])
  ) as t(id, name, owner_squad, description, autonomy_default, autonomy_current, max_level, needs_confirm, reversible, tags)
  on conflict (owner_id, id) do nothing;

  -- 3. S09 normalize 3 existing memory powers per CR-2
  insert into public.powers (
    owner_id, id, name, owner_squad, description,
    autonomy_default, autonomy_current, max_level, needs_confirm, reversible, tags
  )
  select v_owner, t.* from (values
    ('memory.forget', 'Memory: forget', 'S09', 'Hard-delete a memory after confirmation', 0, 0, 2, true, false, array['personal']),
    ('memory.forget-all', 'Memory: forget everything (app tap only)', 'S09', 'Hard-delete all owner memories after fresh count + confirmation', 0, 0, 2, true, false, array['personal']),
    ('memory.export', 'Memory: export normal tier', 'S09', 'Export normal-tier memory only after confirmation', 0, 0, 2, true, false, array['personal'])
  ) as t(id, name, owner_squad, description, autonomy_default, autonomy_current, max_level, needs_confirm, reversible, tags)
  on conflict (owner_id, id) do update set
    owner_squad = excluded.owner_squad,
    description = excluded.description,
    autonomy_default = 0,
    autonomy_current = 0,
    max_level = 2,
    needs_confirm = true,
    reversible = false,
    tags = array['personal'];
end $$;

commit;
