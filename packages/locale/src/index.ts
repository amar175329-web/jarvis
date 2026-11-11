// Time and language rules (decision: store UTC, show Asia/Kolkata). India has no daylight saving, so IST = UTC+05:30 always.
// No Intl and no libraries: the same answer on every machine, and easy to copy to Kotlin later.

export type Lang = 'en' | 'hi' | 'hinglish';
export const IST_OFFSET_MIN = 330;
export const TIMEZONE = 'Asia/Kolkata';

export type ISTParts = { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number };

/** The wall-clock in India for a UTC instant. weekday: 0 = Sunday. */
export function toISTParts(d: Date): ISTParts {
  const x = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  return { year: x.getUTCFullYear(), month: x.getUTCMonth() + 1, day: x.getUTCDate(), hour: x.getUTCHours(), minute: x.getUTCMinutes(), second: x.getUTCSeconds(), weekday: x.getUTCDay() };
}
/** India wall-clock -> the UTC instant (what we store). Rejects dates that do not exist (31 Feb). */
export function istToUtc(y: number, m: number, d: number, h = 0, mi = 0, s = 0): Date {
  const t = Date.UTC(y, m - 1, d, h, mi, s) - IST_OFFSET_MIN * 60_000;
  const back = toISTParts(new Date(t));
  if (back.year !== y || back.month !== m || back.day !== d || back.hour !== h || back.minute !== mi || back.second !== s) throw new RangeError(`not a real IST date-time: ${y}-${m}-${d} ${h}:${mi}:${s}`);
  return new Date(t);
}
export const startOfDayIST = (d: Date): Date => { const p = toISTParts(d); return istToUtc(p.year, p.month, p.day); };
export const startOfMonthIST = (d: Date): Date => { const p = toISTParts(d); return istToUtc(p.year, p.month, 1); };
export const addDaysIST = (d: Date, n: number): Date => { const p = toISTParts(d); return new Date(Date.UTC(p.year, p.month - 1, p.day + n, p.hour, p.minute, p.second) - IST_OFFSET_MIN * 60_000); };

/** "2026-11-07 17:10" or "2026-11-07T17:10" (India time) -> UTC Date. Strict: anything else throws. */
export function parseISTDateTime(text: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(toAsciiDigits(text.trim()));
  if (!m) throw new RangeError(`expected YYYY-MM-DD HH:MM, got "${text}"`);
  return istToUtc(+m[1], +m[2], +m[3], +m[4], +m[5], m[6] ? +m[6] : 0);
}

// ----- names -----
const MONTH_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_HI = ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'];
const DAY_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_HI = ['रविवार', 'सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार'];
// Hinglish people write English month and weekday names, so Hinglish dates use the English names.

export type DateStyle = 'short' | 'long' | 'full';
/** short: 7 Nov 2026 | long: 7 November 2026 | full: Saturday, 7 November 2026 (Hindi names for lang 'hi'). */
export function formatDate(d: Date, lang: Lang = 'en', style: DateStyle = 'long'): string {
  const p = toISTParts(d);
  const hi = lang === 'hi';
  const month = (hi ? MONTH_HI : MONTH_EN)[p.month - 1];
  const core = `${p.day} ${style === 'short' && !hi ? month.slice(0, 3) : month} ${p.year}`;
  return style === 'full' ? `${(hi ? DAY_HI : DAY_EN)[p.weekday]}, ${core}` : core;
}

/** en: 5:10 PM | hi: शाम 5:10 बजे | hinglish: shaam 5:10 baje */
export function formatTime(d: Date, lang: Lang = 'en'): string {
  const { hour, minute } = toISTParts(d);
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const mm = String(minute).padStart(2, '0');
  if (lang === 'en') return `${h12}:${mm} ${hour < 12 ? 'AM' : 'PM'}`;
  const part = dayPart(hour);
  return lang === 'hi' ? `${PART_HI[part]} ${h12}:${mm} बजे` : `${PART_ROMAN[part]} ${h12}:${mm} baje`;
}
export function formatDateTime(d: Date, lang: Lang = 'en', style: DateStyle = 'long'): string { return `${formatDate(d, lang, style)}, ${formatTime(d, lang)}`; }

