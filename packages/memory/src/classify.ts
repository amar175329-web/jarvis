// Sensitive-topic detector (first pass, local, no model). Word lists in English, Roman Hinglish and Devanagari.
// It is deliberately cautious: a hit sends the candidate to refuse/ask, it is never "proof". Lists grow from Amit's real talk (tests/classify.test.ts).
// Honest limit: spelling varies a lot in Hinglish, so some things will slip through; delete/export/edit and the weekly re-scan are the safety net.
import { normalize } from './text.ts';

export type Category = 'health' | 'money_figure' | 'abuse' | 'minor' | 'self_harm' | 'other_sensitive' | 'sensitive_self' | 'contact_pii' | 'emotion';
export type Care = 'self_harm' | 'abuse' | null;
export type Classification = { categories: Category[]; care: Care };

const words = (s: string): string[] => [...normalize(s).matchAll(/[\p{L}\p{M}\p{N}_]+/gu)].map((m) => m[0]);
const padded = (s: string): string => ' ' + words(s).join(' ') + ' ';
const anyPhrase = (hay: string, list: string[]): boolean => list.some((p) => hay.includes(' ' + words(p).join(' ') + ' '));

const HEALTH = [
  'bimar', 'bimari', 'bimaar', 'bukhar', 'fever', 'diabetes', 'diabetic', 'bp', 'blood pressure', 'blood sugar', 'sugar level', 'cancer', 'tumor', 'tumour', 'asthma', 'thyroid', 'migraine',
  'depression', 'depressed', 'anxiety', 'panic attack', 'adhd', 'ocd', 'bipolar', 'mental health', 'therapy', 'therapist', 'psychiatrist', 'psychologist', 'antidepressant',
  'medicine', 'medicines', 'dawai', 'dawa', 'dawaai', 'tablet', 'tablets', 'hospital', 'surgery', 'pregnant', 'pregnancy', 'cholesterol', 'allergy', 'allergic', 'infection', 'covid', 'hiv',
  'injury', 'fracture', 'symptom', 'symptoms', 'diagnosis', 'diagnosed', 'prescription', 'dard', 'sardard', 'chakkar', 'ulti', 'ilaaj', 'ilaj', 'tabiyat', 'heart attack',
  'doctor ne', 'doctor se', 'doctor ke paas', 'doctor ko dikha', 'dr ne', 'dr se',
  'बीमार', 'बीमारी', 'बुखार', 'दवाई', 'दवा', 'अस्पताल', 'मधुमेह', 'डिप्रेशन', 'कैंसर', 'इलाज', 'सर्जरी', 'दर्द', 'तबीयत', 'गर्भवती', 'चक्कर', 'डॉक्टर ने', 'डॉक्टर से', 'डॉक्टर के पास',
];
const ABUSE = [
  'abused', 'sexual abuse', 'child abuse', 'physical abuse', 'verbal abuse', 'emotional abuse', 'domestic violence', 'harass', 'harassed', 'harassment', 'sexual harassment', 'molest', 'molested',
  'rape', 'raped', 'assaulted', 'blackmail', 'blackmailed', 'maar peet', 'maarpeet', 'pitai', 'peeta', 'shoshan', 'utpeedan', 'dhamki di', 'dhamki deta', 'dhamki deti', 'chhedchhad', 'chhed chhad',
  'मारपीट', 'पिटाई', 'शोषण', 'उत्पीड़न', 'बलात्कार', 'छेड़छाड़', 'धमकी दी', 'ब्लैकमेल', 'घरेलू हिंसा',
];
const SELF_HARM = [
  'suicide', 'suicidal', 'kill myself', 'end my life', 'end it all', 'self harm', 'selfharm', 'hurt myself', 'cut myself', 'want to die', 'wanna die', 'overdose',
  'khudkushi', 'khudkhushi', 'aatmahatya', 'atmahatya', 'mar jana chahta', 'mar jaana chahta', 'mar jana chahti', 'marna chahta', 'marna chahti', 'jeena nahi chahta', 'jeena nahi chahti',
  'jeene ka mann nahi', 'jeene ka man nahi', 'khud ko khatam', 'khatam kar lunga', 'khatam kar lungi', 'jaan de dunga', 'jaan de dungi',
  'आत्महत्या', 'खुदकुशी', 'मरना चाहता', 'मरना चाहती', 'मर जाना चाहता', 'जीने का मन नहीं', 'खुद को खत्म', 'जान दे दूँगा', 'जान दे दूंगा',
];
const OTHER_SENSITIVE = [
  'dharm', 'dharam', 'religion', 'religious', 'hindu', 'muslim', 'christian', 'sikh', 'jain', 'buddhist', 'caste', 'jaati', 'jati', 'rajneeti', 'politics', 'political party', 'bjp', 'congress',
  'vote', 'voted', 'sex', 'sexual', 'affair', 'gay', 'lesbian', 'bisexual', 'orientation', 'yaun', 'धर्म', 'जाति', 'राजनीति', 'वोट', 'यौन',
  'jhagda', 'jhagde', 'breakup', 'break up', 'talaq', 'divorce', 'cheating', 'dhokha', 'ladai hui',
];
const SENSITIVE_SELF_MONEY = ['paise ki tangi', 'paise nahi hain', 'paison ki dikkat', 'financial problem', 'financial stress', 'karz mein', 'debt mein', 'broke hoon', 'पैसों की तंगी', 'कर्ज में'];
const EMOTION = ['sab bekar', 'sab kuch bekar', 'bahut gussa', 'bohot gussa', 'gussa aa raha', 'pagal ho jaunga', 'nafrat', 'tang aa gaya', 'tang aa gayi', 'thak gaya hoon', 'frustrated', 'i hate', 'sab khatam', 'सब बेकार', 'बहुत गुस्सा', 'तंग आ गया', 'तंग आ गई', 'नफरत', 'नफ़रत'];

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
  if (/\d[\d,]{2,}/.test(noDates)) return true;                                    // 3+ digits near a money word
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
  return { categories: [...cats], care };
}
