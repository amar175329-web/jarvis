export const SETTINGS_ACTIONS: readonly string[];
export type SettingsContext = { requireOwner(request: Request): Promise<{ ok: true; user: { id: string }; accessToken: string; setCookie?: string } | { ok: false; status?: number; message?: string }>; supabase: { url: string; anonKey: string; fetch?: typeof fetch }; executePower?(args: { powerId: string; ownerId: string; confirmed: boolean; why: string; run: () => Promise<unknown> }): Promise<{ executed: boolean; result?: unknown }> };
export function handle(action: string, request: Request, context?: SettingsContext): Promise<Response>;