type Part = 'morning' | 'afternoon' | 'evening' | 'night';
const PART_HI: Record<Part, string> = { morning: 'सुबह', afternoon: 'दोपहर', evening: 'शाम', night: 'रात' };
const PART_ROMAN: Record<Part, string> = { morning: 'subah', afternoon: 'dopahar', evening: 'shaam', night: 'raat' };
/** 04-11 morning, 12-15 afternoon, 16-19 evening, 20-03 night (India time). */
export function dayPart(hour: number): Part { return hour >= 4 && hour < 12 ? 'morning' : hour >= 12 && hour < 16 ? 'afternoon' : hour >= 16 && hour < 20 ? 'evening' : 'night'; }

const GREET: Record<Lang, Record<Part, string>> = {
  en: { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening', night: 'Good night' },
  hi: { morning: 'सुप्रभात', afternoon: 'नमस्कार', evening: 'शुभ संध्या', night: 'शुभ रात्रि' },
  hinglish: { morning: 'Good morning', afternoon: 'Namaste', evening: 'Good evening', night: 'Shubh ratri' },
};
export function greeting(d: Date, lang: Lang = 'en'): string { return GREET[lang][dayPart(toISTParts(d).hour)]; }

/** "today / tomorrow / yesterday" words. Hindi "कल" means both yesterday and tomorrow, so we say "बीता कल" for the past. Other days: full date. */
export function relativeDay(d: Date, now: Date, lang: Lang = 'en'): string {
  const diff = Math.round((startOfDayIST(d).getTime() - startOfDayIST(now).getTime()) / 86_400_000);
  const w: Record<number, Record<Lang, string>> = { 0: { en: 'today', hi: 'आज', hinglish: 'aaj' }, 1: { en: 'tomorrow', hi: 'कल', hinglish: 'kal' }, [-1]: { en: 'yesterday', hi: 'बीता कल', hinglish: 'beeta kal' } };
  return w[diff]?.[lang] ?? formatDate(d, lang, 'long');
}

// ----- digits -----
const DEV = '०१२३४५६७८९';
export const toDevanagariDigits = (s: string): string => s.replace(/[0-9]/g, (c) => DEV[+c]);
export const toAsciiDigits = (s: string): string => s.replace(/[०-९]/g, (c) => String(DEV.indexOf(c)));

/** Indian grouping: 1234567.5 -> ₹12,34,567.50 */
export function formatINR(n: number, decimals = 2): string {
  const neg = n < 0; const [i, f] = Math.abs(n).toFixed(decimals).split('.');
  const last3 = i.slice(-3), rest = i.slice(0, -3);
  const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3 : last3;
  return `${neg ? '-' : ''}₹${grouped}${f ? '.' + f : ''}`;
}

// ----- which language is this text? -----
const HINGLISH_WORDS = new Set(['hai', 'hain', 'nahi', 'nahin', 'kya', 'kyun', 'kaise', 'mujhe', 'mera', 'meri', 'tum', 'aap', 'karo', 'kar', 'karna', 'kal', 'aaj', 'abhi', 'bhai', 'yaar', 'acha', 'accha', 'theek', 'thik', 'chalo', 'bata', 'batao', 'dikhao', 'chahiye', 'hoga', 'tha', 'thi', 'ho', 'se', 'ko', 'ka', 'ki', 'ke', 'mein', 'me', 'par', 'pe', 'aur', 'lekin', 'toh', 'to', 'bhi', 'ek', 'jo', 'sab', 'kuch', 'koi', 'wala', 'wali', 'baje', 'subah', 'shaam', 'raat', 'dopahar', 'lagta', 'lagao', 'bolo', 'sunao', 'band', 'chalu', 'khol', 'kholo']);
export function detectLanguage(text: string): Lang {
  const letters = [...text].filter((c) => /\p{L}/u.test(c));
  if (!letters.length) return 'en';
  const dev = letters.filter((c) => /[ऀ-ॿ]/.test(c)).length;
  if (dev / letters.length >= 0.3) return 'hi';
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  const hits = words.filter((w) => HINGLISH_WORDS.has(w)).length;
  return hits >= 2 || (hits >= 1 && words.length <= 3 && words.some((w) => w.length > 3 && HINGLISH_WORDS.has(w))) ? 'hinglish' : 'en';
}
