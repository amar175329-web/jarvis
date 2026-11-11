#!/usr/bin/env python3
"""Measures whether the SAME voice stays the same across clips (and sentences), without listening.
   python3 packages/voice/tools/measure-voice.py ~/JARVIS-private/voice-lab/clips            (a folder of mp3/wav)
   python3 packages/voice/tools/measure-voice.py a.mp3 b.mp3
Needs: ffmpeg, numpy, scipy. Per clip: duration, pauses, median pitch (F0), pitch spread, speech rate (rough), brightness.
Clips named <group>__<n>-<voice>.mp3 (what build-voice-lab.ts writes) are compared per voice:
the median pitch of one voice should stay within about 2 semitones; more than 3 means the voice is drifting."""
import sys, os, glob, subprocess, tempfile, re
import numpy as np, scipy.io.wavfile as wf, scipy.signal as ss

def load(path):
    with tempfile.TemporaryDirectory() as d:
        w = os.path.join(d, 'c.wav')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', path, '-ac', '1', '-ar', '16000', w], check=True)
        sr, x = wf.read(w)
    return sr, x.astype(np.float64) / 32768

def analyse(path):
    sr, x = load(path)
    fl, hp = int(.025 * sr), int(.010 * sr)
    if len(x) < fl * 4: return None
    fr = np.array([x[i:i + fl] for i in range(0, len(x) - fl, hp)])
    rms = np.sqrt((fr ** 2).mean(1)); db = 20 * np.log10(rms + 1e-9); thr = db.max() - 35; on = db > thr
    pauses, i, n = [], 0, len(db)
    while i < n:
        if not on[i]:
            j = i
            while j < n and not on[j]: j += 1
            if 0 < i and j < n - 1 and (j - i) * 10 >= 120: pauses.append((j - i) * 10)   # inner pauses only
            i = j
        else: i += 1
    def f0(frame):
        frame = frame - frame.mean()
        if np.sqrt((frame ** 2).mean()) < 0.01: return None
        w = frame * np.hanning(len(frame)); ac = np.correlate(w, w, 'full')[len(w) - 1:]
        lo, hi = int(sr / 400), int(sr / 70); k = ac[lo:hi].argmax() + lo
        return sr / k if ac[k] / ac[0] >= 0.35 else None
    fl2 = int(.04 * sr); p = np.array([v if (v := f0(x[i:i + fl2])) else np.nan for i in range(0, len(x) - fl2, hp)])
    pv = p[~np.isnan(p)]
    def cent(f):
        S = np.abs(np.fft.rfft(f * np.hanning(len(f)))); fq = np.fft.rfftfreq(len(f), 1 / sr); return (S * fq).sum() / (S.sum() + 1e-9)
    c = [cent(fr[i]) for i in range(0, min(len(fr), len(p)), 2) if db[i] > thr + 8 and not np.isnan(p[i])]
    env = ss.savgol_filter(rms, 7, 2); pk, _ = ss.find_peaks(env, height=env.max() * 0.15, distance=8)
    speech = max(on.sum() * 10 / 1000, 0.1)
    return dict(dur=len(x) / sr, pauses=len(pauses), pause_ms=int(np.mean(pauses)) if pauses else 0,
                f0=float(np.median(pv)) if len(pv) > 10 else None, f0_range=float(np.percentile(pv, 90) - np.percentile(pv, 10)) if len(pv) > 10 else None,
                rate=len(pk) / speech, bright=float(np.median(c)) if c else None)

def main(args):
    files = []
    for a in args or ['.']:
        files += sorted(glob.glob(os.path.join(a, '*'))) if os.path.isdir(a) else [a]
    files = [f for f in files if f.lower().endswith(('.mp3', '.wav', '.m4a', '.ogg'))]
    if not files: print('no audio files found'); return 2
    rows, byvoice = [], {}
    print(f"{'file':38} {'sec':>5} {'pauses':>6} {'F0 Hz':>6} {'range':>6} {'syl/s':>6} {'bright':>6}")
    for f in files:
        try: r = analyse(f)
        except Exception as e: print(f'{os.path.basename(f):38} (could not read: {str(e)[:40]})'); continue
        if not r: print(f'{os.path.basename(f):38} (too short)'); continue
        fmt = lambda v, w=6, d=0: f'{v:{w}.{d}f}' if v is not None else ' ' * (w - 1) + '-'
        print(f"{os.path.basename(f)[:38]:38} {r['dur']:5.1f} {r['pauses']:3d}x{r['pause_ms']:<3d}{fmt(r['f0'])}{fmt(r['f0_range'])}{fmt(r['rate'], 6, 1)}{fmt(r['bright'])}")
        m = re.search(r'-(\w+)\.\w+$', os.path.basename(f))
        if m and r['f0']: byvoice.setdefault(m.group(1), []).append((os.path.basename(f), r['f0']))
    for v, lst in byvoice.items():
        if len(lst) < 2: continue
        vals = [x[1] for x in lst]; swing = 12 * np.log2(max(vals) / min(vals))
        lo = min(lst, key=lambda x: x[1]); hi = max(lst, key=lambda x: x[1])
        verdict = 'STEADY' if swing <= 2 else 'WATCH' if swing <= 3 else 'DRIFTING'
        print(f"\nvoice '{v}': {len(lst)} clips, median F0 {np.median(vals):.0f} Hz, swing {swing:.1f} semitones -> {verdict}")
        if swing > 2: print(f"   lowest  {lo[0]} ({lo[1]:.0f} Hz)\n   highest {hi[0]} ({hi[1]:.0f} Hz)")
    return 0

if __name__ == '__main__': sys.exit(main(sys.argv[1:]))
