import { useEffect, useState } from 'react';
import { Sprite } from './components/Sprite';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { HomePage } from './components/HomePage';
import { MorePage } from './components/MorePage';
import { Boot } from './components/Boot';
import type { Page } from './types';

export function App() {
  const [page, setPage] = useState<Page>('home');
  const [query, setQuery] = useState('');

  useEffect(() => { // the soft light that follows the pointer over cards
    const move = (e: PointerEvent) => {
      const c = (e.target as Element | null)?.closest?.('.card') as HTMLElement | null;
      if (c) { const r = c.getBoundingClientRect(); c.style.setProperty('--mx', e.clientX - r.left + 'px'); c.style.setProperty('--my', e.clientY - r.top + 'px'); }
    };
    document.addEventListener('pointermove', move);
    return () => document.removeEventListener('pointermove', move);
  }, []);

  const go = (p: Page) => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  return (
    <>
      <Sprite />
      <div className="app">
        <Sidebar page={page} onNav={go} />
        <main className="main">
          <Topbar page={page} query={query} onQuery={setQuery} />
          <HomePage active={page === 'home'} />
          <MorePage active={page === 'more'} query={query} />
        </main>
      </div>
      <Boot />
    </>
  );
}
