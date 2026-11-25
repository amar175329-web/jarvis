import './jarvis-insight.css';

export type InsightData = {
  headline: string;
  tip: string;
  active_days: number;
  safe_task_count: number;
  completed_task_count: number;
  bars: Array<{ day: string; value: number; safe_completions: number; public_actions: number }>;
};

type Props = { insight?: InsightData | null; loading?: boolean; failed?: boolean };

export function JarvisInsightCard({ insight, loading = false, failed = false }: Props) {
  const bars = (insight?.bars ?? []).slice(-7);
  const max = Math.max(1, ...bars.map((bar) => bar.value));
  return <section className="card insight d2-insight-card" aria-label="JARVIS Insight">
    <div className="card-head">
      <div className="card-title">
        <span className="symbol t-amber"><svg className="i" aria-hidden="true"><use href="#i-spark" /></svg></span>
        Jarvis Insight
      </div>
      <span className="eyebrow">7 DAYS</span>
    </div>
    {loading ? <p className="d2-insight-state">Safe activity pattern calculate ho raha hai…</p>
      : failed || !insight ? <p className="d2-insight-state" role="status">Insight abhi unavailable hai.</p>
        : <>
          <div className="insight-body d2-insight-body">
            <div className="insight-bulb t-amber"><svg className="i" aria-hidden="true"><use href="#i-bulb" /></svg></div>
            <div className="d2-insight-copy"><b>{insight.headline}</b><p>{insight.tip}</p></div>
            <div className="mini-bars d2-insight-bars" role="img" aria-label={`${insight.active_days} active days in the last seven days`}>
              {bars.map((bar, index) => <i key={`${bar.day}-${index}`} style={{ height: `${Math.max(4, (bar.value / max) * 36)}px` }} />)}
            </div>
          </div>
          <div className="d2-insight-meta">
            <span>{insight.active_days}/7 active days</span>
            <span>{insight.completed_task_count} completed</span>
          </div>
        </>}
  </section>;
}
