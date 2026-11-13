import { messagesSendHandler } from './index.ts';
export default function handler(request: Request): Promise<Response> { return messagesSendHandler(request); }
