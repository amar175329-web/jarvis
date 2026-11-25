import { useEffect, useMemo, useState } from 'react';
import { ActivityLogsRequestError, listActivityLogs, type ActivityLogItem } from '../src/api-client';
import './activity-logs.css';

function when(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(date)
    : 'Time unavailable';
}

export function ActivityLogsPanel() {
  const [items, setItems] = useState<ActivityLogItem[]>([]);
  const [query, setQuery] = useState('');
  const [actor, setActor] = useState('all');
  const [outcome, setOutcome] = useState('all');
  const [busy, setBusy] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    listActivityLogs({ limit: 60, confirmed })
      .then((data) => { if (live) { setItems(data.items); setNeedsConfirmation(false); setError(''); } })
      .catch((reason) => { if (live) {
        if (reason instanceof ActivityLogsRequestError && reason.code === 'confirmation_required') setNeedsConfirmation(true);
        setError(reason instanceof Error ? reason.message : 'Activity Logs load nahi hue.');
      } })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [confirmed]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('en-IN');
    return items.filter((item) => {
      if (actor !== 'all' && item.actor !== actor) return false;
      if (outcome === 'success' && !item.ok) return false;
      if (outcome === 'blocked' && item.ok) return false;
      if (!q) return true;
      const detail = Object.values(item.detail).join(' ');
      return `${item.action} ${item.actor} ${item.target ?? ''} ${detail}`.toLocaleLowerCase('en-IN').includes(q);
    });
  }, [items, query, actor, outcome]);

  return <section className="s05-activity" aria-label="Activity Logs">
    <div className="s05-filter-row">
      <label className="s05-search-label">Search safe activity metadata
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Action, actor, status…" />
      </label>
      <label>Who
        <select value={actor} onChange={(event) => setActor(event.target.value)}>
          <option value="all">Everyone</option><option value="owner">Owner</option><option value="jarvis">JARVIS</option><option value="worker">Worker</option><option value="system">System</option>
        </select>
      </label>
      <label>Result
        <select value={outcome} onChange={(event) => setOutcome(event.target.value)}>
          <option value="all">All results</option><option value="success">Success</option><option value="blocked">Blocked / failed</option>
        </select>
      </label>
    </div>
    {error && <div className="s08-alert" role="alert">{error}</div>}
    {needsConfirmation && <div className="s05-confirm-read"><span>Is read power par L2 confirmation chahiye.</span><button type="button" disabled={busy} onClick={() => { setBusy(true); setConfirmed(true); }}>Confirm and load Activity Logs</button></div>}
    {busy ? <p className="s08-muted">Loading activity…</p> : filtered.length ? <div className="s05-activity-list">
      {filtered.map((item) => <article className="card s05-activity-card" key={item.id}>
        <div className="s05-activity-symbol" aria-hidden="true">{item.ok ? '✓' : '!'}</div>
        <div className="s05-activity-copy">
          <div className="s05-activity-heading"><b>{item.action}</b><span className={item.ok ? 's05-result-ok' : 's05-result-blocked'}>{item.ok ? 'Success' : 'Blocked'}</span></div>
          <p>{item.detail.why ?? item.target ?? 'Activity recorded'}</p>
          <small>{item.actor} · {when(item.ts)}</small>
          <details className="s05-activity-details"><summary>Details</summary><dl>
            {Object.entries(item.detail).filter(([key]) => key !== 'why').map(([key, value]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{String(value)}</dd></div>)}
          </dl></details>
        </div>
      </article>)}
    </div> : <div className="card s05-empty"><b>No activity found</b><span>Filters ko badal kar dekho.</span></div>}
    <p className="s08-footnote">Sirf safe metadata dikhaya gaya hai. Message, note, file aur private content log detail mein expose nahi hota.</p>
  </section>;
}
