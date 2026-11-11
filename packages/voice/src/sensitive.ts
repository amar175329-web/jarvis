// Anything money, health or personal must never go to a free cloud voice (free requests may be used for training).
// Errs on the side of "sensitive": a false alarm only means the phone's own voice speaks.
const WORDS = [
  /₹|\brs\.?\s?\d|\binr\b|\brupa(?:ye|ya|iya)\b|\bpaise\b|\bpaisa\b|\bbalance\b|\bsalary\b|\bsalari\b|\bupi\b|\bbank\b|\bloan\b|\bemi\b|\binvoice\b|\bcredit\b|\bdebit\b|\bcard\b/i,
  /\bdoctor\b|\bdawai\b|\bdawa\b|\bmedicine\b|\btablet\b|\bhealth\b|\bsehat\b|\bbimari\b|\bbukhar\b|\bhospital\b|\breport\b.*\b(blood|test)\b|\bdiagnos|\bsymptom|\bdepress|\banxiety\b/i,
  /\bpassword\b|\botp\b|\bpin\b|\baadhaar\b|\baadhar\b|\bpan\s?card\b|\bpasscode\b|\bapi key\b|\bsecret\b|\btoken\b/i,
  /\b\d{10}\b|\b\d{6,}\b|[\w.+-]+@[\w-]+\.[\w.]+/,   // phone numbers, long numbers, emails
];
// Devanagari words (plain substring match: \b does not work with Devanagari).
const HINDI = ['पैसा', 'पैसे', 'रुपये', 'रुपया', 'रुपए', 'बैंक', 'बैलेंस', 'सैलरी', 'वेतन', 'लोन', 'ईएमआई', 'क्रेडिट', 'डेबिट', 'कार्ड', 'यूपीआई', 'उधार', 'कर्ज',
  'डॉक्टर', 'डाक्टर', 'दवा', 'दवाई', 'टैबलेट', 'सेहत', 'स्वास्थ्य', 'बीमारी', 'बुखार', 'अस्पताल', 'हॉस्पिटल', 'अवसाद', 'चिंता',
  'पासवर्ड', 'ओटीपी', 'पिन', 'आधार', 'पैन', 'पासकोड', 'टोकन', 'सीक्रेट', 'गुप्त'];
const DEVANAGARI_DIGITS = /[०-९]{6,}/;
export function isSensitiveForCloud(text: string): boolean {
  const t = text.normalize('NFC').replace(/\u093C/g, '');
  const hindi = HINDI.map((w) => w.normalize('NFC').replace(/\u093C/g, ''));
  return WORDS.some((re) => re.test(text)) || hindi.some((w) => t.includes(w)) || DEVANAGARI_DIGITS.test(text);
}
