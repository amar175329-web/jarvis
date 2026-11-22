import { KillSwitch } from './KillSwitch';
import type { Page } from '../types';
import { AVATAR_SRC } from '../avatar';

const PAGE_META: Record<Page, { title: string; subtitle: string; searchPlaceholder: string }> = {
  home: { title: 'Home', subtitle: 'Your personal space, ready when you are.', searchPlaceholder: 'Search anything...' },
  today: { title: 'Today', subtitle: 'Aaj ke tasks aur reminders, ek jagah.', searchPlaceholder: 'Search anything...' },
  tasks: { title: 'Tasks', subtitle: 'Tasks aur reminders manage karo.', searchPlaceholder: 'Search anything...' },
  more: { title: 'More', subtitle: 'Everything Jarvis can do, organized in one place.', searchPlaceholder: 'Search features...' },
};

export function Topbar({ page, query, onQuery }: { page: Page; query: string; onQuery: (q: string) => void }) {
  const meta = PAGE_META[page];
  return (
<header className="topbar"><div className="crumb"><div><h1 id="page-title">{meta.title}</h1><p id="page-subtitle">{meta.subtitle}</p></div></div><div className="search"><span className="sico"><svg className="i " aria-hidden="true"><use href="#i-search" /></svg></span><input id="global-search" placeholder={meta.searchPlaceholder} aria-label="Search" value={query} onChange={(e) => onQuery(e.target.value)} /></div><KillSwitch /><button className="top-icon t-blue" aria-label="Notifications"><svg className="i " aria-hidden="true"><use href="#i-bell" /></svg><i className="dot" /></button><img className="top-avatar" src={AVATAR_SRC} alt="Amit's profile" /></header>
  );
}
