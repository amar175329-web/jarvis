import { createEvent } from './index.ts';
export default function handler(request: Request): Promise<Response> { return createEvent(request); }
