import {
  runtimeConfig, resolveOwner, readBody, dbRows, requireReadPower,
  insertActivityRow, fail, success, withCookie, type RuntimeOptions, type Owner,
} from '../../activity-logs/src/runtime.ts';
import { logActivity } from '../../activity-logs/src/log-activity.ts';
import { isPrivateText } from '../../activity-logs/src/privacy.ts';
import { makeRegistry, type Power } from '../../../../packages/brain/src/power-registry.ts';
import { executePower } from '../../../../packages/harness/src/executor.ts';
import type { KillSwitchStore } from '../../../../packages/safety/src/index.ts';

export const actions = [
  'boards.list', 'boards.tasks.available', 'boards.create', 'boards.column.create',
  'boards.column.rename', 'boards.task.link', 'boards.task.move', 'boards.task.unlink', 'boards.delete',
] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type HandlerContext = RuntimeOptions & {
  insertActivity?: (row: Record<string, unknown>) => Promise<{ id?: string | number } | void>;
};
type BoardMutation = { ok: true; result: unknown } | { ok: false; status: number; code: string; message: string };
const DEFAULT_COLUMNS = ['To do', 'In progress', 'Done'];
const WHY: Record<string, string> = {
  'boards.create': 'Owner created a personal task board after power confirmation.',
  'boards.column.create': 'Owner added a board column after power confirmation.',
  'boards.column.rename': 'Owner renamed a board column after power confirmation.',
  'boards.task.link': 'Owner linked an existing safe task to a board after power confirmation.',
  'boards.task.move': 'Owner moved a board task card after power confirmation.',
  'boards.task.unlink': 'Owner removed a task link from a board after power confirmation.',
  'boards.delete': 'Owner deleted a personal board after power confirmation.',
};

function validUuid(value: unknown): value is string { return typeof value === 'string' && UUID.test(value); }
function privateLabel(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() && !isPrivateText(value) ? value.trim().slice(0, 80) : fallback;
}
function safeTask(row: Record<string, any>) {
  const isPrivate = isPrivateText(row.title) || (typeof row.notes === 'string' && isPrivateText(row.notes));
  return {
    id: String(row.id),
    title: isPrivate ? 'Private task' : (typeof row.title === 'string' ? row.title : 'Untitled task'),
    private: isPrivate,
    ...(isPrivate ? {} : {
      status: ['todo', 'doing', 'done', 'cancelled'].includes(row.status) ? row.status : 'todo',
      priority: Number.isInteger(row.priority) && row.priority >= 1 && row.priority <= 3 ? row.priority : 2,
      due_at: typeof row.due_at === 'string' ? row.due_at : null,
    }),
  };
}
async function writeActivity(
  action: string, owner: Owner, config: NonNullable<ReturnType<typeof runtimeConfig>>,
  context: HandlerContext, why: string, ok: boolean, result: string, powerId?: string, decisionId?: string,
) {
  return logActivity({
    actor: 'owner', action, target: 'project', why,
    detail: { result, ...(powerId ? { power_id: powerId } : {}), ...(decisionId ? { decision_id: decisionId } : {}) },
    ok, decision_id: decisionId ?? null,
  }, { insert: (row) => context.insertActivity ? context.insertActivity(row) : insertActivityRow(config, owner, row) });
}
async function readAudit(action: string, owner: Owner, config: NonNullable<ReturnType<typeof runtimeConfig>>, context: HandlerContext) {
  const why = action === 'boards.list' ? 'Owner viewed personal boards and safe task-card projections.' : 'Owner viewed safe tasks available for a board.';
  const logged = await writeActivity(action, owner, config, context, why, true, 'viewed');
  return logged.ok;
}

