export const CONNECT_ACTIONS: readonly string[];
export type ConnectContext = { requireOwner(request: Request): Promise<{ ok: true; accessToken: string } | { ok: false; status?: number; message?: string }>; supabase: { url: string; anonKey: string; fetch?: typeof fetch }; now?: () => number };
export function handle(action: string, request: Request, context?: ConnectContext): Promise<Response>;
