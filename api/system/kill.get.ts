import { getKillState } from './index.ts';
export default function handler(request: Request): Promise<Response> { return getKillState(request); }
