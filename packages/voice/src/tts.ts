import { toSpeech } from './speech-text.ts';
import type { Script } from './speech-text.ts';
import { latinLeft } from './hindi.ts';
import { isSensitiveForCloud } from './sensitive.ts';
import { shouldSpeak, tagFor } from './tags.ts';
import type { Mode, Situation } from './tags.ts';

// Amit's pick (community voice "calm", chosen in the S21 chat). Check the creator's terms on the voice page before real use.
export const DEFAULT_VOICE_ID = '57c0c11acb8149ea93074362b310929d';
// Amit's decision (2026-11-08): "calm" is JARVIS himself; "indian" is the voice of the small helpers (bots, boards, short status lines).
// Amit's own recorded voice is never used here, and no ID of it may appear in code, docs or git.
export const HELPER_VOICE_ID = 'ce9c96291460478ea6851049cb847d73';
export type VoiceRole = 'jarvis' | 'helper';
export function voiceIdFor(role: VoiceRole = 'jarvis', env: Record<string, string | undefined> = {}): string {
  return role === 'helper' ? (env.HELPER_VOICE_ID || HELPER_VOICE_ID) : (env.JARVIS_VOICE_ID || DEFAULT_VOICE_ID);
}
export const FISH_FREE_MODEL = 's2.1-pro-free';
// free tier ki date badalti rehti hai, pakka 30 Nov 2026 tak; usse pehle paid plan/doosra model decide karna
export const FISH_FREE_UNTIL = new Date('2026-11-30T18:30:00Z'); // end of 30 Nov in India

/**
 * Days remaining until the Fish free model tier expires.
 * Returns > 0 while active, <= 0 once expired.
 */
