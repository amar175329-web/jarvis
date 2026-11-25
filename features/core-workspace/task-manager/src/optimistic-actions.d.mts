export const OPEN_TASK_STATES: readonly string[];
export const ARCHIVED_TASK_STATES: readonly string[];
export const OPEN_REMINDER_STATES: readonly string[];
export const ARCHIVED_REMINDER_STATES: readonly string[];
export function countOpenTasks(tasks: Array<{ status: string }>): number;
export function splitByState<T>(items: T[], stateKey: keyof T, activeStates: readonly unknown[]): { active: T[]; archived: T[] };
export function replaceById<T extends { id: string }>(items: T[], id: string, replacement: T): T[];
export function removeById<T extends { id: string }>(items: T[], id: string): T[];
export function runOptimisticMutation<T>(args: {
  snapshot: () => T; optimistic: () => void; request: () => Promise<unknown>;
  commit: (result: any) => void; rollback: (snapshot: T) => void; onError?: (error: unknown) => void;
}): Promise<{ ok: true; result: unknown } | { ok: false; error: unknown }>;
export function createDeferredActionQueue(options?: {
  delayMs?: number; setTimer?: typeof setTimeout; clearTimer?: typeof clearTimeout;
}): {
  schedule(key: string, run: (keepalive: boolean) => Promise<unknown> | unknown, onError?: (error: unknown) => void): () => boolean;
  cancel(key: string): boolean; flushAll(): Promise<PromiseSettledResult<unknown>[]>;
  has(key: string): boolean; readonly size: number;
};
export function friendlyActionError(error: any): string;

export function createAutoDismissTimer(options?: { delayMs?: number; setTimer?: typeof setTimeout; clearTimer?: typeof clearTimeout }): { schedule(onExpire: () => void): void; clear(): void; readonly active: boolean };
