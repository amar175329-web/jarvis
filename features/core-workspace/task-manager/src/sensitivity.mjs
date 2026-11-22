/**
 * Shared, deterministic privacy classifier for S08 natural-language parsing and
 * API storage guards. Unknown/non-text values fail closed.
 *
 * This is intentionally conservative: health, credential, and financial
 * indicators are never written to the public tasks/reminders tables.
 */
const HEALTH_TERMS = /\b(?:dawai(?:yan)?|dawaai|dawa|medicine|medicines|meds?|medication|goli(?:yan)?|goliyan|tablet(?:s)?|pill(?:s)?|syrup|injections?|capsules?|capsule|ilaj|ilaaj|dard|pain|fever|bukhar|cough|khansi|headache|migraine|insulin|prescription|prescribed|dosage|dose|inhaler|physio|physiotherapy|dentist|periods|saans|pump|antibiotic|metformin|paracetamol|acetaminophen|crocin|dolo(?:\s*650)?|calpol|ibuprofen|aspirin|cetirizine|levocetirizine|fexofenadine|loratadine|azithromycin|amoxicillin|amoxiclav|augmentin|cefixime|doxycycline|glimepiride|gliclazide|atorvastatin|rosuvastatin|clopidogrel|levothyroxine|thyroxine|omeprazole|pantoprazole|rabeprazole|montelukast|ondansetron|domperidone|amlodipine|telmisartan|losartan|metoprolol|sertraline|escitalopram|alprazolam|fluoxetine|bp|blood\s+pressure|sugar|diabetes|diabetic|doctor|physician|medical|health|report|therapy|hospital|clinic|lab\s+report|test\s+result|glucose|blood\s+test|x[- ]?ray|mri|scan)\b|दवाई|दवाइयाँ|दवाइयां|दवा|गोली|गोलियाँ|गोलियां|सिरप|इंजेक्शन|कैप्सूल|इलाज|दर्द|बुखार|खाँसी|खांसी|सिरदर्द|इंसुलिन|नुस्खा|पर्चा|खुराक|दोज़|बीपी|शुगर|मधुमेह|डायबिटीज|डॉक्टर|चिकित्सक|ब्लड\s*प्रेशर|रक्तचाप|रिपोर्ट|थेरेपी|अस्पताल|क्लिनिक|जाँच|जांच|स्वास्थ्य|ग्लूकोज़|ग्लूकोज|फिजियो|फ़िज़ियो|फिजियोथेरेपी|फ़िज़ियोथेरेपी|डेंटिस्ट|पीरियड्स|सांस|साँस|पंप|इनहेलर|इंहेलर/iu;

const CREDENTIAL_TERMS = /\b(?:password|passcode|passwd|pass\s*word|otp|one[- ]time\s+password|verification\s+code|security\s+code|pin(?:\s+code)?|cvv|cvc|bank\s+account|account\s+(?:number|no\.?|details)|a\/c\s*(?:no\.?|number)?|ifsc|upi\s*(?:id|pin)?|routing\s+number|credit\s+card|debit\s+card|card\s+number|aadhaar|aadhar|pan\s+(?:number|no\.?|card)|social\s+security|secret|confidential)\b|पासवर्ड|ओटीपी|वन\s*टाइम\s*पासवर्ड|सत्यापन\s*कोड|सुरक्षा\s*कोड|पिन|सीवीवी|बैंक\s*खाता|खाता\s*(?:नंबर|संख्या|विवरण)|आईएफएससी|यूपीआई|आधार|पैन\s*(?:नंबर|कार्ड)?/iu;

const ACCOUNT_NUMBER = /(?:^|[^\p{N}])\p{N}(?:[\s-]?\p{N}){8,17}(?!\p{N})/u;
const EMAIL_ADDRESS = /\b[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[A-Z]{2,}\b/iu;
const UNCERTAIN_PRIVATE_CONTEXT = /\b(?:my\s+(?:health|medical|account|bank|password|pin)|personal\s+(?:medical|health|bank|account)\s+(?:details|data|record)|private\s+(?:note|detail|record)|meri\s+(?:health|dawai|dawa)|mera\s+(?:account|password|bank))\b/iu;

/** @param {unknown} value @returns {{ sensitive: boolean, confidence: 'high'|'uncertain', category: string|null }} */
export function classifySensitivity(value) {
  if (typeof value !== 'string') {
    return { sensitive: true, confidence: 'uncertain', category: 'unsupported-content' };
  }
  const text = value.normalize('NFKC').trim();
  if (!text) return { sensitive: false, confidence: 'high', category: null };
  if (HEALTH_TERMS.test(text)) return { sensitive: true, confidence: 'high', category: 'health' };
  if (CREDENTIAL_TERMS.test(text)) return { sensitive: true, confidence: 'high', category: 'credentials-or-financial' };
  if (ACCOUNT_NUMBER.test(text) || EMAIL_ADDRESS.test(text)) return { sensitive: true, confidence: 'high', category: 'identifier' };
  if (UNCERTAIN_PRIVATE_CONTEXT.test(text)) return { sensitive: true, confidence: 'uncertain', category: 'possible-private-context' };
  return { sensitive: false, confidence: 'high', category: null };
}
