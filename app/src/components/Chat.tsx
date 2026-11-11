import { useEffect, useRef, useState } from 'react';

type Msg = { id: number; who: 'me' | 'ai'; text: string };
const REPLY = 'Message received. Replies are not connected in this UI preview.';

// One AI message that "types" itself, 22 ms per character (same as the approved preview).
function AiMessage({ text, onTick }: { text: string; onTick: () => void }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (n >= text.length) return;
    const t = setTimeout(() => setN((v) => v + 1), 22);
    return () => clearTimeout(t);
  }, [n, text]);
  useEffect(onTick, [n]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className={'msg ai' + (n >= text.length ? ' done' : '')}>{text.slice(0, n)}</div>;
}

// The thread, the text box and the three buttons. Same markup and classes as the approved UI.
export function Chat() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [value, setValue] = useState('');
  const [rec, setRec] = useState(false);
  const thread = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);

  const scrollDown = () => { if (thread.current) thread.current.scrollTop = thread.current.scrollHeight; };
  useEffect(scrollDown, [msgs]);
  const first = useRef(true);
  useEffect(() => { // grow the box up to 120 px (not on first render: the CSS decides the starting height, as in the approved UI)
    if (first.current) { first.current = false; return; }
    const el = input.current; if (!el) return;
    el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, [value]);

  const add = (who: Msg['who'], text: string) => setMsgs((m) => [...m, { id: nextId.current++, who, text }]);
  const send = () => {
    const v = value.trim(); if (!v) return;
    add('me', v); add('ai', REPLY); setValue(''); input.current?.focus();
  };

  return (
    <>
      <div className={'chat-thread' + (msgs.length ? ' on' : '')} id="chat-thread" aria-live="polite" ref={thread}>
        {msgs.map((m) => m.who === 'me' ? <div key={m.id} className="msg me">{m.text}</div> : <AiMessage key={m.id} text={m.text} onTick={scrollDown} />)}
      </div>
      <div className="chat-compose" onClick={(e) => { if (!(e.target as HTMLElement).closest('button')) input.current?.focus(); }}>
        <span className="spark t-blue"><svg className="i " aria-hidden="true"><use href="#i-spark" /></svg></span>
        <textarea id="chat-input" rows={1} placeholder="Talk to Jarvis..." aria-label="Message Jarvis" enterKeyHint="send" autoComplete="off" spellCheck={true} ref={input}
          value={value} onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
        <button className="compose-tool t-blue" title="Attach" aria-label="Attach file" type="button" onClick={() => file.current?.click()}><svg className="i " aria-hidden="true"><use href="#i-plus" /></svg></button>
        <button className={'compose-tool t-violet' + (rec ? ' rec' : '')} title="Voice" aria-label="Voice input" type="button" onClick={() => setRec((r) => !r)}><svg className="i " aria-hidden="true"><use href="#i-mic" /></svg></button>
        <button className={'send' + (value.trim() ? ' ready' : '')} id="send-btn" type="button" aria-label="Send" onClick={send}><svg className="i " aria-hidden="true"><use href="#i-send" /></svg></button>
        <input type="file" hidden ref={file} onChange={(e) => { const f = e.target.files?.[0]; if (f) { add('me', 'Attached: ' + f.name); e.target.value = ''; } }} />
      </div>
    </>
  );
}
