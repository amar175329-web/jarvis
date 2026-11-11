import type { Handler } from './types.ts';

// Built-in jobs. Other squads add their own handlers by kind (dot.case) when they have something to run.
export const builtinHandlers: Record<string, Handler> = {
  'system.keepalive': async ({ store }) => { await store.ping(); return { alive: true }; },
  'system.purge': async ({ store }) => ({ purged_jobs: await store.purge() }),
};
/** Jobs the worker schedules for itself. Same bucket => same idempotency key => stored once. */
export const defaultRecurring = [
  { kind: 'system.keepalive', everyMs: 12 * 3600_000 },
  { kind: 'system.purge', everyMs: 24 * 3600_000 },
];
