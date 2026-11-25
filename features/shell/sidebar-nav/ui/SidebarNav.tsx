import { DEFAULT_DISABLED_DESTINATIONS, SIDEBAR_ITEMS, isSidebarItemEnabled } from '../src/nav-items.mjs';
import './sidebar-nav.css';
type Props = { active: string; onNavigate: (destination: string) => void; disabledDestinations?: readonly string[] };
export function SidebarNav({ active, onNavigate, disabledDestinations = DEFAULT_DISABLED_DESTINATIONS }: Props) {
  return <><div className="nav-label">WORKSPACE</div><nav className="nav jarvis-sidebar-nav" aria-label="Workspace navigation">{SIDEBAR_ITEMS.map((item) => {
    const disabled = !isSidebarItemEnabled(item.destination, disabledDestinations);
    return <button type="button" key={item.id} className={`nav-item t-${item.id === 'today' ? 'coral' : item.id === 'tasks' ? 'emerald' : item.id === 'memory' ? 'violet' : item.id === 'insights' ? 'amber' : item.id === 'boards' ? 'teal' : item.id === 'history' ? 'indigo' : item.id === 'more' ? 'rose' : item.id === 'chat' ? 'cyan' : 'blue'}${active === item.destination ? ' active' : ''}${disabled ? '' : ' available'}`} onClick={() => { if (!disabled) onNavigate(item.destination); }} disabled={disabled} aria-current={active === item.destination ? 'page' : undefined}><span className="ico"><svg className="i" aria-hidden="true"><use href={`#${item.icon}`} /></svg></span><span>{item.label}</span></button>;
  })}</nav></>;
}
