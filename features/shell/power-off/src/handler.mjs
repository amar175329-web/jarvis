export const POWER_OFF_ACTIONS = Object.freeze(['system.power-off']);
function json(status, body) { return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } }); }
function fail(status, code, message) { return json(status, { ok: false, error: { code, message } }); }
async function readBody(request) { try { const raw = await request.text(); if (raw.length > 2_000) return null; return JSON.parse(raw); } catch { return null; } }

/**
 * Emergency stop adapter for LEAD's existing /api/system/kill.set route.
 * It has one action only: kill=true. Re-arm belongs to a separate owner-only S22 route.
 */
export async function handle(action, request, context = {}) {
  if (!POWER_OFF_ACTIONS.includes(action)) return fail(404, 'not_found', 'unknown power-off action');
  if (request.method !== 'POST') return fail(405, 'bad_request', 'method not allowed; use POST');
  if (typeof context.requireOwner !== 'function' || typeof context.executePower !== 'function' || typeof context.setKillSwitch !== 'function') return fail(503, 'unavailable', 'power-off handler context is incomplete');
  const owner = await context.requireOwner(request);
  if (!owner?.ok || !owner.user?.id) return fail(owner?.status ?? 401, owner?.status === 503 ? 'unavailable' : 'unauthorized', owner?.message ?? 'owner session required');
  const body = await readBody(request);
  if (!body || body.kill !== true || body.confirm !== true || Object.keys(body).some((key) => !['kill', 'confirm', 'reason'].includes(key)) || (body.reason !== undefined && (typeof body.reason !== 'string' || body.reason.length > 100))) return fail(400, 'bad_request', 'power-off requires explicit confirm:true and only accepts kill:true plus an optional short reason');
  try {
    const result = await context.executePower({
      powerId: 'system.power-off', ownerId: owner.user.id, confirmed: true,
      why: 'Amit ne shell se JARVIS power-off confirm kiya',
      run: async () => context.setKillSwitch({ ownerId: owner.user.id, kill: true, reason: body.reason ?? 'owner_power_off' }),
    });
    if (!result?.executed) return fail(403, 'power_blocked', 'system.power-off power is not enabled; abhi band');
    const state = result.result;
    if (!state || state.kill !== true || !Number.isInteger(state.epoch) || state.epoch < 0) return fail(503, 'unavailable', 'power-off state could not be verified; safety remains blocked');
    return json(200, { ok: true, data: { kill: true, epoch: state.epoch } });
  } catch { return fail(503, 'unavailable', 'power-off failed; safety remains blocked'); }
}
