// Tokenizer for keyword search. Works for English, Roman Hinglish and Devanagari WITHOUT any database text-search parser
// (Postgres' default parser may split Devanagari words at vowel signs; we avoid that risk by storing tokens ourselves).
import { LIMITS } from './rules.ts';

const STOP = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'of', 'to', 'and', 'in', 'on', 'for', 'at', 'it', 'my', 'me', 'i', 'you',
  'hai', 'hain', 'ka', 'ki', 'ke', 'ko', 'se', 'me', 'mein', 'par', 'pe', 'aur', 'ye', 'yeh', 'wo', 'woh', 'tha', 'thi', 'the', 'kya', 'mera', 'meri', 'mere', 'hoon', 'ho',
  'है', 'हैं', 'का', 'की', 'के', 'को', 'से', 'में', 'पर', 'और', 'यह', 'वह', 'था', 'थी', 'क्या', 'मेरा', 'मेरी', 'मेरे',
]);

export function normalize(s: string): string { return s.normalize('NFC').toLowerCase().replace(/[\u200b-\u200d\ufeff]/g, ''); }

export function tokenize(s: string, max: number = LIMITS.tokens): string[] {
  const seen = new Set<string>(); const out: string[] = [];
  for (const m of normalize(s).matchAll(/[\p{L}\p{M}\p{N}_]+/gu)) {
    const t = m[0];
    if (t.length < 2 || STOP.has(t)) continue;
    if (!seen.has(t)) { seen.add(t); out.push(t); if (out.length >= max) break; }
  }
  return out;
}

export function tokensFor(title: string, body: string, tags: string[] = []): string[] { return tokenize(`${title} ${body} ${tags.join(' ')}`); }

/** Share (0..1) of the query tokens that appear in the memory tokens. */
export function overlap(queryTokens: string[], memTokens: string[]): number {
  if (!queryTokens.length) return 0;
  const m = new Set(memTokens); let n = 0;
  for (const q of queryTokens) if (m.has(q)) n++;
  return n / queryTokens.length;
}

/** Same text for "is this the same fact?" checks (spaces, case, punctuation ignored). */
export function fingerprintText(s: string): string { return tokenize(s, 200).sort().join(' '); }
