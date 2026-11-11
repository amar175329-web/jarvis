import { updateKillState } from './index.ts';
export default function handler(request: Request): Promise<Response> { return updateKillState(request); }
