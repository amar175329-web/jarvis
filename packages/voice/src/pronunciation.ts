// Word-level respelling for Hindi words Fish reads wrongly (e.g. "कल" heard as "कॉल"). Found by the round-trip check, then added here
// one word at a time: key = the word as JARVIS writes it, value = the spelling that Fish pronounces correctly. Empty until proven by ear/ASR.
export const PRONUNCIATION: Record<string, string> = {};

// Replaces whole Devanagari words only (the danda । is not part of a word, so "कल।" still matches "कल").
export function applyPronunciation(text: string, map: Record<string, string> = PRONUNCIATION): string {
  if (Object.keys(map).length === 0) return text;
  return text.replace(/[\u0900-\u0963\u0966-\u097F]+/g, (w) => map[w] ?? w);
}
