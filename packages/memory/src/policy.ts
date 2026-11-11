// The memory policy: ONE pure function, decide(candidate) -> save | ask | refuse | skip. No database, no model.
// Final rules in words: self/identity/memory-behaviour.md. If this file and that text differ, fix both in the same change.
import { findSecrets, type SecretKind } from './redact.ts';
import { classify, type Care, type Category } from './classify.ts';
import { DAY, LIMITS, RETENTION_DAYS } from './rules.ts';
import type { Actor, KillState, Kind, Origin, Source, Subject } from './types.ts';

export type Candidate = {
  text: string; title?: string; kind?: Kind; origin: Origin; actor: Actor;
  source?: Source; explicit?: boolean;                 // explicit = Amit said "yaad rakho" (or typed it in the Memory screen)
  about?: Subject; subject_key?: string | null; ephemeral?: boolean; dueDate?: string | null;
  tags?: string[]; why?: string; confidence?: number; pinned?: boolean;
  confirmed?: { channel: 'app_tap' | 'text' | 'voice' } | null; // set only AFTER Amit answered "haan" to an ask
};
export type PolicyContext = { kill: KillState; declinedBefore?: boolean; now: Date };
export type Reason =
  | SecretKind | 'money_figure' | 'health' | 'abuse' | 'minor' | 'self_harm'
  | 'untrusted_origin' | 'kill_switch' | 'empty' | 'too_long' | 'verbatim_other' | 'other_sensitive' | 'momentary_emotion' | 'declined_before'
  | 'inferred' | 'sensitive_self' | 'contact_pii' | 'needs_screen_confirm';
export type Verdict = {
  verdict: 'save' | 'ask' | 'refuse' | 'skip';
  reasons: Reason[]; private: boolean; expires_at: string | null;
  kind: Kind; title: string; body: string; source: Source; confidence: number; why: string; subject: Subject;
  care: Care;                 // tell S07/S21 to answer with care even though nothing is saved
  userMessage: string;        // one short Hinglish line S07 may say (empty = say nothing about memory)
};

const UNTRUSTED: Origin[] = ['web', 'screen', 'message', 'tool', 'file'];
const SECRET_KINDS = new Set<string>(['api_key', 'private_key', 'password', 'otp', 'card', 'cvv', 'bank_account', 'upi_pin', 'gov_id', 'recovery_phrase', 'session_token']);
const NEVER: Category[] = ['health', 'money_figure', 'abuse', 'minor', 'self_harm'];

export function computeExpiry(o: { source: Source; kind: Kind; ephemeral?: boolean; dueDate?: string | null; now: Date }): string | null {
  const t = o.now.getTime(); const c: number[] = [];
  if (o.ephemeral) c.push(t + RETENTION_DAYS.ephemeral * DAY);
  if (o.source === 'inferred') c.push(t + RETENTION_DAYS.inferred * DAY);
  if (o.kind === 'episode') c.push(t + RETENTION_DAYS.episode * DAY);
  if (o.dueDate) { const d = Date.parse(o.dueDate); if (!Number.isNaN(d)) c.push(d + RETENTION_DAYS.afterDueDate * DAY); }
  return c.length ? new Date(Math.min(...c)).toISOString() : null;
}

