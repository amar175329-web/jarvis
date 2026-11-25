import { normalizePublicNewsItems, sanitizePublicSummary } from './normalize.mjs';

export const ACTIONS = Object.freeze(['news.list', 'news.summarize']);
export const NEWS_READ_POWER = 'home.news.read';
export const NEWS_SUMMARIZE_POWER = 'home.news.summarize';

function json(status, payload) { return Response.json(payload, { status, headers: { 'cache-control': 'no-store' } }); }
function fail(status, code, message) { return json(status, { ok: false, error: { code, message } }); }
function gateFail(outcome) {
  return fail(Number.isInteger(outcome?.status) ? outcome.status : 503,
    typeof outcome?.code === 'string' ? outcome.code : 'unavailable',
    typeof outcome?.message === 'string' ? outcome.message : 'News power ne request block ki.');
}
async function requestBody(request) {
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 1_000) return { error: fail(413, 'payload_too_large', 'Request body bahut bada hai.') };
    const body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: fail(400, 'bad_request', 'News request ke liye JSON object required hai.') };
    return { body };
  } catch { return { error: fail(400, 'bad_request', 'Valid JSON body required hai.') }; }
}

/**
 * Public-only handler. `readPublicNews` is deliberately called with no owner/session
 * arguments. The optional summarizer receives only normalized public article DTOs.
 */
export async function handle(action, request, context = {}) {
  if (!ACTIONS.includes(action)) return null;
  if (request?.method !== 'POST') return fail(400, 'bad_request', 'POST required hai.');
  if (typeof context.ownerId !== 'string' || !context.ownerId || typeof context.runPower !== 'function' || typeof context.readPublicNews !== 'function') {
    return fail(503, 'unavailable', 'Public news adapter abhi configured nahi hai.');
  }
  const parsed = await requestBody(request);
  if (parsed.error) return parsed.error;
  const body = parsed.body;
  const allowedHosts = Array.isArray(context.publicNewsHosts) ? context.publicNewsHosts : [];

  if (action === 'news.list') {
    if (Object.keys(body).length) return fail(400, 'bad_request', 'News list ke liye empty JSON body required hai.');
    try {
      const outcome = await context.runPower({
        powerId: NEWS_READ_POWER,
        why: 'Read bounded headlines from configured public news sources.',
        confirmed: false,
        run: async () => {
          const rawItems = await context.readPublicNews();
          return { items: normalizePublicNewsItems(rawItems, { allowedHosts, limit: 6 }) };
        },
      });
      return outcome?.ok ? json(200, { ok: true, data: outcome.result }) : gateFail(outcome);
    } catch { return fail(503, 'unavailable', 'Public news abhi unavailable hai.'); }
  }

  if (Object.keys(body).sort().join(',') !== 'confirmed' || body.confirmed !== true) return fail(409, 'confirmation_required', 'Cloud summary se pehle explicit confirmation zaroori hai.');
  if (typeof context.summarizePublicNews !== 'function') return fail(503, 'unavailable', 'Public news summary abhi band hai.');
  try {
    const outcome = await context.runPower({
      powerId: NEWS_SUMMARIZE_POWER,
      why: 'Summarize only allowlisted public news; no owner data is included.',
      confirmed: true,
      run: async () => {
        const rawItems = await context.readPublicNews();
        const items = normalizePublicNewsItems(rawItems, { allowedHosts, limit: 6 });
        if (!items.length) return { summary: '', item_count: 0 };
        // Important boundary: only this public DTO is passed to the model adapter.
        const generated = await context.summarizePublicNews({
          items: items.map(({ source, title, summary, url, published_at }) => ({ source, title, summary, url, published_at })),
        });
        return { summary: sanitizePublicSummary(generated), item_count: items.length };
      },
    });
    return outcome?.ok ? json(200, { ok: true, data: outcome.result }) : gateFail(outcome);
  } catch { return fail(503, 'unavailable', 'Public news summary abhi unavailable hai.'); }
}
