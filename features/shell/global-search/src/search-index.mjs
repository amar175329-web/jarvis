const SEARCH_ITEMS = [
  { id: 'home', label: 'Home', description: 'Main workspace', aliases: ['ghar', 'dashboard'], destination: 'home' },
  { id: 'today', label: 'Today', description: 'Aaj ke tasks aur schedule', aliases: ['aaj', 'focus', 'today focus'], destination: 'today' },
  { id: 'tasks', label: 'Tasks', description: 'Task manager', aliases: ['kaam', 'todo', 'task manager'], destination: 'tasks' },
  { id: 'more', label: 'More Features', description: 'Browse JARVIS features', aliases: ['features', 'tools'], destination: 'more' },
  { id: 'settings', label: 'Settings', description: 'General app preferences', aliases: ['preferences', 'set karna', 'settings kholo'], destination: 'settings' },
  { id: 'connect', label: 'Connect devices', description: 'Paired phone and device status', aliases: ['phone connect', 'device', 'jodo'], destination: 'connect' },
];

export function normalizeSearchText(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
}

/** Local-only search. The query is never sent to a server/model and records are never indexed. */
export function searchShellItems(query, { limit = 8 } = {}) {
  const q = normalizeSearchText(query);
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  const ranked = SEARCH_ITEMS.map((item) => {
    const fields = [item.label, item.description, ...item.aliases].map(normalizeSearchText);
    const exact = fields.some((field) => field === q) ? 4 : 0;
    const starts = fields.some((field) => field.startsWith(q)) ? 3 : 0;
    const contains = fields.some((field) => terms.every((term) => field.includes(term))) ? 2 : 0;
    return { item, score: exact || starts || contains };
  }).filter((entry) => entry.score > 0);
  return ranked.sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label)).slice(0, Math.max(1, Math.min(12, limit))).map(({ item }) => ({ ...item }));
}

export const SEARCH_INDEX_SIZE = SEARCH_ITEMS.length;
