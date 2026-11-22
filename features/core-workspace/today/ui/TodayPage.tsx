import { useEffect, useState } from 'react';
import { taskApi, type TodayProjection } from '../../task-manager/src/api-client';
import './today.css';

function timeLabel(value: string) {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

export function TodayPage({ onOpenTasks }: { onOpenTasks?: () => void }) {
  const [data, setData] = useState<TodayProjection | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let live = true;
    taskApi.today().then((value) => { if (live) setData(value); }).catch((e) => { if (live) setError(e instanceof Error ? e.message : 'Today data load nahi hua.'); }).finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, []);

  return <section className="page active s08-page s08-today" aria-labelledby="s08-today-title">
    <div className="s08-page-heading"><div><h2 id="s08-today-title">Today</h2><p>Aaj ke tasks aur reminders, ek jagah.</p></div><button className="s08-secondary" type="button" onClick={onOpenTasks}>Manage tasks</button></div>
    {error && <div className="s08-alert" role="alert">{error}</div>}
    <div className="s08-stat-grid">
      <article className="card s08-stat-card"><span className="eyebrow">OPEN TASKS</span><strong>{busy ? '—' : data?.focus.open_count ?? 0}</strong><small>Abhi complete karne baaki</small></article>
      <article className="card s08-stat-card"><span className="eyebrow">OVERDUE</span><strong>{busy ? '—' : data?.focus.overdue_count ?? 0}</strong><small>Due date nikal chuki hai</small></article>
    </div>
    <div className="s08-columns">
      <section className="card s08-card"><div className="card-head"><div className="card-title"><span className="symbol t-coral"><svg className="i" aria-hidden="true"><use href="#i-target" /></svg></span> Priority tasks</div><span className="eyebrow">TOP TASKS</span></div>
        {busy ? <p className="s08-muted">Loading…</p> : data?.focus.top_tasks.length ? <ul className="s08-list">{data.focus.top_tasks.map((task) => <li key={task.id}><span className="s08-priority" data-priority={task.priority} /> <span>{task.title}</span><small>{task.due_at ? timeLabel(task.due_at) : 'No due time'}</small></li>)}</ul> : <p className="s08-muted">Abhi koi open task nahi hai.</p>}
      </section>
      <section className="card s08-card"><div className="card-head"><div className="card-title"><span className="symbol t-emerald"><svg className="i" aria-hidden="true"><use href="#i-cal" /></svg></span> Today’s timeline</div><span className="eyebrow">{data?.date ?? 'TODAY'}</span></div>
        {busy ? <p className="s08-muted">Loading…</p> : data?.schedule.length ? <ul className="s08-timeline">{data.schedule.map((item) => <li key={`${item.kind}-${item.id}`}><time>{timeLabel(item.at)}</time><i /><div><b>{item.title}</b><small>{item.kind === 'reminder' ? 'Reminder' : item.status}</small></div></li>)}</ul> : <p className="s08-muted">Aaj ke liye schedule abhi empty hai.</p>}
      </section>
    </div>
    <p className="s08-footnote">Timezone: {data?.time_zone ?? 'Asia/Kolkata'}. Home ke Today’s Focus aur Today’s Schedule cards isi projection ko read kar sakte hain.</p>
  </section>;
}
