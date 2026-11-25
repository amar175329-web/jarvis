import { useEffect, useState } from 'react';
import './settings.css';
type Preferences = { language: 'hi' | 'hinglish' | 'en'; timeZone: 'Asia/Kolkata' | 'UTC'; reduceMotion: boolean };
const DEFAULTS: Preferences = { language: 'hinglish', timeZone: 'Asia/Kolkata', reduceMotion: false };
export function SettingsPage() {
  const [value, setValue] = useState<Preferences>(DEFAULTS); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('Loading settings...');
  useEffect(() => { const controller = new AbortController(); fetch('/api/settings/settings.read', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal }).then(async (r) => { const b = await r.json().catch(() => null); if (!r.ok || b?.ok !== true) throw new Error('General settings abhi unavailable hain'); setValue({ ...DEFAULTS, ...b.data.preferences }); setMessage(''); }).catch((e) => { if (!controller.signal.aborted) setMessage(e instanceof Error ? e.message : 'Settings unavailable'); }); return () => controller.abort(); }, []);
  async function save() { setBusy(true); setMessage(''); try { const r = await fetch('/api/settings/settings.update', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ preferences: value, confirm: true }) }); const b = await r.json().catch(() => null); if (!r.ok || b?.ok !== true) throw new Error(b?.error?.message ?? 'Settings power abhi band hai'); setValue({ ...DEFAULTS, ...b.data.preferences }); setMessage('Settings saved.'); } catch (e) { setMessage(e instanceof Error ? e.message : 'Settings save nahi hui'); } finally { setBusy(false); } }
  return <section className="page active jarvis-settings-page"><div className="more-intro"><div><h2>Settings</h2><p>JARVIS ko apne workflow ke hisaab se set karo.</p></div><span className="count-pill">GENERAL</span></div>
    <div className="jarvis-settings-grid">
      <section className="card jarvis-settings-card"><div className="jarvis-settings-card__head"><span className="jarvis-settings-icon"><svg className="i"><use href="#i-sliders" /></svg></span><div><h3>General preferences</h3><p>Language, timezone aur motion.</p></div></div>
        <label>Language<select value={value.language} onChange={(e) => setValue((v) => ({ ...v, language: e.target.value as Preferences['language'] }))}><option value="hinglish">Hinglish</option><option value="hi">Hindi</option><option value="en">English</option></select></label>
        <label>Time zone<select value={value.timeZone} onChange={(e) => setValue((v) => ({ ...v, timeZone: e.target.value as Preferences['timeZone'] }))}><option value="Asia/Kolkata">India (Asia/Kolkata)</option><option value="UTC">UTC</option></select></label>
        <label className="jarvis-settings-check"><input type="checkbox" checked={value.reduceMotion} onChange={(e) => setValue((v) => ({ ...v, reduceMotion: e.target.checked }))}/><span>Reduce animations</span></label>
        <button type="button" className="jarvis-settings-save" onClick={() => void save()} disabled={busy}>{busy ? 'Saving...' : 'Save preferences'}</button>
        {message && <p className="jarvis-settings-message" role="status">{message}</p>}
      </section>
      <section className="card jarvis-settings-card"><div className="jarvis-settings-card__head"><span className="jarvis-settings-icon"><svg className="i"><use href="#i-shield" /></svg></span><div><h3>Privacy &amp; models</h3><p>Private data ke liye cloud model use nahi hoga.</p></div></div><p className="jarvis-settings-note">Model providers, keys, budgets aur privacy tiers S13 ke dedicated controls mein manage honge. Ye shell page un values ko read ya edit nahi karta.</p><p className="jarvis-settings-note">Power state unreadable ho toh JARVIS actions blocked rahenge.</p></section>
    </div>
  </section>;
}