async function runPoweredMutation(args: {
  action: string; powerId: string; confirmed: boolean; owner: Owner;
  config: NonNullable<ReturnType<typeof runtimeConfig>>; context: HandlerContext;
  run: (decisionId: string) => Promise<unknown>;
}): Promise<BoardMutation> {
  const { action, powerId, confirmed, owner, config, context, run } = args;
  const why = WHY[action];
  let registry;
  try {
    const rows = await dbRows(config, owner, 'powers', {
      select: 'id,name,owner_squad,description,autonomy_default,autonomy_current,max_level,needs_confirm,reversible,tags',
      owner_id: `eq.${owner.user.id}`,
    });
    registry = makeRegistry(rows as Power[]);
  } catch {
    return { ok: false, status: 503, code: 'unavailable', message: 'Power registry unavailable; board action blocked.' };
  }
  const power = registry.get(powerId);
  let decisionId = '';
  try {
    const intents = await dbRows(config, owner, 'decisions', {}, {
      method: 'POST', prefer: 'return=representation', body: {
        power_id: powerId, level: power?.autonomy_current ?? 0, request: action,
        why, result: 'intent_recorded',
      },
    });
    if (!intents[0]?.id) throw new Error('missing intent id');
    decisionId = String(intents[0].id);
  } catch {
    return { ok: false, status: 503, code: 'unavailable', message: 'Decision intent could not be recorded; action blocked.' };
  }

  // Pre-write a metadata-only activity intent. If this fails, no mutation is attempted.
  const activityIntent = await writeActivity(action, owner, config, context, why, false, 'intent_recorded', powerId, decisionId);
  if (!activityIntent.ok) return { ok: false, status: 503, code: 'unavailable', message: 'Activity intent could not be recorded; action blocked.' };

  const store: KillSwitchStore = {
    async read(ownerId: string) {
      if (ownerId !== owner.user.id) return null;
      const rows = await dbRows(config, owner, 'system_state', {
        select: 'kill,epoch,changed_at', id: 'eq.1', owner_id: `eq.${owner.user.id}`, limit: '1',
      });
      const row = rows[0];
      if (!row || typeof row.kill !== 'boolean' || !Number.isInteger(row.epoch) || row.epoch < 0) return null;
      return { kill: row.kill, epoch: row.epoch, changed_at: row.changed_at };
    },
    async write() { throw new Error('Boards cannot change the kill switch.'); },
  };

  const outcome = await executePower({
    reg: registry, powerId, store, ownerId: owner.user.id, confirmed,
    run: () => run(decisionId),
    onDecisionLog: async (entry) => {
      const rows = await dbRows(config, owner, 'decisions', { id: `eq.${decisionId}`, owner_id: `eq.${owner.user.id}` }, {
        method: 'PATCH', body: { result: entry.executed ? 'executed' : 'blocked', why }, prefer: 'return=minimal',
      });
      void rows;
    },
  });
  if (!outcome.executed) {
    try {
      await dbRows(config, owner, 'activity_log', { decision_id: `eq.${decisionId}`, owner_id: `eq.${owner.user.id}` }, {
        method: 'PATCH', body: { ok: false }, prefer: 'return=minimal',
      });
    } catch { /* the intent row was already persisted before gating */ }
    if (outcome.gate.mode === 'ask_confirm' && !confirmed) {
      return { ok: false, status: 409, code: 'confirmation_required', message: 'L2 board action ke liye explicit confirmation chahiye.' };
    }
    if (outcome.error?.message === 'private_task') return { ok: false, status: 409, code: 'private_content', message: 'Private task cannot be linked to a board.' };
    if (outcome.error?.message === 'task_already_linked') return { ok: false, status: 409, code: 'conflict', message: 'Task already linked to this board.' };
    if (outcome.error?.message === 'board column or task not found' || outcome.error?.message === 'board not found' || outcome.error?.message === 'column not found' || outcome.error?.message === 'link or column not found') return { ok: false, status: 404, code: 'not_found', message: 'Board, column or task was not found.' };
    if (outcome.error) return { ok: false, status: 503, code: 'unavailable', message: 'Board action failed; refresh before retrying.' };
    return { ok: false, status: 403, code: 'forbidden', message: `Board action blocked by safety gate: ${outcome.gate.reason}` };
  }
  try {
    await dbRows(config, owner, 'activity_log', { decision_id: `eq.${decisionId}`, owner_id: `eq.${owner.user.id}` }, {
      method: 'PATCH', body: { ok: true }, prefer: 'return=minimal',
    });
  } catch {
    // A durable intent remains in activity_log even if the success flag cannot be updated.
  }
  return { ok: true, result: outcome.result };
}

