import { KillSwitch } from './KillSwitch';
import type { Page } from '../types';

export function Topbar({ page, query, onQuery }: { page: Page; query: string; onQuery: (q: string) => void }) {
  return (
<header className="topbar"><div className="crumb"><div><h1 id="page-title">{page === "more" ? "More" : "Home"}</h1><p id="page-subtitle">{page === "more" ? "Everything Jarvis can do, organized in one place." : "Your personal space, ready when you are."}</p></div></div><div className="search"><span className="sico"><svg className="i " aria-hidden="true"><use href="#i-search" /></svg></span><input id="global-search" placeholder={page === "more" ? "Search features..." : "Search anything..."} aria-label="Search" value={query} onChange={(e) => onQuery(e.target.value)} /></div><KillSwitch /><button className="top-icon t-blue" aria-label="Notifications"><svg className="i " aria-hidden="true"><use href="#i-bell" /></svg><i className="dot" /></button><img className="top-avatar" src="data:image/png;base64,PHOTO_REMOVED" alt="Amit's profile" /></header>
  );
}
