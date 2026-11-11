// NEVER-STORE detector (secrets, credentials, card/bank, ID numbers). Runs BEFORE anything is saved or embedded.
// Honest limit: patterns catch the usual shapes only. They cannot catch everything, so Amit can always delete/export/edit,
// and a weekly re-scan of stored rows is planned (memory.rescan job). A match = the whole candidate is refused (no partial save).
export type SecretKind = 'api_key' | 'private_key' | 'password' | 'otp' | 'card' | 'cvv' | 'bank_account' | 'upi_pin' | 'gov_id' | 'recovery_phrase' | 'session_token';
export type Finding = { kind: SecretKind; start: number; end: number };

export function luhn(digits: string): boolean {
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0, alt = false;
  for (let i = digits.length - 1; i >= 0; i--) { let n = digits.charCodeAt(i) - 48; if (alt) { n *= 2; if (n > 9) n -= 9; } sum += n; alt = !alt; }
  return sum % 10 === 0;
}

const VD = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
const VP = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
/** Verhoeff checksum (Aadhaar uses it). True when the digit string is valid. */
export function verhoeff(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let c = 0; const rev = digits.split('').reverse();
  for (let i = 0; i < rev.length; i++) c = VD[c]![VP[i % 8]![rev[i]!.charCodeAt(0) - 48]!]!;
  return c === 0;
}

const KEY_PATTERNS: RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{10,}/g, /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/g, /AIza[0-9A-Za-z_-]{30,}/g, /\bgh[pousr]_[A-Za-z0-9]{30,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g, /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /\b(?:xox[abp]-[A-Za-z0-9-]{10,}|\d{8,10}:AA[A-Za-z0-9_-]{30,})/g, /\bbearer\s+[A-Za-z0-9._~+\/-]{20,}/gi,
];
const IGNORE_PW_VALUE = new Set(['manager', 'ka', 'ko', 'ki', 'badal', 'badalna', 'change', 'reset', 'kaise', 'nahi', 'bhool', 'bhul', 'yaad', 'security', 'policy', 'strong', 'weak', 'hai', 'bata', 'batao', 'mat', 'ye', 'woh', 'wo', 'app', 'vault', 'store', 'save', 'lock', 'protected']);

