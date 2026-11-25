export const SIDEBAR_ITEMS = Object.freeze([
  { id: 'home', label: 'Home', icon: 'i-nhome', destination: 'home' },
  { id: 'chat', label: 'Chat', icon: 'i-nchat', destination: 'chat' },
  { id: 'today', label: 'Today', icon: 'i-ntoday', destination: 'today' },
  { id: 'tasks', label: 'Tasks', icon: 'i-ntasks', destination: 'tasks' },
  { id: 'memory', label: 'Memory', icon: 'i-nmem', destination: 'memory' },
  { id: 'insights', label: 'Insights', icon: 'i-nins', destination: 'insights' },
  { id: 'boards', label: 'Boards', icon: 'i-nboard', destination: 'boards' },
  { id: 'history', label: 'History', icon: 'i-nhist', destination: 'history' },
  { id: 'more', label: 'More Features', icon: 'i-nmore', destination: 'more' },
]);
export function isSidebarDestination(value) { return SIDEBAR_ITEMS.some((item) => item.destination === value); }

export const DEFAULT_DISABLED_DESTINATIONS = Object.freeze(['chat', 'memory', 'insights', 'boards', 'history']);
export function isSidebarItemEnabled(destination, disabledDestinations = DEFAULT_DISABLED_DESTINATIONS) {
  return isSidebarDestination(destination) && !disabledDestinations.includes(destination);
}
