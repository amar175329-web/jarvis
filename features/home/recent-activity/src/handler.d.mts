export const ACTIONS: readonly ['activity.recent'];
export const RECENT_ACTIVITY_POWER: 'home.recent-activity.read';
export type SafeActivityItem = {
  id: string;
  ts: string;
  label: string;
  kind: 'private' | 'task' | 'complete' | 'reminder' | 'system';
  ok: boolean;
  private: boolean;
};
export function sanitizeActivityEntry(row: Record<string, unknown>): SafeActivityItem | null;
export function handle(action: string, request: Request, context?: {
  ownerId?: string;
  readActivity?: (args: { ownerId: string; limit: number }) => Promise<Array<Record<string, unknown>>>;
  runPower?: (args: { powerId: string; why: string; confirmed: boolean; run: () => Promise<SafeActivityItem[]> }) => Promise<{
    ok: boolean; result?: SafeActivityItem[]; status?: number; code?: string; message?: string;
  }>;
}): Promise<Response | null>;
