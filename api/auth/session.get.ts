import { getOwnerSessionResponse } from './index.ts';
export default function handler(request: Request): Promise<Response> { return getOwnerSessionResponse(request); }
