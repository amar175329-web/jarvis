export type PrivatePlaceholder = { id: string; label: 'Private item'; badge: 'private'; updated_at: string | null };
export type MemoryItem = {
  id: string; kind: string; title: string; body: string; source: string; why: string;
  tags: string[]; pinned: boolean; revision: number; created_at: string; updated_at: string;
  expires_at: string | null;
};
export type WorkspaceNote = {
  id: string; kind: 'note'; title: string; body_md: string; tags: string[];
  project_id: string | null; pinned: boolean; status: string; revision: number | null;
  created_at: string; updated_at: string;
};
export type WorkspaceProject = {
  id: string; kind: 'project'; name: string; goal: string; status: string;
  next_step: string; due_at: string | null; tags: string[];
  created_at: string; updated_at: string;
};
export type WorkspaceFile = {
  id: string; kind: 'file'; mime: string; size_bytes: number; status: string;
  project_id: string | null; created_at: string; updated_at: string;
};
export type Sections<T> = { normal: T[]; private: PrivatePlaceholder[]; counts: { normal: number; private: number } };

async function request<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(path, {
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });
  let payload: any;
  try { payload = await response.json(); } catch { throw new Error('JARVIS se valid response nahi mila.'); }
  if (!response.ok || payload?.ok !== true) {
    const code = payload?.error?.code ?? 'request_failed';
    throw new Error(`${payload?.error?.message ?? 'Request complete nahi hui.'} (${code})`);
  }
  return payload.data as T;
}

export const memoryApi = {
  list: () => request<Sections<MemoryItem>>('/api/memory/memory.list'),
  remember: (body: Record<string, unknown>) => request<{ saved: boolean; deduped: boolean; item: MemoryItem | PrivatePlaceholder }>('/api/memory/memory.remember', body),
  forget: (id: string, confirmed: boolean) => request<{ deleted: number }>('/api/memory/memory.forget', { id, confirmed }),
};
export const notesFilesApi = {
  notes: () => request<Sections<WorkspaceNote>>('/api/notes-files/workspace.notes.list'),
  createNote: (body: Record<string, unknown>) => request<WorkspaceNote | PrivatePlaceholder>('/api/notes-files/workspace.notes.create', body),
  deleteNote: (id: string, confirmed: boolean) => request<{ deleted: boolean }>('/api/notes-files/workspace.notes.delete', { id, confirmed }),
  files: () => request<Sections<WorkspaceFile>>('/api/notes-files/workspace.files.list'),
  uploadUrl: (body: Record<string, unknown>) => request<{ id: string; upload: { method: 'PUT'; url: string; headers: Record<string, string> }; private: true }>('/api/notes-files/workspace.files.upload-url', body),
  completeUpload: (body: Record<string, unknown>) => request<{ id: string; status: 'quarantined'; label: string; badge: 'private' }>('/api/notes-files/workspace.files.complete-upload', body),
  deleteFile: (id: string, confirmed: boolean) => request<{ deleted: boolean }>('/api/notes-files/workspace.files.delete', { id, confirmed }),
};
export const projectsApi = {
  list: () => request<Sections<WorkspaceProject>>('/api/projects/workspace.projects.list'),
  create: (body: Record<string, unknown>) => request<WorkspaceProject | PrivatePlaceholder>('/api/projects/workspace.projects.create', body),
  delete: (id: string, confirmed: boolean) => request<{ deleted: boolean }>('/api/projects/workspace.projects.delete', { id, confirmed }),
};
