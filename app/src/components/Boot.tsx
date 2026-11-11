import { useEffect, useRef, useState } from 'react';

const STEPS = ['INITIALIZING CORE', 'LOADING NEURAL LINK', 'SYNCING YOUR WORKSPACE', 'ALL SYSTEMS ONLINE'];

// The start-up screen. Skipped when the person prefers reduced motion (same as the approved UI).
export function Boot() {
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion:reduce)').matches;
  const [gone, setGone] = useState(reduce);
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState(STEPS[0]);
  const logo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduce) return;
    const logoSvg = document.querySelector('.brand-mark svg');
    if (logoSvg && logo.current) logo.current.appendChild(logoSvg.cloneNode(true));
    const timers = STEPS.map((t, i) => setTimeout(() => setMsg(t), i * 520));
    timers.push(setTimeout(() => setDone(true), 2150));
    return () => timers.forEach(clearTimeout);
  }, [reduce]);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setGone(true), 800);
    return () => clearTimeout(t);
  }, [done]);

  if (gone) return null;
  return (
    <div id="boot" className={done ? 'done' : ''} onClick={() => setDone(true)}>
      <div className="boot-in"><div id="bm" ref={logo}></div>JARVIS<div className="boot-line"><i></i></div><div className="boot-msg" id="bmsg">{msg}</div></div>
    </div>
  );
}
