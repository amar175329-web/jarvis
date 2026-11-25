import { useEffect, useMemo, useState } from 'react';
import { HistoryRequestError, historyApi, type HistoryMessage, type HistoryThread } from '../src/api-client';
import { ActivityLogsPanel } from '../../activity-logs/ui/ActivityLogsPanel';
import './history.css';

type Tab = 'conversations' | 'activity';
function when(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(date)
    : 'Time unavailable';
}

export function HistoryPage() {
  const [tab, setTab] = useState<Tab>('conversations');
  const [threads, setThreads] = useState<HistoryThread[]>([]);
  const [selected, setSelected] = useState<HistoryThread | null>(null);
  const [messages, setMessages] = useState<HistoryMessage[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(true);
  const [messageBusy, setMessageBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [confirmationTarget, setConfirmationTarget] = useState<'threads' | 'messages'>('threads');
  const [error, setError] = useState('');

  const loadMessages = async (threadId: string, allow: boolean) => {
    setMessageBusy(true);
    setError('');
    try {
      const data = await historyApi.messages(threadId, { limit: 60, confirmed: allow });
      setMessages(data.messages);
      setNeedsConfirmation(false);
    } catch (reason) {
      if (reason instanceof HistoryRequestError && reason.code === 'confirmation_required') {
        setNeedsConfirmation(true);
        setConfirmationTarget('messages');
      }
      setError(reason instanceof Error ? reason.message : 'Messages load nahi hue.');
    } finally {
      setMessageBusy(false);
    }
  };

  useEffect(() => {
    let live = true;
    historyApi.threads({ limit: 40, confirmed })
      .then((data) => { if (live) { setThreads(data.threads); setNeedsConfirmation(false); setError(''); } })
      .catch((reason) => { if (live) {
        if (reason instanceof HistoryRequestError && reason.code === 'confirmation_required') {
          setNeedsConfirmation(true);
          setConfirmationTarget('threads');
        }
        setError(reason instanceof Error ? reason.message : 'History load nahi hua.');
      } })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [confirmed]);

  const visibleThreads = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('en-IN');
    return threads.filter((thread) => !q || thread.title.toLocaleLowerCase('en-IN').includes(q));
  }, [threads, query]);

  const openThread = async (thread: HistoryThread) => {
    setSelected(thread);
    setMessages([]);
    await loadMessages(thread.id, confirmed);
  };

  const confirmRead = () => {
    setConfirmed(true);
    setNeedsConfirmation(false);
    if (confirmationTarget === 'messages' && selected) void loadMessages(selected.id, true);
    else setBusy(true);
  };

  return <section className="page active s08-page s05-history" aria-labelledby="s05-history-title">
    <div className="s08-page-heading">
      <div><h2 id="s05-history-title">History</h2><p>Purani conversations aur activity, owner-only view mein.</p></div>
    </div>
    <div className="s08-tabs s05-tabs" role="tablist" aria-label="History sections">
      <button type="button" role="tab" aria-selected={tab === 'conversations'} className={tab === 'conversations' ? 'active' : ''} onClick={() => setTab('conversations')}>Conversations</button>
      <button type="button" role="tab" aria-selected={tab === 'activity'} className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')}>Activity Logs</button>
    </div>
    {error && <div className="s08-alert" role="alert">{error}</div>}
    {needsConfirmation && <div className="s05-confirm-read"><span>Is read power par L2 confirmation chahiye.</span><button type="button" disabled={busy || messageBusy} onClick={confirmRead}>Confirm and load History</button></div>}
    {tab === 'conversations' ? <div className="s05-history-layout">
      <section className="card s05-thread-list" aria-label="Conversation list">
        <label className="s05-thread-search">Search conversations
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Safe titles only…" />
        </label>
        {busy ? <p className="s08-muted">Loading conversations…</p> : visibleThreads.length ? <ul>
          {visibleThreads.map((thread) => <li key={thread.id}>
            <button type="button" className={selected?.id === thread.id ? 's05-thread-button selected' : 's05-thread-button'} onClick={() => void openThread(thread)}>
              <span className="s05-thread-title">{thread.title}{thread.private && <span className="s05-private-badge">private</span>}</span>
              <small>Updated {when(thread.updated_at)}</small>
            </button>
          </li>)}
        </ul> : <div className="s05-empty-inline">No conversations found.</div>}
      </section>
      <section className="card s05-message-panel" aria-label="Selected conversation">
        {selected ? <>
          <div className="s05-message-heading"><b>{selected.private ? 'Private conversation' : selected.title}</b><small>{when(selected.created_at)}</small></div>
          {messageBusy ? <p className="s08-muted">Loading messages…</p> : messages.length ? <div className="s05-message-list">
            {messages.map((message) => <article className={`s05-message ${message.role}`} key={message.id}>
              <div className="s05-message-meta">{message.role === 'user' ? 'You' : 'JARVIS'} {message.private && <span className="s05-private-badge">private</span>}</div>
              <p>{message.content}</p>
              <time>{when(message.created_at)}</time>
            </article>)}
          </div> : <p className="s08-muted">Is conversation mein abhi messages nahi hain.</p>}
        </> : <div className="s05-message-placeholder"><b>Conversation kholo</b><span>Private messages yahan generic label ke saath masked rahenge.</span></div>}
      </section>
    </div> : <ActivityLogsPanel />}
    <p className="s08-footnote">Private content kisi model ko nahi bheja jata. Private messages normal previews aur search se hidden rehte hain.</p>
  </section>;
}
