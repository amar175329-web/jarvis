import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  memoryApi, notesFilesApi, projectsApi,
  type MemoryItem, type PrivatePlaceholder, type Sections,
  type WorkspaceFile, type WorkspaceNote, type WorkspaceProject,
} from '../src/api-client';
import './memory-workspace.css';

type Tab = 'memory' | 'notes' | 'files' | 'projects';
function PrivateItems({ items, onDelete, pendingDelete, busy }: { items: PrivatePlaceholder[]; onDelete?: (id: string) => void; pendingDelete?: string; busy?: boolean }) {
  return <section className="card s08-card mw-private-section" aria-label="Private items">
    <div className="card-head"><div className="card-title"><span className="symbol t-violet"><svg className="i" aria-hidden="true"><use href="#i-nmem" /></svg></span> Private</div><span className="mw-private-badge">private</span></div>
    {items.length ? <ul className="s08-list">{items.map((item) => <li key={item.id}><span aria-hidden="true">●</span><span className="mw-private-copy">Private item</span><span className="mw-private-badge">private</span>{onDelete && <button className="s08-inline-action" type="button" disabled={busy} onClick={() => onDelete(item.id)}>{pendingDelete === item.id ? 'Confirm?' : 'Delete'}</button>}</li>)}</ul> : <p className="s08-muted">Private items abhi nahi hain.</p>}
    <p className="mw-private-note">Private entries yahan alag hain. S19 Vault integration aane tak unka content yahan nahi dikhaya jayega.</p>
  </section>;
}

