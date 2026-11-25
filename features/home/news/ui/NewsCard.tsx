import './news.css';

export type PublicNewsItem = {
  id: string;
  source: string;
  title: string;
  summary: string;
  url: string;
  published_at: string;
};

type Props = {
  items?: PublicNewsItem[];
  summary?: string;
  loading?: boolean;
  summarizing?: boolean;
  failed?: boolean;
  onOpen?: (item: PublicNewsItem) => void;
  onSummarize?: () => void;
};

/** Public headlines only. The shell owns navigation/power checks for all callbacks. */
export function NewsCard({ items = [], summary = '', loading = false, summarizing = false, failed = false, onOpen, onSummarize }: Props) {
  const visible = items.slice(0, 6);
  return <section className="card d2-news-card" aria-label="News">
    <div className="card-head">
      <div className="card-title">
        <span className="symbol t-blue"><svg className="i" aria-hidden="true"><use href="#i-globe" /></svg></span>
        News
      </div>
      <span className="eyebrow">PUBLIC SOURCES</span>
    </div>
    {loading ? <p className="d2-news-state">Headlines load ho rahi hain…</p>
      : failed ? <p className="d2-news-state" role="status">News abhi unavailable hai.</p>
        : visible.length === 0 ? <p className="d2-news-state">Abhi koi public headline available nahi hai.</p>
          : <div className="d2-news-list">
            {visible.map((item) => <article className="d2-news-item" key={item.id}>
              <div className="d2-news-meta"><span>{item.source}</span>{item.published_at && <time dateTime={item.published_at}>{new Date(item.published_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</time>}</div>
              <button className="d2-news-title" type="button" onClick={() => onOpen?.(item)} disabled={!onOpen}>{item.title}</button>
              {item.summary && <p>{item.summary}</p>}
            </article>)}
          </div>}
    {summary && <p className="d2-news-summary">{summary}</p>}
    {!loading && !failed && <button type="button" className="d2-news-summarize" onClick={onSummarize} disabled={!onSummarize || summarizing || visible.length === 0}>
      {summarizing ? 'Public briefing ban rahi hai…' : 'Summarize public news'}
    </button>}
  </section>;
}
