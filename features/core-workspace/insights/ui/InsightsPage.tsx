import { useCallback, useEffect, useState } from 'react';
import { insightsApi, type InsightsOverview } from '../src/api-client';
import './insights.css';

function readErrorCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code ?? '') : '';
}
function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function InsightsPage() {
  const [period, setPeriod] = useState<7 | 30>(7);
  const [data, setData] = useState<InsightsOverview | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (confirmed = false) => {
    setLoading(true); setError('');
    try {
      const result = await insightsApi.overview(period, confirmed);
      setData(result); setNeedsConfirm(false);
    } catch (err) {
      if (readErrorCode(err) === 'confirmation_required') setNeedsConfirm(true);
      else setError(err instanceof Error ? err.message : 'Insights load nahi ho paaye.');
    } finally { setLoading(false); }
  }, [period]);

  useEffect(() => { void load(false); }, [load]);

  const trendItems = data?.activity.daily.length === 30
    ? Array.from({ length: 5 }, (_, index) => ({ date: data.activity.daily[index * 6]?.date ?? '', label: `Week ${index + 1}`, count: data.activity.daily.slice(index * 6, index * 6 + 6).reduce((sum, item) => sum + item.count, 0) }))
    : (data?.activity.daily ?? []).map((item) => ({ ...item, label: formatDate(item.date) }));
  const peak = Math.max(1, ...trendItems.map((item) => item.count));
  return (
    <section className="workspace-page insights-page" aria-labelledby="insights-title">
      <div className="workspace-heading">
        <div><p className="eyebrow">WORKSPACE / OVERVIEW</p><h2 id="insights-title">Insights</h2><p>Progress from safe activity and task totals.</p></div>
        <div className="insights-period" role="group" aria-label="Insights period">
          <button type="button" className={period === 7 ? 'active' : ''} onClick={() => setPeriod(7)}>7 days</button>
          <button type="button" className={period === 30 ? 'active' : ''} onClick={() => setPeriod(30)}>30 days</button>
        </div>
      </div>

      {needsConfirm && <div className="card insights-confirm" role="status"><div><b>Read confirmation required</b><p>Insights sirf aggregate task aur activity counts padhega.</p></div><button className="btn-primary" type="button" onClick={() => void load(true)} disabled={loading}>Confirm and load</button></div>}
      {error && <div className="card insights-error" role="alert">{error}</div>}
      {loading && !data && <div className="card insights-empty">Loading safe insights…</div>}
      {data && <>
        <div className="insights-metrics">
          <article className="card metric-card"><span className="metric-label">Tasks tracked</span><strong>{data.tasks.total}</strong><small>{data.tasks.todo} to do · {data.tasks.doing} in progress</small></article>
          <article className="card metric-card"><span className="metric-label">Completed</span><strong>{data.tasks.done}</strong><small>{data.tasks.completion_rate}% of this period</small></article>
          <article className="card metric-card"><span className="metric-label">Overdue</span><strong>{data.tasks.overdue}</strong><small>Open tasks past due</small></article>
          <article className="card metric-card"><span className="metric-label">Activity events</span><strong>{data.activity.total}</strong><small>{data.activity.successful} successful events</small></article>
        </div>
        <article className="card insights-trend">
          <div className="card-head"><div className="card-title"><span className="symbol t-amber"><svg className="i" aria-hidden="true"><use href="#i-nins" /></svg></span>Activity trend</div><span className="subtle-link">{data.period_days} days</span></div>
          <div className="trend-bars" aria-label="Daily activity counts">
            {trendItems.map((item) => <div className="trend-day" key={item.date || item.label} title={`${item.label}: ${item.count}`}><div className="trend-track"><span style={{ height: `${Math.max(item.count ? 8 : 2, item.count / peak * 100)}%` }} /></div><small>{item.label}</small></div>)}
          </div>
          {data.truncated && <p className="insights-footnote">Projection limit reached; totals may be partial.</p>}
          <p className="insights-footnote">Only safe task and activity metadata is used. Private text is never analysed.</p>
        </article>
      </>}

      <section className="card insights-news-slot" data-integration-slot="CR_D2_NEWS_PLACEMENT" aria-label="News and Briefing integration slot">
        <div className="card-head"><div className="card-title"><span className="symbol t-blue"><svg className="i" aria-hidden="true"><use href="#i-nins" /></svg></span>News &amp; Briefing</div><span className="subtle-link">D2 integration</span></div>
        <p>News &amp; Briefing yahan Insights tab mein appear hoga. Is slot ki content implementation D2-owned hai.</p>
      </section>
    </section>
  );
}
