-- P34c S22 Powers Seed (FILE ONLY — PROPOSAL; DO NOT APPLY TO DB UNTIL AMIT APPROVES).
-- Registers the 9 S10 Insights + Boards powers from CR_S10_S22_POWERS_2026-11-23.md using the v2 3-class taxonomy:
--   A) own-data reads (2): L4/max4, needs_confirm=false, reversible=true, tags empty
--   B) small reversible writes (5): L3/max4, needs_confirm=false, reversible=true, tags empty
--   C) destructive/unlink/delete (2): L2/max2, needs_confirm=true, reversible=false, tags=['personal']
-- Does NOT include system.power-off.

begin;

do $$
declare
  v_owner uuid := (select id from auth.users order by created_at limit 1);
begin
  if v_owner is null then
    raise exception 'no owner user yet';
  end if;

  -- A) own-data reads: L4 silent
  insert into public.powers (
    owner_id, id, name, owner_squad, description,
    autonomy_default, autonomy_current, max_level, needs_confirm, reversible, tags
  )
  select v_owner, t.* from (values
    ('insights.read', 'Insights: read aggregate metadata', 'S10', 'Read owner task/activity aggregate counts without private text', 4, 4, 4, false, true, '{}'::text[]),
    ('boards.read', 'Boards: read boards and safe task cards', 'S10', 'Read owner boards, columns, and masked task-card projections', 4, 4, 4, false, true, '{}'::text[])
  ) as t(id, name, owner_squad, description, autonomy_default, autonomy_current, max_level, needs_confirm, reversible, tags)
  on conflict (owner_id, id) do nothing;

  -- B) small reversible writes: L3 act then tell
  insert into public.powers (
    owner_id, id, name, owner_squad, description,
    autonomy_default, autonomy_current, max_level, needs_confirm, reversible, tags
  )
  select v_owner, t.* from (values
    ('boards.create', 'Boards: create board', 'S10', 'Create a personal task board with default columns', 3, 3, 4, false, true, '{}'::text[]),
    ('boards.column.create', 'Boards: create column', 'S10', 'Add a column to an owner board', 3, 3, 4, false, true, '{}'::text[]),
    ('boards.column.rename', 'Boards: rename column', 'S10', 'Rename an owner board column', 3, 3, 4, false, true, '{}'::text[]),
    ('boards.task.link', 'Boards: link task', 'S10', 'Link an existing safe owner task to a board column', 3, 3, 4, false, true, '{}'::text[]),
    ('boards.task.move', 'Boards: move task card', 'S10', 'Move an existing board task link between columns', 3, 3, 4, false, true, '{}'::text[])
  ) as t(id, name, owner_squad, description, autonomy_default, autonomy_current, max_level, needs_confirm, reversible, tags)
  on conflict (owner_id, id) do nothing;

  -- C) destructive / unlink / delete: L2 ask every time
  insert into public.powers (
    owner_id, id, name, owner_squad, description,
    autonomy_default, autonomy_current, max_level, needs_confirm, reversible, tags
  )
  select v_owner, t.* from (values
    ('boards.task.unlink', 'Boards: unlink task', 'S10', 'Remove a task link from a board after confirmation', 2, 2, 2, true, false, array['personal']),
    ('boards.delete', 'Boards: delete board', 'S10', 'Hard-delete an owner board and its columns/links after confirmation', 2, 2, 2, true, false, array['personal'])
  ) as t(id, name, owner_squad, description, autonomy_default, autonomy_current, max_level, needs_confirm, reversible, tags)
  on conflict (owner_id, id) do nothing;
end $$;

commit;
