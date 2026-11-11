import { applyPronunciation } from './pronunciation.ts';

// Pure-Hindi speech helpers. Amit's rule (2026-11-07): mixing English into a Hindi sentence spoils the voice, so JARVIS speaks
// Devanagari Hindi only. Everyday English words are written in Devanagari (मीटिंग, फ़ोन), numbers and money are spoken as Hindi words.

const U99 = ['शून्य','एक','दो','तीन','चार','पाँच','छह','सात','आठ','नौ','दस','ग्यारह','बारह','तेरह','चौदह','पंद्रह','सोलह','सत्रह','अठारह','उन्नीस',
  'बीस','इक्कीस','बाईस','तेईस','चौबीस','पच्चीस','छब्बीस','सत्ताईस','अट्ठाईस','उनतीस','तीस','इकतीस','बत्तीस','तैंतीस','चौंतीस','पैंतीस','छत्तीस','सैंतीस','अड़तीस','उनतालीस',
  'चालीस','इकतालीस','बयालीस','तैंतालीस','चौवालीस','पैंतालीस','छियालीस','सैंतालीस','अड़तालीस','उनचास','पचास','इक्यावन','बावन','तिरपन','चौवन','पचपन','छप्पन','सत्तावन','अट्ठावन','उनसठ',
  'साठ','इकसठ','बासठ','तिरसठ','चौंसठ','पैंसठ','छियासठ','सड़सठ','अड़सठ','उनहत्तर','सत्तर','इकहत्तर','बहत्तर','तिहत्तर','चौहत्तर','पचहत्तर','छिहत्तर','सतहत्तर','अठहत्तर','उनासी',
  'अस्सी','इक्यासी','बयासी','तिरासी','चौरासी','पचासी','छियासी','सत्तासी','अट्ठासी','नवासी','नब्बे','इक्यानवे','बानवे','तिरानवे','चौरानवे','पचानवे','छियानवे','सत्तानवे','अट्ठानवे','निन्यानवे'];
const DIGIT = ['शून्य','एक','दो','तीन','चार','पाँच','छह','सात','आठ','नौ'];

// Whole numbers up to 99,99,99,999 in Indian place values (हज़ार, लाख, करोड़).
export function numToHindi(n: number): string {
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n) || n > 9_999_999_999) return String(n);
  if (n < 100) return U99[n];
  const parts: string[] = [];
  let r = n;
  const crore = Math.floor(r / 10_000_000); r %= 10_000_000;
  const lakh = Math.floor(r / 100_000); r %= 100_000;
  const thousand = Math.floor(r / 1000); r %= 1000;
  const hundred = Math.floor(r / 100); r %= 100;
  if (crore) parts.push(`${numToHindi(crore)} करोड़`);
  if (lakh) parts.push(`${U99[lakh]} लाख`);
  if (thousand) parts.push(`${U99[thousand]} हज़ार`);
  if (hundred) parts.push(`${U99[hundred]} सौ`);
  if (r) parts.push(U99[r]);
  return parts.join(' ');
}

function decimalToHindi(intPart: string, frac: string): string {
  return `${numToHindi(Number(intPart))} दशमलव ${[...frac].map((d) => DIGIT[Number(d)]).join(' ')}`;
}

function dayPart(h: number, ampm?: string): string {
  if (!ampm) return '';
  const pm = ampm.toLowerCase() === 'pm';
  if (!pm) return h >= 4 && h <= 11 ? 'सुबह ' : 'रात ';
  if (h === 12 || h <= 3) return 'दोपहर ';
  if (h <= 7) return 'शाम ';
  return 'रात ';
}
const DAY_WORDS = ['सुबह', 'दोपहर', 'शाम', 'रात'];
export function timeToHindi(h: number, m: number, ampm?: string, withDayPart = true): string {
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  const ap = ampm ?? (h > 12 ? 'pm' : undefined);   // 24-hour input: 13 and later is the afternoon/evening
  const base = `${withDayPart ? dayPart(h12, ap) : ''}${U99[h12]}`;
  return m === 0 ? `${base} बजे` : `${base} बजकर ${U99[m]} मिनट`;
}

