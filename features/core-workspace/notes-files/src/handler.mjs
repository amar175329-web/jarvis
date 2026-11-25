import {
  classifyWorkspaceContent, isStoredPrivate, normalWorkspaceRecord, privatePlaceholder,
} from '../../memory/src/privacy.mjs';
import {
  cleanText, fail, isUuid, ok, readBody, requireContext, safeTags, throughPower,
} from '../../memory/src/http.mjs';

export const actions = Object.freeze([
  'workspace.notes.list', 'workspace.notes.get', 'workspace.notes.create',
  'workspace.notes.update', 'workspace.notes.delete', 'workspace.files.list',
  'workspace.files.upload-url', 'workspace.files.complete-upload', 'workspace.files.delete', 'workspace.search',
]);

const NOTE_FIELDS = 'id,owner_id,title,body_md,tags,project_id,pinned,status,source,no_embed,tokens,word_count,revision,private,tier,created_at,updated_at';
const FILE_FIELDS = 'id,owner_id,name,mime,size_bytes,sha256,storage_path,project_id,tags,status,no_embed,tokens,revision,private,tier,created_at,updated_at';
const ALLOWED_MIME = new Map([
  ['text/plain', 'txt'], ['text/markdown', 'md'], ['application/pdf', 'pdf'],
  ['image/png', 'png'], ['image/jpeg', 'jpg'], ['text/csv', 'csv'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
]);

async function db(context, table, method, query = {}, body, prefer = 'return=representation') {
  if (typeof context.db !== 'function') throw Object.assign(new Error('owner-scoped database adapter unavailable'), { status: 503, code: 'db_unavailable' });
  const rows = await context.db({ table, method, query: { ...query, owner_id: `eq.${context.ownerId}` }, body, prefer });
  if (!Array.isArray(rows)) throw Object.assign(new Error('database response invalid'), { status: 503, code: 'db_response_invalid' });
  return rows;
}

async function privacy(context, row, kind) {
  const values = kind === 'note'
    ? [row.title, row.body_md, ...(row.tags ?? [])]
    : kind === 'project'
      ? [row.name, row.goal, row.next_step, ...(row.tags ?? [])]
      : [row.name, ...(row.tags ?? [])];
  const classification = classifyWorkspaceContent(context, values, isStoredPrivate(row));
  if (classification.secret) return { private: true, secret: true, row };
  // Read/list never mutates storage. A legacy row is still masked immediately; its next
  // explicit edit persists the T2 tier.
  return { private: classification.private, secret: false, row };
}

async function listNotes(context) {
  const rows = await db(context, 'notes', 'GET', { select: NOTE_FIELDS, status: 'eq.active', order: 'updated_at.desc', limit: '200' });
  const normal = [], privateItems = [];
  for (const row of rows) {
    const checked = await privacy(context, row, 'note');
    if (checked.private) privateItems.push(privatePlaceholder(checked.row));
    else normal.push(normalWorkspaceRecord(checked.row, 'note'));
  }
  return { normal, private: privateItems, counts: { normal: normal.length, private: privateItems.length } };
}

async function listFiles(context) {
  const rows = await db(context, 'files', 'GET', { select: FILE_FIELDS, order: 'created_at.desc', limit: '200' });
  // A file is always treated as private until S19's scanner/vault flow exists.
  const privateItems = rows.map((row) => privatePlaceholder(row));
  return { normal: [], private: privateItems, counts: { normal: 0, private: privateItems.length }, upload_note: 'Files private rahengi; S19 scanner/vault integration pending hai.' };
}

async function createNote(context, body) {
  const title = cleanText(body.title, 200, 'Title');
  const content = typeof body.body_md === 'string' ? body.body_md : '';
  if (content.length > 100_000) throw Object.assign(new Error('Note body 100 KB se chhoti honi chahiye'), { status: 400, code: 'too_large' });
  const tags = safeTags(body.tags);
  const classification = classifyWorkspaceContent(context, [title, content, ...tags], body.private === true);
  if (classification.secret) throw Object.assign(new Error('Raw password, OTP, ID, card, bank ya API secret note mein save nahi hoga.'), { status: 422, code: 'raw_secret_refused' });
  const projectId = body.project_id == null ? null : body.project_id;
  if (projectId && !isUuid(projectId)) throw Object.assign(new Error('Project ID invalid hai'), { status: 400, code: 'invalid_project' });
  const created = await db(context, 'notes', 'POST', { select: NOTE_FIELDS }, {
    owner_id: context.ownerId, title, body_md: content, tags, project_id: projectId,
    pinned: classification.private ? false : body.pinned === true, status: 'active', source: 'amit',
    no_embed: classification.no_embed, tokens: [], word_count: content.trim() ? content.trim().split(/\s+/u).length : 0,
    private: classification.private, tier: classification.tier, revision: 1,
  });
  const row = created[0];
  if (!row) throw Object.assign(new Error('Note save response missing'), { status: 503, code: 'db_response_invalid' });
  return classification.private ? privatePlaceholder(row) : normalWorkspaceRecord(row, 'note');
}

async function updateNote(context, body) {
  if (!isUuid(body.id) || !Number.isInteger(body.revision) || body.revision < 1) throw Object.assign(new Error('ID/revision invalid hai'), { status: 400, code: 'invalid_input' });
  const existing = await db(context, 'notes', 'GET', { id: `eq.${body.id}`, select: NOTE_FIELDS, limit: '1' });
  if (!existing[0]) throw Object.assign(new Error('Note nahi mili'), { status: 404, code: 'not_found' });
  const before = existing[0];
  const title = body.title === undefined ? before.title : cleanText(body.title, 200, 'Title');
  const content = body.body_md === undefined ? before.body_md : body.body_md;
  const tags = body.tags === undefined ? (before.tags ?? []) : safeTags(body.tags);
  if (typeof content !== 'string' || content.length > 100_000) throw Object.assign(new Error('Note body invalid hai'), { status: 400, code: 'invalid_body' });
  const classification = classifyWorkspaceContent(context, [title, content, ...tags], body.private === true || isStoredPrivate(before));
  if (classification.secret) throw Object.assign(new Error('Raw secret note mein save nahi hoga.'), { status: 422, code: 'raw_secret_refused' });
  const changed = await db(context, 'notes', 'PATCH', { id: `eq.${body.id}`, revision: `eq.${body.revision}`, select: NOTE_FIELDS }, {
    title, body_md: content, tags, private: classification.private, tier: classification.tier,
    no_embed: classification.no_embed, tokens: [], pinned: classification.private ? false : body.pinned === true,
    revision: body.revision + 1, word_count: content.trim() ? content.trim().split(/\s+/u).length : 0,
  });
  if (!changed[0]) throw Object.assign(new Error('Note badal chuki hai; refresh karke dobara try karo.'), { status: 409, code: 'conflict' });
  return classification.private ? privatePlaceholder(changed[0]) : normalWorkspaceRecord(changed[0], 'note');
}

async function deleteNote(context, body) {
  if (!isUuid(body.id) || body.confirmed !== true) throw Object.assign(new Error('Delete ke liye valid ID aur app confirmation chahiye'), { status: 409, code: 'confirmation_required' });
  const rows = await db(context, 'notes', 'DELETE', { id: `eq.${body.id}`, select: 'id' });
  return { deleted: rows.length > 0 };
}

async function createUploadUrl(context, body) {
  const name = cleanText(body.name, 200, 'File name');
  const mime = String(body.mime ?? '');
  const extension = ALLOWED_MIME.get(mime);
  if (!extension) throw Object.assign(new Error('File type allow-list mein nahi hai'), { status: 415, code: 'mime_not_allowed' });
  const sizeBytes = Number(body.size_bytes);
  if (!Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > 10 * 1024 * 1024) throw Object.assign(new Error('File 10 MB limit ke andar honi chahiye'), { status: 413, code: 'too_large' });
  const classification = classifyWorkspaceContent(context, [name, ...(Array.isArray(body.tags) ? body.tags : [])]);
  if (classification.secret) throw Object.assign(new Error('Secret jaisa filename upload nahi hoga'), { status: 422, code: 'raw_secret_refused' });
  if (typeof context.storageCreateUploadUrl !== 'function') throw Object.assign(new Error('Owner-token signed upload adapter pending hai'), { status: 503, code: 'storage_unavailable' });
  const id = crypto.randomUUID(); const path = `${context.ownerId}/${id}.${extension}`;
  const signed = await context.storageCreateUploadUrl(path, mime, sizeBytes);
  if (!signed || typeof signed.url !== 'string' || !signed.url.startsWith('https://')) throw Object.assign(new Error('Signed upload URL invalid hai'), { status: 503, code: 'storage_unavailable' });
  const rows = await db(context, 'files', 'POST', { select: FILE_FIELDS }, {
    id, owner_id: context.ownerId, name, mime, size_bytes: sizeBytes, sha256: '0'.repeat(64), storage_path: path,
    project_id: isUuid(body.project_id) ? body.project_id : null, tags: safeTags(body.tags), status: 'uploading',
    text_excerpt: null, no_embed: true, tokens: [], private: true, tier: 'sensitive', revision: 1,
  });
  if (!rows[0]) throw Object.assign(new Error('File metadata row create nahi hui'), { status: 503, code: 'db_response_invalid' });
  return { id, upload: { method: 'PUT', url: signed.url, headers: signed.headers ?? { 'content-type': mime } }, private: true };
}

async function completeUpload(context, body) {
  if (!isUuid(body.id) || body.confirmed !== true || typeof body.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(body.sha256)) {
    throw Object.assign(new Error('Upload completion details invalid hain'), { status: 409, code: 'invalid_upload' });
  }
  const existing = await db(context, 'files', 'GET', { id: `eq.${body.id}`, select: FILE_FIELDS, status: 'eq.uploading', limit: '1' });
  if (!existing[0]) throw Object.assign(new Error('Pending file upload nahi mila'), { status: 404, code: 'not_found' });
  const rows = await db(context, 'files', 'PATCH', { id: `eq.${body.id}`, status: 'eq.uploading', select: 'id,status,created_at,updated_at' }, {
    sha256: body.sha256.toLowerCase(), status: 'quarantined', text_excerpt: null, no_embed: true,
    private: true, tier: 'sensitive', revision: Number(existing[0].revision ?? 1) + 1,
  });
  if (!rows[0]) throw Object.assign(new Error('Upload completion conflict'), { status: 409, code: 'conflict' });
  return { id: rows[0].id, status: 'quarantined', label: 'Private file', badge: 'private' };
}

async function deleteFile(context, body) {
  if (!isUuid(body.id) || body.confirmed !== true) throw Object.assign(new Error('Delete ke liye valid ID aur app confirmation chahiye'), { status: 409, code: 'confirmation_required' });
  if (typeof context.storageRemove !== 'function') throw Object.assign(new Error('Owner-token Storage remove adapter pending hai'), { status: 503, code: 'storage_unavailable' });
  const rows = await db(context, 'files', 'GET', { id: `eq.${body.id}`, select: 'id,storage_path', limit: '1' });
  if (!rows[0]) return { deleted: false };
  await context.storageRemove([rows[0].storage_path]);
  const removed = await db(context, 'files', 'DELETE', { id: `eq.${body.id}`, select: 'id' });
  return { deleted: removed.length > 0 };
}

async function getNote(context, id) {
  if (!isUuid(id)) throw Object.assign(new Error('Note ID invalid hai'), { status: 400, code: 'invalid_id' });
  const rows = await db(context, 'notes', 'GET', { id: `eq.${id}`, select: NOTE_FIELDS, limit: '1' });
  if (!rows[0]) throw Object.assign(new Error('Note nahi mili'), { status: 404, code: 'not_found' });
  const checked = await privacy(context, rows[0], 'note');
  return checked.private ? privatePlaceholder(checked.row) : normalWorkspaceRecord(checked.row, 'note');
}

async function search(context, request) {
  const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (!query || query.length > 120) throw Object.assign(new Error('Search 1..120 characters hona chahiye'), { status: 400, code: 'invalid_query' });
  const rows = await db(context, 'notes', 'GET', {
    select: NOTE_FIELDS, status: 'eq.active', private: 'eq.false', tier: 'eq.normal',
    title: `ilike.*${query.replace(/[\\%_*(),]/g, '')}*`, order: 'updated_at.desc', limit: '50',
  });
  const normal = [];
  for (const row of rows) {
    const checked = await privacy(context, row, 'note');
    if (!checked.private) normal.push(normalWorkspaceRecord(checked.row, 'note'));
  }
  return { normal, private: [], counts: { normal: normal.length, private: 0 } };
}

export async function handle(action, request, context) {
  try {
    if (!actions.includes(action)) return fail(Object.assign(new Error('Unknown notes/files action'), { status: 404, code: 'unknown_action' }));
    requireContext(context, ['classifyMemoryText', 'findMemorySecrets', 'db']);
    const withBody = ['workspace.notes.create','workspace.notes.update','workspace.notes.delete','workspace.files.upload-url','workspace.files.complete-upload','workspace.files.delete'].includes(action);
    const body = withBody ? await readBody(request, 14_500_000) : {};
    const powerId = action;
    const why = `Owner ne ${action} request bheji.`;
    const data = await throughPower(context, action, powerId, why, body.confirmed === true, async () => {
      switch (action) {
        case 'workspace.notes.list': return listNotes(context);
        case 'workspace.notes.get': return getNote(context, new URL(request.url).searchParams.get('id'));
        case 'workspace.notes.create': return createNote(context, body);
        case 'workspace.notes.update': return updateNote(context, body);
        case 'workspace.notes.delete': return deleteNote(context, body);
        case 'workspace.files.list': return listFiles(context);
        case 'workspace.files.upload-url': return createUploadUrl(context, body);
        case 'workspace.files.complete-upload': return completeUpload(context, body);
        case 'workspace.files.delete': return deleteFile(context, body);
        case 'workspace.search': return search(context, request);
        default: return null;
      }
    });
    return ok(data);
  } catch (error) { return fail(error); }
}
