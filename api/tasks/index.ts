import { readOwnerSession, clearSessionCookie } from '../auth/index.ts';
import { makeRegistry, type Power } from '../../packages/brain/src/power-registry.ts';
import { executePower } from '../../packages/harness/src/executor.ts';
import type { KillSwitchStore } from '../../packages/safety/src/index.ts';
import { parseNaturalLanguage } from '../../features/core-workspace/task-manager/src/natural-language.mjs';
import { classifySensitivity } from '../../features/core-workspace/task-manager/src/sensitivity.mjs';
import { consumeMedicineReminderRequest } from '../../features/core-workspace/reminders/src/memory-handoff.mjs';
import { nextOccurrenceAfter } from '../../features/core-workspace/reminders/src/time-recurrence.mjs';
import type { MedicineReminderRequest } from '../../packages/memory/src/service.ts';

const TIME_ZONE = 'Asia/Kolkata';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TASK_SELECT = 'id,title,notes,due_at,status,priority,focus_today,source,repeat_rule,time_zone,created_at,updated_at,completed_at';
const REMINDER_SELECT = 'id,text,remind_at,repeat_rule,time_zone,state,task_id,created_at,fired_at';

type Options = { env?: Record<string, string | undefined>; fetch?: typeof fetch };
type Config = { url: string; anonKey: string; env: Record<string, string | undefined>; fetcher: typeof fetch };
type Owner = { user: { id: string; email: string }; accessToken: string; setCookie?: string };
type Row = Record<string, any>;
class RequestTooLargeError extends Error {}

function config(options: Options): Config | null {
  const env = options.env ?? process.env;
  const url = env.SUPABASE_URL?.replace(/\/$/, '');
  const anonKey = env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey, env, fetcher: options.fetch ?? fetch };
}
function response(status: number, body: unknown, headers: HeadersInit = {}) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store', ...Object.fromEntries(new Headers(headers).entries()) } });
}
function fail(status: number, code: string, message: string) {
  return response(status, { ok: false, error: { code, message } });
}
function success(data: unknown, status = 200) { return response(status, { ok: true, data }); }
function withCookie(res: Response, cookie?: string) {
  if (!cookie) return res;
  const headers = new Headers(res.headers); headers.set('set-cookie', cookie);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
async function bodyJson(request: Request): Promise<Row | null> {
  const length = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(length) && length > 12_000) throw new RequestTooLargeError('request body too large');
  let raw: string;
  try { raw = await request.text(); } catch { return null; }
  if (new TextEncoder().encode(raw).length > 12_000) throw new RequestTooLargeError('request body too large');
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : null;
  } catch { return null; }
}
function isIso(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value)) && value.includes('T');
}
function isRepeat(value: unknown): value is string | null {
  return value === null || ['FREQ=DAILY', 'FREQ=WEEKLY', 'FREQ=MONTHLY', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'].includes(String(value).toUpperCase());
}
function isPriority(value: unknown): value is 1 | 2 | 3 { return value === 1 || value === 2 || value === 3; }
function isTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 64) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(new Date()); return true; } catch { return false; }
}
function privacyConfirmation(cookie?: string) {
  return withCookie(response(409, { ok: false, error: { code: 'privacy_confirmation', message: 'yeh private hai? abhi sirf normal reminders save hote hain' } }), cookie);
}

async function db(c: Config, owner: Owner, table: string, query: Record<string, string> = {}, options: { method?: string; body?: unknown; prefer?: string } = {}): Promise<Row[]> {
  const url = new URL(`${c.url}/rest/v1/${table}`);
  url.search = new URLSearchParams(query).toString();
  const headers: Record<string, string> = { apikey: c.anonKey, Authorization: `Bearer ${owner.accessToken}`, Accept: 'application/json' };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.prefer) headers.Prefer = options.prefer;
  const result = await c.fetcher(url, { method: options.method ?? 'GET', headers, ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}) });
  if (!result.ok) throw new Error(`database request failed (${result.status})`);
  if (result.status === 204) return [];
  const raw = await result.text();
  if (!raw.trim()) return [];
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error('database response shape invalid');
  return data as Row[];
}

