export type ShellSearchResult = { id: string; label: string; description: string; aliases: string[]; destination: string };
export function normalizeSearchText(value: unknown): string;
export function searchShellItems(query: unknown, options?: { limit?: number }): ShellSearchResult[];
export const SEARCH_INDEX_SIZE: number;
