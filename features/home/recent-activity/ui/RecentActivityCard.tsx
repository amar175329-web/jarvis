import { useEffect, useState } from 'react';
import { recentActivity } from '../src/api-client';
import type { SafeActivityItem } from '../src/handler.mjs';
import './recent-activity.css';

function relativeTime(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '—';
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1_000));
  if (seconds < 60) return 'Just now';
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h ago`;
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' }).format(date);
}

function iconFor(item: SafeActivityItem) {
  if (item.private) return { tone: 't-violet', icon: 'i-lock' };
  if (item.kind === 'complete') return { tone: 't-emerald', icon: 'i-check' };
  if (item.kind === 'system') return { tone: 't-cyan', icon: 'i-pulse' };
  return { tone: 't-violet', icon: 'i-spark' };
}

export function RecentActivityCard() {
  const [items, setItems] = useState<SafeActivityItem[]>([]);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    recentActivity()
      .then((value) => { if (active) setItems(value); })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);

  return <section className="card history-card d2-history-card" aria-label="Recent Activity">
    <div className="card-head">
      <div className="card-title">
        <span className="symbol t-violet"><svg className="i" aria-hidden="true"><use href="#i-clock" /></svg></span>
        Recent Activity
      </div>
      <span className="subtle-link">Past history &rarr;</span>
    </div>
    {busy ? <p className="d2-history-state">Loading recent activity…</p>
      : failed ? <p className="d2-history-state" role="status">Recent activity abhi unavailable hai.</p>
        : items.length === 0 ? <p className="d2-history-state">Abhi koi recent activity nahi hai.</p>
          : items.map((item) => {
            const icon = iconFor(item);
            return <div className="history-row d2-history-row" key={item.id}>
              <span className={`history-icon ${icon.tone}`}><svg className="i" aria-hidden="true"><use href={`#${icon.icon}`} /></svg></span>
              <div className="d2-history-copy">
                <b>{item.private ? 'Private activity' : item.label}</b>
                <small>{item.private ? 'Details hidden for privacy' : item.label === 'Task completed' ? 'Task progress updated' : 'JARVIS activity'}</small>
              </div>
              {!item.private && <time dateTime={item.ts}>{relativeTime(item.ts)}</time>}
            </div>;
          })}
  </section>;
}
