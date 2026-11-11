import { createOwnerSession } from './index.ts';
export default function handler(request: Request): Promise<Response> { return createOwnerSession(request); }
