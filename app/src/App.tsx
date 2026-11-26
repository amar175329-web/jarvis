import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { OwnerLock } from './components/OwnerLock';
import { nextAuthStateFromSession, type AuthGateState } from './ownerLockPolicy';
import type { Page } from './types';

const Sprite = lazy(() => import('./components/Sprite').then((m) => ({ default: m.Sprite })));
const Sidebar = lazy(() => import('./components/Sidebar').then((m) => ({ default: m.Sidebar })));
const Topbar = lazy(() => import('./components/Topbar').then((m) => ({ default: m.Topbar })));
const HomePage = lazy(() => import('./components/HomePage').then((m) => ({ default: m.HomePage })));
const MorePage = lazy(() => import('./components/MorePage').then((m) => ({ default: m.MorePage })));
const Boot = lazy(() => import('./components/Boot').then((m) => ({ default: m.Boot })));
const TodayPage = lazy(() => import('../../features/core-workspace/today/ui/TodayPage').then((m) => ({ default: m.TodayPage })));
const TaskManagerPage = lazy(() => import('../../features/core-workspace/task-manager/ui/TaskManagerPage').then((m) => ({ default: m.TaskManagerPage })));
const MemoryWorkspacePage = lazy(() => import('../../features/core-workspace/memory/ui/MemoryWorkspacePage').then((m) => ({ default: m.MemoryWorkspacePage })));
const InsightsPage = lazy(() => import('../../features/core-workspace/insights/ui/InsightsPage').then((m) => ({ default: m.InsightsPage })));
const BoardsPage = lazy(() => import('../../features/core-workspace/boards/ui/BoardsPage').then((m) => ({ default: m.BoardsPage })));
const HistoryPage = lazy(() => import('../../features/core-workspace/history/ui/HistoryPage').then((m) => ({ default: m.HistoryPage })));

export function App() {
  const [authState, setAuthState] = useState<AuthGateState>('loading');
  const [page, setPage] = useState<Page>('home');
  const [query, setQuery] = useState('');

  const checkSession = useCallback(async (signal?: { canceled: boolean }) => {
    try {
      const res = await fetch('/api/auth/session.get', { method: 'GET' });
      if (signal?.canceled) return;
      const data = res.ok ? await res.json().catch(() => null) : null;
      if (signal?.canceled) return;
      setAuthState(nextAuthStateFromSession(res.status, Boolean(data?.ok)));
    } catch {
      if (!signal?.canceled) setAuthState('locked');
    }
  }, []);

  useEffect(() => {
    const signal = { canceled: false };
    checkSession(signal);
    return () => { signal.canceled = true; };
  }, [checkSession]);

  // Re-verify session on browser back/forward (popstate) and listen for explicit relock/logout events
  useEffect(() => {
    const onPopState = () => {
      if (authState !== 'unlocked') {
        setAuthState('locked');
      } else {
        void checkSession();
      }
    };
    const onRelock = () => setAuthState('locked');
    window.addEventListener('popstate', onPopState);
    window.addEventListener('jarvis:session-locked', onRelock);
    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('jarvis:session-locked', onRelock);
    };
  }, [authState, checkSession]);

  useEffect(() => { // the soft light that follows the pointer over cards
    if (authState !== 'unlocked') return;
    const move = (e: PointerEvent) => {
      const c = (e.target as Element | null)?.closest?.('.card') as HTMLElement | null;
      if (c) { const r = c.getBoundingClientRect(); c.style.setProperty('--mx', e.clientX - r.left + 'px'); c.style.setProperty('--my', e.clientY - r.top + 'px'); }
    };
    document.addEventListener('pointermove', move);
    return () => document.removeEventListener('pointermove', move);
  }, [authState]);

  const handleLock = useCallback(() => {
    setAuthState('locked');
  }, []);

  const handleUnlocked = useCallback(() => {
    setAuthState('unlocked');
  }, []);

  if (authState === 'loading') {
    return (
      <main className="owner-lock-shell" role="status" aria-live="polite" data-testid="auth-loading">
        <div className="owner-lock-loading">Loading...</div>
      </main>
    );
  }

  if (authState === 'locked') {
    return <OwnerLock onUnlocked={handleUnlocked} />;
  }

  const go = (p: Page) => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  return (
    <Suspense fallback={<main className="owner-lock-shell" role="status" aria-live="polite"><div className="owner-lock-loading">Loading...</div></main>}>
      <Sprite />
      <div className="app">
        <Sidebar page={page} onNav={go} />
        <main className="main">
          <Topbar page={page} query={query} onQuery={setQuery} />
          <HomePage active={page === 'home'} onUnauthorized={handleLock} />
          {page === 'today' && <TodayPage onOpenTasks={() => go('tasks')} />}
          {page === 'tasks' && <TaskManagerPage />}
          {page === 'memory' && <MemoryWorkspacePage />}
          {page === 'insights' && <InsightsPage />}
          {page === 'boards' && <BoardsPage />}
          {page === 'history' && <HistoryPage />}
          <MorePage active={page === 'more'} query={query} />
        </main>
      </div>
      <Boot />
    </Suspense>
  );
}
