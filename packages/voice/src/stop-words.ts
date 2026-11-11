// Local stop commands: no model, no network. Strict on purpose: a short phrase only, and never when it is negated.
// The nukta (़) is dropped everywhere so "प्लीज़" and "प्लीज" match. "ना" is NOT a negation ("रुको ना" = "please stop").
const nk = (s: string) => s.normalize('NFC').replace(/\u093C/g, '');
const STOP_PHRASES = new Set(['ruko', 'ruk', 'ruk jao', 'stop', 'chup', 'chup raho', 'band karo', 'bas', 'bas karo', 'shut up',
  'रुको', 'रुक', 'रुक जाओ', 'रुक जा', 'स्टॉप', 'चुप', 'चुप रहो', 'चुप हो जाओ', 'बंद करो', 'बन्द करो', 'बस', 'बस करो', 'बस कर'].map(nk));
const FILLERS = new Set(['na', 'ना', 'jarvis', 'boss', 'please', 'plz', 'yaar', 'ab', 'abhi', 'जार्विस', 'जार्वीस', 'बॉस', 'प्लीज़', 'यार', 'अब', 'अभी'].map(nk));
const NEGATIONS = new Set(['mat', 'nahi', 'nahin', 'not', 'no', 'dont', "don't", 'never', 'मत', 'नहीं', 'नही', 'कभी'].map(nk));

export function normalizeUtterance(text: string): string[] {
  return nk(text.toLowerCase()).replace(/[.,!?।"“”]/g, ' ').split(/\s+/).filter(Boolean);
}

export function isStopCommand(text: string): boolean {
  const words = normalizeUtterance(text);
  if (words.length === 0 || words.length > 3) return false;
  if (words.some((w) => NEGATIONS.has(w))) return false; // "mat ruko", "ruko mat", "don't stop"
  const core = words.filter((w) => !FILLERS.has(w)).join(' ');
  return STOP_PHRASES.has(core);
}
