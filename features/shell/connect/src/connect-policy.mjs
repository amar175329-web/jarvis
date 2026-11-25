export function projectDevice(row, nowMs = Date.now()) {
  if (!row || typeof row !== 'object' || typeof row.id !== 'string' || typeof row.name !== 'string' || !['phone', 'tv', 'computer', 'agent', 'machine-agent'].includes(row.kind)) return null;
  if (row.revoked_at) return null;
  const lastSeen = typeof row.last_seen === 'string' && Number.isFinite(Date.parse(row.last_seen)) ? new Date(row.last_seen).toISOString() : null;
  const pairedAt = typeof row.paired_at === 'string' && Number.isFinite(Date.parse(row.paired_at)) ? new Date(row.paired_at).toISOString() : null;
  return { id: row.id, name: row.name.slice(0, 80), kind: row.kind, pairedAt, lastSeenAt: lastSeen, online: Boolean(lastSeen && nowMs - Date.parse(lastSeen) <= 120_000) };
}
export function profileStatus(user, devices = []) {
  const email = typeof user?.email === 'string' ? user.email.trim().slice(0, 180) : null;
  const safeDevices = Array.isArray(devices) ? devices.filter(Boolean) : [];
  return { email, deviceCount: safeDevices.length, onlineCount: safeDevices.filter((d) => d.online).length, status: email ? 'owner-session-active' : 'owner-session-unavailable' };
}
