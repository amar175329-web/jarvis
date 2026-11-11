// ONE error format for every API route. Success is { ok: true, data }, failure is { ok: false, error }.
import { z } from 'zod';

// code -> HTTP status. Add a code only with LEAD/S00 approval.
export const ERROR_STATUS = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  payload_too_large: 413,
  kill_switch_on: 423,
  rate_limited: 429,
  internal: 500,
  unavailable: 503,
} as const;
export type ErrorCode = keyof typeof ERROR_STATUS;
export const ERROR_CODES = Object.keys(ERROR_STATUS) as [ErrorCode, ...ErrorCode[]];

export const ErrorBodySchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string().max(1000), // short, plain, safe to show to Amit. Never contains secrets.
    request_id: z.string().max(100).optional(), // same id is written in the logs
    details: z.unknown().optional(), // e.g. zod issues for bad_request
  }).strict(),
}).strict();
export type ErrorBody = z.infer<typeof ErrorBodySchema>;

export const okBody = <T extends z.ZodTypeAny>(data: T) => z.object({ ok: z.literal(true), data }).strict();

export function errorBody(code: ErrorCode, message: string, extra: { request_id?: string; details?: unknown } = {}): { status: number; body: ErrorBody } {
  return { status: ERROR_STATUS[code], body: { ok: false, error: { code, message, ...extra } } };
}
