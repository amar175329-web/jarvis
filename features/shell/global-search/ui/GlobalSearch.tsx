import { useMemo, useState } from 'react';
import { searchShellItems } from '../src/search-index.mjs';
import './global-search.css';

type Result = { id: string; label: string; description: string; destination: string };
export function GlobalSearch({ onNavigate, placeholder = 'Search anything...' }: { onNavigate: (destination: string) => void; placeholder?: string }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const results = useMemo(() => searchShellItems(query) as Result[], [query]);
  return <div className="jarvis-global-search" role="search">
    <span className="jarvis-global-search__icon" aria-hidden="true"><svg className="i"><use href="#i-search" /></svg></span>
    <input aria-label="Search JARVIS features" value={query} onChange={(e) => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); if (e.key === 'Enter' && results[0]) { onNavigate(results[0].destination); setOpen(false); setQuery(''); } }} placeholder={placeholder} autoComplete="off" />
    {query && <button type="button" className="jarvis-global-search__clear" onClick={() => { setQuery(''); setOpen(false); }} aria-label="Clear search">×</button>}
    {open && query.trim() && <div className="jarvis-global-search__results" role="listbox" aria-label="Search results">
      {results.length ? results.map((item) => <button type="button" key={item.id} role="option" className="jarvis-global-search__result" onClick={() => { onNavigate(item.destination); setQuery(''); setOpen(false); }}><span><b>{item.label}</b><small>{item.description}</small></span><span aria-hidden="true">›</span></button>) : <div className="jarvis-global-search__empty">Kuch nahi mila. Sirf navigation aur features search hote hain.</div>}
    </div>}
  </div>;
}
