// Local topic detector for memory tiering. A hit is a classification hint, not a diagnosis.
// Lists cover English, Roman Hinglish and Devanagari; update them with real, consented test phrases.
import { normalize } from './text.ts';
import type { MemoryPurpose } from './types.ts';

export type Category = 'health' | 'money_figure' | 'abuse' | 'minor' | 'self_harm' | 'other_sensitive' | 'sensitive_self' | 'contact_pii' | 'emotion' | 'family' | 'location';
export type Care = 'self_harm' | 'abuse' | null;
export type Classification = { categories: Category[]; care: Care };

const words = (s: string): string[] => [...normalize(s).matchAll(/[\p{L}\p{M}\p{N}_]+/gu)].map((m) => m[0]);
const padded = (s: string): string => ' ' + words(s).join(' ') + ' ';
const anyPhrase = (hay: string, list: string[]): boolean => list.some((p) => hay.includes(' ' + words(p).join(' ') + ' '));

const HEALTH = [
  'bimar', 'bimari', 'bimaar', 'bukhar', 'fever', 'diabetes', 'diabetic', 'bp', 'blood pressure', 'blood sugar', 'sugar level', 'cancer', 'tumor', 'tumour', 'asthma', 'thyroid', 'migraine',
  'depression', 'depressed', 'anxiety', 'panic attack', 'adhd', 'ocd', 'bipolar', 'mental health', 'therapy', 'therapist', 'psychiatrist', 'psychologist', 'antidepressant',
  'medicine', 'medicines', 'dawai', 'dawa', 'dawaai', 'tablet', 'tablets', 'pill', 'pills', 'hospital', 'surgery', 'pregnant', 'pregnancy', 'cholesterol', 'allergy', 'allergic', 'infection', 'covid', 'hiv',
  'injury', 'fracture', 'symptom', 'symptoms', 'diagnosis', 'diagnosed', 'prescription', 'dard', 'sardard', 'chakkar', 'ulti', 'ilaaj', 'ilaj', 'tabiyat', 'heart attack',
  'weight', 'body weight', 'wazan', 'vajan', 'workout', 'exercise', 'gym', 'fitness', 'training', 'walk routine', 'running routine',
  'बीमार', 'बीमारी', 'बुखार', 'दवाई', 'दवा', 'अस्पताल', 'मधुमेह', 'डिप्रेशन', 'कैंसर', 'इलाज', 'सर्जरी', 'दर्द', 'तबीयत', 'गर्भवती', 'चक्कर', 'डॉक्टर ने', 'डॉक्टर से', 'डॉक्टर के पास', 'वजन', 'कसरत', 'व्यायाम',
];
const MEDICINE = ['medicine', 'medicines', 'medication', 'medications', 'dawai', 'dawa', 'dawaai', 'tablet', 'tablets', 'pill', 'pills', 'capsule', 'capsules', 'दवाई', 'दवा', 'गोली', 'कैप्सूल'];
const FITNESS = ['workout', 'exercise', 'gym', 'fitness', 'training', 'walk routine', 'running routine', 'कसरत', 'व्यायाम'];
const WEIGHT = ['weight', 'body weight', 'wazan', 'vajan', 'वजन', 'kg', 'kilo', 'kilogram'];
const FAMILY = [
  'family', 'parivaar', 'parivar', 'meri maa', 'mere papa', 'mere pita', 'meri mummy', 'mere papa', 'my mother', 'my father', 'my mom', 'my dad', 'mother', 'father', 'mom', 'dad', 'wife', 'husband', 'spouse', 'partner', 'brother', 'sister', 'bhai', 'behen', 'bahen', 'didi', 'bhaiya', 'nana', 'nani', 'dada', 'dadi', 'uncle', 'aunty', 'mama', 'mausi', 'chacha', 'chachi', 'फैमिली', 'परिवार', 'माँ', 'मां', 'पापा', 'भाई', 'बहन', 'पत्नी', 'पति', 'नाना', 'नानी', 'दादा', 'दादी',
];
const LOCATION = ['live location', 'location', 'gps location', 'current location', 'home address', 'school address', 'ghar ka pata', 'ghar ka address', 'address', 'pata', 'location sharing', 'लोकेशन', 'पता', 'ठिकाना'];
const ABUSE = [
  'abused', 'sexual abuse', 'child abuse', 'physical abuse', 'verbal abuse', 'emotional abuse', 'domestic violence', 'harass', 'harassed', 'harassment', 'sexual harassment', 'molest', 'molested',
  'rape', 'raped', 'assaulted', 'blackmail', 'blackmailed', 'maar peet', 'maarpeet', 'pitai', 'peeta', 'shoshan', 'utpeedan', 'dhamki di', 'dhamki deta', 'dhamki deti', 'chhedchhad', 'chhed chhad',
  'मारपीट', 'पिटाई', 'शोषण', 'उत्पीड़न', 'बलात्कार', 'छेड़छाड़', 'धमकी दी', 'ब्लैकमेल', 'घरेलू हिंसा',
];
const SELF_HARM = [
  'suicide', 'suicidal', 'kill myself', 'end my life', 'end it all', 'self harm', 'selfharm', 'hurt myself', 'cut myself', 'want to die', 'wanna die', 'overdose',
  'khudkushi', 'khudkhushi', 'aatmahatya', 'atmahatya', 'mar jana chahta', 'mar jaana chahta', 'mar jana chahti', 'marna chahta', 'marna chahti', 'jeena nahi chahta', 'jeena nahi chahti',
  'jeene ka mann nahi', 'jeene ka man nahi', 'khud ko khatam', 'khatam kar lunga', 'khatam kar lungi', 'jaan de dunga', 'jaan de dungi',
  // LEAD 2026-11-12: more everyday Hinglish/Hindi phrasings (the first list missed 'mar jaana hai'). Care signal only, never blocks Amit.
  'mar jaana hai', 'mar jana hai', 'mar jaunga', 'mar jaungi', 'mar jaun', 'mar jau', 'jaan dena chahta', 'jaan dena chahti', 'zindagi khatam', 'jindagi khatam', 'jeene ki ichha nahi', 'jeene ki iccha nahi', 'khatam kar dun', 'khatam kar du',
  'मर जाना है', 'मर जाऊँगा', 'मर जाऊंगा', 'मर जाऊँगी', 'ज़िंदगी खत्म', 'जिंदगी खत्म', 'जीने की इच्छा नहीं',
  'आत्महत्या', 'खुदकुशी', 'मरना चाहता', 'मरना चाहती', 'मर जाना चाहता', 'जीने का मन नहीं', 'खुद को खत्म', 'जान दे दूँगा', 'जान दे दूंगा',
];
const OTHER_SENSITIVE = [
  'dharm', 'dharam', 'religion', 'religious', 'hindu', 'muslim', 'christian', 'sikh', 'jain', 'buddhist', 'caste', 'jaati', 'jati', 'rajneeti', 'politics', 'political party', 'bjp', 'congress',
  'vote', 'voted', 'sex', 'sexual', 'affair', 'gay', 'lesbian', 'bisexual', 'orientation', 'yaun', 'धर्म', 'जाति', 'राजनीति', 'वोट', 'यौन',
  'jhagda', 'jhagde', 'breakup', 'break up', 'talaq', 'divorce', 'cheating', 'dhokha', 'ladai hui',
];
const SENSITIVE_SELF_MONEY = ['paise ki tangi', 'paise nahi hain', 'paison ki dikkat', 'financial problem', 'financial stress', 'karz mein', 'debt mein', 'broke hoon', 'पैसों की तंगी', 'कर्ज में'];
const EMOTION = ['mood kharab', 'mood off', 'mood theek nahi', 'bura lag raha', 'sad hoon', 'upset hoon', 'bahut gussa', 'bohot gussa', 'gussa aa raha', 'pagal ho jaunga', 'nafrat', 'tang aa gaya', 'tang aa gayi', 'thak gaya hoon', 'frustrated', 'i hate', 'sab khatam', 'andar se pareshan', 'pareshan hoon', 'lonely', 'akela mehsoos', 'अकेला महसूस', 'मन खराब', 'मूड खराब', 'बहुत गुस्सा', 'तंग आ गया', 'तंग आ गई', 'नफरत', 'नफ़रत'];
const DEEP_EMOTION = [
  'kai mahino se', 'kai mahine se', 'mahino se', 'mahinon se', 'saalon se', 'kai saal se', 'lambe samay se', 'bahut samay se', 'baar baar', 'bar bar', 'roz aisa', 'har din', 'hamesha aisa', 'andar se', 'for months', 'for years', 'for a long time', 'every day', 'everyday', 'repeatedly', 'keeps happening', 'again and again', 'recurring', 'long term', 'long-term', 'deeply', 'months', 'years',
];
const CURRENCY_A = /(?:₹|\brs\.?|\binr\b|\brupees?\b|\brupaye?\b|रुपये|रुपए|रु\.?)\s*\d[\d,]*(?:\.\d+)?/i;
const CURRENCY_B = /\d[\d,]*(?:\.\d+)?\s*(?:₹|\brs\b|\brupees?\b|\brupaye?\b|\brupay\b|रुपये|रुपए)/i;
const FIN_CTX = ['salary', 'tankhwah', 'tankha', 'income', 'kamai', 'balance', 'loan', 'karz', 'emi', 'rent', 'kiraya', 'savings', 'bachat', 'investment', 'nivesh', 'sip', 'udhaar', 'udhar', 'fees', 'fee', 'premium', 'mortgage', 'debt', 'bonus', 'ctc', 'paise', 'paisa', 'तनख्वाह', 'वेतन', 'कमाई', 'कर्ज', 'ईएमआई', 'किराया', 'बचत', 'निवेश', 'उधार', 'पैसे', 'पैसा'];
const MINOR_POSS = /(?:^|\s)(?:mera|meri|mere|my|hamara|hamari|मेरा|मेरी|मेरे|हमारा|हमारी)\s+(?:beta|beti|bete|betiyan|son|daughter|bachcha|bachchi|bachche|baccha|bacche|bhanja|bhanji|bhatija|bhatiji|nephew|niece|pota|poti|nati|natin|grandson|granddaughter|kid|kids|child|children|बेटा|बेटी|बच्चा|बच्ची|बच्चे|भांजा|भांजी|भतीजा|भतीजी|पोता|पोती|नाती)(?=\s|$)/;
const MINOR_AGE = /(?:^|\s)(?:[0-9]|1[0-7])\s*(?:saal|sal|year|years|yr|yrs|varsh|वर्ष|साल)\s*(?:ka|ki|ke|old|का|की|के)(?=\s|$)/;
const MINOR_WORDS = ['minor', 'nabalig', 'underage', 'under age', 'नाबालिग'];
const ADULT_AGE = /(?:^|\s)(?:1[89]|[2-9]\d)\s*(?:saal|sal|year|years|yr|yrs|varsh|वर्ष|साल)\s*(?:ka|ki|ke|old|का|की|के)(?=\s|$)/;

