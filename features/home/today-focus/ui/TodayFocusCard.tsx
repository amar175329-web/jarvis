import { useEffect, useState } from 'react';
import { taskApi, type TodayProjection } from '../../../core-workspace/task-manager/src/api-client';
import { focusProgress } from '../src/progress.mjs';
import './today-focus.css';

type FocusProjection = TodayProjection['focus'] & {
  completed_today?: number;
  daily_goal?: number | null;
  streak_days?: number | null;
};
type ExtendedTodayProjection = Omit<TodayProjection, 'focus'> & { focus: FocusProjection };

export function TodayFocusCard() {
  const [data, setData] = useState<ExtendedTodayProjection | null>(null);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    taskApi.today()
      .then((value) => { if (active) setData(value as ExtendedTodayProjection); })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);

  const focus = data?.focus;
  const progress = focusProgress(focus);
  const rawGoal = focus?.daily_goal;
  const goal = typeof rawGoal === 'number' && Number.isInteger(rawGoal) && rawGoal > 0 ? rawGoal : null;
  const rawStreak = focus?.streak_days;
  const streak = typeof rawStreak === 'number' && Number.isInteger(rawStreak) && rawStreak > 0 ? rawStreak : null;
  const subtitle = failed
    ? 'Focus data abhi unavailable hai.'
    : goal !== null
      ? `Goal: ${goal} tasks${streak !== null ? ` · ${streak}-day streak` : ''}`
      : focus?.overdue_count
        ? `${focus.overdue_count} overdue · daily goal data abhi nahi hai`
        : 'Aaj ka focus, ek step at a time.';
  const progressLabel = progress === null ? '—' : `${progress}%`;

  return <section className="card focus-card d2-focus-card" aria-label="Today's Focus">
    <div className="card-head">
      <div className="card-title">
        <span className="symbol t-coral"><svg className="i" aria-hidden="true"><use href="#i-target" /></svg></span>
        Today&apos;s Focus
      </div>
      <span className="eyebrow" style={{ letterSpacing: '.5px' }}>TODAY</span>
    </div>
    <div className="focus-content">
      <div className="d2-focus-copy" aria-live="polite">
        <b>{busy ? '—' : failed ? 'Unavailable' : `${focus?.open_count ?? 0} ${(focus?.open_count ?? 0) === 1 ? 'Task' : 'Tasks'}`}</b>
        <small>{busy ? 'Loading focus…' : subtitle}</small>
      </div>
      <div
        className="progress-ring s01-progress-ring"
        data-progress-label={progressLabel}
        role="img"
        aria-label={progress === null ? 'Focus progress unavailable' : `${progress}% of daily focus goal`}
        style={{ background: `conic-gradient(#2478ee 0 ${progress ?? 0}%, #dceaff ${progress ?? 0}% 100%)` }}
      />
    </div>
  </section>;
}
