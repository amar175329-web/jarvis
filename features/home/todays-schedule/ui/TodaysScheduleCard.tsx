import { useEffect, useState } from 'react';
import { taskApi, type TodayProjection } from '../../../core-workspace/task-manager/src/api-client';
import './todays-schedule.css';

function displayTime(value: string, timeZone: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('en-IN', { timeZone, hour: 'numeric', minute: '2-digit' }).format(date);
  } catch {
    return '—';
  }
}

function displayDate(value: string | undefined, timeZone: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'TODAY';
  const date = new Date(`${value}T12:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return 'TODAY';
  try {
    return new Intl.DateTimeFormat('en-IN', { timeZone, day: '2-digit', month: 'short' }).format(date).toUpperCase();
  } catch {
    return 'TODAY';
  }
}

export function TodaysScheduleCard() {
  const [data, setData] = useState<TodayProjection | null>(null);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    taskApi.today()
      .then((value) => { if (active) setData(value); })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);

  const rows = (data?.schedule ?? []).slice(0, 3);
  const timeZone = data?.time_zone || 'Asia/Kolkata';
  const dateLabel = displayDate(data?.date, timeZone);

  return <section className="card schedule d2-schedule-card" aria-label="Today's Schedule">
    <div className="card-head">
      <div className="card-title">
        <span className="symbol t-emerald"><svg className="i" aria-hidden="true"><use href="#i-cal" /></svg></span>
        Today&apos;s Schedule
      </div>
      <span className="subtle-link">View all &rarr;</span>
    </div>
    {busy ? <p className="d2-schedule-state">Loading schedule…</p>
      : failed ? <p className="d2-schedule-state" role="status">Schedule abhi unavailable hai.</p>
        : rows.length === 0 ? <p className="d2-schedule-state">Aaj ka schedule abhi empty hai.</p>
          : <div className="schedule-list">
            {rows.map((item) => <div className="schedule-row d2-schedule-row" key={`${item.kind}-${item.id}`}>
              <time dateTime={item.at}>{displayTime(item.at, timeZone)}</time>
              <i className="bullet" aria-hidden="true" />
              <b title={item.title}>{item.title}</b>
            </div>)}
          </div>}
    <span className="d2-schedule-date" aria-label={`Date ${data?.date ?? 'today'}`}>{dateLabel}</span>
  </section>;
}