function money(text: string, hay: string): boolean {
  if (CURRENCY_A.test(text) || CURRENCY_B.test(text)) return true;
  if (!anyPhrase(hay, FIN_CTX)) return false;
  const noDates = text.replace(/\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b/g, ' ').replace(/\b(?:19|20)\d{2}\b/g, ' ');
  if (/\d[\d,]{2,}/.test(noDates)) return true;
  if (/\d+(?:\.\d+)?\s*(?:lakh|lac|lakhs|crore|cr|hazaar|hazar|thousand|k)\b/i.test(noDates)) return true;
  return false;
}

export function classify(text: string): Classification {
  const hay = padded(text); const n = normalize(text); const cats = new Set<Category>(); let care: Care = null;
  if (anyPhrase(hay, SELF_HARM)) { cats.add('self_harm'); care = 'self_harm'; }
  if (anyPhrase(hay, ABUSE)) { cats.add('abuse'); care ??= 'abuse'; }
  if (anyPhrase(hay, HEALTH)) cats.add('health');
  if (money(text, hay)) cats.add('money_figure');
  const kidPoss = MINOR_POSS.test(n) && !ADULT_AGE.test(n);
  if (kidPoss || MINOR_AGE.test(n) || anyPhrase(hay, MINOR_WORDS)) cats.add('minor');
  if (anyPhrase(hay, OTHER_SENSITIVE)) cats.add('other_sensitive');
  if (anyPhrase(hay, SENSITIVE_SELF_MONEY)) cats.add('sensitive_self');
  if (/(?:\+?91[\s-]?)?[6-9]\d{9}\b/.test(text.replace(/(\d)[\s-](?=\d)/g, '$1')) || /[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(text) || (/\b\d{6}\b/.test(text) && /address|pata|flat|house|plot|pin ?code/i.test(text))) cats.add('contact_pii');
  if (anyPhrase(hay, EMOTION)) cats.add('emotion');
  if (anyPhrase(hay, FAMILY)) cats.add('family');
  if (anyPhrase(hay, LOCATION)) cats.add('location');
  return { categories: [...cats], care };
}

export function isDeepEmotion(text: string): boolean {
  const hay = padded(text);
  return anyPhrase(hay, DEEP_EMOTION) || /\b(?:since|for)\s+(?:many\s+)?(?:months?|years?)\b/i.test(text);
}

export function isMedicineMention(text: string): boolean { return anyPhrase(padded(text), MEDICINE); }
export function isWorkoutMention(text: string): boolean { return anyPhrase(padded(text), FITNESS); }
export function isWeightMention(text: string): boolean { return anyPhrase(padded(text), WEIGHT); }

/** Tags are metadata used by SQL to restrict each purpose to matching sensitive subjects. */
export function sensitiveTags(text: string, categories: Category[] = classify(text).categories): string[] {
  const tags = new Set<string>();
  if (categories.includes('health')) tags.add('health');
  if (categories.includes('money_figure') || categories.includes('sensitive_self')) { tags.add('money'); tags.add('finance'); }
  if (categories.includes('family') || categories.includes('minor')) tags.add('family');
  if (categories.includes('emotion') || categories.includes('abuse') || categories.includes('self_harm')) tags.add('emotion');
  if (categories.includes('location')) tags.add('location');
  if (isMedicineMention(text)) { tags.add('medicine'); tags.add('medication'); }
  if (isWorkoutMention(text)) { tags.add('workout'); tags.add('fitness'); }
  if (isWeightMention(text)) tags.add('weight');
  if (categories.includes('contact_pii')) tags.add('contact');
  if (categories.includes('other_sensitive')) tags.add('relationship');
  return [...tags];
}

export function purposeAllowsSensitive(tags: string[], purpose: MemoryPurpose): boolean {
  if (purpose === 'ask') return true;
  const has = (allowed: string[]) => allowed.some((tag) => tags.includes(tag));
  if (purpose === 'plan_workout') return has(['workout', 'fitness', 'weight']);
  if (purpose === 'day_status') return has(['health', 'workout', 'fitness', 'weight', 'medicine', 'medication', 'emotion']);
  if (purpose === 'medicine_reminder') return has(['medicine', 'medication']);
  if (purpose === 'budget') return has(['money', 'finance']);
  return false;
}
