import { PowerOff } from '../../power-off/ui/PowerOff';
import './sidebar-nav.css';

type Props = { onConnect: () => void; onSettings: () => void };
/** Drop-in replacement for the existing .sidebar-tools block. Mount only; do not restyle the approved sidebar. */
export function SidebarUtilities({ onConnect, onSettings }: Props) {
  return <div className="sidebar-tools jarvis-sidebar-utilities" aria-label="Sidebar utilities">
    <button className="sidebar-tool t-cyan" type="button" onClick={onConnect} aria-label="Connect devices" title="Connect devices"><span className="tool-icon"><svg className="i" aria-hidden="true"><use href="#i-link" /></svg></span><span className="tool-label">Connect</span></button>
    <button className="sidebar-tool t-violet" type="button" onClick={onSettings} aria-label="Settings" title="Settings"><span className="tool-icon"><svg className="i" aria-hidden="true"><use href="#i-gear" /></svg></span><span className="tool-label">Settings</span></button>
    <PowerOff />
  </div>;
}
