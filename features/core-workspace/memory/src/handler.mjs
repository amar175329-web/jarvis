import {
  classifyWorkspaceContent, isStoredPrivate, normalMemoryRecord, privatePlaceholder,
} from './privacy.mjs';
import { cleanText, fail, isUuid, ok, readBody, requireContext, throughPower } from './http.mjs';

export const actions = Object.freeze([
  'memory.list', 'memory.get', 'memory.remember', 'memory.update',
  'memory.forget', 'memory.forget-all', 'memory.export', 'memory.stats',
]);

function safeMemory(row) {
  if (!row) return null;
  return normalMemoryRecord(row);
}

async function protectLegacyRow(_context, row, _classification) {
  // Listing is read-only. Legacy rows are masked in this response; persistent tier promotion
  // occurs only on an explicit owner update, never as a hidden side effect of viewing.
  return row;
}

async function classifiedRow(context, row) {
  const classification = classifyWorkspaceContent(context, [row.title, row.body, row.why, ...(row.tags ?? [])], isStoredPrivate(row));
  const protectedRow = await protectLegacyRow(context, row, classification);
  return { row: protectedRow, private: classification.private || isStoredPrivate(protectedRow) || classification.secret };
}

async function list(context, request) {
  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 50) || 50));
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? 0) || 0);
  const page = await context.memoryStore.list({ includePrivate: true, limit, offset, order: 'recent' });
  const normal = [], privateItems = [];
  for (const row of page.items) {
    const checked = await classifiedRow(context, row);
    if (checked.private) privateItems.push(privatePlaceholder(checked.row));
    else normal.push(safeMemory(checked.row));
  }
  return { normal, private: privateItems, total: page.total, counts: { normal: normal.length, private: privateItems.length } };
}

async function get(context, id) {
  if (!isUuid(id)) throw Object.assign(new Error('Memory ID invalid hai'), { status: 400, code: 'invalid_id' });
  const row = await context.memoryStore.get(id);
  if (!row) throw Object.assign(new Error('Memory nahi mili'), { status: 404, code: 'not_found' });
  const checked = await classifiedRow(context, row);
  return checked.private ? privatePlaceholder(checked.row) : safeMemory(checked.row);
}

async function remember(context, body) {
  const text = cleanText(body.text, 2_000, 'Memory text');
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : '';
  const classification = classifyWorkspaceContent(context, [title, text, ...(Array.isArray(body.tags) ? body.tags : [])], body.private === true);
  if (classification.secret) throw Object.assign(new Error('Raw password, OTP, ID, card, bank ya API secret memory mein save nahi hoga.'), { status: 422, code: 'raw_secret_refused' });
  const candidate = {
    text, ...(title ? { title } : {}), kind: ['fact','profile','preference','routine','project','episode','knowledge','person'].includes(body.kind) ? body.kind : 'fact',
    origin: 'ui', actor: 'amit_ui', explicit: true, about: 'amit', tags: Array.isArray(body.tags) ? body.tags.slice(0, 12) : [],
    why: 'Amit ne Memory screen se save kiya', pinned: classification.private ? false : body.pinned === true,
  };

  if (classification.private) {
    // Preflight the established memory policy, but never call MemoryService.remember() for
    // shared-guard-only private text: that service could initially classify it as T1.
    // Direct T2 insert closes the gap before any event or embedding worker can observe it.
    const verdict = await context.decideMemoryCandidate(candidate);
    if (verdict?.verdict !== 'save') {
      throw Object.assign(new Error(verdict?.userMessage || 'Memory policy ne is entry ko save nahi kiya.'), { status: 422, code: 'memory_policy_refused' });
    }
    const row = await context.memoryStore.create({
      kind: verdict.kind, title: verdict.title, body: verdict.body, source: verdict.source,
      confidence: verdict.confidence, why: verdict.why, tier: 'sensitive', private: true,
      subject: verdict.subject, subject_key: null, tags: [...new Set([...(candidate.tags ?? []), ...(verdict.tags ?? [])])].slice(0, 12),
      pinned: false, ref_type: null, ref_id: null, tokens: [], expires_at: verdict.expires_at ?? null,
    });
    return { saved: true, deduped: false, item: privatePlaceholder(row) };
  }

  const result = await context.memoryService.remember(candidate);
  if (result.verdict?.verdict !== 'save' || !result.memory) {
    throw Object.assign(new Error(result.verdict?.userMessage || 'Memory policy ne is entry ko save nahi kiya.'), { status: 422, code: 'memory_policy_refused' });
  }
  const storedPrivate = isStoredPrivate(result.memory);
  return { saved: true, deduped: result.deduped === true, item: storedPrivate ? privatePlaceholder(result.memory) : safeMemory(result.memory) };
}

