import { listEvents } from './index.ts';
export default function handler(request: Request): Promise<Response> { return listEvents(request); }