function digitsOf(s: string): string { return s.replace(/\D/g, ''); }
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export function findSecrets(text: string): Finding[] {
  const out: Finding[] = [];
  const add = (kind: SecretKind, m: RegExpMatchArray | RegExpExecArray) => { if (m.index === undefined) return; out.push({ kind, start: m.index, end: m.index + m[0].length }); };

  for (const re of KEY_PATTERNS) for (const m of text.matchAll(re)) add('api_key', m);
  for (const m of text.matchAll(/-----BEGIN [A-Z ]*PRIVATE KEY-----/g)) add('private_key', m);
  // long mixed letter+digit blobs without spaces (tokens, hashes of secrets). UUIDs are not secrets.
  for (const m of text.matchAll(/[A-Za-z0-9_\-+\/=]{32,}/g)) { const v = m[0]; if (!isUuid(v) && /[A-Za-z]/.test(v) && /\d/.test(v)) add('api_key', m); }

  // numbers: card (Luhn) and Aadhaar (Verhoeff), with or without spaces/hyphens
  for (const m of text.matchAll(/\b\d(?:[ -]?\d){11,18}\b/g)) {
    const d = digitsOf(m[0]);
    if (d.length >= 13 && luhn(d)) add('card', m);
    else if (d.length === 12 && /^[2-9]/.test(d) && verhoeff(d)) add('gov_id', m);
  }
  for (const m of text.matchAll(/(?:aadhaar|aadhar|adhar|आधार|\buid\b)\D{0,15}(\d{4}[\s-]?\d{4}[\s-]?\d{4})/gi)) add('gov_id', m);
  for (const m of text.matchAll(/\b[A-Za-z]{3}[PCHFATBLJGpchfatbljg][A-Za-z]\d{4}[A-Za-z]\b/g)) add('gov_id', m); // PAN: AAAPL1234C
  for (const m of text.matchAll(/(?:passport|पासपोर्ट)\D{0,15}[A-Za-z]\d{7}\b/gi)) add('gov_id', m);
  for (const m of text.matchAll(/(?:voter\s*id|driving\s*licen[cs]e|\bdl\s*no\b|epic\s*no)\D{0,15}[A-Za-z0-9]{8,16}/gi)) add('gov_id', m);

  for (const m of text.matchAll(/(?:otp|ओटीपी|one[\s-]?time\s*(?:password|code)|verification\s*code|security\s*code|login\s*code)\D{0,20}?\d{4,8}\b/gi)) add('otp', m);
  for (const m of text.matchAll(/\b\d{4,8}\D{0,15}(?:otp|ओटीपी)/gi)) add('otp', m);
  for (const m of text.matchAll(/(?:cvv|cvc|सीवीवी)\D{0,12}\d{3,4}\b/gi)) add('cvv', m);
  for (const m of text.matchAll(/(?:upi\s*pin|atm\s*pin|card\s*pin|bank\s*pin|\bm-?pin\b|यूपीआई\s*पिन)\D{0,12}\d{4,6}\b/gi)) add('upi_pin', m);
  for (const m of text.matchAll(/\bpin\D{0,6}\d{4,6}\b/gi)) { const around = text.slice(Math.max(0, (m.index ?? 0) - 40), (m.index ?? 0) + m[0].length + 20); if (/upi|atm|debit|credit|card|bank|paytm|gpay|phonepe/i.test(around)) add('upi_pin', m); }
  for (const m of text.matchAll(/(?:account|a\/c|acc(?:ount)?\.?\s*(?:no|number|num)|khata|खाता|खाते)\D{0,20}\d{9,18}\b/gi)) add('bank_account', m);
  for (const m of text.matchAll(/\b[A-Z]{4}0[A-Z0-9]{6}\b/g)) add('bank_account', m); // IFSC

  // password: "password <value>" where value looks like a real credential
  for (const m of text.matchAll(/(?:password|passwd|pwd|passcode|पासवर्ड|पासकोड)\s*(is|hai|h|है|=|:|-)?\s*(\S{4,})/gi)) {
    const val = (m[2] ?? '').replace(/[.,;!?]+$/, '').toLowerCase(); const explicit = !!m[1];
    if (IGNORE_PW_VALUE.has(val)) continue;
    if (/[\d\W_]/.test(val) || explicit) add('password', m);
  }
  for (const m of text.matchAll(/(\S{4,})\s+(?:mera|meri|ka|my)?\s*(?:password|पासवर्ड)\s*(?:hai|है|is)\b/gi)) if (/[\d\W_]/.test(m[1] ?? '')) add('password', m);

  for (const m of text.matchAll(/(?:seed\s*phrase|recovery\s*phrase|mnemonic|secret\s*phrase)[\s\S]{0,200}/gi)) { const words = m[0].split(/\s+/).filter((w) => /^[a-z]{3,8}$/.test(w)); if (words.length >= 11) add('recovery_phrase', m); }
  for (const m of text.matchAll(/(?:cookie|session[_\s-]?(?:id|token)?|auth[_\s-]?token|access[_\s-]?token|refresh[_\s-]?token)\s*[:=]\s*\S{16,}/gi)) add('session_token', m);

  return mergeFindings(out);
}

function mergeFindings(f: Finding[]): Finding[] {
  const s = [...f].sort((a, b) => a.start - b.start || b.end - a.end); const out: Finding[] = [];
  for (const x of s) { const last = out[out.length - 1]; if (last && x.start < last.end) { if (x.end > last.end) last.end = x.end; } else out.push({ ...x }); }
  return out;
}

export const REDACTED = '[hata diya]';
/** Replaces every finding. Used on anything that is shown or embedded, as a second line of defence. */
export function redactText(text: string): string {
  const f = findSecrets(text); if (!f.length) return text;
  let out = '', i = 0; for (const x of f) { out += text.slice(i, x.start) + REDACTED; i = x.end; } return out + text.slice(i);
}
export const hasSecret = (text: string): boolean => findSecrets(text).length > 0;
