// "What is written is what is spoken": speak a line, transcribe the audio, compare word by word.
// ASR is not perfect either, so a mismatch is a pointer to listen, not a verdict.

const norm = (s: string): string[] =>
  s.normalize('NFC').toLowerCase()
    .replace(/\[[^\]]*\]/g, ' ')                       // emotion/pause tags are not spoken text
    .replace(/\u093C/g, '').replace(/\u0901/g, '\u0902')   // nukta dropped, chandrabindu = anusvara (ASR spells these loosely)
    .replace(/[.,!?।"“”'’:;()\-–—…]/g, ' ').split(/\s+/).filter(Boolean);

export interface Diff { expected: string[]; heard: string[]; missing: string[]; extra: string[]; accuracy: number }
// Longest-common-subsequence on words: missing = written but not heard, extra = heard but not written.
export function wordDiff(expected: string, heard: string): Diff {
  const E = norm(expected), H = norm(heard);
  const dp = Array.from({ length: E.length + 1 }, () => new Array<number>(H.length + 1).fill(0));
  for (let i = E.length - 1; i >= 0; i--) for (let j = H.length - 1; j >= 0; j--)
    dp[i][j] = E[i] === H[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const missing: string[] = [], extra: string[] = []; let i = 0, j = 0;
  while (i < E.length && j < H.length) {
    if (E[i] === H[j]) { i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) missing.push(E[i++]); else extra.push(H[j++]);
  }
  while (i < E.length) missing.push(E[i++]); while (j < H.length) extra.push(H[j++]);
  return { expected: E, heard: H, missing, extra, accuracy: E.length ? (E.length - missing.length) / E.length : 1 };
}

// Fish speech-to-text through its OpenAI-compatible endpoint.
// UNVERIFIED against the live API in this build (no network/key in the build sandbox): path, `model` name and form fields must be tested once.
export function createFishAsr(opts: { apiKey: string; fetchImpl?: typeof fetch; baseUrl?: string }) {
  const f = opts.fetchImpl ?? fetch; const base = opts.baseUrl ?? 'https://api.fish.audio/compat/api/v1';
  return async (audio: Uint8Array, o: { mime?: string; language?: string; signal?: AbortSignal } = {}): Promise<string> => {
    const form = new FormData();
    form.append('file', new Blob([audio as BlobPart], { type: o.mime ?? 'audio/mpeg' }), 'clip.mp3');
    form.append('model', 'fish-audio/transcribe-1');
    if (o.language) form.append('language', o.language);
    const res = await f(`${base}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${opts.apiKey}` }, body: form, signal: o.signal });
    if (!res.ok) throw new Error(`fish_asr_http_${res.status}`);   // status only: no body, no key
    const data = (await res.json()) as { text?: string };
    return data.text ?? '';
  };
}
