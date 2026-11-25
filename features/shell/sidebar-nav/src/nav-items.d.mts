export type SidebarItem = { id: string; label: string; icon: string; destination: string };
export const SIDEBAR_ITEMS: readonly SidebarItem[];
export function isSidebarDestination(value: unknown): boolean;

export const DEFAULT_DISABLED_DESTINATIONS: readonly string[];
export function isSidebarItemEnabled(destination: string, disabledDestinations?: readonly string[]): boolean;
