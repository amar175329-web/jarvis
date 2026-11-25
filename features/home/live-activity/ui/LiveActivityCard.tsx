export type LiveActivityItem = {
  id: string;
  label: string;
  icon: 'globe' | 'code' | 'spark' | 'bot' | 'clock' | 'phone';
  state: 'queued' | 'running' | 'sent';
  state_label: string;
  created_at: string;
  source: 'job' | 'phone';
  can_stop: boolean;
};

type Props = {
  items?: LiveActivityItem[];
  loading?: boolean;
  failed?: boolean;
  onStop?: (item: LiveActivityItem) => void;
};

const ICONS: Record<LiveActivityItem['icon'], string> = {
  globe: 'i-globe', code: 'i-code', spark: 'i-spark', bot: 'i-bot',
  clock: 'i-clock', phone: 'i-phone',
};

export function LiveActivityCard({ items = [], loading = false, failed = false, onStop }: Props) {
  const visible = items.slice(0, 5);
  return <section className="card activity d2-live-card" aria-label="Live Activity">
    <div className="card-head">
      <div className="card-title">
        <span className="symbol t-cyan"><svg className="i" aria-hidden="true"><use href="#i-pulse" /></svg></span>
        Live Activity
      </div>
      <span className="live"><span aria-hidden="true">●</span> LIVE</span>
    </div>
    {loading ? <p className="d2-live-state">JARVIS status check kar raha hai…</p>
      : failed ? <p className="d2-live-state" role="status">Live status abhi unavailable hai.</p>
        : visible.length === 0 ? <div className="activity-item">
          <div className="activity-thumb t-cyan"><svg className="i" aria-hidden="true"><use href="#i-globe" /></svg></div>
          <div className="activity-copy"><b>JARVIS is ready</b><p>Abhi koi active background task nahi hai.</p></div>
        </div>
          : <div className="d2-live-list">
            {visible.map((item) => <div className="activity-item d2-live-item" key={`${item.source}-${item.id}`}>
              <div className="activity-thumb t-cyan"><svg className="i" aria-hidden="true"><use href={`#${ICONS[item.icon]}`} /></svg></div>
              <div className="activity-copy d2-live-copy">
                <b>{item.label}</b>
                <p>{item.state_label}</p>
                <div className="activity-line d2-live-progress" aria-label="Progress is being reported by the active worker" />
              </div>
              {item.can_stop && <button className="d2-live-stop" type="button" onClick={() => onStop?.(item)} disabled={!onStop}>Stop</button>}
            </div>)}
          </div>}
  </section>;
}
