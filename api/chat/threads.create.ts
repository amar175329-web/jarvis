import { threadsCreateHandler } from './index.ts';
export default function handler(request: Request): Promise<Response> { return threadsCreateHandler(request); }