function localDate(value: string | Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}
function todayString(now = new Date()) { return localDate(now); }
function safeTask(row: Row) {
  return { id: row.id, title: row.title, due_at: row.due_at ?? null, status: row.status, priority: row.priority, focus_today: Boolean(row.focus_today), repeat_rule: row.repeat_rule ?? null, time_zone: row.time_zone ?? TIME_ZONE };
}
function safeReminder(row: Row) {
  return { id: row.id, text: row.text, remind_at: row.remind_at, repeat_rule: row.repeat_rule ?? null, time_zone: row.time_zone ?? TIME_ZONE, state: row.state };
}

async function loadPowers(c: Config, owner: Owner) {
  const rows = await db(c, owner, 'powers', { select: 'id,name,owner_squad,description,autonomy_default,autonomy_current,max_level,needs_confirm,reversible,tags' });
  return makeRegistry(rows as Power[]);
}
function killStore(c: Config, owner: Owner): KillSwitchStore {
  return {
    async read(ownerId: string) {
      const rows = await db(c, owner, 'system_state', { select: 'kill,epoch,changed_at', id: 'eq.1', limit: '1' });
      const row = rows[0];
      if (!row || typeof row.kill !== 'boolean' || !Number.isInteger(row.epoch) || row.epoch < 0 || ownerId !== owner.user.id) return null;
      return { kill: row.kill, epoch: row.epoch, changed_at: row.changed_at };
    },
    async write() { throw new Error('task/reminder API cannot change the kill switch'); },
  };
}

/** Pre-write a minimal intent audit row; no title, medicine label, or reminder text is logged. */
async function runMutation<T>(args: {
  c: Config; owner: Owner; powerId: string; why: string; confirmed: boolean; run: (context: { decisionId: string }) => Promise<T>;
}): Promise<{ ok: true; result: T } | { ok: false; status: number; code: string; message: string }> {
  const { c, owner, powerId, why, confirmed, run } = args;
  let registry;
  try { registry = await loadPowers(c, owner); }
  catch { return { ok: false, status: 503, code: 'unavailable', message: 'Power registry read nahi ho paayi; action block hai.' }; }
  const power = registry.get(powerId);
  let auditId: string;
  try {
    const intents = await db(c, owner, 'decisions', {}, { method: 'POST', body: {
      power_id: powerId, level: power?.autonomy_current ?? 0, request: powerId,
      why: why.slice(0, 240), result: 'intent_recorded',
    }, prefer: 'return=representation' });
    if (!intents[0]?.id) throw new Error('intent audit row missing');
    auditId = intents[0].id;
  } catch {
    return { ok: false, status: 503, code: 'unavailable', message: 'Action log save nahi hua; action block hai.' };
  }
  const outcome = await executePower<T>({
    reg: registry, powerId, store: killStore(c, owner), ownerId: owner.user.id, confirmed, run: () => run({ decisionId: auditId }),
    onDecisionLog: async (entry) => {
      await db(c, owner, 'decisions', { id: `eq.${auditId}` }, { method: 'PATCH', body: {
        result: entry.executed ? 'executed' : 'blocked',
        why: why.slice(0, 240),
      }, prefer: 'return=minimal' });
    },
  });
  if (!outcome.executed) {
    if (outcome.gate.mode === 'ask_confirm' && !confirmed) {
      return { ok: false, status: 409, code: 'confirmation_required', message: 'L2 power requires explicit confirmation: pehle confirm karo (confirmed: true).' };
    }
    if (outcome.error) return { ok: false, status: 503, code: 'unavailable', message: 'Action complete nahi hui; safe retry se pehle status refresh karo.' };
    const reason = outcome.gate.reason;
    return { ok: false, status: 403, code: 'forbidden', message: `JARVIS safety gate ne action roka: ${reason}` };
  }
  return { ok: true, result: outcome.result as T };
}

