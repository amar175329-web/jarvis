import { DEFAULT_SHORTCUTS, normalizeShortcutList, SETTINGS_KEY } from './model.mjs';

export const ACTIONS = Object.freeze(['quick-access.list', 'quick-access.save']);
export const QUICK_ACCESS_READ_POWER = 'home.quick-access.read';
export const QUICK_ACCESS_MANAGE_POWER = 'home.quick-access.manage';

function json(status, payload) {
  return Response.json(payload, { status, headers: { 'cache-control': 'no-store' } });
}
function fail(status, code, message) {
  return json(status, { ok: false, error: { code, message } });
}
async function readBody(request) {
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 4_000) return { error: fail(413, 'payload_too_large', 'Request body bahut bada hai.') };
    const body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: fail(400, 'bad_request', 'JSON object required hai.') };
    return { body };
  } catch {
    return { error: fail(400, 'bad_request', 'Valid JSON required hai.') };
  }
}
function gatedFailure(outcome) {
  return fail(Number.isInteger(outcome?.status) ? outcome.status : 503,
    typeof outcome?.code === 'string' ? outcome.code : 'unavailable',
    typeof outcome?.message === 'string' ? outcome.message : 'Quick Access power ne request block ki.');
}

/** Plain handler. Auth, RLS settings adapters and executePower are injected by the shared API function. */
export async function handle(action, request, context = {}) {
  if (!ACTIONS.includes(action)) return null;
  if (request?.method !== 'POST') return fail(400, 'bad_request', 'POST required hai.');
  if (typeof context.ownerId !== 'string' || !context.ownerId || typeof context.runPower !== 'function' || typeof context.readSetting !== 'function') {
    return fail(503, 'unavailable', 'Quick Access abhi configured nahi hai.');
  }
  const parsed = await readBody(request);
  if (parsed.error) return parsed.error;
  const body = parsed.body;

  if (action === 'quick-access.list') {
    if (Object.keys(body).length) return fail(400, 'bad_request', 'Quick Access list ke liye empty body required hai.');
    try {
      const outcome = await context.runPower({
        powerId: QUICK_ACCESS_READ_POWER,
        why: 'Read the owner shortcut list for the Home Quick Access card.',
        confirmed: false,
        run: async () => {
          const stored = await context.readSetting({ ownerId: context.ownerId, key: SETTINGS_KEY });
          const configured = stored?.value?.items ?? stored?.items;
          const normalized = configured === undefined ? null : normalizeShortcutList(configured);
          return { items: normalized ?? [...DEFAULT_SHORTCUTS] };
        },
      });
      return outcome?.ok ? json(200, { ok: true, data: outcome.result }) : gatedFailure(outcome);
    } catch {
      return fail(503, 'unavailable', 'Quick Access list abhi unavailable hai.');
    }
  }

  if (Object.keys(body).sort().join(',') !== 'confirmed,items' || typeof body.confirmed !== 'boolean') {
    return fail(400, 'bad_request', 'items aur confirmed fields required hain.');
  }
  const items = normalizeShortcutList(body.items);
  if (!items) return fail(400, 'bad_request', 'Shortcut list invalid hai (max 8, unique id, safe HTTPS/internal destination).');
  if (typeof context.writeSetting !== 'function') return fail(503, 'unavailable', 'Quick Access save adapter configured nahi hai.');

  try {
    const outcome = await context.runPower({
      powerId: QUICK_ACCESS_MANAGE_POWER,
      why: 'Owner explicitly saved a validated Home shortcut list.',
      confirmed: body.confirmed,
      run: async () => {
        await context.writeSetting({ ownerId: context.ownerId, key: SETTINGS_KEY, value: { items } });
        return { items };
      },
    });
    return outcome?.ok ? json(200, { ok: true, data: outcome.result }) : gatedFailure(outcome);
  } catch {
    return fail(503, 'unavailable', 'Quick Access save nahi ho paaya.');
  }
}
