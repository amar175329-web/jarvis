import { isCancellableLiveActivity, projectLiveActivity } from './project.mjs';

export const ACTIONS = Object.freeze(['live.activity', 'live.stop']);
export const LIVE_ACTIVITY_READ_POWER = 'home.live-activity.read';
export const LIVE_ACTIVITY_STOP_POWER = 'home.live-activity.stop';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(status, payload) { return Response.json(payload, { status, headers: { 'cache-control': 'no-store' } }); }
function fail(status, code, message) { return json(status, { ok: false, error: { code, message } }); }
function gateFail(outcome) {
  return fail(Number.isInteger(outcome?.status) ? outcome.status : 503,
    typeof outcome?.code === 'string' ? outcome.code : 'unavailable',
    typeof outcome?.message === 'string' ? outcome.message : 'Live Activity power ne request block ki.');
}
async function bodyJson(request) {
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 1_000) return { error: fail(413, 'payload_too_large', 'Request body bahut bada hai.') };
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: fail(400, 'bad_request', 'JSON object required hai.') };
    return { value };
  } catch { return { error: fail(400, 'bad_request', 'Valid JSON required hai.') }; }
}

/** The shared API function injects owner-scoped readers, stop adapter and executePower. */
export async function handle(action, request, context = {}) {
  if (!ACTIONS.includes(action)) return null;
  if (request?.method !== 'POST') return fail(400, 'bad_request', 'POST required hai.');
  if (typeof context.ownerId !== 'string' || !context.ownerId || typeof context.runPower !== 'function') {
    return fail(503, 'unavailable', 'Live Activity abhi configured nahi hai.');
  }
  const parsed = await bodyJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.value;

  if (action === 'live.activity') {
    if (Object.keys(body).length) return fail(400, 'bad_request', 'Live Activity read ke liye empty body required hai.');
    if (typeof context.readJobs !== 'function' || typeof context.readPhoneCommands !== 'function') return fail(503, 'unavailable', 'Live Activity readers configured nahi hain.');
    try {
      const outcome = await context.runPower({
        powerId: LIVE_ACTIVITY_READ_POWER,
        why: 'Read safe status metadata for active JARVIS work on the Home card.',
        confirmed: false,
        run: async () => {
          const [jobs, phoneCommands] = await Promise.all([
            context.readJobs({ ownerId: context.ownerId, states: ['queued', 'running'], limit: 8, columns: ['id', 'kind', 'state', 'created_at'] }),
            context.readPhoneCommands({ ownerId: context.ownerId, states: ['queued', 'sent', 'running'], limit: 8, columns: ['id', 'state', 'created_at'] }),
          ]);
          return { items: projectLiveActivity({ jobs, phoneCommands, limit: 5 }) };
        },
      });
      return outcome?.ok ? json(200, { ok: true, data: outcome.result }) : gateFail(outcome);
    } catch { return fail(503, 'unavailable', 'Live Activity read unavailable hai.'); }
  }

  if (Object.keys(body).sort().join(',') !== 'confirmed,id,source' || typeof body.confirmed !== 'boolean' || !UUID.test(String(body.id ?? '')) || !['job', 'phone'].includes(body.source)) {
    return fail(400, 'bad_request', 'id, source aur confirmed required hain.');
  }
  if (!body.confirmed) return fail(409, 'confirmation_required', 'Stop se pehle explicit confirmation zaroori hai.');
  if (typeof context.stopActivity !== 'function') return fail(503, 'unavailable', 'Stop adapter configured nahi hai.');

  try {
    const outcome = await context.runPower({
      powerId: LIVE_ACTIVITY_STOP_POWER,
      why: 'Owner explicitly confirmed stopping a queued JARVIS activity from the Home Live Activity card.',
      confirmed: true,
      run: async () => {
        const result = await context.stopActivity({ ownerId: context.ownerId, id: body.id, source: body.source, onlyIfState: 'queued' });
        if (!result?.stopped) throw new Error('activity is no longer queued or cannot be stopped');
        return { stopped: true };
      },
    });
    return outcome?.ok ? json(200, { ok: true, data: outcome.result }) : gateFail(outcome);
  } catch { return fail(409, 'conflict', 'Activity ab queued nahi hai ya stop nahi ho sakti.'); }
}
