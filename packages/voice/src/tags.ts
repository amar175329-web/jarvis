export type Mode = 'normal' | 'focus' | 'night' | 'chill' | 'workout';
export type Situation = 'greeting' | 'good_news' | 'bad_news' | 'joke' | 'alert' | 'normal';

// Only these tags are ever sent to Fish. Everything else in a reply is stripped (see cleanForSpeech).
export const ALLOWED_TAGS = ['softly', 'relaxed', 'energetic', 'warm', 'happy', 'dry tone'] as const;
export type Tag = (typeof ALLOWED_TAGS)[number];

// Bad news and alerts: plain voice, no emotion tag, no joke. Night is always soft. Then the situation, then the mode.
export function tagFor(mode: Mode, situation: Situation): Tag | null {
  if (situation === 'bad_news' || situation === 'alert') return null;
  if (mode === 'night') return 'softly';
  if (situation === 'greeting') return 'warm';
  if (situation === 'good_news') return 'happy';
  if (situation === 'joke') return 'dry tone';
  if (mode === 'chill') return 'relaxed';
  if (mode === 'workout') return 'energetic';
  return null;
}

// Focus mode is silent unless it is an alert.
export function shouldSpeak(mode: Mode, situation: Situation): boolean {
  return !(mode === 'focus' && situation !== 'alert');
}

export function withTag(sentence: string, tag: Tag | null): string {
  return tag ? `[${tag}] ${sentence}` : sentence;
}
