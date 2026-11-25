import {
  classifyWorkspaceContent, isStoredPrivate, normalWorkspaceRecord, privatePlaceholder,
} from '../../memory/src/privacy.mjs';
import {
  cleanText, fail, isUuid, ok, readBody, requireContext, safeTags, throughPower,
} from '../../memory/src/http.mjs';

export const actions = Object.freeze([
  'workspace.projects.list', 'workspace.projects.get', 'workspace.projects.create',
  'workspace.projects.update', 'workspace.projects.delete',
  'workspace.projects.link-item', 'workspace.projects.unlink-item',
]);
const FIELDS = 'id,owner_id,name,goal,status,next_step,due_at,tags,revision,private,tier,no_embed,created_at,updated_at';
const STATUSES = new Set(['active','paused','done','archived']);
const LINK_TYPES = new Set(['memory','note','file','project','task']);

async function db(context, table, method, query = {}, body, prefer = 'return=representation') {
  if (typeof context.db !== 'function') throw Object.assign(new Error('owner-scoped database adapter unavailable'), { status: 503, code: 'db_unavailable' });
  const rows = await context.db({ table, method, query: { ...query, owner_id: `eq.${context.ownerId}` }, body, prefer });
  if (!Array.isArray(rows)) throw Object.assign(new Error('database response invalid'), { status: 503, code: 'db_response_invalid' });
  return rows;
}

async function checkPrivacy(context, row) {
  const classification = classifyWorkspaceContent(context, [row.name, row.goal, row.next_step, ...(row.tags ?? [])], isStoredPrivate(row));
  if (classification.secret) return { private: true, row };
  // Listing is a pure read; legacy rows are masked without a hidden write.
  return { private: classification.private, row };
}

async function list(context) {
  const rows = await db(context, 'projects', 'GET', { select: FIELDS, order: 'updated_at.desc', limit: '200' });
  const normal = [], privateItems = [];
  for (const row of rows) {
    const checked = await checkPrivacy(context, row);
    if (checked.private) privateItems.push(privatePlaceholder(checked.row));
    else normal.push(normalWorkspaceRecord(checked.row, 'project'));
  }
  return { normal, private: privateItems, counts: { normal: normal.length, private: privateItems.length } };
}

async function get(context, id) {
  if (!isUuid(id)) throw Object.assign(new Error('Project ID invalid hai'), { status: 400, code: 'invalid_id' });
  const rows = await db(context, 'projects', 'GET', { id: `eq.${id}`, select: FIELDS, limit: '1' });
  if (!rows[0]) throw Object.assign(new Error('Project nahi mila'), { status: 404, code: 'not_found' });
  const checked = await checkPrivacy(context, rows[0]);
  return checked.private ? privatePlaceholder(checked.row) : normalWorkspaceRecord(checked.row, 'project');
}

function valuesFrom(body, current = {}) {
  const name = body.name === undefined ? current.name : cleanText(body.name, 120, 'Project name');
  const goal = body.goal === undefined ? (current.goal ?? null) : (body.goal === null || body.goal === '' ? null : cleanText(body.goal, 1000, 'Goal'));
  const nextStep = body.next_step === undefined ? (current.next_step ?? null) : (body.next_step === null || body.next_step === '' ? null : cleanText(body.next_step, 300, 'Next step'));
  const status = body.status === undefined ? (current.status ?? 'active') : body.status;
  if (!STATUSES.has(status)) throw Object.assign(new Error('Project status invalid hai'), { status: 400, code: 'invalid_status' });
  const tags = body.tags === undefined ? (current.tags ?? []) : safeTags(body.tags);
  const dueAt = body.due_at === undefined ? (current.due_at ?? null) : body.due_at;
  if (dueAt !== null && (typeof dueAt !== 'string' || !Number.isFinite(Date.parse(dueAt)))) throw Object.assign(new Error('Due date invalid hai'), { status: 400, code: 'invalid_due_at' });
  return { name, goal, next_step: nextStep, status, tags, due_at: dueAt };
}

async function create(context, body) {
  const value = valuesFrom(body);
  const classification = classifyWorkspaceContent(context, [value.name, value.goal, value.next_step, ...value.tags], body.private === true);
  if (classification.secret) throw Object.assign(new Error('Raw password, OTP, ID, card, bank ya API secret project mein save nahi hoga.'), { status: 422, code: 'raw_secret_refused' });
  const rows = await db(context, 'projects', 'POST', { select: FIELDS }, {
    owner_id: context.ownerId, ...value, private: classification.private,
    tier: classification.tier, no_embed: classification.no_embed, revision: 1,
  });
  if (!rows[0]) throw Object.assign(new Error('Project save response missing'), { status: 503, code: 'db_response_invalid' });
  return classification.private ? privatePlaceholder(rows[0]) : normalWorkspaceRecord(rows[0], 'project');
}

