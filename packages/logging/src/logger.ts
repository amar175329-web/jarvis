// Structured logs: one JSON object per line. Every field passes through redact() before any sink sees it.
import { systemClock, type Clock } from '../../shared/src/index.ts';
import { redact, redactString } from './redact.ts';

export type Level = 'debug' | 'info' | 'warn' | 'error';
const RANK: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
export type LogEntry = { ts: string; level: Level; service: string; msg: string; request_id?: string } & Record<string, unknown>;
export interface Sink { write(entry: LogEntry): void }

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

export function createLogger(opts: { service: string; level?: Level; sinks?: Sink[]; clock?: Clock; bindings?: Record<string, unknown> }): Logger {
  const { service, level = 'info', sinks = [consoleSink()], clock = systemClock, bindings = {} } = opts;
  const emit = (lv: Level, msg: string, fields: Record<string, unknown> = {}) => {
    if (RANK[lv] < RANK[level]) return;
    const safe = redact({ ...bindings, ...fields }) as Record<string, unknown>;
    const entry = { ts: clock.now().toISOString(), level: lv, service, msg: redactString(String(msg)), ...safe } as LogEntry;
    for (const s of sinks) { try { s.write(entry); } catch { /* a broken sink must never break the program */ } }
  };
  return {
    debug: (m, f) => emit('debug', m, f), info: (m, f) => emit('info', m, f), warn: (m, f) => emit('warn', m, f), error: (m, f) => emit('error', m, f),
    child: (b) => createLogger({ service, level, sinks, clock, bindings: { ...bindings, ...b } }),
  };
}

/** warn/error go to stderr, the rest to stdout. */
export function consoleSink(out: (s: string) => void = (s) => process.stdout.write(s + '\n'), err: (s: string) => void = (s) => process.stderr.write(s + '\n')): Sink {
  return { write: (e) => (RANK[e.level] >= RANK.warn ? err : out)(JSON.stringify(e)) };
}
export function memorySink(): Sink & { entries: LogEntry[] } {
  const entries: LogEntry[] = [];
  return { entries, write: (e) => { entries.push(e); } };
}

/** One row for the activity_log table (warn and error only; keep the free 500 MB small). */
export function toActivityRow(e: LogEntry): { actor: string; action: string; target: string | null; detail: Record<string, unknown>; ok: boolean } | null {
  if (RANK[e.level] < RANK.warn) return null;
  const { ts, level, service, msg, request_id, ...rest } = e;
  return { actor: service, action: `log.${level}`, target: request_id ?? null, detail: { msg, ts, ...rest }, ok: false };
}

export const newRequestId = (): string => 'req_' + [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('');
