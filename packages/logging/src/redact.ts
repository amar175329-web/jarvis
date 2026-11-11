// Nothing secret may reach a log line. Two layers: by NAME of the field, and by LOOK of the value.
const SECRET_NAME = /(pass(word|wd)?|secret|token|authorization|api[-_]?key|apikey|service[-_]?role|cookie|pepper|private[-_]?key|credential|session|bearer|^key$|_key$)/i;
const SECRET_VALUE: RegExp[] = [
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, // JWT (Supabase anon/service_role keys, sessions)
  /sb_(secret|publishable)_[A-Za-z0-9_-]{8,}/g, // new Supabase keys
  /sk-[A-Za-z0-9_-]{16,}/g, // OpenAI / Anthropic style
  /AIza[A-Za-z0-9_-]{20,}/g, // Google
  /gh[pousr]_[A-Za-z0-9]{20,}/g, // GitHub
  /(Bearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi, // Authorization header text
  /(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s]+(@)/gi, // password inside a database URL
];
export const REDACTED = '[REDACTED]';
const MAX_STRING = 2000, MAX_DEPTH = 6, MAX_ITEMS = 50;

export function redactString(s: string): string {
  let out = s;
  for (const re of SECRET_VALUE) out = out.replace(re, (...m) => (typeof m[1] === 'string' && m.length > 3 && re.source.startsWith('(') ? `${m[1]}${REDACTED}${typeof m[2] === 'string' && typeof m[2] !== 'number' ? m[2] : ''}` : REDACTED));
  return out.length > MAX_STRING ? out.slice(0, MAX_STRING) + `…[+${out.length - MAX_STRING} chars]` : out;
}

/** Copy of any value that is safe to print: secrets hidden, errors flattened, cycles cut, size limited. */
export function redact(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return redactString(value);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function' || typeof value === 'symbol') return `[${typeof value}]`;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if (seen.has(value)) return '[Circular]';
    if (depth >= MAX_DEPTH) return '[Truncated]';
    seen.add(value);
    if (value instanceof Error) {
      const e: Record<string, unknown> = { name: value.name, message: redactString(value.message) };
      if (value.stack) e.stack = redactString(value.stack.split('\n').slice(0, 8).join('\n'));
      if ('cause' in value && value.cause) e.cause = redact(value.cause, depth + 1, seen);
      return e;
    }
    if (Array.isArray(value)) return value.slice(0, MAX_ITEMS).map((v) => redact(v, depth + 1, seen)).concat(value.length > MAX_ITEMS ? [`[+${value.length - MAX_ITEMS} more]`] : []);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value).slice(0, MAX_ITEMS * 2)) out[k] = SECRET_NAME.test(k) ? REDACTED : redact(v, depth + 1, seen);
    return out;
  }
  return String(value);
}
