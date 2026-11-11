import { formatINR } from '../../locale/src/index.ts';
import { hindiize } from './hindi.ts';

export type Script = 'devanagari' | 'roman';

// Make a reply clean for the ear. Also strips every [bracket] the model or a web page wrote, so nobody can inject voice tags.
export function cleanForSpeech(input: string, script: Script = 'roman'): string {
  let t = input;
  t = t.replace(/```[\s\S]*?```/g, ' ');                       // code blocks
  t = t.replace(/`([^`]*)`/g, '$1');                           // inline code -> its text
  t = t.replace(/\[([^\]]*)\]\((?:[^)]*)\)/g, '$1');           // [text](url) -> text
  t = t.replace(/https?:\/\/\S+/gi, 'link');                   // bare URLs
  t = t.replace(/(?:[A-Za-z]:\\|\/)(?:[\w.\- ]+[\\/])+[\w.\-]+/g, 'file'); // file paths
  t = t.replace(/\[[^\]]*\]/g, ' ');                           // leftover [tags]
  t = t.replace(/\p{Extended_Pictographic}|\uFE0F|\u200D/gu, '');
  t = t.replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '');  // headings, quotes, bullets
  t = t.replace(/[*_~]{1,3}/g, '');                            // bold / italic
  if (script === 'devanagari') return hindiize(t.replace(/\s+/g, ' ').trim()).replace(/\s+/g, ' ').trim();
  t = t.replace(/(?:₹|Rs\.?|INR)\s?([\d,]+(?:\.\d+)?)/gi, (_m, n: string) => {
    const v = Number(n.replace(/,/g, ''));
    return Number.isFinite(v) ? `${formatINR(v, Number.isInteger(v) ? 0 : 2).replace('₹', '').trim()} rupaye` : _m;
  });
  return t.replace(/\s+/g, ' ').trim();
}

// Split into sentences so the first one can be spoken early. Long sentences are cut at a comma.
export function toSpeech(input: string, maxLen = 180, script: Script = 'roman'): string[] {
  const clean = cleanForSpeech(input, script);
  if (!clean) return [];
  const out: string[] = [];
  for (const s of clean.split(/(?<=[.!?।])\s+/)) {
    if (s.length <= maxLen) { if (s.trim()) out.push(s.trim()); continue; }
    let cur = '';
    for (const piece of s.split(/(?<=,)\s+/)) {
      if (cur && (cur + ' ' + piece).length > maxLen) { out.push(cur.trim()); cur = piece; } else cur = cur ? cur + ' ' + piece : piece;
    }
    if (cur.trim()) out.push(cur.trim());
  }
  return out;
}