function validateTaskInput(body: Row) {
  if (body.private === true || body.privacy_tier === 'T2' || body.privacy_tier === 'T3') return null;
  if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 500) return null;
  if (body.due_at !== undefined && body.due_at !== null && !isIso(body.due_at)) return null;
  if (body.priority !== undefined && !isPriority(body.priority)) return null;
  if (body.repeat_rule !== undefined && !isRepeat(body.repeat_rule)) return null;
  if (body.repeat_rule && !body.due_at) return null;
  if ((typeof body.title === 'string' && classifySensitivity(body.title).sensitive) || (body.notes !== undefined && body.notes !== null && classifySensitivity(body.notes).sensitive)) return null;
  if (body.time_zone !== undefined && !isTimeZone(body.time_zone)) return null;
  return { title: body.title.trim(), notes: typeof body.notes === 'string' ? body.notes.slice(0, 4000) : null, due_at: body.due_at ?? null, priority: isPriority(body.priority) ? body.priority : 2, focus_today: body.focus_today === true, repeat_rule: body.repeat_rule ?? null, time_zone: isTimeZone(body.time_zone) ? body.time_zone : TIME_ZONE, source: 'amit', status: 'todo' };
}

async function createReminder(c: Config, owner: Owner, body: Row, decisionId: string) {
  if (body.task_id !== undefined && !UUID.test(String(body.task_id))) throw new Error('invalid reminder task link');
  if (body.task_id) {
    const linkedTask = await db(c, owner, 'tasks', { id: `eq.${body.task_id}`, select: 'id', limit: '1' });
    if (!linkedTask[0]) throw new Error('reminder task link must belong to the signed-in owner');
  }
  if (body.private === true || body.is_private === true || body.privacy_tier === 'T2' || body.privacy_tier === 'T3' || body.memory_id || body.display_text || classifySensitivity(body.text).sensitive) throw new Error('private reminder requires the approved T2 vault; plaintext reminder storage is blocked');
  if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 500 || !isIso(body.remind_at) || !isRepeat(body.repeat_rule ?? null)) throw new Error('invalid reminder payload');
  if (body.time_zone !== undefined && !isTimeZone(body.time_zone)) throw new Error('invalid reminder time zone');
  const rows = await db(c, owner, 'reminders', {}, { method: 'POST', body: {
    text: body.text.trim(), remind_at: body.remind_at, repeat_rule: body.repeat_rule ?? null, time_zone: isTimeZone(body.time_zone) ? body.time_zone : TIME_ZONE, state: 'pending', approved_decision_id: decisionId,
    ...(UUID.test(String(body.task_id ?? '')) ? { task_id: body.task_id } : {}),
  }, prefer: 'return=representation' });
  const reminder = rows[0];
  if (!reminder?.id) throw new Error('reminder insert returned no row');
  try {
    await db(c, owner, 'jobs', {}, { method: 'POST', body: {
      kind: 'reminders.fire', payload: { reminder_id: reminder.id }, state: 'queued', run_at: body.remind_at,
      idempotency_key: `reminders.fire:${reminder.id}:${body.remind_at}`, max_attempts: 5,
    }, prefer: 'return=minimal' });
  } catch {
    await db(c, owner, 'reminders', { id: `eq.${reminder.id}` }, { method: 'PATCH', body: { state: 'cancelled' }, prefer: 'return=minimal' }).catch(() => undefined);
    throw new Error('reminder saved nahi hui; worker job enqueue fail hua');
  }
  return safeReminder(reminder);
}

