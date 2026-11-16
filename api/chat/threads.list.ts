import { threadsListHandler } from './index.ts';
export default function handler(request: Request): Promise<Response> { return threadsListHandler(request); }