async function update(context, body) {
  if (!isUuid(body.id) || !Number.isInteger(body.revision) || body.revision < 1) throw Object.assign(new Error('ID/revision invalid hai'), { status: 400, code: 'invalid_input' });
  const currentRows = await db(context, 'projects', 'GET', { id: `eq.${body.id}`, select: FIELDS, limit: '1' });
  const current = currentRows[0];
  if (!current) throw Object.assign(new Error('Project nahi mila'), { status: 404, code: 'not_found' });
  const value = valuesFrom(body, current);
  const classification = classifyWorkspaceContent(context, [value.name, value.goal, value.next_step, ...value.tags], body.private === true || isStoredPrivate(current));
  if (classification.secret) throw Object.assign(new Error('Raw secret project mein save nahi hoga.'), { status: 422, code: 'raw_secret_refused' });
  const rows = await db(context, 'projects', 'PATCH', { id: `eq.${body.id}`, revision: `eq.${body.revision}`, select: FIELDS }, {
    ...value, private: classification.private, tier: classification.tier, no_embed: classification.no_embed,
    revision: body.revision + 1,
  });
  if (!rows[0]) throw Object.assign(new Error('Project badal chuka hai; refresh karke dobara try karo.'), { status: 409, code: 'conflict' });
  return classification.private ? privatePlaceholder(rows[0]) : normalWorkspaceRecord(rows[0], 'project');
}

async function remove(context, body) {
  if (!isUuid(body.id) || body.confirmed !== true) throw Object.assign(new Error('Delete ke liye valid ID aur app confirmation chahiye'), { status: 409, code: 'confirmation_required' });
  const rows = await db(context, 'projects', 'DELETE', { id: `eq.${body.id}`, select: 'id' });
  return { deleted: rows.length > 0 };
}

async function link(context, body) {
  const srcType = body.src_type; const dstType = body.dst_type;
  if (!LINK_TYPES.has(srcType) || !LINK_TYPES.has(dstType) || !isUuid(body.src_id) || !isUuid(body.dst_id)
    || typeof body.rel !== 'string' || !/^[a-z_]{2,40}$/.test(body.rel)) {
    throw Object.assign(new Error('Project link invalid hai'), { status: 400, code: 'invalid_link' });
  }
  if (srcType !== 'project' && dstType !== 'project') throw Object.assign(new Error('Link mein project endpoint hona zaroori hai'), { status: 400, code: 'invalid_link' });
  const rows = await db(context, 'memory_links', 'POST', {
    on_conflict: 'owner_id,src_type,src_id,rel,dst_type,dst_id', select: 'id,src_type,src_id,rel,dst_type,dst_id,created_at',
  }, {
    owner_id: context.ownerId, src_type: srcType, src_id: body.src_id, rel: body.rel,
    dst_type: dstType, dst_id: body.dst_id,
  }, 'return=representation,resolution=merge-duplicates');
  return rows[0] ? { linked: true, id: rows[0].id } : { linked: true };
}

async function unlink(context, body) {
  if (!isUuid(body.id) || body.confirmed !== true) throw Object.assign(new Error('Unlink ke liye valid ID aur app confirmation chahiye'), { status: 409, code: 'confirmation_required' });
  const rows = await db(context, 'memory_links', 'DELETE', { id: `eq.${body.id}`, select: 'id' });
  return { unlinked: rows.length > 0 };
}

export async function handle(action, request, context) {
  try {
    if (!actions.includes(action)) return fail(Object.assign(new Error('Unknown project action'), { status: 404, code: 'unknown_action' }));
    requireContext(context, ['classifyMemoryText', 'findMemorySecrets', 'db']);
    const withBody = ['workspace.projects.create','workspace.projects.update','workspace.projects.delete','workspace.projects.link-item','workspace.projects.unlink-item'].includes(action);
    const body = withBody ? await readBody(request) : {};
    const why = `Owner ne ${action} request bheji.`;
    const data = await throughPower(context, action, action, why, body.confirmed === true, async () => {
      switch (action) {
        case 'workspace.projects.list': return list(context);
        case 'workspace.projects.get': return get(context, new URL(request.url).searchParams.get('id'));
        case 'workspace.projects.create': return create(context, body);
        case 'workspace.projects.update': return update(context, body);
        case 'workspace.projects.delete': return remove(context, body);
        case 'workspace.projects.link-item': return link(context, body);
        case 'workspace.projects.unlink-item': return unlink(context, body);
        default: return null;
      }
    });
    return ok(data);
  } catch (error) { return fail(error); }
}
