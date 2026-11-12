// The memory policy: ONE pure function, decide(candidate) -> save | ask | refuse | skip. No database, no model.
// Human rules live in self/identity/memory-behaviour.md. Keep this code and that file aligned.
import { findSecrets, type SecretKind } from './redact.ts';
import { classify, isDeepEmotion, type Care, type Category, sensitiveTags } from './classify.ts';
import { DAY, LIMITS, RETENTION_DAYS } from './rules.ts';
import type { Actor, KillState, Kind, MemoryTier, Origin, Source, Subject } from './types.ts';

export type Candidate = {
  text: string; title?: string; kind?: Kind; origin: Origin; actor: Actor;
  source?: Source; explicit?: boolean;                 // explicit = Amit said "yaad rakho" (or typed it in the Memory screen)
  about?: Subject; subject_key?: string | null; ephemeral?: boolean; dueDate?: string | null;
  tags?: string[]; why?: string; confidence?: number; pinned?: boolean;
  confirmed?: { channel: 'app_tap' | 'text' | 'voice' } | null; // set only AFTER Amit answered "haan" to an ask
};
export type PolicyContext = { kill: KillState; declinedBefore?: boolean; now: Date };
export type Reason =
  | SecretKind | 'untrusted_origin' | 'kill_switch' | 'empty' | 'too_long' | 'verbatim_other' | 'other_sensitive' | 'momentary_emotion' | 'declined_before'
  | 'inferred' | 'contact_pii' | 'needs_screen_confirm' | 'child_photo_or_school';
export type Verdict = {
  verdict: 'save' | 'ask' | 'refuse' | 'skip';
  reasons: Reason[]; tier: MemoryTier; private: boolean; expires_at: string | null;
  kind: Kind; title: string; body: string; source: Source; confidence: number; why: string; subject: Subject;
  care: Care;                 // S07/S21 must answer with care even when nothing is saved
  tags: string[];             // derived private-use tags; never an event/log payload
  userMessage: string;        // one short Hinglish line S07 may say (empty = say nothing about memory)
};

const UNTRUSTED: Origin[] = ['web', 'screen', 'message', 'tool', 'file'];
const SENSITIVE: Category[] = ['health', 'money_figure', 'abuse', 'minor', 'self_harm', 'other_sensitive', 'sensitive_self', 'contact_pii', 'emotion', 'family', 'location'];

export function computeExpiry(o: { source: Source; kind: Kind; ephemeral?: boolean; dueDate?: string | null; now: Date }): string | null {
  const t = o.now.getTime(); const c: number[] = [];
  if (o.ephemeral) c.push(t + RETENTION_DAYS.ephemeral * DAY);
  if (o.source === 'inferred') c.push(t + RETENTION_DAYS.inferred * DAY);
  // Amit's own historical episodes (including workouts and health history) do not expire by age.
  if (o.dueDate) { const d = Date.parse(o.dueDate); if (!Number.isNaN(d)) c.push(d + RETENTION_DAYS.afterDueDate * DAY); }
  return c.length ? new Date(Math.min(...c)).toISOString() : null;
}

const short = (s: string, n = 80) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const T3_MESSAGE = 'Ye raw secret/ID number hai. Main ise memory mein nahi rakhunga. Vault mein sirf {{secret:naam}} handle se use hoga; asli number chat mein mat bhejo.';
const SECRET_PASTE_MESSAGE = 'Isme password/key/OTP/card jaisi secret cheez hai. Memory mein nahi rakhunga; message hata do, aur password/key asli thi to badal do.';

function careSummary(care: Care): string {
  return care === 'self_harm'
    ? 'Amit ne self-harm se judi mushkil share ki; JARVIS ko aage hamesha care aur support ke saath jawab dena hai.'
    : 'Amit ne abuse ya unsafe experience share kiya; JARVIS ko aage hamesha care aur support ke saath jawab dena hai.';
}

