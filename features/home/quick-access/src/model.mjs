export const MAX_SHORTCUTS = 8;
export const SETTINGS_KEY = 'home.quick-access';

export const DEFAULT_SHORTCUTS = Object.freeze([
  Object.freeze({ id: 'youtube', label: 'YouTube', icon: 'youtube', destination: { type: 'https', url: 'https://www.youtube.com/' } }),
  Object.freeze({ id: 'browser', label: 'Browser', icon: 'browser', destination: { type: 'https', url: 'https://www.google.com/' } }),
  Object.freeze({ id: 'projects', label: 'Projects', icon: 'folder', destination: { type: 'internal', route: 'projects' } }),
]);

const ID = /^[a-z0-9][a-z0-9-]{1,39}$/;
const LABEL = /^[\p{L}\p{N}][\p{L}\p{N} ._'&()-]{0,23}$/u;
const ICONS = new Set(['youtube', 'browser', 'folder', 'link', 'chat']);
const INTERNAL_ROUTES = new Set(['projects', 'chat', 'today', 'tasks']);
const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;

export function safeHttpsUrl(value) {
  if (typeof value !== 'string' || value.length > 240) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    if (url.port && url.port !== '443') return null;
    const host = url.hostname.toLowerCase();
    if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || IPV4.test(host) || host.includes(':')) return null;
    if (!host.includes('.') || host.startsWith('.') || host.endsWith('.')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeShortcut(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { id, label, icon, destination } = value;
  if (typeof id !== 'string' || !ID.test(id)) return null;
  if (typeof label !== 'string' || !LABEL.test(label.trim())) return null;
  if (typeof icon !== 'string' || !ICONS.has(icon)) return null;
  if (!destination || typeof destination !== 'object' || Array.isArray(destination)) return null;
  if (destination.type === 'https') {
    const url = safeHttpsUrl(destination.url);
    if (!url) return null;
    return { id, label: label.trim(), icon, destination: { type: 'https', url } };
  }
  if (destination.type === 'internal' && INTERNAL_ROUTES.has(destination.route)) {
    return { id, label: label.trim(), icon, destination: { type: 'internal', route: destination.route } };
  }
  return null;
}

export function normalizeShortcutList(value) {
  if (!Array.isArray(value) || value.length > MAX_SHORTCUTS) return null;
  const items = [];
  const ids = new Set();
  for (const entry of value) {
    const item = normalizeShortcut(entry);
    if (!item || ids.has(item.id)) return null;
    ids.add(item.id);
    items.push(item);
  }
  return items;
}

export function moveShortcut(items, fromIndex, toIndex) {
  if (!Array.isArray(items) || !Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) return items;
  if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length) return items;
  const copy = [...items];
  const [entry] = copy.splice(fromIndex, 1);
  copy.splice(toIndex, 0, entry);
  return copy;
}
