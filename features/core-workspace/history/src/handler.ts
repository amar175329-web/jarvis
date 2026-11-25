import {
  runtimeConfig, resolveOwner, readBody, dbRows, requireReadPower,
  insertActivityRow, fail, success, withCookie, type RuntimeOptions, type Owner,
} from '../../activity-logs/src/runtime.ts';
import { logActivity } from '../../activity-logs/src/log-activity.ts';
import { isPrivateText, PRIVATE_MESSAGE_LABEL } from '../../activity-logs/src/privacy.ts';

export const actions = ['history.threads.list', 'history.messages.list'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_THREADS = 50;
const MAX_MESSAGES = 100;

type HandlerContext = RuntimeOptions & {
  /** Test seam only; production callers omit it and use the authenticated PostgREST insert. */
  insertActivity?: (row: Record<string, unknown>) => Promise<{ id?: string | number } | void>;
};
function isLimit(value: unknown, max: number): value is number {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= max;
}
function safeThread(row: Record<string, any>) {
  const privateTitle = typeof row.title === 'string' && isPrivateText(row.title);
  return {
    id: String(row.id),
    title: privateTitle ? 'Private conversation' : (typeof row.title === 'string' && row.title.trim() ? row.title : 'Untitled conversation'),
    private: privateTitle,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
function safeMessage(row: Record<string, any>) {
  const privateMessage = isPrivateText(row.content);
  return {
    id: String(row.id),
    thread_id: String(row.thread_id),
    role: row.role === 'assistant' ? 'assistant' : 'user',
    content: privateMessage ? PRIVATE_MESSAGE_LABEL : String(row.content),
    private: privateMessage,
    sequence: Number(row.sequence),
    created_at: row.created_at,
  };
}
async function audit(action: string, owner: Owner, config: NonNullable<ReturnType<typeof runtimeConfig>>, context: HandlerContext, details: Record<string, unknown>) {
  return logActivity({
    actor: 'owner',
    action,
    target: action.startsWith('history.messages') ? 'chat_thread' : 'chat_history',
    why: action === 'history.messages.list' ? 'Owner opened a redacted chat history thread.' : 'Owner opened the chat history list.',
    detail: details,
    ok: true,
  }, {
    insert: (row) => context.insertActivity ? context.insertActivity(row) : insertActivityRow(config, owner, row),
  });
}

/** Plain action module mounted by LEAD in the existing shared API function (no api/ file). */
export async function handle(action: string, request: Request, context: HandlerContext = {}): Promise<Response> {
  if (!(actions as readonly string[]).includes(action)) return fail(404, 'not_found', 'Unknown history action.');
  if (request.method !== 'POST') return fail(405, 'bad_request', 'Use POST.');
  const config = runtimeConfig(context);
  if (!config) return fail(503, 'unavailable', 'History API is not configured.');
  const auth = await resolveOwner(request, context, config);
  if (!auth.ok) return withCookie(auth.response, auth.clearCookie);
  const owner = auth.owner;
  const body = await readBody(request);
  if (!body) return withCookie(fail(400, 'bad_request', 'Invalid request body.'), owner.setCookie);

  const readGate = await requireReadPower(config, owner, 'history.read', body.confirmed === true);
  if (!readGate.ok) return withCookie(fail(readGate.status, readGate.code, readGate.message), owner.setCookie);

  try {
    if (action === 'history.threads.list') {
      const limit = body.limit === undefined ? 30 : body.limit;
      if (!isLimit(limit, MAX_THREADS)) return withCookie(fail(400, 'bad_request', 'limit must be 1..50.'), owner.setCookie);
      const query: Record<string, string> = {
        select: 'id,title,created_at,updated_at',
        owner_id: `eq.${owner.user.id}`,
        order: 'updated_at.desc',
        limit: String(limit + 1),
      };
      if (typeof body.before === 'string') {
        if (!Number.isFinite(Date.parse(body.before))) return withCookie(fail(400, 'bad_request', 'before must be an ISO timestamp.'), owner.setCookie);
        query.updated_at = `lt.${body.before}`;
      }
      const rows = await dbRows(config, owner, 'chat_threads', query);
      const page = rows.slice(0, limit);
      const next_before = rows.length > limit ? page[page.length - 1]?.updated_at : undefined;
      const logged = await audit(action, owner, config, context, { count: page.length, limit });
      if (!logged.ok) return withCookie(fail(503, 'unavailable', 'History access could not be recorded; request blocked.'), owner.setCookie);
      return withCookie(success({ threads: page.map(safeThread), ...(next_before ? { next_before } : {}) }), owner.setCookie);
    }

    const threadId = body.thread_id;
    const limit = body.limit === undefined ? 50 : body.limit;
    if (typeof threadId !== 'string' || !UUID.test(threadId) || !isLimit(limit, MAX_MESSAGES)) {
      return withCookie(fail(400, 'bad_request', 'thread_id or limit is invalid.'), owner.setCookie);
    }
    const threadRows = await dbRows(config, owner, 'chat_threads', {
      select: 'id', id: `eq.${threadId}`, owner_id: `eq.${owner.user.id}`, limit: '1',
    });
    if (!threadRows[0]) return withCookie(fail(404, 'not_found', 'Conversation not found.'), owner.setCookie);
    const query: Record<string, string> = {
      select: 'id,thread_id,role,content,sequence,created_at',
      thread_id: `eq.${threadId}`,
      owner_id: `eq.${owner.user.id}`,
      status: 'eq.done',
      order: 'sequence.desc',
      limit: String(limit + 1),
    };
    if (body.before_sequence !== undefined) {
      const before = Number(body.before_sequence);
      if (!Number.isSafeInteger(before) || before < 0) return withCookie(fail(400, 'bad_request', 'before_sequence is invalid.'), owner.setCookie);
      query.sequence = `lt.${before}`;
    }
    const rows = await dbRows(config, owner, 'chat_messages', query);
    const page = rows.slice(0, limit).reverse();
    const next_before_sequence = rows.length > limit ? page[0]?.sequence : undefined;
    const logged = await audit(action, owner, config, context, { count: page.length, limit });
    if (!logged.ok) return withCookie(fail(503, 'unavailable', 'History access could not be recorded; request blocked.'), owner.setCookie);
    return withCookie(success({
      messages: page.map(safeMessage),
      ...(next_before_sequence !== undefined ? { next_before_sequence } : {}),
    }), owner.setCookie);
  } catch {
    return withCookie(fail(503, 'unavailable', 'History is temporarily unavailable.'), owner.setCookie);
  }
}
