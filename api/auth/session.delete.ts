import { deleteOwnerSession } from './index.ts';

export async function POST(request: Request): Promise<Response> {
  return deleteOwnerSession(request);
}

export default async function handler(req: any, res?: any) {
  const response = await deleteOwnerSession(req);
  if (res && typeof res.status === 'function') {
    res.status(response.status);
    response.headers.forEach((v: string, k: string) => res.setHeader(k, v));
    const text = await response.text();
    return res.send(text);
  }
  return response;
}
