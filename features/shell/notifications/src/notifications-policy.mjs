const SAFE_EVENT_LABELS = Object.freeze({
  'device.paired': 'Device connected',
  'device.revoked': 'Device disconnected',
  'bot.run.finished': 'Background run finished',
  'model.usage.recorded': 'Model usage recorded',
  'chat.thread.created': 'New chat thread',
  'chat.message.error': 'Chat needs attention',
  'brain.action.done': 'JARVIS action finished',
  'brain.confirm.needed': 'Approval is waiting',
});

export function notificationLabel(type) {
  return typeof type === 'string' ? SAFE_EVENT_LABELS[type] ?? null : null;
}

/** Accept only an event envelope's public metadata. Payload/source/detail never leave the handler. */
export function projectNotification(row, readThrough = null) {
  if (!row || typeof row !== 'object' || typeof row.id !== 'string') return null;
  const title = notificationLabel(row.type);
  const ts = typeof row.ts === 'string' && Number.isFinite(Date.parse(row.ts)) ? new Date(row.ts).toISOString() : null;
  if (!title || !ts) return null;
  const through = typeof readThrough === 'string' && Number.isFinite(Date.parse(readThrough)) ? Date.parse(readThrough) : 0;
  return { id: row.id, title, createdAt: ts, unread: Date.parse(ts) > through };
}

export function readThroughFromSetting(value) {
  const through = value && typeof value === 'object' ? value.through : null;
  return typeof through === 'string' && Number.isFinite(Date.parse(through)) ? new Date(through).toISOString() : null;
}

export function latestEventTime(rows) {
  const valid = (Array.isArray(rows) ? rows : []).map((row) => typeof row?.ts === 'string' ? Date.parse(row.ts) : NaN).filter(Number.isFinite);
  return valid.length ? new Date(Math.max(...valid)).toISOString() : null;
}

export const NOTIFICATION_EVENT_TYPES = Object.freeze(Object.keys(SAFE_EVENT_LABELS));