async function dispatch(request: Request, options: Options = {}) {
  const url = new URL(request.url);
  const path = request.headers.get('x-matched-path') || url.pathname;
  const action = url.searchParams.get('action') || path.split('/').filter(Boolean).pop() || '';
  if (request.method !== 'POST') return fail(400, 'bad_request', 'POST required hai.');
  const c = config(options);
  const ownerResult = await readOwnerSession(request, { env: c?.env ?? options.env, fetch: c?.fetcher ?? options.fetch });
  if (!ownerResult.ok) {
    const result = fail(ownerResult.status, ownerResult.status === 401 ? 'unauthorized' : ownerResult.status === 403 ? 'forbidden' : 'unavailable', ownerResult.message);
    return ownerResult.clearCookie ? withCookie(result, clearSessionCookie()) : result;
  }
  if (!c) return withCookie(fail(503, 'unavailable', 'Supabase configuration missing hai.'), ownerResult.setCookie);
  const owner: Owner = { user: ownerResult.user, accessToken: ownerResult.accessToken, setCookie: ownerResult.setCookie };
  let body: Row | null;
  try { body = await bodyJson(request); }
  catch (error) { if (error instanceof RequestTooLargeError) return withCookie(fail(413, 'payload_too_large', 'Request size 12 KB se zyada hai.'), owner.setCookie); throw error; }
  if (!body) return withCookie(fail(400, 'bad_request', 'Valid JSON body required hai.'), owner.setCookie);

  try {
    switch (action) {
      case 'tasks.list': {
        const rows = await db(c, owner, 'tasks', { select: TASK_SELECT, order: 'due_at.asc.nullslast,created_at.desc', limit: '200' });
        return withCookie(success({ tasks: rows.map(safeTask) }), owner.setCookie);
      }
      case 'tasks.today': {
        const today = todayString();
        const tasks = await db(c, owner, 'tasks', { select: TASK_SELECT, order: 'due_at.asc.nullslast,created_at.desc', limit: '300' });
        const reminders = await db(c, owner, 'reminders', { select: REMINDER_SELECT, state: 'eq.pending', order: 'remind_at.asc', limit: '300' });
        const open = tasks.filter((t) => ['todo', 'doing'].includes(t.status));
        const overdue = open.filter((t) => t.due_at && localDate(t.due_at) < today);
        const todaysTasks = open.filter((t) => t.due_at && localDate(t.due_at) === today);
        const todaysReminders = reminders.filter((r) => localDate(r.remind_at) === today);
        const top = [...open].sort((a, b) => Number(b.focus_today) - Number(a.focus_today) || (b.priority ?? 2) - (a.priority ?? 2) || String(a.due_at ?? '').localeCompare(String(b.due_at ?? ''))).slice(0, 3);
        const schedule = [
          ...todaysTasks.map((t) => ({ id: t.id, kind: 'task' as const, title: t.title, at: t.due_at, status: t.status, priority: t.priority })),
          ...todaysReminders.map((r) => ({ id: r.id, kind: 'reminder' as const, title: 'Reminder', at: r.remind_at, status: r.state })),
        ].sort((a, b) => String(a.at).localeCompare(String(b.at)));
        return withCookie(success({
          date: today, time_zone: TIME_ZONE,
          focus: { open_count: open.length, overdue_count: overdue.length, top_tasks: top.map(safeTask) },
          schedule,
        }), owner.setCookie);
      }
      case 'tasks.create': {
        if (body.private === true || body.privacy_tier === 'T2' || body.privacy_tier === 'T3' || (typeof body.title === 'string' && classifySensitivity(body.title).sensitive) || (typeof body.notes === 'string' && classifySensitivity(body.notes).sensitive)) return privacyConfirmation(owner.setCookie);
        const task = validateTaskInput(body);
        if (!task) return withCookie(fail(400, 'bad_request', 'Task title, due_at, priority ya repeat_rule invalid hai.'), owner.setCookie);
        const result = await runMutation({ c, owner, powerId: 'tasks.create', why: 'User explicitly requested a new task.', confirmed: body.confirmed === true, run: async () => {
          const rows = await db(c, owner, 'tasks', {}, { method: 'POST', body: task, prefer: 'return=representation' });
          if (!rows[0]) throw new Error('task insert failed'); return safeTask(rows[0]);
        } });
        return withCookie(result.ok ? success({ task: result.result }, 201) : fail(result.status, result.code, result.message), owner.setCookie);
      }
      case 'tasks.natural-add': {
        if (body.private === true || body.privacy_tier === 'T2' || body.privacy_tier === 'T3') return privacyConfirmation(owner.setCookie);
        if (typeof body.text !== 'string' || body.text.length > 1000) return withCookie(fail(400, 'bad_request', 'Natural-language text invalid hai.'), owner.setCookie);
        if (classifySensitivity(body.text).sensitive) return privacyConfirmation(owner.setCookie);
        const parsed = parseNaturalLanguage(body.text, { timeZone: TIME_ZONE });
        if (!parsed.ok) return withCookie(fail(400, 'bad_request', 'Date/time clear nahi hua; details dobara likho.'), owner.setCookie);
        if (parsed.status !== 'ready') {
          const message = parsed.reason === 'title_missing' ? 'Kya yaad dilana hai?' : 'Time ambiguous hai. AM/PM ya exact time confirm karo.';
          return withCookie(response(409, { ok: false, error: { code: 'confirmation_required', message, details: { status: parsed.status, reason: parsed.reason, kind: parsed.kind } } }), owner.setCookie);
        }
        if (parsed.sensitive) return privacyConfirmation(owner.setCookie);
        if (parsed.kind === 'reminder') {
          const result = await runMutation({ c, owner, powerId: 'reminders.create', why: 'User explicitly requested a scheduled reminder.', confirmed: body.confirmed === true, run: ({ decisionId }) => createReminder(c, owner, { text: parsed.title, remind_at: parsed.due_at, repeat_rule: parsed.repeat_rule }, decisionId) });
          return withCookie(result.ok ? success({ kind: 'reminder', item: result.result }, 201) : fail(result.status, result.code, result.message), owner.setCookie);
        }
        const result = await runMutation({ c, owner, powerId: 'tasks.create', why: 'User explicitly requested a new task.', confirmed: body.confirmed === true, run: async () => {
          const rows = await db(c, owner, 'tasks', {}, { method: 'POST', body: { title: parsed.title, due_at: parsed.due_at, priority: parsed.priority, repeat_rule: parsed.repeat_rule, time_zone: TIME_ZONE, source: 'natural-language', status: 'todo' }, prefer: 'return=representation' });
          if (!rows[0]) throw new Error('task insert failed'); return safeTask(rows[0]);
        } });
        return withCookie(result.ok ? success({ kind: 'task', item: result.result }, 201) : fail(result.status, result.code, result.message), owner.setCookie);
      }
      case 'tasks.update': {
        if (body.private === true || body.privacy_tier === 'T2' || body.privacy_tier === 'T3') return privacyConfirmation(owner.setCookie);
        if (!UUID.test(String(body.id ?? ''))) return withCookie(fail(400, 'bad_request', 'Task id invalid hai.'), owner.setCookie);
        if (body.title !== undefined && (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 500)) return withCookie(fail(400, 'bad_request', 'Task title invalid hai.'), owner.setCookie);
        if (body.notes !== undefined && body.notes !== null && (typeof body.notes !== 'string' || body.notes.length > 4000)) return withCookie(fail(400, 'bad_request', 'Task notes invalid hain.'), owner.setCookie);
        if (body.due_at !== undefined && body.due_at !== null && !isIso(body.due_at)) return withCookie(fail(400, 'bad_request', 'Due date invalid hai.'), owner.setCookie);
        if (body.priority !== undefined && !isPriority(body.priority)) return withCookie(fail(400, 'bad_request', 'Priority invalid hai.'), owner.setCookie);
        if (body.repeat_rule !== undefined && !isRepeat(body.repeat_rule)) return withCookie(fail(400, 'bad_request', 'Repeat rule invalid hai.'), owner.setCookie);
        if (body.repeat_rule && !isIso(body.due_at)) return withCookie(fail(400, 'bad_request', 'Repeating task ke liye due date/time required hai.'), owner.setCookie);
        const patch: Row = {};
        if (typeof body.title === 'string' && body.title.trim() && body.title.length <= 500) patch.title = body.title.trim();
        if (body.notes === null || typeof body.notes === 'string') patch.notes = typeof body.notes === 'string' ? body.notes.slice(0, 4000) : null;
        if ((typeof patch.title === 'string' && classifySensitivity(patch.title).sensitive) || (typeof patch.notes === 'string' && classifySensitivity(patch.notes).sensitive)) return privacyConfirmation(owner.setCookie);
        if (body.time_zone !== undefined && !isTimeZone(body.time_zone)) return withCookie(fail(400, 'bad_request', 'Time zone invalid hai.'), owner.setCookie);
        if (body.due_at === null || isIso(body.due_at)) patch.due_at = body.due_at;
        if (isPriority(body.priority)) patch.priority = body.priority;
        if (isRepeat(body.repeat_rule)) patch.repeat_rule = body.repeat_rule;
        if (typeof body.focus_today === 'boolean') patch.focus_today = body.focus_today;
        if (isTimeZone(body.time_zone)) patch.time_zone = body.time_zone;
        if (!Object.keys(patch).length) return withCookie(fail(400, 'bad_request', 'Update ke liye valid field required hai.'), owner.setCookie);
        const result = await runMutation({ c, owner, powerId: 'tasks.update', why: 'User explicitly updated task details.', confirmed: body.confirmed === true, run: async () => {
          const rows = await db(c, owner, 'tasks', { id: `eq.${body.id}` }, { method: 'PATCH', body: patch, prefer: 'return=representation' });
          if (!rows[0]) throw new Error('task not found'); return safeTask(rows[0]);
        } });
        return withCookie(result.ok ? success({ task: result.result }) : fail(result.status, result.code, result.message), owner.setCookie);
      }
      case 'tasks.link-project': {
        if (!UUID.test(String(body.task_id ?? '')) || !UUID.test(String(body.project_id ?? ''))) return withCookie(fail(400, 'bad_request', 'Task ya project id invalid hai.'), owner.setCookie);
        const result = await runMutation({ c, owner, powerId: 'tasks.link-project', why: 'User explicitly linked a task to a project.', confirmed: body.confirmed === true, run: async () => {
          const rows = await db(c, owner, 'memory_links', {}, { method: 'POST', body: { src_type: 'task', src_id: body.task_id, rel: 'part_of', dst_type: 'project', dst_id: body.project_id }, prefer: 'return=representation' });
          return { linked: true, link_id: rows[0]?.id ?? null };
        } });
        return withCookie(result.ok ? success(result.result, 201) : fail(result.status, result.code, result.message), owner.setCookie);
      }
      case 'tasks.complete': {
        if (!UUID.test(String(body.id ?? ''))) return withCookie(fail(400, 'bad_request', 'Task id invalid hai.'), owner.setCookie);
        const result = await runMutation({ c, owner, powerId: 'tasks.complete', why: 'User explicitly marked a task complete.', confirmed: body.confirmed === true, run: async () => {
          const current = await db(c, owner, 'tasks', { id: `eq.${body.id}`, select: TASK_SELECT });
          if (!current[0]) throw new Error('task not found');
          if (current[0].status === 'done') return { task: safeTask(current[0]), next_task: null, already_completed: true };
          if (!['todo', 'doing'].includes(current[0].status)) throw new Error('cancelled task cannot be completed');
          let next_task: Row | null = null;
          if (current[0].repeat_rule && current[0].due_at) {
            const nextAt = nextOccurrenceAfter(current[0].due_at, current[0].repeat_rule, current[0].time_zone || TIME_ZONE, new Date());
            const nextRows = await db(c, owner, 'tasks', {}, { method: 'POST', body: {
              title: current[0].title, notes: current[0].notes ?? null, due_at: nextAt.toISOString(),
              time_zone: current[0].time_zone || TIME_ZONE, repeat_rule: current[0].repeat_rule,
              priority: current[0].priority ?? 2, focus_today: false, source: 'recurrence', status: 'todo',
            }, prefer: 'return=representation' });
            if (!nextRows[0]) throw new Error('next recurring task could not be queued');
            next_task = nextRows[0];
          }
          try {
            const rows = await db(c, owner, 'tasks', { id: `eq.${body.id}`, status: 'in.(todo,doing)' }, { method: 'PATCH', body: { status: 'done', completed_at: new Date().toISOString() }, prefer: 'return=representation' });
            if (!rows[0]) throw new Error('task completion update failed');
            return { task: safeTask(rows[0]), next_task: next_task ? safeTask(next_task) : null };
          } catch (error) {
            // Compensate if the completion update fails after a recurrence row was created.
            if (next_task?.id) await db(c, owner, 'tasks', { id: `eq.${next_task.id}` }, { method: 'PATCH', body: { status: 'cancelled' }, prefer: 'return=minimal' }).catch(() => undefined);
            throw error;
          }
        } });
        return withCookie(result.ok ? success(result.result) : fail(result.status, result.code, result.message), owner.setCookie);
      }
      case 'tasks.cancel': {
        if (!UUID.test(String(body.id ?? ''))) return withCookie(fail(400, 'bad_request', 'Task id invalid hai.'), owner.setCookie);
        const result = await runMutation({ c, owner, powerId: 'tasks.cancel', why: 'User explicitly cancelled a task.', confirmed: body.confirmed === true, run: async () => {
          const rows = await db(c, owner, 'tasks', { id: `eq.${body.id}`, status: 'in.(todo,doing)' }, { method: 'PATCH', body: { status: 'cancelled' }, prefer: 'return=representation' });
          if (!rows[0]) throw new Error('task not found'); return safeTask(rows[0]);
        } });
        return withCookie(result.ok ? success({ task: result.result }) : fail(result.status, result.code, result.message), owner.setCookie);
      }
      case 'reminders.list': {
        const rows = await db(c, owner, 'reminders', { select: REMINDER_SELECT, order: 'remind_at.asc', limit: '200' });
        return withCookie(success({ reminders: rows.map(safeReminder) }), owner.setCookie);
      }
      case 'reminders.create': {
        if (body.task_id !== undefined && !UUID.test(String(body.task_id))) return withCookie(fail(400, 'bad_request', 'Task link id invalid hai.'), owner.setCookie);
        if (classifySensitivity(body.text).sensitive || body.private === true || body.is_private === true || body.privacy_tier === 'T2' || body.privacy_tier === 'T3' || body.memory_id || body.display_text) return privacyConfirmation(owner.setCookie);
        const result = await runMutation({ c, owner, powerId: 'reminders.create', why: 'User explicitly requested a reminder.', confirmed: body.confirmed === true, run: ({ decisionId }) => createReminder(c, owner, body, decisionId) });
        return withCookie(result.ok ? success({ reminder: result.result }, 201) : fail(result.status, result.code, result.message), owner.setCookie);
      }
      case 'reminders.cancel': {
        if (!UUID.test(String(body.id ?? ''))) return withCookie(fail(400, 'bad_request', 'Reminder id invalid hai.'), owner.setCookie);
        const result = await runMutation({ c, owner, powerId: 'reminders.cancel', why: 'User explicitly cancelled a reminder.', confirmed: body.confirmed === true, run: async () => {
          const rows = await db(c, owner, 'reminders', { id: `eq.${body.id}`, state: 'eq.pending' }, { method: 'PATCH', body: { state: 'cancelled' }, prefer: 'return=representation' });
          if (!rows[0]) throw new Error('pending reminder not found');
          await db(c, owner, 'jobs', { kind: 'eq.reminders.fire', state: 'eq.queued', payload: `cs.{"reminder_id":"${body.id}"}` }, { method: 'PATCH', body: { state: 'cancelled' }, prefer: 'return=minimal' }).catch(() => undefined);
          return { cancelled: true };
        } });
        return withCookie(result.ok ? success(result.result) : fail(result.status, result.code, result.message), owner.setCookie);
      }
      case 'reminders.consume-memory': {
        const handoff = consumeMedicineReminderRequest(body.request as MedicineReminderRequest);
        if (!handoff.ok) return withCookie(fail(400, 'bad_request', 'S09 medicine reminder hand-off invalid hai.'), owner.setCookie);
        // No plaintext T2 storage: Decision 014 requires protected content, and
        // the S19 private vault adapter is not yet approved/wired into this repo.
        const message = handoff.reason === 'am_pm_ambiguous'
          ? 'Dawai ka AM/PM clear nahi hai; pehle time confirm karo.'
          : handoff.reason === 'date_missing_from_s09_contract'
            ? 'S09 hand-off mein date missing hai; date confirm karni hogi.'
            : 'Private reminder vault available nahi hai; reminder save nahi ki.';
        return withCookie(response(409, { ok: false, error: { code: 'conflict', message, details: { status: handoff.status, reason: handoff.reason } } }), owner.setCookie);
      }
      default:
        return withCookie(fail(404, 'not_found', 'Tasks/reminders route nahi mila.'), owner.setCookie);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'request failed';
    // Generic error only; never log or return request body / T2 content.
    return withCookie(fail(503, 'unavailable', message.slice(0, 240)), owner.setCookie);
  }
}

async function toWebRequest(req: any): Promise<Request> {
  if (req instanceof Request) return req;
  if (req && typeof req.headers?.get === 'function') return req as Request;
  const host = req.headers?.['x-forwarded-host'] || req.headers?.host || 'localhost';
  const proto = req.headers?.['x-forwarded-proto'] || 'https';
  const url = new URL(req.url || '/', `${proto}://${host}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers || {})) {
    if (value !== undefined) Array.isArray(value) ? value.forEach((v) => headers.append(key, v)) : headers.set(key, String(value));
  }
  const method = req.method || 'GET';
  let body: string | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    if (req.body) body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    else if (typeof req[Symbol.asyncIterator] === 'function') {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      if (chunks.length) body = Buffer.concat(chunks).toString('utf8');
    }
  }
  return new Request(url, { method, headers, ...(body ? { body } : {}) });
}

export async function POST(request: Request, options: Options = {}) { return dispatch(request, options); }
export async function GET(request: Request, options: Options = {}) { return dispatch(request, options); }
export default async function handler(req: any, resOrOptions: any = {}): Promise<Response | void> {
  const nodeRes = resOrOptions && typeof resOrOptions.setHeader === 'function';
  const options: Options = nodeRes ? {} : (resOrOptions ?? {});
  try {
    const request = await toWebRequest(req);
    const result = await dispatch(request, options);
    if (!nodeRes) return result;
    resOrOptions.statusCode = result.status;
    for (const [key, value] of result.headers.entries()) resOrOptions.setHeader(key, value);
    resOrOptions.end(Buffer.from(await result.arrayBuffer()));
  } catch {
    const result = fail(500, 'internal', 'Internal request error.');
    if (!nodeRes) return result;
    resOrOptions.statusCode = result.status; resOrOptions.setHeader('content-type', 'application/json');
    resOrOptions.end(Buffer.from(await result.arrayBuffer()));
  }
}
