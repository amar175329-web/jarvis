import { classify } from '../../memory/src/classify.ts';

/** Fixed, warm safety reply. This path never recalls memory or calls a model. */
export const CARE_REPLY = 'Yeh sun kar mujhe fikr ho rahi hai. Main yahin hoon. Abhi akele mat raho—kisi bharosemand apne ko paas bulao aur unhe batao ki tumhe sahare ki zaroorat hai. Agar turant khatra hai to safe jagah jao aur India mein 112 par call karo; emotional support ke liye Tele-MANAS 14416 par 24x7 baat kar sakte ho.';

const CARE_EXTRA = [
  /\b(?:jeene|jeena)\s+ka\s+mann?\s+nahi\b/i,
  /\b(?:mar|marr)\s+ja(?:na|ane|ana)\s+(?:hai|chahta|chahti)\b/i,
  /\bjaan\s+dena\s+(?:hai|chahta|chahti)\b/i,
  /\b(?:khud\s+ko\s+)?(?:khatam|maar)\s+kar(?:na|ne)\s+(?:hai|chahta|chahti)\b/i,
  /\b(?:mujhe|mere saath)\s+(?:abuse|maarpeet|harass)\s+(?:ho raha|kar rahe|kar raha|karte)\b/i,
  /\b(?:ghar|school|kaam)\s+mein\s+(?:maar|pitai|shoshan)\s+(?:hoti|hota|ho raha)\b/i,
  /(?:मेरे साथ|मुझे).{0,12}(?:मारपीट|शोषण|छेड़छाड़|उत्पीड़न|हिंसा)/u,
  /(?:जीने का मन नहीं|जीने की इच्छा नहीं|मर जाना है|मरना चाहता|मरना चाहती|जान देना है|खुदकुशी|आत्महत्या)/u,
];

export type CareSignal = 'self_harm' | 'abuse';
export function detectCareSignal(text: string): CareSignal | null {
  const classified = classify(text).care;
  if (classified) return classified;
  if (CARE_EXTRA.some((pattern) => pattern.test(text))) {
    return /(?:abuse|maarpeet|harass|मारपीट|शोषण|छेड़छाड़|उत्पीड़न|हिंसा)/iu.test(text) ? 'abuse' : 'self_harm';
  }
  return null;
}
