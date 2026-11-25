import { useEffect, useState } from 'react';
import { BOOT_STEPS, bootStepAt } from '../src/boot-policy.mjs';
import './boot-sequence.css';
export function BootSequence() {
  const [visible, setVisible] = useState(false); const [done, setDone] = useState(false); const [message, setMessage] = useState(BOOT_STEPS[0]);
  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (reduced) return;
    setVisible(true); const started = Date.now(); let finishTimer: number | undefined;
    const interval = window.setInterval(() => {
      const elapsed = Date.now() - started; setMessage(bootStepAt(elapsed));
      if (elapsed >= 2080) { window.clearInterval(interval); setDone(true); finishTimer = window.setTimeout(() => setVisible(false), 800); }
    }, 100);
    return () => { window.clearInterval(interval); if (finishTimer !== undefined) window.clearTimeout(finishTimer); };
  }, []);
  if (!visible) return null;
  return <div className={`jarvis-boot-sequence${done ? ' is-done' : ''}`} role="status" aria-live="polite" onClick={() => setVisible(false)}><div className="jarvis-boot-sequence__inner"><div className="jarvis-boot-sequence__mark"><span/></div><b>JARVIS</b><div className="jarvis-boot-sequence__line"><i/></div><small>{message}</small><button type="button" onClick={() => setVisible(false)}>Skip</button></div></div>;
}
