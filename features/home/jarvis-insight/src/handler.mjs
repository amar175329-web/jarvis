import { deriveInsight } from './insight.mjs';

export const ACTIONS = Object.freeze(['insight.summary']);
export const JARVIS_INSIGHT_READ_POWER = 'home.jarvis-insight.read';

function json(status, payload) { return Response.json(payload, { status, headers: { 'cache-control': 'no-store' } }); }
function fail(status, code, message) { return json(status, { ok: false, error: { code, message } }); }
function gateFail(outcome) {
  return fail(Number.isInteger(outcome?.status) ? outcome.status : 503,
    typeof outcome?.code === 'string' ? outcome.code : 'unavailable',
    typeof outcome?.message === 'string' ? outcome.message : 'Insight power ne request block ki.');
}

export async function handle(action, request, context = {}) {
  if (!ACTIONS.includes(action)) return null;
  if (request?.method !== 'POST') return fail(400, 'bad_request', 'POST required hai.');
  if (typeof context.ownerId !== 'string' || !context.ownerId || typeof context.runPower !== 'function' || typeof context.readTasks !== 'function' || typeof context.readActivity !== 'function') {
    return fail(503, 'unavailable', 'Insight data adapters abhi configured nahi hain.');
  }
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 1_000) return fail(413, 'payload_too_large', 'Request body bahut bada hai.');
    const body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) return fail(400, 'bad_request', 'Insight summary ke liye empty JSON body required hai.');
  } catch { return fail(400, 'bad_request', 'Valid empty JSON body required hai.'); }

  try {
    const outcome = await context.runPower({
      powerId: JARVIS_INSIGHT_READ_POWER,
      why: 'Build a local deterministic insight from safe task and activity metadata.',
      confirmed: false,
      run: async () => {
        const [tasks, activity] = await Promise.all([
          context.readTasks({ ownerId: context.ownerId, limit: 500, columns: ['title', 'notes', 'status', 'created_at', 'completed_at', 'updated_at'] }),
          context.readActivity({ ownerId: context.ownerId, limit: 500, columns: ['action', 'ts', 'actor', 'target', 'detail'] }),
        ]);
        return deriveInsight({ tasks, activity, now: context.now ? new Date(context.now) : new Date(), timeZone: context.timeZone ?? 'Asia/Kolkata' });
      },
    });
    return outcome?.ok ? json(200, { ok: true, data: outcome.result }) : gateFail(outcome);
  } catch { return fail(503, 'unavailable', 'Insight abhi unavailable hai.'); }
}
