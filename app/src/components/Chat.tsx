import { useEffect, useRef, useState } from 'react';

type Msg = { id: number; who: 'me' | 'ai'; text: string };
const REPLY = 'Message received. Replies are not connected in this UI preview.';

// One AI message that "types" itself, smoothly rendering chunks with completion class.
function AiMessage({ text, onTick }: { text: string; onTick: () => void }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (n >= text.length) return;
    const step = text.length - n > 30 ? 4 : 1;
    const t = setTimeout(() => setN((v) => Math.min(v + step, text.length)), 18);
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
  const [threadId, setThreadId] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
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

  // Click suggestions in HomePage to fill input
  useEffect(() => {
    const handleSuggestion = (e: MouseEvent) => {
      const target = (e.target as HTMLElement | null)?.closest('.suggestion');
      if (target?.textContent) {
        setValue(target.textContent);
        input.current?.focus();
      }
    };
    document.addEventListener('click', handleSuggestion);
    return () => document.removeEventListener('click', handleSuggestion);
  }, []);

  // Check authenticated owner session and fetch/create thread
  useEffect(() => {
    let canceled = false;
    async function initSession() {
      try {
        const sessionRes = await fetch('/api/auth/session.get', { method: 'GET' });
        if (!sessionRes.ok) return;
        const sessionData = await sessionRes.json();
        if (!sessionData?.ok || canceled) return;
        setIsAuthenticated(true);

        const listRes = await fetch('/api/chat/threads.list', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ limit: 10 }),
        });
        if (!listRes.ok || canceled) return;
        const listData = await listRes.json();
        let activeId: string;
        if (listData?.ok && Array.isArray(listData.data?.threads) && listData.data.threads.length > 0) {
          activeId = listData.data.threads[0].id;
        } else {
          const createRes = await fetch('/api/chat/threads.create', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ title: 'Main Chat' }),
          });
          if (!createRes.ok || canceled) return;
          const createData = await createRes.json();
          activeId = createData?.data?.thread?.id;
        }
        if (!activeId || canceled) return;
        setThreadId(activeId);

        const msgRes = await fetch('/api/chat/messages.list', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ thread_id: activeId, limit: 50 }),
        });
        if (!msgRes.ok || canceled) return;
        const msgData = await msgRes.json();
        if (msgData?.ok && Array.isArray(msgData.data?.messages) && msgData.data.messages.length > 0) {
          setMsgs(msgData.data.messages.map((m: any) => ({
            id: nextId.current++,
            who: m.role === 'user' ? 'me' : 'ai',
            text: m.content,
          })));
        }
      } catch {
        // Fallback gracefully to offline/preview mode
      }
    }
    initSession();
    return () => { canceled = true; };
  }, []);

  const add = (who: Msg['who'], text: string) => setMsgs((m) => [...m, { id: nextId.current++, who, text }]);

  async function ensureThread(): Promise<string> {
    if (threadId) return threadId;
    const createRes = await fetch('/api/chat/threads.create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Main Chat' }),
    });
    const createData = await createRes.json();
    const tid = createData?.data?.thread?.id ?? crypto.randomUUID();
    setThreadId(tid);
    return tid;
  }

  const send = async () => {
    const v = value.trim(); if (!v) return;
    add('me', v);
    setValue('');
    input.current?.focus();

    if (!isAuthenticated) {
      add('ai', REPLY);
      return;
    }

    try {
      const activeThreadId = await ensureThread();
      const sendRes = await fetch('/api/chat/messages.send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ thread_id: activeThreadId, text: v }),
      });
      const sendData = await sendRes.json();
      if (!sendRes.ok || !sendData.ok) {
        const errCode = sendData?.error?.code;
        const errMsg = errCode === 'kill_switch_on'
          ? 'Kill switch ON hai, main kuch nahi kar raha.'
          : (sendData?.error?.message || 'Message bhejne mein samasya aayi.');
        add('ai', errMsg);
        return;
      }

      const aiMsgId = nextId.current++;
      setMsgs((m) => [...m, { id: aiMsgId, who: 'ai', text: '' }]);

      const streamRes = await fetch('/api/chat/messages.stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ thread_id: activeThreadId, message_id: sendData.data.message_id }),
      });

      if (!streamRes.ok || !streamRes.body) {
        setMsgs((m) => m.map((msg) => msg.id === aiMsgId ? { ...msg, text: 'Stream shuru nahi ho saka.' } : msg));
        return;
      }

      const reader = streamRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';

      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        buffer += decoder.decode(chunk, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() ?? '';
        for (const block of blocks) {
          for (const line of block.split('\n')) {
            if (!line.startsWith('data:')) continue;
            try {
              const frame = JSON.parse(line.slice(5).trim());
              if (frame.type === 'chat.message.delta' && typeof frame.text === 'string') {
                accumulated += frame.text;
                setMsgs((m) => m.map((msg) => msg.id === aiMsgId ? { ...msg, text: accumulated } : msg));
              } else if (frame.type === 'chat.message.error') {
                const codeMsg = frame.code === 'kill_switch_on'
                  ? 'Kill switch ON hai, main kuch nahi kar raha.'
                  : (frame.code === 'needs_model' || frame.code === 'unconfigured')
                    ? 'Model set nahi hai. Settings mein model slot configure karein.'
                    : `Error: ${frame.code}`;
                accumulated = codeMsg;
                setMsgs((m) => m.map((msg) => msg.id === aiMsgId ? { ...msg, text: accumulated } : msg));
              }
            } catch {
              // Ignore partial or unparseable frames
            }
          }
        }
      }
      if (!accumulated) {
        setMsgs((m) => m.map((msg) => msg.id === aiMsgId ? { ...msg, text: 'Model set nahi hai. Settings mein model slot configure karein.' } : msg));
      }
    } catch {
      add('ai', 'Network samasya: response prapt nahi hua.');
    }
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
