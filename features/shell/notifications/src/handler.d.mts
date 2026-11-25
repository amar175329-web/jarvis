export const NOTIFICATION_ACTIONS: readonly string[];
export type NotificationOwner = { ok: true; user: { id: string }; accessToken: string; setCookie?: string } | { ok: false; status?: number; message?: string; clearCookie?: boolean };
export type NotificationsContext = { requireOwner(request: Request): Promise<NotificationOwner>; supabase: { url: string; anonKey: string; fetch?: typeof fetch }; executePower?(args: { powerId: string; ownerId: string; confirmed: boolean; why: string; run: () => Promise<unknown> }): Promise<{ executed: boolean; result?: unknown }> };
export function handle(action: string, request: Request, context?: NotificationsContext): Promise<Response>;
