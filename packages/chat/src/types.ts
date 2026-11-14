import type { MemoryPurpose, Kind } from '../../memory/src/types.ts';
import type { Candidate } from '../../memory/src/policy.ts';
import type { TaskType } from './model-router.ts';
import type { RememberResult, Recall } from '../../memory/src/service.ts';

export type UntrustedSource = 'web' | 'file' | 'tool' | 'screen' | 'message';
export type ChatData = { source: UntrustedSource; text: string };
export type AttachmentReference = {
  id: string;
  storageRef: string;
  fileName?: string;
  mimeType: string;
  sizeBytes?: number;
};
/** S21 voice owns transcription and synthesis; S07 carries only an audio reference. */
export type VoiceInputReference = { audioRef: string; mimeType: string; language?: string };
export type MemoryPurposeRequest = {
  purpose: MemoryPurpose;
  reason: 'explicit_question' | 'task_requirement';
};
export type RememberRequest = { explicit: true; kind?: Kind; title?: string; tags?: string[] };
export type ChatInput = {
  text: string;
  /** Trusted task label from the caller; task overrides still cannot bypass private-data routing. */
  taskType?: TaskType;
  threadId?: string;
  messageId?: string;
  data?: readonly ChatData[];
  attachments?: readonly AttachmentReference[];
  voice?: VoiceInputReference;
  /** Supplied only by trusted intent/task handling; absent means T1-only recall. */
  memoryPurpose?: MemoryPurposeRequest;
  /** Only set for Amit's explicit "yaad rakho" request. Ordinary chat is never auto-saved. */
  remember?: RememberRequest;
};

export type ChatStreamEvent =
  | { type: 'chat.message.started'; threadId?: string; messageId?: string }
  | { type: 'chat.message.delta'; threadId?: string; messageId?: string; index: number; text: string }
  | { type: 'chat.message.completed'; threadId?: string; messageId?: string }
  | { type: 'chat.message.error'; threadId?: string; messageId?: string; code: string };

export type ChatThread = {
  id: string;
  ownerId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};
export type ChatMessage = {
  id: string;
  threadId: string;
  ownerId: string;
  role: 'user' | 'assistant';
  content: string;
  sequence: number;
  createdAt: string;
};
export type ChatAttachmentRef = {
  id: string;
  threadId: string;
  messageId: string;
  ownerId: string;
  storageRef: string;
  fileName: string | null;
  mimeType: string;
  sizeBytes: number | null;
  createdAt: string;
};

export interface ChatMemoryPort {
  recall(options: { text: string; purpose?: MemoryPurpose }): Promise<Recall>;
  remember(candidate: Candidate): Promise<RememberResult>;
}

/** Server-side adapter backed only by migration 0034 tables and authenticated RLS. */
export interface ChatThreadStore {
  listMessages(input: { ownerId: string; threadId: string; limit: number; beforeSequence?: number }): Promise<ChatMessage[]>;
  appendMessage(input: { id?: string; ownerId: string; threadId: string; role: ChatMessage['role']; content: string }): Promise<void | ChatMessage>;
  getMessage?(input: { ownerId: string; threadId: string; messageId: string }): Promise<ChatMessage | null>;
  listThreads?(input: { ownerId: string; before?: string; limit?: number }): Promise<ChatThread[]>;
  createThread?(input: { ownerId: string; id?: string; title?: string | null }): Promise<ChatThread>;
}