export function decide(c: Candidate, ctx: PolicyContext): Verdict {
  const text = (c.text ?? '').trim();
  const kind: Kind = c.kind ?? 'fact';
  const subject: Subject = c.about ?? (kind === 'person' ? 'other' : 'amit');
  const source: Source = c.actor === 'amit_ui' ? 'amit_said' : (c.source ?? (c.origin === 'chat' || c.origin === 'voice' || c.origin === 'ui' ? 'amit_said' : 'inferred'));
  const confidence = source === 'amit_said' ? 1 : source === 'observed' ? Math.min(0.8, c.confidence ?? 0.8) : Math.min(0.7, c.confidence ?? 0.6);
  const why = (c.why ?? (source === 'amit_said' ? (c.explicit ? 'Amit ne kaha: yaad rakho' : 'Amit ne bataya tha') : source === 'observed' ? 'JARVIS ne dekha' : 'JARVIS ka andaza (Amit ne haan kaha)')).slice(0, LIMITS.whyChars);
  const out = (verdict: Verdict['verdict'], reasons: Reason[], extra: Partial<Verdict> = {}): Verdict => ({
    verdict, reasons, tier: 'normal', private: false, expires_at: null, kind, title: short(c.title?.trim() || text, LIMITS.titleChars), body: text, source, confidence, why, subject, care: null, tags: [], userMessage: '', ...extra,
  });

  if (!text) return out('skip', ['empty']);
  if (UNTRUSTED.includes(c.origin)) return out('refuse', ['untrusted_origin'], { userMessage: '' }); // web/screen/message/tool/file is DATA, never memory
  if (c.actor === 'jarvis' && ctx.kill !== 'off') return out('refuse', ['kill_switch'], { userMessage: 'Kill switch ON hai, main kuch yaad nahi kar raha.' });

  // T3: raw credentials, identity numbers and secret-like material never enter memory, even on explicit instruction.
  const secrets = findSecrets(text);
  if (secrets.length) {
    const kinds = [...new Set(secrets.map((s) => s.kind))];
    const idOnly = kinds.every((k) => k === 'gov_id');
    return out('refuse', kinds, { userMessage: idOnly ? T3_MESSAGE : SECRET_PASTE_MESSAGE });
  }

  const cl = classify(text);
  const limit = kind === 'episode' || kind === 'knowledge' ? LIMITS.episodeBodyChars : LIMITS.bodyChars;
  if (text.length > limit) return out('refuse', ['too_long'], { userMessage: 'Ye bahut lamba hai. Note bana dun? Yaad ke liye chhoti line chahiye.' });
  if ((c.about === 'other' || kind === 'person') && text.length > 200 && /^['"“'‘]/.test(text)) return out('refuse', ['verbatim_other'], { userMessage: 'Doosre ka poora message main yaad nahi rakhta; chhota saaransh bata do.' });

  // Existing Decision 014 explicitly excludes a child's photo and school address from memory. Amit asked to revisit this; see CONTRACT REQUEST in the S09 report.
  const childAsset = cl.categories.includes('minor') && /\b(photo|picture|tasveer|image|school\s+(?:address|pata)|school ka pata|स्कूल का पता|तस्वीर|फोटो)\b/i.test(text);
  if (childAsset) return out('refuse', ['child_photo_or_school'], { userMessage: 'Bachche ki photo ya school address memory mein save nahi karunga; is rule ko LEAD se badalne ki request alag hai.' });

  // A crisis disclosure always gets a care signal. Raw methods/plans/details are never saved.
  if (cl.care) {
    if (!c.explicit) return out('skip', [cl.care], { care: cl.care, userMessage: '' });
    const safe = careSummary(cl.care);
    return out('save', [cl.care], { tier: 'sensitive', private: true, care: cl.care, body: safe, title: cl.care === 'self_harm' ? 'Amit emotional safety' : 'Amit unsafe experience', tags: ['emotion'], userMessage: 'Note kar liya (private).' });
  }

  if (cl.categories.includes('emotion') && !isDeepEmotion(text) && !c.explicit && c.actor !== 'amit_ui') {
    return out('skip', ['momentary_emotion']);
  }
  if (ctx.declinedBefore && !c.confirmed) return out('skip', ['declined_before']);

  const categories = cl.categories;
  const isSensitive = categories.some((x) => SENSITIVE.includes(x));
  const needsAsk = source !== 'amit_said';
  const tier: MemoryTier = isSensitive ? 'sensitive' : 'normal';
  const priv = tier === 'sensitive';
  const tags = priv ? sensitiveTags(text, categories) : [];
  const expires_at = computeExpiry({ source, kind, ephemeral: c.ephemeral, dueDate: c.dueDate, now: ctx.now });
  const base = { tier, private: priv, expires_at, tags } as const;

  // T2 facts Amit directly states are saved immediately. Only JARVIS inference asks first.
  if (needsAsk) {
    if (!c.confirmed) {
      return out('ask', ['inferred'], { ...base, userMessage: `Mera andaza hai: "${short(text)}". Private rakh kar yaad rakhun? (haan / nahi)` });
    }
    if (priv && c.confirmed.channel === 'voice') return out('ask', ['inferred', 'needs_screen_confirm'], { ...base, userMessage: 'Nijee baat hai, screen par bhi "haan" dabao.' });
  }

  return out('save', [], { ...base, userMessage: priv ? 'Note kar liya (private).' : 'Note kar liya.' });
}
