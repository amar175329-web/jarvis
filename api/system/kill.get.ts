import { getKillState } from './index.ts';

async function toWebRequest(req: any): Promise<Request> {
  if (req instanceof Request || typeof req?.headers?.get === 'function') return req as Request;
  const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host || 'localhost';
  const proto = req?.headers?.['x-forwarded-proto'] || 'https';
  const url = new URL(req?.url || '/api/system/kill.get', `${proto}://${host}`);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req?.headers || {})) {
    if (v !== undefined) Array.isArray(v) ? v.forEach((x) => headers.append(k, String(x))) : headers.set(k, String(v));
  }
  return new Request(url, { method: req?.method || 'GET', headers });
}

export async function GET(request: Request): Promise<Response> {
  return getKillState(request);
}

export default async function handler(req: any, res?: any) {
  const response = await getKillState(await toWebRequest(req));
  if (res && (typeof res.status === 'function' || typeof res.end === 'function')) {
    if (typeof res.status === 'function') res.status(response.status);
    else res.statusCode = response.status;
    response.headers.forEach((v: string, k: string) => res.setHeader?.(k, v));
    const text = await response.text();
    return typeof res.send === 'function' ? res.send(text) : res.end(text);
  }
  return response;
}