async function update(context, body) {
  if (!isUuid(body.id) || !Number.isInteger(body.revision) || body.revision < 1) {
    throw Object.assign(new Error('ID ya revision invalid hai'), { status: 400, code: 'invalid_input' });
  }
  const current = await context.memoryStore.get(body.id);
  if (!current) throw Object.assign(new Error('Memory nahi mili'), { status: 404, code: 'not_found' });
  const nextTitle = body.title === undefined ? current.title : cleanText(body.title, 200, 'Title');
  const nextBody = body.body === undefined ? current.body : cleanText(body.body, 2_000, 'Body');
  const nextTags = body.tags === undefined ? (current.tags ?? []) : body.tags;
  const classification = classifyWorkspaceContent(context, [nextTitle, nextBody, ...(Array.isArray(nextTags) ? nextTags : [])], body.private === true || isStoredPrivate(current));
  if (classification.secret) throw Object.assign(new Error('Raw secret memory mein save nahi hoga.'), { status: 422, code: 'raw_secret_refused' });
  const patch = {
    ...(body.title !== undefined ? { title: nextTitle } : {}),
    ...(body.body !== undefined ? { body: nextBody } : {}),
    ...(body.tags !== undefined ? { tags: nextTags } : {}),
    ...(classification.private ? { private: true, tier: 'sensitive', pinned: false } : {}),
  };
  const result = await context.memoryService.update(body.id, patch, body.revision);
  if (!result.ok) throw Object.assign(new Error('Memory policy ne update rok diya.'), { status: 422, code: 'memory_policy_refused' });
  const privateRow = classification.private || isStoredPrivate(result.memory);
  return privateRow ? privatePlaceholder(result.memory) : safeMemory(result.memory);
}

async function forget(context, body) {
  if (!isUuid(body.id)) throw Object.assign(new Error('Memory ID invalid hai'), { status: 400, code: 'invalid_id' });
  if (body.confirmed !== true) throw Object.assign(new Error('Delete se pehle app confirmation zaroori hai'), { status: 409, code: 'confirmation_required' });
  const result = await context.memoryService.forget(body.id, true);
  return { deleted: result.deleted, derived_deleted: result.derived_deleted, links_deleted: result.links_deleted };
}

async function forgetAll(context, body) {
  if (body.confirmed !== true || !Number.isInteger(body.expectedCount) || body.expectedCount < 0) {
    throw Object.assign(new Error('Sab memory bhoolne ke liye fresh count aur app confirmation chahiye'), { status: 409, code: 'confirmation_required' });
  }
  const result = await context.memoryService.forgetAll({ channel: 'app_tap', expectedCount: body.expectedCount });
  return { deleted: result.deleted, derived_deleted: result.derived_deleted, links_deleted: result.links_deleted };
}

async function exportNormal(context, body) {
  if (body.confirmed !== true) throw Object.assign(new Error('Export ke liye app confirmation zaroori hai'), { status: 409, code: 'confirmation_required' });
  const rows = [];
  for await (const record of context.memoryService.exportAll()) {
    if (record.tier === 'normal' && record.private !== true) rows.push(record);
  }
  const payload = rows.map((record) => JSON.stringify(record)).join('\n') + (rows.length ? '\n' : '');
  return new Response(payload, { status: 200, headers: {
    'cache-control': 'no-store', 'content-type': 'application/x-ndjson; charset=utf-8',
    'content-disposition': 'attachment; filename="jarvis-memory-normal.jsonl"',
  } });
}

export async function handle(action, request, context) {
  try {
    if (!actions.includes(action)) return fail(Object.assign(new Error('Unknown memory action'), { status: 404, code: 'unknown_action' }));
    requireContext(context, ['memoryStore', 'memoryService', 'classifyMemoryText', 'findMemorySecrets']);
    if (action === 'memory.remember' && typeof context.decideMemoryCandidate !== 'function') {
      throw Object.assign(new Error('private memory policy adapter unavailable'), { status: 503, code: 'not_ready' });
    }
    const needsBody = ['memory.remember','memory.update','memory.forget','memory.forget-all','memory.export'].includes(action);
    const body = needsBody ? await readBody(request) : {};
    const why = ({
      'memory.list': 'Owner ne apni memory list kholi.',
      'memory.get': 'Owner ne selected memory open ki.',
      'memory.remember': 'Owner ne memory save karne ko kaha.',
      'memory.update': 'Owner ne memory edit ki.',
      'memory.forget': 'Owner ne selected memory delete confirm ki.',
      'memory.forget-all': 'Owner ne all-memory deletion app par confirm ki.',
      'memory.export': 'Owner ne normal-memory export confirm kiya.',
      'memory.stats': 'Owner ne memory usage summary kholi.',
    })[action];
    const confirmed = body.confirmed === true;
    const data = await throughPower(context, action, action, why, confirmed, async () => {
      switch (action) {
        case 'memory.list': return list(context, request);
        case 'memory.get': return get(context, new URL(request.url).searchParams.get('id'));
        case 'memory.remember': return remember(context, body);
        case 'memory.update': return update(context, body);
        case 'memory.forget': return forget(context, body);
        case 'memory.forget-all': return forgetAll(context, body);
        case 'memory.export': return exportNormal(context, body);
        case 'memory.stats': return context.memoryStore.stats();
        default: return null;
      }
    });
    if (data instanceof Response) return data;
    return ok(data);
  } catch (error) { return fail(error); }
}