async function listBoards(owner: Owner, config: NonNullable<ReturnType<typeof runtimeConfig>>) {
  const boards = await dbRows(config, owner, 's10_boards', {
    select: 'id,name,created_at,updated_at', owner_id: `eq.${owner.user.id}`, order: 'created_at.desc', limit: '50',
  });
  if (!boards.length) return [];
  const boardIds = boards.map((row) => String(row.id));
  const columns = await dbRows(config, owner, 's10_board_columns', {
    select: 'id,board_id,name,position', owner_id: `eq.${owner.user.id}`,
    board_id: `in.(${boardIds.join(',')})`, order: 'position.asc', limit: '250',
  });
  const links = await dbRows(config, owner, 's10_board_task_links', {
    select: 'id,board_id,column_id,task_id,position', owner_id: `eq.${owner.user.id}`,
    board_id: `in.(${boardIds.join(',')})`, order: 'position.asc', limit: '500',
  });
  const taskIds = [...new Set(links.map((row) => String(row.task_id)))];
  const tasks = taskIds.length ? await dbRows(config, owner, 'tasks', {
    select: 'id,title,notes,status,priority,due_at', owner_id: `eq.${owner.user.id}`,
    id: `in.(${taskIds.join(',')})`, limit: String(Math.min(taskIds.length, 500)),
  }) : [];
  const taskMap = new Map(tasks.map((row) => [String(row.id), safeTask(row)]));
  return boards.map((board) => {
    const boardColumns = columns.filter((col) => String(col.board_id) === String(board.id)).map((column) => ({
      id: String(column.id), name: privateLabel(column.name, 'Private column'), position: Number(column.position) || 0,
      cards: links.filter((link) => String(link.column_id) === String(column.id)).flatMap((link) => {
        const task = taskMap.get(String(link.task_id));
        return task ? [task.private ? task : { link_id: String(link.id), ...task }] : [];
      }),
    }));
    return {
      id: String(board.id), name: privateLabel(board.name, 'Private board'),
      created_at: board.created_at, updated_at: board.updated_at, columns: boardColumns,
    };
  });
}

async function availableTasks(owner: Owner, config: NonNullable<ReturnType<typeof runtimeConfig>>) {
  const rows = await dbRows(config, owner, 'tasks', {
    select: 'id,title,notes,status,priority,due_at', owner_id: `eq.${owner.user.id}`,
    status: 'in.(todo,doing)', order: 'updated_at.desc', limit: '100',
  });
  return rows.filter((row) => !isPrivateText(row.title) && !(typeof row.notes === 'string' && isPrivateText(row.notes))).map(safeTask);
}