export function daysUntilFishFreeExpiry(now: Date = new Date()): number {
  const diffMs = FISH_FREE_UNTIL.getTime() - now.getTime();
  if (diffMs <= 0) return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

// Fish sampling settings. Lower temperature = more consistent voice (Fish docs). `normalize` makes Fish rewrite numbers/dates/symbols and
// guess the language of each chunk; we already spell numbers in Hindi ourselves, so it is switched off to speak exactly what is written.
export interface Tuning { temperature?: number; top_p?: number; normalize?: boolean }
export const DEFAULT_TUNING: Tuning = { temperature: 0.5, top_p: 0.7, normalize: false };   // PROPOSED: confirm with the voice lab round-trip check
export type CloudSpeak = (req: { text: string; voiceId: string; model: string; signal: AbortSignal; speed?: number; tuning?: Tuning }) => Promise<Uint8Array>;
export interface SpeakContext {
  now: Date; mode: Mode; situation: Situation;
  killSwitch: boolean | 'unknown';          // true or unknown = no cloud (fail-closed)
  cloudEnabled: boolean; deviceVoice: boolean;
  model?: string; voiceId?: string; allowPaid?: boolean; timeoutMs?: number;
  script?: Script;                          // default 'devanagari': Amit wants pure Hindi in the voice
  role?: VoiceRole;                         // 'jarvis' (default) or 'helper' (bots, boards, small things)
  speed?: number;                           // overrides the mode's pace (0.5 to 2.0)
  tuning?: Tuning;                          // default DEFAULT_TUNING
  joinReply?: boolean;                      // send the whole short reply in ONE request (one take = one steady voice); default false until the lab proves it
}
export type Part = { kind: 'audio'; data: Uint8Array; gapAfterMs: number } | { kind: 'device'; text: string } | { kind: 'text'; text: string };
export interface SpeakResult { parts: Part[]; route: 'fish' | 'device' | 'text' | 'silent'; reasons: string[]; latinWords?: string[] }


// ---- Pace and pauses (Amit, 2026-11-08: sometimes too fast; wants human pauses, but never so slow that he waits).
// Three levers: Fish `prosody.speed`, a short inline pause after commas, and a silent gap the PLAYER leaves between sentences.
export interface Pace { speed: number; gapMs: number; commaPause: boolean }
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
// Starting values, to be tuned by ear in the voice lab (never below 0.85: slower than that feels like waiting).
export function paceFor(mode: Mode, situation: Situation, speedOverride?: number): Pace {
  let p: Pace;
  if (situation === 'alert') p = { speed: 1.0, gapMs: 250, commaPause: false };       // clear and direct
  else if (situation === 'bad_news') p = { speed: 0.9, gapMs: 450, commaPause: true }; // softer and unhurried
  else if (mode === 'night') p = { speed: 0.88, gapMs: 450, commaPause: true };
  else if (mode === 'chill') p = { speed: 0.9, gapMs: 450, commaPause: true };
  else if (mode === 'workout') p = { speed: 1.0, gapMs: 250, commaPause: true };
  else p = { speed: 0.93, gapMs: 350, commaPause: true };
  return { ...p, speed: clamp(speedOverride ?? p.speed, 0.85, 1.1) };
}

// A short breath after commas in sentences long enough to need one (at most two per sentence). Added only for the cloud voice:
// the phone's own voice and the screen never see these tags.
export function addPauses(sentence: string): string {
  if (sentence.trim().split(/\s+/).length < 6) return sentence;
  let n = 0;
  return sentence.replace(/,\s+/g, (m) => (++n <= 2 ? ', [short pause] ' : m));
}

export function gapFor(sentence: string, pace: Pace): number {
  const end = sentence.trim().slice(-1);
  if (end === '?') return pace.gapMs + 50;
  if (end === '!') return Math.max(150, pace.gapMs - 50);
  return pace.gapMs;
}

export interface CloudSentence { plain: string; cloud: string; speed: number; gapAfterMs: number }
// The one place that decides exactly what is sent to Fish. speak() and the voice lab both use it.
export function buildCloudSentences(text: string, o: { mode: Mode; situation: Situation; script?: Script; tag?: string | null; pace?: Partial<Pace>; join?: boolean }): CloudSentence[] {
  const pace = { ...paceFor(o.mode, o.situation), ...(o.pace ?? {}) };
  const tag = o.tag === undefined ? tagFor(o.mode, o.situation) : o.tag;
  const sentences = toSpeech(text, 120, o.script ?? 'devanagari');
  // One take: all sentences in a single request, a [pause] tag between them (Fish keeps one steady voice inside a request).
  if (o.join && sentences.length > 1) {
    const joined = sentences.map((s, i) => { const b = pace.commaPause ? addPauses(s) : s; return i === 0 && tag ? `[${tag}] ${b}` : b; }).join(' [pause] ');
    if (joined.length <= 280) return [{ plain: sentences.join(' '), cloud: joined, speed: pace.speed, gapAfterMs: 0 }];
  }
  return sentences.map((s, i) => {
    const body = pace.commaPause ? addPauses(s) : s;
    return { plain: s, cloud: i === 0 && tag ? `[${tag}] ${body}` : body, speed: pace.speed, gapAfterMs: i < sentences.length - 1 ? gapFor(s, pace) : 0 };
  });
}

// Why the cloud voice may not be used right now, or null if it may.
export function cloudBlockReason(text: string, ctx: SpeakContext, cloud?: CloudSpeak): string | null {
  if (ctx.killSwitch !== false) return ctx.killSwitch === true ? 'kill_switch' : 'kill_switch_unknown';
  if (isSensitiveForCloud(text)) return 'sensitive';
  if (!ctx.cloudEnabled) return 'cloud_disabled';
  if (!cloud) return 'no_adapter';
  if ((ctx.model ?? FISH_FREE_MODEL) === FISH_FREE_MODEL && !ctx.allowPaid && ctx.now >= FISH_FREE_UNTIL) return 'free_period_over';
  return null;
}

export async function speak(text: string, ctx: SpeakContext, cloud?: CloudSpeak): Promise<SpeakResult> {
  if (!shouldSpeak(ctx.mode, ctx.situation)) return { parts: [], route: 'silent', reasons: ['focus_mode'] };
  const script = ctx.script ?? 'devanagari';
  const items = buildCloudSentences(text, { mode: ctx.mode, situation: ctx.situation, script, pace: ctx.speed !== undefined ? { speed: clamp(ctx.speed, 0.85, 1.1) } : undefined, join: ctx.joinReply });
  const sentences = toSpeech(text, 120, script);   // always the per-sentence plain text: the fallback voice and the screen use it
  if (sentences.length === 0) return { parts: [], route: 'silent', reasons: ['nothing_to_say'] };
  const plain = (rest: string[]): Part[] => rest.map((s) => (ctx.deviceVoice ? { kind: 'device', text: s } : { kind: 'text', text: s }) as Part);

  // Sensitivity is judged on the ORIGINAL text too: numbers become Hindi words after conversion, so a phone number would no longer look like one.
  const latin = script === 'devanagari' ? latinLeft(sentences.join(' ')) : undefined;
  const block = cloudBlockReason(`${text} ${sentences.join(' ')}`, ctx, cloud);
  if (block) return { parts: plain(sentences), route: ctx.deviceVoice ? 'device' : 'text', reasons: [block], latinWords: latin };

  const parts: Part[] = []; const reasons: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), ctx.timeoutMs ?? 6000);
    try {
      const data = await cloud!({ text: items[i].cloud, voiceId: ctx.voiceId ?? voiceIdFor(ctx.role ?? 'jarvis'), model: ctx.model ?? FISH_FREE_MODEL, signal: ac.signal, speed: items[i].speed, tuning: ctx.tuning ?? DEFAULT_TUNING });
      parts.push({ kind: 'audio', data, gapAfterMs: items[i].gapAfterMs });
    } catch (e) {
      reasons.push(`cloud_failed:${e instanceof Error ? e.message.slice(0, 40) : 'error'}`);
      parts.push(...plain(items.length === sentences.length ? sentences.slice(i) : sentences));   // rest goes to the phone's voice (or text) WITHOUT tags
      return { parts, route: parts[0]?.kind === 'audio' ? 'fish' : ctx.deviceVoice ? 'device' : 'text', reasons, latinWords: latin };
    } finally { clearTimeout(timer); }
  }
  return { parts, route: 'fish', reasons, latinWords: latin };
}

// Server-side only. The key is passed in by the route, never read from the environment here, never logged, never in an error.
// UNVERIFIED against the live Fish API in this build (no network/key in the build sandbox): endpoint path and body must be tested once.
export function createFishAdapter(opts: { apiKey: string; fetchImpl?: typeof fetch; baseUrl?: string }): CloudSpeak {
  const f = opts.fetchImpl ?? fetch; const base = opts.baseUrl ?? 'https://api.fish.audio';
  return async ({ text, voiceId, model, signal, speed, tuning }) => {
    const res = await f(`${base}/v1/tts`, {
      method: 'POST', signal,
      headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json', model },
      body: JSON.stringify({ text, reference_id: voiceId, format: 'mp3', ...(speed !== undefined && speed !== 1 ? { prosody: { speed } } : {}), ...Object.fromEntries(Object.entries(tuning ?? {}).filter(([, v]) => v !== undefined)) }),
    });
    if (!res.ok) throw new Error(`fish_http_${res.status}`);  // status only: no body, no key
    return new Uint8Array(await res.arrayBuffer());
  };
}