// Everyday English words that are fine in speech, written the way Hindi speakers say them.
export const COMMON_EN: Record<string, string> = {
  boss: 'बॉस', jarvis: 'जार्विस', amit: 'अमित', ok: 'ओके', okay: 'ओके', hello: 'हेलो', hi: 'हाय', sorry: 'सॉरी', please: 'प्लीज़', thanks: 'थैंक्स', thank: 'थैंक', you: 'यू',
  meeting: 'मीटिंग', call: 'कॉल', message: 'मैसेज', messages: 'मैसेज', msg: 'मैसेज', phone: 'फ़ोन', mobile: 'मोबाइल', mail: 'मेल', email: 'ईमेल', whatsapp: 'व्हाट्सऐप',
  app: 'ऐप', apps: 'ऐप्स', battery: 'बैटरी', charge: 'चार्ज', charging: 'चार्जिंग', wifi: 'वाई-फ़ाई', internet: 'इंटरनेट', net: 'नेट', time: 'टाइम',
  task: 'टास्क', tasks: 'टास्क', reminder: 'रिमाइंडर', alarm: 'अलार्म', timer: 'टाइमर', notification: 'नोटिफ़िकेशन', screen: 'स्क्रीन', camera: 'कैमरा',
  photo: 'फ़ोटो', video: 'वीडियो', music: 'म्यूज़िक', song: 'सॉन्ग', ticket: 'टिकट', bill: 'बिल', payment: 'पेमेंट', bank: 'बैंक', card: 'कार्ड', password: 'पासवर्ड', otp: 'ओटीपी',
  link: 'लिंक', file: 'फ़ाइल', folder: 'फ़ोल्डर', download: 'डाउनलोड', upload: 'अपलोड', update: 'अपडेट', install: 'इंस्टॉल', delete: 'डिलीट', send: 'सेंड', save: 'सेव',
  mode: 'मोड', normal: 'नॉर्मल', focus: 'फ़ोकस', night: 'नाइट', chill: 'चिल', workout: 'वर्कआउट', plan: 'प्लान', list: 'लिस्ट', note: 'नोट', notes: 'नोट्स',
  calendar: 'कैलेंडर', schedule: 'शेड्यूल', team: 'टीम', office: 'ऑफ़िस', doctor: 'डॉक्टर', good: 'गुड', morning: 'मॉर्निंग', evening: 'ईवनिंग', afternoon: 'आफ़्टरनून',
};

export function hindiize(input: string): string {
  let t = input;
  t = t.replace(/(?:₹|Rs\.?|INR)\s?(\d[\d,]*)(?:\.(\d+))?/gi, (_m, i: string, f?: string) => {
    const whole = Number(i.replace(/,/g, ''));
    return `${f ? decimalToHindi(String(whole), f) : numToHindi(whole)} रुपये`;
  });
  t = t.replace(/\b(\d{1,2}):(\d{2})\s?(AM|PM)?\b/gi, (m, h: string, mi: string, ap: string | undefined, offset: number, whole: string) => {
    const H = Number(h), M = Number(mi);
    const before = whole.slice(0, offset).trimEnd();
    const said = DAY_WORDS.some((w) => before.endsWith(w));   // the writer already said शाम/सुबह/...: do not repeat it
    return H <= 24 && M <= 59 ? timeToHindi(H, M, ap, !said) : m;
  });
  t = t.replace(/(\d[\d,]*(?:\.\d+)?)\s?%/g, (_m, n: string) => `${hindiize(n)} प्रतिशत`);
  t = t.replace(/\d[\d,]*(?:\.(\d+))?/g, (m, f?: string) => {
    const [i] = m.replace(/,/g, '').split('.');
    return f ? decimalToHindi(i, f) : numToHindi(Number(i));
  });
  t = t.replace(/[A-Za-z][A-Za-z']*/g, (w) => COMMON_EN[w.toLowerCase()] ?? w);
  return applyPronunciation(t);
}

// Latin words still left after hindiize(): the caller can log them or ask the model to rewrite once.
export function latinLeft(text: string): string[] {
  return text.match(/[A-Za-z][A-Za-z']+/g) ?? [];
}