/** Plain, owner-only action module mounted in the existing shared /api/tasks function. */
export async function handle(action: string, request: Request, context: HandlerContext = {}): Promise<Response> {
  if (!(actions as readonly string[]).includes(action)) return fail(404, 'not_found', 'Unknown boards action.');
  if (request.method !== 'POST') return fail(405, 'bad_request', 'Use POST.');
  const config = runtimeConfig(context);
  if (!config) return fail(503, 'unavailable', 'Boards API is not configured.');
  const auth = await resolveOwner(request, context, config);
  if (!auth.ok) return withCookie(auth.response, auth.clearCookie);
  const owner = auth.owner;
  const body = await readBody(request);
  if (!body) return withCookie(fail(400, 'bad_request', 'Invalid request body.'), owner.setCookie);

  if (body.confirmed !== undefined && typeof body.confirmed !== 'boolean') return withCookie(fail(400, 'bad_request', 'confirmed must be boolean.'), owner.setCookie);

  const readActions = ['boards.list', 'boards.tasks.available'];
  if (readActions.includes(action)) {
    const gate = await requireReadPower(config, owner, 'boards.read', body.confirmed === true);
    if (!gate.ok) return withCookie(fail(gate.status, gate.code, gate.message), owner.setCookie);
    try {
      const data = action === 'boards.list' ? await listBoards(owner, config) : await availableTasks(owner, config);
      if (!await readAudit(action, owner, config, context)) return withCookie(fail(503, 'unavailable', 'Board read could not be recorded; request blocked.'), owner.setCookie);
      return withCookie(success(action === 'boards.list' ? { boards: data } : { tasks: data }), owner.setCookie);
    } catch {
      return withCookie(fail(503, 'unavailable', 'Board projection is temporarily unavailable.'), owner.setCookie);
    }
  }

  let powerId = action;
  let run: (decisionId: string) => Promise<unknown>;

  if (action === 'boards.create') {
    if (typeof body.name !== 'string' || body.name.trim().length < 1 || body.name.trim().length > 60 || isPrivateText(body.name)) {
      return withCookie(fail(400, 'bad_request', 'Board name must be 1..60 characters and must not contain private text.'), owner.setCookie);
    }
    const name = body.name.trim();
    run = async () => {
      const made = await dbRows(config, owner, 's10_boards', {}, { method: 'POST', body: { owner_id: owner.user.id, name }, prefer: 'return=representation' });
      if (!made[0]?.id) throw new Error('board insert returned no row');
      const board = made[0];
      try {
        await dbRows(config, owner, 's10_board_columns', {}, {
          method: 'POST', prefer: 'return=minimal',
          body: DEFAULT_COLUMNS.map((column, index) => ({ owner_id: owner.user.id, board_id: board.id, name: column, position: index })),
        });
      } catch (error) {
        await dbRows(config, owner, 's10_boards', { id: `eq.${board.id}`, owner_id: `eq.${owner.user.id}` }, { method: 'DELETE' });
        throw error;
      }
      return { board: { id: String(board.id), name } };
    };
  } else if (action === 'boards.column.create') {
    if (!validUuid(body.board_id) || typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 40 || isPrivateText(body.name)) {
      return withCookie(fail(400, 'bad_request', 'board_id or column name is invalid.'), owner.setCookie);
    }
    run = async () => {
      const board = await dbRows(config, owner, 's10_boards', { select: 'id', id: `eq.${body.board_id}`, owner_id: `eq.${owner.user.id}`, limit: '1' });
      if (!board[0]) throw new Error('board not found');
      const current = await dbRows(config, owner, 's10_board_columns', { select: 'position', board_id: `eq.${body.board_id}`, owner_id: `eq.${owner.user.id}`, order: 'position.desc', limit: '1' });
      const position = (Number(current[0]?.position) || -1) + 1;
      const rows = await dbRows(config, owner, 's10_board_columns', {}, { method: 'POST', body: { owner_id: owner.user.id, board_id: body.board_id, name: body.name.trim(), position }, prefer: 'return=representation' });
      if (!rows[0]?.id) throw new Error('column insert returned no row');
      return { column: { id: String(rows[0].id), name: body.name.trim(), position } };
    };
  } else if (action === 'boards.column.rename') {
    if (!validUuid(body.column_id) || typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 40 || isPrivateText(body.name)) {
      return withCookie(fail(400, 'bad_request', 'column_id or column name is invalid.'), owner.setCookie);
    }
    run = async () => {
      const rows = await dbRows(config, owner, 's10_board_columns', { select: 'id', id: `eq.${body.column_id}`, owner_id: `eq.${owner.user.id}`, limit: '1' });
      if (!rows[0]) throw new Error('column not found');
      await dbRows(config, owner, 's10_board_columns', { id: `eq.${body.column_id}`, owner_id: `eq.${owner.user.id}` }, { method: 'PATCH', body: { name: body.name.trim() }, prefer: 'return=minimal' });
      return { renamed: true };
    };
  } else if (action === 'boards.task.link') {
    if (!validUuid(body.board_id) || !validUuid(body.column_id) || !validUuid(body.task_id)) return withCookie(fail(400, 'bad_request', 'board_id, column_id or task_id is invalid.'), owner.setCookie);
    run = async () => {
      const [column, task] = await Promise.all([
        dbRows(config, owner, 's10_board_columns', { select: 'id,board_id', id: `eq.${body.column_id}`, board_id: `eq.${body.board_id}`, owner_id: `eq.${owner.user.id}`, limit: '1' }),
        dbRows(config, owner, 'tasks', { select: 'id,title,notes', id: `eq.${body.task_id}`, owner_id: `eq.${owner.user.id}`, limit: '1' }),
      ]);
      if (!column[0] || !task[0]) throw new Error('board column or task not found');
      if (isPrivateText(task[0].title) || (typeof task[0].notes === 'string' && isPrivateText(task[0].notes))) throw new Error('private_task');
      const existing = await dbRows(config, owner, 's10_board_task_links', { select: 'id', board_id: `eq.${body.board_id}`, task_id: `eq.${body.task_id}`, owner_id: `eq.${owner.user.id}`, limit: '1' });
      if (existing[0]) throw new Error('task_already_linked');
      const rows = await dbRows(config, owner, 's10_board_task_links', {}, { method: 'POST', body: { owner_id: owner.user.id, board_id: body.board_id, column_id: body.column_id, task_id: body.task_id, position: 0 }, prefer: 'return=representation' });
      return { link_id: rows[0]?.id ? String(rows[0].id) : null };
    };
  } else if (action === 'boards.task.move') {
    if (!validUuid(body.link_id) || !validUuid(body.column_id)) return withCookie(fail(400, 'bad_request', 'link_id or column_id is invalid.'), owner.setCookie);
    run = async () => {
      const link = await dbRows(config, owner, 's10_board_task_links', { select: 'id,board_id', id: `eq.${body.link_id}`, owner_id: `eq.${owner.user.id}`, limit: '1' });
      const column = await dbRows(config, owner, 's10_board_columns', { select: 'id,board_id', id: `eq.${body.column_id}`, owner_id: `eq.${owner.user.id}`, limit: '1' });
      if (!link[0] || !column[0] || String(link[0].board_id) !== String(column[0].board_id)) throw new Error('link or column not found');
      await dbRows(config, owner, 's10_board_task_links', { id: `eq.${body.link_id}`, owner_id: `eq.${owner.user.id}` }, { method: 'PATCH', body: { column_id: body.column_id, position: 0 }, prefer: 'return=minimal' });
      return { moved: true };
    };
  } else if (action === 'boards.task.unlink') {
    if (!validUuid(body.link_id)) return withCookie(fail(400, 'bad_request', 'link_id is invalid.'), owner.setCookie);
    run = async () => {
      await dbRows(config, owner, 's10_board_task_links', { id: `eq.${body.link_id}`, owner_id: `eq.${owner.user.id}` }, { method: 'DELETE' });
      return { unlinked: true };
    };
  } else if (action === 'boards.delete') {
    if (!validUuid(body.board_id)) return withCookie(fail(400, 'bad_request', 'board_id is invalid.'), owner.setCookie);
    run = async () => {
      await dbRows(config, owner, 's10_boards', { id: `eq.${body.board_id}`, owner_id: `eq.${owner.user.id}` }, { method: 'DELETE' });
      return { deleted: true };
    };
  } else {
    return withCookie(fail(404, 'not_found', 'Unknown boards action.'), owner.setCookie);
  }

  const outcome = await runPoweredMutation({
    action, powerId, confirmed: body.confirmed === true, owner, config, context, run,
  });
  if (!outcome.ok) {
    return withCookie(fail(outcome.status, outcome.code, outcome.message), owner.setCookie);
  }
  return withCookie(success(outcome.result), owner.setCookie);
}
