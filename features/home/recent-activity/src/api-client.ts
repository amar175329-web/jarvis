import type { SafeActivityItem } from './handler.mjs';

export async function recentActivity() {
  const response = await fetch('/api/tasks/activity.recent', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: '{}',
  });
  let payload: any;
  try { payload = await response.json(); } catch { throw new Error('Activity response valid nahi hai.'); }
  if (!response.ok || payload?.ok !== true || !Array.isArray(payload?.data?.items)) {
    const code = payload?.error?.code ?? 'request_failed';
    throw new Error(`Recent activity load nahi hui (${code}).`);
  }
  return payload.data.items as SafeActivityItem[];
}
