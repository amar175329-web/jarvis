import type { Page } from '../types';

export function Sidebar({ page, onNav }: { page: Page; onNav: (p: Page) => void }) {
  return (
<aside className="sidebar">
 <div className="brand"><div className="brand-mark"><svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="20" fill="url(#jc)" /><path d="M24 6.500a17.500 17.500 0 0 1 0 35" fill="none" stroke="url(#jr)" strokeWidth={7.2} strokeLinecap="butt" /><path d="M24 41.500a17.500 17.500 0 0 1 0-35" fill="none" stroke="url(#jl)" strokeWidth={7.2} /><circle cx="24" cy="24" r="13.400" fill="none" stroke="#fff" strokeOpacity=".75" strokeWidth={1} /><path d="M11.500 17.500A15 15 0 0 1 22 8.700" fill="none" stroke="#fff" strokeOpacity=".6" strokeWidth={1.6} strokeLinecap="round" /><circle cx="35.500" cy="12.500" r="2.200" fill="#fff" /><circle cx="35.500" cy="12.500" r="1.100" fill="#19d3ff" /></svg></div><div><div className="brand-name">JARVIS</div><div className="brand-sub">Your AI Companion</div></div></div>
 <div className="nav-label">WORKSPACE</div><nav className="nav">
  <button className={"nav-item" + (page === "home" ? " active" : "") + " available t-blue"} onClick={() => onNav("home")}><span className="ico"><svg className="i " aria-hidden="true"><use href="#i-nhome" /></svg></span><span>Home</span></button>
  <div className="nav-item t-cyan"><span className="ico"><svg className="i " aria-hidden="true"><use href="#i-nchat" /></svg></span><span>Chat</span></div><div className="nav-item t-coral"><span className="ico"><svg className="i " aria-hidden="true"><use href="#i-ntoday" /></svg></span><span>Today</span></div><div className="nav-item t-emerald"><span className="ico"><svg className="i " aria-hidden="true"><use href="#i-ntasks" /></svg></span><span>Tasks</span></div><div className="nav-item t-violet"><span className="ico"><svg className="i " aria-hidden="true"><use href="#i-nmem" /></svg></span><span>Memory</span></div><div className="nav-item t-amber"><span className="ico"><svg className="i " aria-hidden="true"><use href="#i-nins" /></svg></span><span>Insights</span></div><div className="nav-item t-teal"><span className="ico"><svg className="i " aria-hidden="true"><use href="#i-nboard" /></svg></span><span>Boards</span></div><div className="nav-item t-indigo"><span className="ico"><svg className="i " aria-hidden="true"><use href="#i-nhist" /></svg></span><span>History</span></div>
  <button className={"nav-item" + (page === "more" ? " active" : "") + " available t-rose"} onClick={() => onNav("more")}><span className="ico"><svg className="i " aria-hidden="true"><use href="#i-nmore" /></svg></span><span>More Features</span></button>
 </nav>
 <div className="side-spacer" /><div className="device-pill"><div className="device-icon t-cyan"><svg className="i " aria-hidden="true"><use href="#i-phone" /></svg></div><div><b><span style={{ color: "#18bd87" }}>&#9679;</span> Phone Connected</b><small>Android device</small></div></div>
 <div className="profile-mini"><img className="avatar" src="data:image/png;base64,PHOTO_REMOVED" alt="Profile portrait" /><div><b>Amit</b><small>Personal workspace</small></div></div>
 <div className="sidebar-tools" aria-label="Sidebar utilities">
  <button className="sidebar-tool t-cyan" type="button" disabled={true} aria-label="Connect devices" title="Connect devices"><span className="tool-icon"><svg className="i " aria-hidden="true"><use href="#i-link" /></svg></span><span className="tool-label">Connect</span></button>
  <button className="sidebar-tool t-violet" type="button" disabled={true} aria-label="Settings" title="Settings"><span className="tool-icon"><svg className="i " aria-hidden="true"><use href="#i-gear" /></svg></span><span className="tool-label">Settings</span></button>
  <button className="sidebar-tool power t-red" type="button" disabled={true} aria-label="Power off" title="Power off"><span className="tool-icon"><svg className="i " aria-hidden="true"><use href="#i-power" /></svg></span><span className="tool-label">Off</span></button>
 </div>
</aside>
  );
}
