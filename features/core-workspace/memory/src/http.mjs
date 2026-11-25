export function json(status, body) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' } });
}

export async function readBody(request, maxBytes = 120_000) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > maxBytes) throw Object.assign(new Error('request body too large'), { status: 413, code: 'too_large' });
  try {
    const data = raw ? JSON.parse(raw) : {};
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('object required');
    return data;
  } catch {
    throw Object.assign(new Error('invalid JSON body'), { status: 400, code: 'bad_json' });
  }
}

export function requireContext(context, required = []) {
  if (!context || typeof context.ownerId !== 'string' || !context.ownerId || typeof context.runPower !== 'function') {
    throw Object.assign(new Error('owner context or power gate unavailable'), { status: 503, code: 'not_ready' });
  }
  for (const key of required) {
    if (typeof context[key] !== 'function' && !context[key]) {
      throw Object.assign(new Error(`required dependency unavailable: ${key}`), { status: 503, code: 'not_ready' });
    }
  }
}

/** All reads and mutations are gated. Host must implement S08's registry + executor + kill-store path. */
export async function throughPower(context, action, powerId, why, confirmed, run) {
  if (typeof context.runPower !== 'function') throw Object.assign(new Error('power gate unavailable'), { status: 503, code: 'power_gate_unavailable' });
  const readOnly = /\.(list|get|search|stats)$/.test(action);
  return context.runPower({ action, powerId, confirmed: confirmed === true, readOnly, why, run });
}

export function fail(error) {
  const status = Number.isInteger(error?.status) ? error.status : error?.code === 'forbidden' ? 403 : error?.code === 'conflict' ? 409 : 500;
  const code = typeof error?.code === 'string' ? error.code : 'operation_failed';
  const message = status >= 500 ? 'Request abhi complete nahi hui. Power gate ya storage available nahi hai.' : String(error?.message ?? 'Request invalid hai.');
  return json(status, { ok: false, error: { code, message } });
}

export function ok(data, status = 200) { return json(status, { ok: true, data }); }
export function isUuid(value) { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
export function cleanText(value, max, field) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw Object.assign(new Error(`${field} 1..${max} characters hona chahiye`), { status: 400, code: 'invalid_input' });
  }
  return value.trim();
}
export function safeTags(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 12 || value.some((v) => typeof v !== 'string' || !v.trim() || v.length > 40)) {
    throw Object.assign(new Error('Tags invalid hain'), { status: 400, code: 'invalid_tags' });
  }
  return [...new Set(value.map((v) => v.trim()))];
}
