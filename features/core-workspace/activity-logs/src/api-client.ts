export type ActivityLogItem = {
  id: string;
  ts: string;
  actor: string;
  action: string;
  target: string | null;
  detail: Record<string, string | number | boolean>;
  ok: boolean;
  decision_id: string | null;
};
type Envelope<T> = { ok: true; data: T } | { ok: false; error?: { message?: string; code?: string } };

export class ActivityLogsRequestError extends Error {
  constructor(message: string, readonly code: string) { super(message); this.name = 'ActivityLogsRequestError'; }
}

export async function listActivityLogs(input: {
  before?: string; limit?: number; action?: string; actor?: string; ok?: boolean; confirmed?: boolean;
} = {}): Promise<{ items: ActivityLogItem[]; next_before?: string }> {
  const response = await fetch('/api/tasks/activity-logs.list', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    cache: 'no-store',
    body: JSON.stringify(input),
  });
  const result = await response.json().catch(() => null) as Envelope<{ items: ActivityLogItem[]; next_before?: string }> | null;
  if (!response.ok || !result || result.ok !== true) {
    throw new ActivityLogsRequestError(
      result && result.ok === false ? result.error?.message ?? 'Activity Logs request failed.' : 'Activity Logs request failed.',
      result && result.ok === false ? result.error?.code ?? 'unavailable' : 'unavailable',
    );
  }
  return result.data;
}
