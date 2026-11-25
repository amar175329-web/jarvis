import { jarvisPost } from '../../task-manager/src/api-client';

export type BoardTask = { id: string; title: string; private: boolean; status?: string; priority?: number; due_at?: string | null; link_id?: string };
export type BoardColumn = { id: string; name: string; position: number; cards: BoardTask[] };
export type Board = { id: string; name: string; created_at: string; updated_at: string; columns: BoardColumn[] };
export const boardsApi = {
  list: (confirmed = false) => jarvisPost<{ boards: Board[] }>('/api/tasks/boards.list', { confirmed }),
  availableTasks: (confirmed = false) => jarvisPost<{ tasks: BoardTask[] }>('/api/tasks/boards.tasks.available', { confirmed }),
  create: (name: string, confirmed = false) => jarvisPost<{ board: { id: string; name: string } }>('/api/tasks/boards.create', { name, confirmed }),
  createColumn: (board_id: string, name: string, confirmed = false) => jarvisPost<{ column: { id: string; name: string } }>('/api/tasks/boards.column.create', { board_id, name, confirmed }),
  linkTask: (board_id: string, column_id: string, task_id: string, confirmed = false) => jarvisPost<{ link_id: string | null }>('/api/tasks/boards.task.link', { board_id, column_id, task_id, confirmed }),
  moveTask: (link_id: string, column_id: string, confirmed = false) => jarvisPost<{ moved: true }>('/api/tasks/boards.task.move', { link_id, column_id, confirmed }),
  unlinkTask: (link_id: string, confirmed = false) => jarvisPost<{ unlinked: true }>('/api/tasks/boards.task.unlink', { link_id, confirmed }),
  delete: (board_id: string, confirmed = false) => jarvisPost<{ deleted: true }>('/api/tasks/boards.delete', { board_id, confirmed }),
};