export function MemoryWorkspacePage() {
  const [tab, setTab] = useState<Tab>('memory');
  const [memories, setMemories] = useState<Sections<MemoryItem> | null>(null);
  const [notes, setNotes] = useState<Sections<WorkspaceNote> | null>(null);
  const [files, setFiles] = useState<Sections<WorkspaceFile> | null>(null);
  const [projects, setProjects] = useState<Sections<WorkspaceProject> | null>(null);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [projectName, setProjectName] = useState('');
  const [projectGoal, setProjectGoal] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pendingDelete, setPendingDelete] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [m, n, f, p] = await Promise.all([memoryApi.list(), notesFilesApi.notes(), notesFilesApi.files(), projectsApi.list()]);
      setMemories(m); setNotes(n); setFiles(f); setProjects(p);
    } catch (e) { setError(e instanceof Error ? e.message : 'Workspace load nahi hua.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const createMemory = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try { await memoryApi.remember({ title, text, kind: 'fact', confirmed: true }); setTitle(''); setText(''); await refresh(); setMessage('Memory save ho gayi. Private hui to alag section mein rahegi.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Memory save nahi hui.'); }
    finally { setBusy(false); }
  };
  const createNote = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try { await notesFilesApi.createNote({ title: noteTitle, body_md: noteBody, confirmed: true }); setNoteTitle(''); setNoteBody(''); await refresh(); setMessage('Note save ho gaya.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Note save nahi hua.'); }
    finally { setBusy(false); }
  };
  const createProject = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try { await projectsApi.create({ name: projectName, goal: projectGoal, confirmed: true }); setProjectName(''); setProjectGoal(''); await refresh(); setMessage('Project save ho gaya.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Project save nahi hua.'); }
    finally { setBusy(false); }
  };
  const removeItem = async (kind: 'memory' | 'note' | 'file' | 'project', id: string) => {
    const key = `${kind}:${id}`;
    if (pendingDelete !== key) { setPendingDelete(key); return; }
    setBusy(true); setError('');
    try {
      if (kind === 'memory') await memoryApi.forget(id, true);
      if (kind === 'note') await notesFilesApi.deleteNote(id, true);
      if (kind === 'file') await notesFilesApi.deleteFile(id, true);
      if (kind === 'project') await projectsApi.delete(id, true);
      setPendingDelete(''); await refresh(); setMessage(`${kind} delete ho gaya.`);
    } catch (e) { setError(e instanceof Error ? e.message : `${kind} delete nahi hua.`); }
    finally { setBusy(false); }
  };
  const uploadFile = async (file?: File) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError('File 10 MB se chhoti honi chahiye.'); return; }
    setBusy(true); setError('');
    try {
      const mime = file.type || 'application/octet-stream';
      const signed = await notesFilesApi.uploadUrl({ name: file.name, mime, size_bytes: file.size, confirmed: true });
      const uploaded = await fetch(signed.upload.url, { method: signed.upload.method, headers: signed.upload.headers, body: file });
      if (!uploaded.ok) throw new Error('Storage upload reject ho gaya.');
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      const sha256 = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
      await notesFilesApi.completeUpload({ id: signed.id, sha256, confirmed: true });
      await refresh(); setMessage('File upload ho gayi; S19 scanner tak quarantine mein private rahegi.');
    } catch (e) { setError(e instanceof Error ? e.message : 'File upload nahi hui.'); }
    finally { setBusy(false); }
  };

  const tabButton = (key: Tab, label: string) => <button role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>;
  const renderPrivate = <T,>(value: Sections<T> | null): PrivatePlaceholder[] => value?.private ?? [];

  return <section className="page active s08-page mw-page" aria-labelledby="mw-title">
    <div className="s08-page-heading"><div><h2 id="mw-title">Memory & Workspace</h2><p>Yaadein, notes, files aur projects — private items alag aur masked.</p></div></div>
    <div className="s08-tabs mw-tabs" role="tablist" aria-label="Memory workspace">{tabButton('memory', 'Memory')}{tabButton('notes', 'Notes')}{tabButton('files', 'Files')}{tabButton('projects', 'Projects')}</div>
    {error && <div className="s08-alert" role="alert">{error}</div>}{message && <div className="s08-success" role="status">{message}</div>}
    {loading && <p className="s08-muted">Loading workspace…</p>}

    {!loading && tab === 'memory' && <>
      <form className="card mw-form" onSubmit={createMemory}><label htmlFor="mw-memory-title">Memory title (optional)</label><input id="mw-memory-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Short title" /><label htmlFor="mw-memory-text">Kya yaad rakhna hai?</label><textarea id="mw-memory-text" value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} rows={3} required placeholder="Hindi ya Hinglish mein likho…" /><button type="submit" disabled={busy || !text.trim()}>{busy ? 'Saving…' : 'Save memory'}</button><small>Health, dawai, paisa, family ya credentials se judi entries private classify ho sakti hain. Password/OTP jaise raw secrets save nahi honge.</small></form>
      <section className="card s08-card mw-list"><div className="card-head"><div className="card-title">Normal memories</div><span className="eyebrow">{memories?.counts.normal ?? 0} ITEMS</span></div>
        {memories?.normal.length ? <ul className="s08-list">{memories.normal.map((item) => <li key={item.id}><span className="mw-dot" /><div className="mw-item-copy"><b>{item.title}</b><small>{item.kind} · {item.why}</small><p>{item.body}</p></div></li>)}</ul> : <p className="s08-muted">Abhi normal memory empty hai.</p>}
      </section>
      <PrivateItems items={renderPrivate(memories)} onDelete={(id) => void removeItem('memory', id)} pendingDelete={pendingDelete.startsWith('memory:') ? pendingDelete.slice(7) : ''} busy={busy} />
    </>}

    {!loading && tab === 'notes' && <>
      <form className="card mw-form" onSubmit={createNote}><label htmlFor="mw-note-title">New note</label><input id="mw-note-title" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} maxLength={200} required placeholder="Note title" /><label htmlFor="mw-note-body">Note</label><textarea id="mw-note-body" value={noteBody} onChange={(e) => setNoteBody(e.target.value)} rows={4} maxLength={100000} placeholder="Markdown ya Hinglish note…" /><button type="submit" disabled={busy || !noteTitle.trim()}>{busy ? 'Saving…' : 'Save note'}</button></form>
      <section className="card s08-card mw-list"><div className="card-head"><div className="card-title">Normal notes</div><span className="eyebrow">{notes?.counts.normal ?? 0} ITEMS</span></div>
        {notes?.normal.length ? <ul className="s08-list">{notes.normal.map((item) => <li key={item.id}><span className="mw-dot" /><div className="mw-item-copy"><b>{item.title}</b><p>{item.body_md}</p><button className="s08-inline-action" type="button" disabled={busy} onClick={() => void removeItem('note', item.id)}>{pendingDelete === `note:${item.id}` ? 'Confirm delete?' : 'Delete'}</button></div></li>)}</ul> : <p className="s08-muted">Abhi notes empty hain.</p>}
      </section>
      <PrivateItems items={renderPrivate(notes)} onDelete={(id) => void removeItem('note', id)} pendingDelete={pendingDelete.startsWith('note:') ? pendingDelete.slice(5) : ''} busy={busy} />
    </>}

    {!loading && tab === 'files' && <>
      <section className="card mw-form"><label htmlFor="mw-file">Upload file (max 10 MB)</label><input id="mw-file" type="file" disabled={busy} accept=".txt,.md,.pdf,.png,.jpg,.jpeg,.csv,.docx" onChange={(e) => { void uploadFile(e.target.files?.[0]); e.currentTarget.value = ''; }} /><small>Files default private hain. S19 scanning/vault tak filename aur content UI mein show nahi hoga.</small></section>
      <section className="card s08-card mw-list"><div className="card-head"><div className="card-title">Files</div><span className="eyebrow">{files?.counts.private ?? 0} PRIVATE</span></div><p className="s08-muted">File metadata bhi privacy ke liye masked hai.</p></section>
      <PrivateItems items={renderPrivate(files)} onDelete={(id) => void removeItem('file', id)} pendingDelete={pendingDelete.startsWith('file:') ? pendingDelete.slice(5) : ''} busy={busy} />
    </>}

    {!loading && tab === 'projects' && <>
      <form className="card mw-form" onSubmit={createProject}><label htmlFor="mw-project-name">New project</label><input id="mw-project-name" value={projectName} onChange={(e) => setProjectName(e.target.value)} maxLength={120} required placeholder="Project name" /><label htmlFor="mw-project-goal">Goal (optional)</label><textarea id="mw-project-goal" value={projectGoal} onChange={(e) => setProjectGoal(e.target.value)} maxLength={1000} rows={2} placeholder="Project goal" /><button type="submit" disabled={busy || !projectName.trim()}>{busy ? 'Saving…' : 'Create project'}</button></form>
      <section className="card s08-card mw-list"><div className="card-head"><div className="card-title">Normal projects</div><span className="eyebrow">{projects?.counts.normal ?? 0} ITEMS</span></div>
        {projects?.normal.length ? <ul className="s08-list">{projects.normal.map((item) => <li key={item.id}><span className="mw-dot" /><div className="mw-item-copy"><b>{item.name}</b><small>{item.status}</small>{item.goal && <p>{item.goal}</p>}{item.next_step && <small>Next: {item.next_step}</small>}<button className="s08-inline-action" type="button" disabled={busy} onClick={() => void removeItem('project', item.id)}>{pendingDelete === `project:${item.id}` ? 'Confirm delete?' : 'Delete'}</button></div></li>)}</ul> : <p className="s08-muted">Abhi projects empty hain.</p>}
      </section>
      <PrivateItems items={renderPrivate(projects)} onDelete={(id) => void removeItem('project', id)} pendingDelete={pendingDelete.startsWith('project:') ? pendingDelete.slice(8) : ''} busy={busy} />
    </>}
  </section>;
}
