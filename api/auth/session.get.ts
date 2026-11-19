import { getOwnerSessionResponse } from './index.ts';

export async function GET(request: Request): Promise<Response> {
  return getOwnerSessionResponse(request);
}

export default async function handler(req: any, res?: any) {
  const response = await getOwnerSessionResponse(req);
  if (res && typeof res.status === 'function') {
    res.status(response.status);
    response.headers.forEach((v: string, k: string) => res.setHeader(k, v));
    const text = await response.text();
    return res.send(text);
  }
  return response;
}
