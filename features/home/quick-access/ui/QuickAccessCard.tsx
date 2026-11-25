import './quick-access.css';

export type QuickShortcut = {
  id: string;
  label: string;
  icon: 'youtube' | 'browser' | 'folder' | 'link' | 'chat';
  destination: { type: 'https'; url: string } | { type: 'internal'; route: string };
};

type Props = {
  shortcuts?: QuickShortcut[];
  loading?: boolean;
  failed?: boolean;
  onOpen?: (shortcut: QuickShortcut) => void;
  onAdd?: () => void;
};

const ICONS: Record<QuickShortcut['icon'], { id: string; logo?: boolean }> = {
  youtube: { id: 'b-youtube', logo: true },
  browser: { id: 'b-chrome', logo: true },
  folder: { id: 'i-folder' },
  link: { id: 'i-link' },
  chat: { id: 'i-chat' },
};

/** UI-only card. The host must route callbacks through the relevant registered power. */
export function QuickAccessCard({ shortcuts = [], loading = false, failed = false, onOpen, onAdd }: Props) {
  const visible = shortcuts.slice(0, 3);
  return <section className="card quick-card d2-quick-card" aria-label="Quick Access">
    <div className="card-head">
      <div className="card-title">
        <span className="symbol t-blue"><svg className="i" aria-hidden="true"><use href="#i-spark" /></svg></span>
        Quick Access
      </div>
      <span className="eyebrow" style={{ letterSpacing: '.5px' }}>YOUR SHORTCUTS</span>
    </div>
    {loading ? <p className="d2-quick-state">Shortcuts load ho rahe hain…</p>
      : failed ? <p className="d2-quick-state" role="status">Quick Access abhi unavailable hai.</p>
        : <div className="quick-grid d2-quick-grid">
          {visible.map((shortcut) => {
            const icon = ICONS[shortcut.icon];
            return <button className="quick-app d2-quick-app" type="button" key={shortcut.id}
              onClick={() => onOpen?.(shortcut)} disabled={!onOpen} title={shortcut.label}>
              <span className={`app-icon ${icon.logo ? 'logo' : ''}`}>
                <svg className="i" aria-hidden="true"><use href={`#${icon.id}`} /></svg>
              </span>
              <span>{shortcut.label}</span>
            </button>;
          })}
          <button className="quick-app d2-quick-app d2-quick-add" type="button" onClick={onAdd} disabled={!onAdd}>
            <span className="app-icon"><svg className="i" aria-hidden="true"><use href="#i-plus" /></svg></span>
            <span>Add shortcut</span>
          </button>
        </div>}
  </section>;
}
