import { useEffect, useState } from 'react';
import './kill-switch.css';
import { canToggleKill, killButtonLabel, parseKillRead, parseKillWrite, type KillView } from './kill-switch-policy';

/** Appears only when an owner session exists or the API explicitly reports a safety outage. */
export function KillSwitch() {
  const [view, setView] = useState<KillView>({ visible: false, kill: true, unavailable: false, saving: false, epoch: -1 });

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/system/kill.get', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const body = response.status >= 200 && response.status < 300 ? await response.json() : null;
        const next = parseKillRead(response.status, body);
        if (next) setView(next);
      })
      .catch(() => { if (!controller.signal.aborted) setView({ visible: true, kill: true, unavailable: true, saving: false, epoch: -1 }); });
    return () => controller.abort();
  }, []);

  async function toggle() {
    if (!canToggleKill(view)) return;
    const next = !view.kill;
    setView((v) => ({ ...v, saving: true }));
    try {
      const response = await fetch('/api/system/kill.set', {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kill: next, reason: 'owner_app_toggle' }),
      });
      const body = response.status >= 200 && response.status < 300 ? await response.json() : null;
      setView(parseKillWrite(response.status, body));
    } catch {
      // Any inability to verify the switch is presented as ON and disabled.
      setView({ visible: true, kill: true, unavailable: true, saving: false, epoch: -1 });
    }
  }

  if (!view.visible) return null;
  const label = killButtonLabel(view);
  return (
    <button
      type="button"
      className={`jarvis-kill ${view.kill || view.unavailable ? 'is-on' : 'is-off'}`}
      data-testid="kill-switch"
      aria-label={label}
      aria-pressed={view.kill || view.unavailable}
      title={view.unavailable ? 'Kill switch could not be verified. All actions remain blocked.' : `Safety switch · epoch ${view.epoch}`}
      disabled={view.unavailable || view.saving}
      onClick={toggle}
    >
      <span className="jarvis-kill__dot" aria-hidden="true" />
      <span>{view.unavailable ? 'Safety blocked' : view.kill ? 'Safety ON' : 'Safety OFF'}</span>
    </button>
  );
}