const short = (s: string, n = 80) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export function decide(c: Candidate, ctx: PolicyContext): Verdict {
  const text = (c.text ?? '').trim();
  const kind: Kind = c.kind ?? 'fact';
  const subject: Subject = c.about ?? (kind === 'person' ? 'other' : 'amit');
  const source: Source = c.actor === 'amit_ui' ? 'amit_said' : (c.source ?? (c.origin === 'chat' || c.origin === 'voice' || c.origin === 'ui' ? 'amit_said' : 'inferred'));
  const confidence = source === 'amit_said' ? 1 : source === 'observed' ? Math.min(0.8, c.confidence ?? 0.8) : Math.min(0.7, c.confidence ?? 0.6);
  const why = (c.why ?? (source === 'amit_said' ? (c.explicit ? 'Amit ne kaha: yaad rakho' : 'Amit ne bataya tha') : source === 'observed' ? 'JARVIS ne dekha' : 'JARVIS ka andaza (Amit ne haan kaha)')).slice(0, LIMITS.whyChars);
  const out = (verdict: Verdict['verdict'], reasons: Reason[], extra: Partial<Verdict> = {}): Verdict => ({
    verdict, reasons, private: false, expires_at: null, kind, title: short(c.title?.trim() || text, LIMITS.titleChars), body: text, source, confidence, why, subject, care: null, userMessage: '', ...extra,
  });

  if (!text) return out('skip', ['empty']);
  if (UNTRUSTED.includes(c.origin)) return out('refuse', ['untrusted_origin'], { userMessage: '' }); // text from outside is DATA, never a memory
  if (c.actor === 'jarvis' && ctx.kill !== 'off') return out('refuse', ['kill_switch'], { userMessage: 'Kill switch ON hai, main kuch yaad nahi kar raha.' });

  // 1) secrets and IDs: whole candidate refused, "haan" cannot change it
  const secrets = findSecrets(text);
  if (secrets.length) {
    const kinds = [...new Set(secrets.map((s) => s.kind))];
    return out('refuse', kinds, { userMessage: 'Isme password/key/OTP/card jaisi cheez hai, main ise yaad nahi rakhta. Is message ko hata do, aur agar asli thi to badal do.' });
  }
  // 2) sensitive topics Amit put on the NEVER list
  const cl = classify(text);
  const never = NEVER.filter((x) => cl.categories.includes(x));
  if (never.length) {
    const msg = never.includes('self_harm') || never.includes('abuse') ? '' // S21 answers with care; we say nothing about "not remembering"
      : never.includes('money_figure') ? 'Paise ke ank main yaad nahi rakhta. Tarikh ya baat (bina ank) yaad rakh lun?'
      : never.includes('minor') ? 'Bachchon ki jaankari main yaad nahi rakhta.'
      : 'Sehat ki baatein main yaad nahi rakhta.';
    return out('refuse', never as Reason[], { care: cl.care, userMessage: msg });
  }
  const limit = kind === 'episode' || kind === 'knowledge' ? LIMITS.episodeBodyChars : LIMITS.bodyChars;
  if (text.length > limit) return out('refuse', ['too_long'], { userMessage: 'Ye bahut lamba hai. Note bana dun? Yaad ke liye chhoti line chahiye.' });
  if ((c.about === 'other' || kind === 'person') && text.length > 200 && /^["“'‘]/.test(text)) return out('refuse', ['verbatim_other'], { userMessage: 'Doosre ka poora message main yaad nahi rakhta; chhota saaransh bata do.' });
  if (cl.categories.includes('emotion') && !c.explicit && c.actor !== 'amit_ui') return out('skip', ['momentary_emotion']);
  if (ctx.declinedBefore && !c.confirmed) return out('skip', ['declined_before']);

  // 3) ask-first and private rules
  const ask: Reason[] = []; let priv = false;
  const ownUi = c.actor === 'amit_ui';
  if (source !== 'amit_said') ask.push('inferred');
  if (cl.categories.includes('other_sensitive')) {
    if (subject === 'other') {
      if (!c.explicit && !ownUi) return out('refuse', ['other_sensitive'], { userMessage: 'Doosron ki nazuk baatein main tabhi rakhta hoon jab tum saaf "yaad rakho" bolo.' });
      priv = true;
    } else { ask.push('other_sensitive'); priv = true; }
  }
  if (cl.categories.includes('sensitive_self')) { ask.push('sensitive_self'); priv = true; }
  if (cl.categories.includes('contact_pii')) { priv = true; if (!c.explicit && !ownUi) ask.push('contact_pii'); }
  if (ownUi) { const i = ask.indexOf('other_sensitive'); if (i >= 0) ask.splice(i, 1); const j = ask.indexOf('sensitive_self'); if (j >= 0) ask.splice(j, 1); }

  const expires_at = computeExpiry({ source, kind, ephemeral: c.ephemeral, dueDate: c.dueDate, now: ctx.now });
  const base = { private: priv, expires_at } as const;
  if (ask.length) {
    if (!c.confirmed) {
      const line = ask.includes('inferred') ? `Mera andaza hai: "${short(text)}". Yaad rakhun? (haan / nahi)` : `Ye nijee lag raha hai: "${short(text)}". Private rakh kar yaad rakhun? (haan / nahi)`;
      return out('ask', ask, { ...base, userMessage: line });
    }
    if (priv && c.confirmed.channel === 'voice') return out('ask', [...ask, 'needs_screen_confirm'], { ...base, userMessage: 'Nijee baat hai, screen par bhi "haan" dabao.' });
  }
  return out('save', ask, { ...base, userMessage: 'Note kar liya.' });
}
