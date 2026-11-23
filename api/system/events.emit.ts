import { createEvent } from './index.ts';

async function toWebRequest(req: any): Promise<Request> {
  if (req instanceof Request || typeof req?.headers?.get === 'function') return req as Request;
  const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host || 'localhost';
  const proto = req?.headers?.['x-forwarded-proto'] || 'https';
  const url = new URL(req?.url || '/api/system/events.emit', `${proto}://${host}`);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req?.headers || {})) {
    if (v !== undefined) Array.isArray(v) ? v.forEach((x) => headers.append(k, String(x))) : headers.set(k, String(v));
  }
  const method = req?.method || 'POST';
  let body: string | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    if (req?.body !== undefined) body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    else if (typeof req?.[Symbol.asyncIterator] === 'function') {
      const chunks: Uint8Array[] = [];
      for await (const chunk of req) chunks.push(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk);
      if (chunks.length) body = new TextDecoder().decode(Buffer.concat(chunks));
    }
  }
  return new Request(url, { method, headers, ...(body !== undefined ? { body } : {}) });
}

export async function POST(request: Request): Promise<Response> {
  return createEvent(request);
}

export default async function handler(req: any, res?: any) {
  const response = await createEvent(await toWebRequest(req));
  if (res && (typeof res.status === 'function' || typeof res.end === 'function')) {
    if (typeof res.status === 'function') res.status(response.status);
    else res.statusCode = response.status;
    response.headers.forEach((v: string, k: string) => res.setHeader?.(k, v));
    const text = await response.text();
    return typeof res.send === 'function' ? res.send(text) : res.end(text);
  }
  return response;
}

