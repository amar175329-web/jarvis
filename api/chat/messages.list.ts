import { messagesListHandler } from './index.ts';
export default function handler(request: Request): Promise<Response> { return messagesListHandler(request); }
