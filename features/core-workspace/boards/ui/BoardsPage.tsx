import { useCallback, useEffect, useMemo, useState } from 'react';
import { boardsApi, type Board, type BoardTask } from '../src/api-client';
import './boards.css';

type Pending = { action: 'create' | 'link' | 'move' | 'unlink' | 'delete' | 'column'; payload: Record<string, string> };
function errorCode(error: unknown) { return typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code ?? '') : ''; }
function errorText(error: unknown) { return error instanceof Error ? error.message : 'Action complete nahi hui.'; }

export function BoardsPage() {
  const [boards, setBoards] = useState<Board[]>([]);
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [name, setName] = useState('');
  const [columnName, setColumnName] = useState('');
  const [taskId, setTaskId] = useState('');
  const [selectedBoard, setSelectedBoard] = useState('');
  const [selectedColumn, setSelectedColumn] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [needsReadConfirm, setNeedsReadConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async (confirmed = false) => {
    setLoading(true); setError('');
    try {
      const [boardResult, taskResult] = await Promise.all([boardsApi.list(confirmed), boardsApi.availableTasks(confirmed)]);
      setNeedsReadConfirm(false);
      setBoards(boardResult.boards); setTasks(taskResult.tasks);
      setSelectedBoard((current) => current || boardResult.boards[0]?.id || '');
      const firstBoard = boardResult.boards.find((board) => board.id === selectedBoard) ?? boardResult.boards[0];
      setSelectedColumn((current) => firstBoard?.columns.some((column) => column.id === current) ? current : firstBoard?.columns[0]?.id ?? '');
    } catch (err) {
      if (errorCode(err) === 'confirmation_required') setNeedsReadConfirm(true);
      else setError(errorText(err));
    } finally { setLoading(false); }
  }, [selectedBoard]);

  useEffect(() => { void refresh(); }, [refresh]);
  const currentBoard = useMemo(() => boards.find((board) => board.id === selectedBoard) ?? boards[0], [boards, selectedBoard]);

  const execute = async (item: Pending, confirmed = false) => {
    setLoading(true); setError(''); setNotice('');
    try {
      if (item.action === 'create') await boardsApi.create(item.payload.name, confirmed);
      if (item.action === 'column') await boardsApi.createColumn(item.payload.board_id, item.payload.name, confirmed);
      if (item.action === 'link') await boardsApi.linkTask(item.payload.board_id, item.payload.column_id, item.payload.task_id, confirmed);
      if (item.action === 'move') await boardsApi.moveTask(item.payload.link_id, item.payload.column_id, confirmed);
      if (item.action === 'unlink') await boardsApi.unlinkTask(item.payload.link_id, confirmed);
      if (item.action === 'delete') await boardsApi.delete(item.payload.board_id, confirmed);
      setPending(null); setNeedsConfirm(false); setNotice('Saved.');
      if (item.action === 'create') setName('');
      if (item.action === 'column') setColumnName('');
      if (item.action === 'link') setTaskId('');
      await refresh();
    } catch (err) {
      if (errorCode(err) === 'confirmation_required' && !confirmed) { setPending(item); setNeedsConfirm(true); }
      else setError(errorText(err));
    } finally { setLoading(false); }
  };

  const addTask = () => {
    if (!currentBoard || !selectedColumn || !taskId) return;
    void execute({ action: 'link', payload: { board_id: currentBoard.id, column_id: selectedColumn, task_id: taskId } });
  };

  return (
    <section className="workspace-page boards-page" aria-labelledby="boards-title">
      <div className="workspace-heading"><div><p className="eyebrow">WORKSPACE / KANBAN</p><h2 id="boards-title">Boards</h2><p>Existing safe tasks, organized into lanes.</p></div></div>
      <form className="card board-create" onSubmit={(event) => { event.preventDefault(); if (name.trim()) void execute({ action: 'create', payload: { name: name.trim() } }); }}>
        <label htmlFor="board-name">New board</label><div className="board-inline-form"><input id="board-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder="Project board"/><button className="btn-primary" type="submit" disabled={loading || !name.trim()}>Create board</button></div>
      </form>
      {needsReadConfirm && <div className="card board-confirm" role="status"><div><b>Read confirmation required</b><p>Boards sirf existing task links aur safe task projections padhega.</p></div><button type="button" className="btn-primary" disabled={loading} onClick={() => void refresh(true)}>Confirm and load</button></div>}
      {boards.length > 0 && <div className="board-toolbar">
        <label className="sr-only" htmlFor="board-select">Select board</label>
        <select id="board-select" value={currentBoard?.id ?? ''} onChange={(event) => { setSelectedBoard(event.target.value); const next = boards.find((board) => board.id === event.target.value); setSelectedColumn(next?.columns[0]?.id ?? ''); }}>
          {boards.map((board) => <option key={board.id} value={board.id}>{board.name}</option>)}
        </select>
        {currentBoard && <button type="button" className="btn-quiet danger" disabled={loading} onClick={() => void execute({ action: 'delete', payload: { board_id: currentBoard.id } })}>Delete board</button>}
      </div>}
      {currentBoard && <>
        <form className="card board-link-form" onSubmit={(event) => { event.preventDefault(); addTask(); }}>
          <label htmlFor="board-task">Add an existing task</label>
          <div className="board-inline-form"><select id="board-task" value={taskId} onChange={(event) => setTaskId(event.target.value)}><option value="">Choose task</option>{tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select>
          <select aria-label="Destination lane" value={selectedColumn} onChange={(event) => setSelectedColumn(event.target.value)}>{currentBoard.columns.map((column) => <option value={column.id} key={column.id}>{column.name}</option>)}</select><button className="btn-primary" type="submit" disabled={loading || !taskId || !selectedColumn}>Add task</button></div>
        </form>
        <form className="board-column-form" onSubmit={(event) => { event.preventDefault(); if (columnName.trim()) void execute({ action: 'column', payload: { board_id: currentBoard.id, name: columnName.trim() } }); }}>
          <input value={columnName} onChange={(event) => setColumnName(event.target.value)} maxLength={40} placeholder="New lane name" aria-label="New lane name"/><button className="btn-quiet" type="submit" disabled={loading || !columnName.trim()}>Add lane</button>
        </form>
        <div className="board-lanes">
          {currentBoard.columns.map((column) => <section className="board-lane" key={column.id} aria-label={column.name}>
            <header><b>{column.name}</b><span>{column.cards.length}</span></header>
            <div className="board-cards">
              {column.cards.map((card) => <article className="card board-task-card" key={card.link_id}>
                <b>{card.private ? 'Private task' : card.title}</b>{card.private && <span className="private-badge">Private</span>}
                {!card.private && <div className="board-card-meta"><span>{card.status}</span><span>Priority {card.priority}</span></div>}
                {!card.private && <div className="board-card-actions">
                  <label className="sr-only" htmlFor={`move-${card.link_id}`}>Move task</label>
                  <select id={`move-${card.link_id}`} defaultValue={column.id} onChange={(event) => { if (event.target.value !== column.id) void execute({ action: 'move', payload: { link_id: card.link_id!, column_id: event.target.value } }); }}>
                    <option value={column.id}>Move to…</option>{currentBoard.columns.filter((other) => other.id !== column.id).map((other) => <option value={other.id} key={other.id}>{other.name}</option>)}
                  </select>
                  <button type="button" className="btn-quiet" onClick={() => void execute({ action: 'unlink', payload: { link_id: card.link_id! } })}>Remove</button>
                </div>}
              </article>)}
              {column.cards.length === 0 && <p className="board-lane-empty">No tasks in this lane.</p>}
            </div>
          </section>)}
        </div>
      </>}
      {!currentBoard && !loading && <div className="card board-empty">No boards yet. Create your first board above.</div>}
      {needsConfirm && pending && <div className="card board-confirm" role="alertdialog" aria-label="Confirm board action"><div><b>Confirm this board action?</b><p>Registered S22 power ne confirmation maangi hai. Action hone se pehle confirm karo.</p></div><div className="board-confirm-actions"><button type="button" className="btn-quiet" onClick={() => { setPending(null); setNeedsConfirm(false); }}>Cancel</button><button type="button" className="btn-primary" disabled={loading} onClick={() => void execute(pending, true)}>Confirm action</button></div></div>}
      {error && <div className="card board-error" role="alert">{error}</div>}{notice && <p className="board-notice" role="status">{notice}</p>}{loading && <p className="board-loading" role="status">Updating boards…</p>}
    </section>
  );
}
