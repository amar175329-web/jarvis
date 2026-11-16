import { messagesStreamHandler } from './index.ts';
export default function handler(request: Request): Promise<Response> { return messagesStreamHandler(request); }
