import { useEffect, useState } from 'react';
import './notifications.css';
type Item = { id: string; title: string; createdAt: string; unread: boolean };
export function NotificationsPanel({ endpoint = '/api/notifications/notifications.list' }: { endpoint?: string }) {
  const [open, setOpen] = useState(false); const [items, setItems] = useState<Item[]>([]); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const unread = items.filter((item) => item.unread).length;
  async function load() { setBusy(true); setMessage(''); try { const r = await fetch(endpoint, { credentials: 'same-origin', cache: 'no-store' }); const b = await r.json().catch(() => null); if (!r.ok || b?.ok !== true) throw new Error('Notifications abhi unavailable hain'); setItems(Array.isArray(b.data?.notifications) ? b.data.notifications : []); } catch (e) { setMessage(e instanceof Error ? e.message : 'Notifications unavailable'); } finally { setBusy(false); } }
  useEffect(() => { if (open) void load(); }, [open]);
  async function markRead() { setBusy(true); setMessage(''); try { const r = await fetch('/api/notifications/notifications.mark-read', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: true }) }); const b = await r.json().catch(() => null); if (!r.ok || b?.ok !== true) throw new Error(b?.error?.message ?? 'Mark-read power abhi band hai'); setItems((old) => old.map((item) => ({ ...item, unread: false }))); } catch (e) { setMessage(e instanceof Error ? e.message : 'Read status save nahi hua'); } finally { setBusy(false); } }
  return <div className="jarvis-notifications">
    <button type="button" className="top-icon t-blue jarvis-notifications__trigger" aria-label={`Notifications, ${unread} unread`} aria-expanded={open} onClick={() => setOpen((value) => !value)}><svg className="i" aria-hidden="true"><use href="#i-bell" /></svg>{unread > 0 && <i className="dot" />}</button>
    {open && <section className="jarvis-notifications__panel card" aria-label="Notifications">
      <header><div><h3>Notifications</h3><p>{unread} unread</p></div><button type="button" onClick={() => void load()} disabled={busy}>Refresh</button></header>
      {message && <p role="status" className="jarvis-notifications__message">{message}</p>}
      {busy && <p className="jarvis-notifications__empty">Loading...</p>}
      {!busy && items.length === 0 && <p className="jarvis-notifications__empty">Abhi koi notification nahi hai.</p>}
      {!busy && items.map((item) => <article key={item.id} className={`jarvis-notifications__item${item.unread ? ' is-unread' : ''}`}><span className="jarvis-notifications__state" aria-hidden="true"/><div><b>{item.title}</b><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</time></div></article>)}
      <footer><small>Reminder fire karna D1a ka kaam hai.</small><button type="button" onClick={() => void markRead()} disabled={busy || unread === 0}>Mark all read</button></footer>
    </section>}
  </div>;
}
