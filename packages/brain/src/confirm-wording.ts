// Confirmation wording + voice-confirm rules (agreed with S21). Short, Hinglish ok, shows WHAT + TO WHOM + UNDO.
import type { Level } from './levels.ts';
import type { Power } from './power-registry.ts';

export type ConfirmCtx = { what: string; to?: string; undo?: string; amount?: string };

export function wording(level: Level, c: ConfirmCtx): string | null {
  const to = c.to ? ` (${c.to})` : '';
  const amt = c.amount ? ` ${c.amount}` : '';
  const undo = c.undo ? ` Undo: ${c.undo}.` : ' Undo: nahi ho sakta.';
  switch (level) {
    case 0: return `Dekh raha hoon: ${c.what}${to}. Kuch karunga nahi.`;
    case 1: return `Sujhav: ${c.what}${to}${amt}. Karun?`;
    case 2: return `${c.what}${to}${amt} karun?${undo} "हाँ" ya "कर दो" bolo.`;
    case 3: return `Kar diya: ${c.what}${to}${amt}.${undo}`;
    case 4: return null; // silent: only logged with its one-line why
  }
}

// ---- voice answers: only these count as YES. Silence is NEVER yes. Anything else is not yes. ----
export type Answer = 'yes' | 'no' | 'unclear' | 'no_answer';
const YES = new Set(['हाँ', 'हां', 'कर दो', 'करदो', 'भेज दो', 'भेजदो']);
const NO = new Set(['नहीं', 'ना', 'मत करो', 'रुको', 'रुक जाओ', 'कैंसिल']);
const norm = (s: string) => s.trim().replace(/[।.,!?'"]+/g, '').replace(/\s+/g, ' ');
export function parseVoiceAnswer(text: string | null | undefined): Answer {
  if (text == null || norm(text) === '') return 'no_answer';
  const t = norm(text);
  if (YES.has(t)) return 'yes';
  if (NO.has(t)) return 'no';
  return 'unclear';
}

// ---- which channel may confirm which power ----
export type Channel = 'phone_voice' | 'app_tap' | 'app_voice';
export type Confirmation = { answer: Answer; channel: Channel; fingerprintOk?: boolean };
export function confirmed(p: Pick<Power, 'id' | 'tags'>, c: Confirmation): { ok: boolean; why: string } {
  if (c.answer !== 'yes') return { ok: false, why: `answer was ${c.answer}` };
  const sensitive = (p.tags ?? []).some((t) => t === 'money' || t === 'health' || t === 'secret');
  if (sensitive && c.channel !== 'phone_voice') return { ok: false, why: 'money/health/password must be confirmed by voice from the phone' };
  // Amit's rule: sensitive = voice "haan" first, THEN fingerprint of the owner on a screen. Both, or nothing.
  if (sensitive && !c.fingerprintOk) return { ok: false, why: 'sensitive power needs voice yes, then owner fingerprint' };
  return { ok: true, why: 'confirmed' };
}
export const FINGERPRINT_PROMPT = 'Ab fingerprint lagao.';
