export const SETTINGS_KEY = 'shell.preferences';
export const DEFAULT_SHELL_PREFERENCES = Object.freeze({ language: 'hinglish', timeZone: 'Asia/Kolkata', reduceMotion: false });
const LANGUAGES = new Set(['hi', 'hinglish', 'en']);
export function parseShellPreferences(value) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    language: LANGUAGES.has(raw.language) ? raw.language : DEFAULT_SHELL_PREFERENCES.language,
    timeZone: raw.timeZone === 'Asia/Kolkata' || raw.timeZone === 'UTC' ? raw.timeZone : DEFAULT_SHELL_PREFERENCES.timeZone,
    reduceMotion: typeof raw.reduceMotion === 'boolean' ? raw.reduceMotion : DEFAULT_SHELL_PREFERENCES.reduceMotion,
  };
}
export function validateShellPreferencePatch(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, message: 'preferences object required' };
  const keys = Object.keys(input);
  if (!keys.length || keys.some((key) => !['language', 'timeZone', 'reduceMotion'].includes(key))) return { ok: false, message: 'only language, timeZone, and reduceMotion can be changed here' };
  const merged = { ...DEFAULT_SHELL_PREFERENCES, ...input };
  if (!LANGUAGES.has(merged.language) || !['Asia/Kolkata', 'UTC'].includes(merged.timeZone) || typeof merged.reduceMotion !== 'boolean') return { ok: false, message: 'invalid shell preference value' };
  return { ok: true, value: parseShellPreferences(merged) };
}
