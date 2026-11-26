// The API list. One entry per route. Route names: /api/<group>/<action> (decision 003).
// Request = JSON body (POST). Response data goes inside { ok: true, data }. Errors: see errors.ts.
import { z } from 'zod';
import { Uuid, UtcTime, IdempotencyKey, Empty, Device, DeviceKind, PhoneCommand, PhoneCommandBody, KillState, Envelope } from './common.ts';
import { ERROR_CODES, type ErrorCode } from './errors.ts';

export const ROUTE_PATH_RE = /^\/api\/[a-z0-9-]+\/[a-z0-9-]+(\.[a-z0-9-]+)*$/;
export type Auth = 'none' | 'owner' | 'device' | 'owner_or_device';

export type Route = {
  path: string; method: 'GET' | 'POST'; auth: Auth; summary: string;
  input: z.ZodTypeAny; output: z.ZodTypeAny;
  killSensitive: boolean; // true = refused with kill_switch_on while the kill switch is ON
  errors: ErrorCode[]; // codes this route may return besides unauthorized/internal (those can come from any route)
};
const route = (r: Route): Route => r;

const SessionUser = z.object({ id: Uuid, email: z.string().email() }).strict();
const SessionTokenInput = z.object({
  access_token: z.string().min(20).max(4096),
  refresh_token: z.string().min(20).max(4096).optional(),
}).strict();
const VoiceTranscribeInput = z.object({
  session_id: Uuid,
  audio_ref: z.string().min(1).max(500),
  mime_type: z.enum(['audio/webm', 'audio/wav', 'audio/mp4', 'audio/mpeg', 'audio/ogg']),
  language: z.string().min(2).max(35).optional(),
}).strict();
const VoiceSpeakInput = z.object({
  session_id: Uuid,
  text: z.string().min(1).max(12000),
  language: z.string().min(2).max(35).optional(),
  persona_mode: z.string().min(1).max(50).optional(),
  voice_id: z.string().min(1).max(100).optional(),
}).strict();

// S07 authenticated chat contracts. Message content is stored only in migration 0034 tables (RLS).
const ChatThread = z.object({
  id: Uuid, title: z.string().max(200).nullable(), created_at: UtcTime, updated_at: UtcTime,
}).strict();
const ChatMessage = z.object({
  id: Uuid, thread_id: Uuid, role: z.enum(['user', 'assistant']), content: z.string().max(12000),
  sequence: z.number().int().min(0), created_at: UtcTime,
}).strict();
const ChatDataInput = z.object({
  source: z.enum(['web', 'file', 'tool', 'screen', 'message']), text: z.string().max(12000),
}).strict();
const ChatAttachmentInput = z.object({
  id: Uuid, storage_ref: z.string().min(1).max(500), file_name: z.string().max(255).optional(),
  mime_type: z.string().min(1).max(100), size_bytes: z.number().int().nonnegative().max(10485760).optional(),
}).strict();
const ChatVoiceInput = z.object({
  audio_ref: z.string().min(1).max(500), mime_type: z.enum(['audio/webm', 'audio/wav', 'audio/mp4', 'audio/mpeg', 'audio/ogg']),
  language: z.string().min(2).max(35).optional(),
}).strict();
const ChatStreamFrame = z.discriminatedUnion('type', [
  z.object({ type: z.literal('chat.message.started'), thread_id: Uuid, message_id: Uuid }).strict(),
  z.object({ type: z.literal('chat.message.delta'), thread_id: Uuid, message_id: Uuid, index: z.number().int().min(0), text: z.string().max(12000) }).strict(),
  z.object({ type: z.literal('chat.message.completed'), thread_id: Uuid, message_id: Uuid, chunk_count: z.number().int().min(0) }).strict(),
  z.object({ type: z.literal('chat.message.error'), thread_id: Uuid, message_id: Uuid, code: z.string().min(1).max(80) }).strict(),
]);

const RepeatRule = z.enum(['FREQ=DAILY', 'FREQ=WEEKLY', 'FREQ=MONTHLY', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR']);
const TimeZone = z.string().min(1).max(64).refine((value) => {
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(new Date()); return true; } catch { return false; }
}, 'invalid IANA time zone');
const TaskPriority = z.number().int().min(1).max(3);
const Task = z.object({
  id: Uuid,
  title: z.string().min(1).max(500),
  due_at: UtcTime.nullable(),
  ends_at: UtcTime.nullable().optional(),
  status: z.enum(['todo', 'doing', 'done', 'cancelled']),
  priority: TaskPriority,
  focus_today: z.boolean(),
  repeat_rule: RepeatRule.nullable(),
  time_zone: TimeZone,
}).strict();
const Reminder = z.object({
  id: Uuid,
  text: z.string().min(1).max(500),
  remind_at: UtcTime,
  repeat_rule: RepeatRule.nullable(),
  time_zone: TimeZone,
  state: z.enum(['pending', 'fired', 'done', 'cancelled']),
}).strict();
const TodayScheduleItem = z.object({
  id: Uuid,
  kind: z.enum(['task', 'reminder']),
  title: z.string().min(1).max(500),
  at: UtcTime,
  status: z.string().min(1).max(40),
  priority: TaskPriority.optional(),
}).strict();
const TodayProjection = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time_zone: TimeZone,
  focus: z.object({
    open_count: z.number().int().nonnegative(),
    overdue_count: z.number().int().nonnegative(),
    top_tasks: z.array(Task).max(3),
  }).strict(),
  schedule: z.array(TodayScheduleItem),
}).strict();
const MedicineReminderRequest = z.object({
  memory_id: Uuid,
  private: z.literal(true),
  label: z.string().min(1).max(100),
  time_text: z.string().min(1).max(100),
  display_text: z.string().min(1).max(200),
  needs_time_confirmation: z.boolean(),
  lock_screen_visible: z.literal(true),
  date_text: z.string().min(1).max(100).optional(),
  time_zone: TimeZone.optional(),
}).strict();

// S05 History + Activity Logs schemas (CR-S05-CONTRACTS).
const HistoryThread = z.object({
  id: Uuid,
  title: z.string().min(1).max(200),
  private: z.boolean(),
  created_at: UtcTime,
  updated_at: UtcTime,
}).strict();
const HistoryMessage = z.object({
  id: Uuid,
  thread_id: Uuid,
  role: z.enum(['user', 'assistant']),
  content: z.string().max(12000),
  private: z.boolean(),
  sequence: z.number().int().min(0),
  created_at: UtcTime,
}).strict();
const ActivityItem = z.object({
  id: z.string().min(1).max(30),
  ts: UtcTime,
  actor: z.string().min(1).max(40),
  action: z.string().min(1).max(100),
  target: z.string().max(120).nullable(),
  detail: z.record(z.union([z.string().max(240), z.number(), z.boolean()])),
  ok: z.boolean(),
  decision_id: Uuid.nullable(),
}).strict();

// S09 Memory, Notes/Files, Projects schemas (CR-1).
const MemoryKind = z.enum(['fact', 'profile', 'preference', 'routine', 'project', 'episode', 'knowledge', 'person']);
const PrivatePlaceholder = z.object({
  id: Uuid,
  label: z.literal('Private item'),
  badge: z.literal('private'),
  updated_at: UtcTime,
}).strict();
const NormalCounts = z.object({ normal: z.number().int().nonnegative(), private: z.number().int().nonnegative() }).strict();
const MemoryItem = z.object({
  id: Uuid,
  kind: MemoryKind,
  title: z.string().max(200),
  body: z.string().max(2000),
  tags: z.array(z.string().max(40)).max(12),
  pinned: z.boolean(),
  revision: z.number().int().min(1),
  created_at: UtcTime,
  updated_at: UtcTime,
}).strict();
const WorkspaceNote = z.object({
  id: Uuid,
  title: z.string().min(1).max(200),
  body_md: z.string().max(100000),
  tags: z.array(z.string().max(40)).max(12),
  project_id: Uuid.nullable(),
  pinned: z.boolean(),
  revision: z.number().int().min(1),
  created_at: UtcTime,
  updated_at: UtcTime,
}).strict();
const WorkspaceProject = z.object({
  id: Uuid,
  name: z.string().min(1).max(120),
  goal: z.string().max(1000).nullable(),
  next_step: z.string().max(300).nullable(),
  status: z.enum(['active', 'paused', 'done', 'archived']),
  due_at: UtcTime.nullable(),
  tags: z.array(z.string().max(40)).max(12),
  revision: z.number().int().min(1),
  created_at: UtcTime,
  updated_at: UtcTime,
}).strict();
const AllowedFileMime = z.enum([
  'text/plain', 'text/markdown', 'application/pdf', 'image/png', 'image/jpeg', 'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const LinkEntityType = z.enum(['memory', 'note', 'file', 'project', 'task']);

export const ROUTES = {
  'auth.session.create': route({
    path: '/api/auth/session.create', method: 'POST', auth: 'none', killSensitive: false, errors: ['bad_request', 'unauthorized', 'forbidden', 'unavailable'],
    summary: 'Exchange an existing Supabase Auth token for the owner-only HttpOnly session. Passwords are not handled here.',
    input: SessionTokenInput,
    output: z.object({ user: SessionUser, expires_in: z.number().int().positive() }).strict(),
  }),
  'auth.session.get': route({
    path: '/api/auth/session.get', method: 'GET', auth: 'none', killSensitive: false, errors: ['unauthorized', 'forbidden', 'unavailable'],
    summary: 'Read and refresh the owner session cookie.', input: Empty,
    output: z.object({ user: SessionUser, expires_in: z.number().int().positive() }).strict(),
  }),
  'auth.session.delete': route({
    path: '/api/auth/session.delete', method: 'POST', auth: 'none', killSensitive: false, errors: ['unavailable'],
    summary: 'Clear the owner session cookie and ask Supabase Auth to sign out.', input: Empty,
    output: z.object({ signed_out: z.literal(true) }).strict(),
  }),
  'auth.owner.enter': route({
    path: '/api/auth/owner.enter', method: 'POST', auth: 'none', killSensitive: false, errors: ['bad_request', 'unauthorized', 'rate_limited', 'unavailable'],
    summary: 'Verify owner entry key and issue HttpOnly session cookie.',
    input: z.object({ key: z.string().min(1).max(4096) }).strict(),
    output: z.object({ user: SessionUser, expires_in: z.number().int().positive() }).strict(),
  }),
  'system.health': route({
    path: '/api/system/health', method: 'GET', auth: 'none', killSensitive: false, errors: ['unavailable'],
    summary: 'Real database query (keeps the free Supabase project awake). Returns nothing private.',
    input: Empty, output: z.object({ status: z.literal('ok'), ts: UtcTime }).strict(),
  }),
  'system.kill.get': route({
    path: '/api/system/kill.get', method: 'GET', auth: 'owner_or_device', killSensitive: false, errors: [],
    summary: 'Read the global kill switch.', input: Empty, output: KillState,
  }),
  'system.kill.set': route({
    path: '/api/system/kill.set', method: 'POST', auth: 'owner_or_device', killSensitive: false, errors: ['forbidden'],
    summary: 'Turn the kill switch on or off. A device may only turn it ON; only the owner may turn it OFF.',
    input: z.object({ kill: z.boolean(), reason: z.string().max(500).optional() }).strict(), output: KillState,
  }),
  'system.events.emit': route({
    path: '/api/system/events.emit', method: 'POST', auth: 'owner_or_device', killSensitive: false, errors: ['bad_request', 'payload_too_large', 'rate_limited'],
    summary: 'Send one event. Same idempotency_key again returns the first one (duplicate: true).',
    input: Envelope.extend({ idempotency_key: IdempotencyKey }),
    output: z.object({ event_id: Uuid, duplicate: z.boolean(), live: z.boolean() }).strict(),
  }),
  'system.events.list': route({
    path: '/api/system/events.list', method: 'POST', auth: 'owner', killSensitive: false, errors: ['bad_request'],
    summary: 'Read stored events, newest first.',
    input: z.object({ type: z.string().max(100).optional(), before: UtcTime.optional(), limit: z.number().int().min(1).max(200).default(50) }).strict(),
    output: z.object({ events: z.array(Envelope) }).strict(),
  }),
  'auth.devices.pair': route({
    path: '/api/auth/devices.pair', method: 'POST', auth: 'owner', killSensitive: true, errors: ['bad_request'],
    summary: 'Pair a new device. The token is shown ONCE; only its hash is stored.',
    input: z.object({ name: z.string().min(1).max(100), kind: DeviceKind }).strict(),
    output: z.object({ device: Device, token: z.string().min(20).max(200) }).strict(),
  }),
  'auth.devices.list': route({
    path: '/api/auth/devices.list', method: 'GET', auth: 'owner', killSensitive: false, errors: [],
    summary: 'List paired devices (never returns tokens).', input: Empty, output: z.object({ devices: z.array(Device) }).strict(),
  }),
  'auth.devices.revoke': route({
    path: '/api/auth/devices.revoke', method: 'POST', auth: 'owner', killSensitive: false, errors: ['not_found'],
    summary: 'Revoke a device. Its token stops working at once.',
    input: z.object({ device_id: Uuid }).strict(), output: z.object({ device: Device }).strict(),
  }),
  'phone.commands.create': route({
    path: '/api/phone/commands.create', method: 'POST', auth: 'owner_or_device', killSensitive: true, errors: ['bad_request', 'not_found', 'conflict', 'rate_limited'],
    summary: 'Queue a command for a phone. Risky ops need confirmation first (S22 policy).',
    input: z.object({ device_id: Uuid, command: PhoneCommandBody, idempotency_key: IdempotencyKey.optional(), ttl_seconds: z.number().int().min(10).max(3600).optional() }).strict(),
    output: z.object({ command: PhoneCommand }).strict(),
  }),
  'phone.commands.claim': route({
    path: '/api/phone/commands.claim', method: 'POST', auth: 'device', killSensitive: true, errors: [],
    summary: 'The phone asks for its next fresh command (state becomes sent). command: null = nothing to do.',
    input: z.object({ device_id: Uuid }).strict(), output: z.object({ command: PhoneCommand.nullable() }).strict(),
  }),
  'phone.commands.ack': route({
    path: '/api/phone/commands.ack', method: 'POST', auth: 'device', killSensitive: false, errors: ['not_found', 'conflict'],
    summary: 'The phone reports progress: running, done or failed.',
    input: z.object({ command_id: Uuid, state: z.enum(['running', 'done', 'failed']), result: z.record(z.unknown()).optional(), error: z.string().max(1000).optional() }).strict(),
    output: z.object({ command: PhoneCommand }).strict(),
  }),
  'phone.commands.cancel': route({
    path: '/api/phone/commands.cancel', method: 'POST', auth: 'owner_or_device', killSensitive: false, errors: ['not_found', 'conflict'],
    summary: 'Cancel a command that has not finished.', input: z.object({ command_id: Uuid }).strict(), output: z.object({ command: PhoneCommand }).strict(),
  }),
  'phone.commands.list': route({
    path: '/api/phone/commands.list', method: 'POST', auth: 'owner', killSensitive: false, errors: ['bad_request'],
    summary: 'Recent commands, newest first.',
    input: z.object({ device_id: Uuid.optional(), state: z.string().max(20).optional(), limit: z.number().int().min(1).max(200).default(50) }).strict(),
    output: z.object({ commands: z.array(PhoneCommand) }).strict(),
  }),
  // S07 CHAT (LEAD accepted CR-4, 2026-11-13). All routes require the owner session.
  'chat.threads.list': route({
    path: '/api/chat/threads.list', method: 'POST', auth: 'owner', killSensitive: false, errors: ['bad_request', 'unavailable'],
    summary: 'List only the authenticated owner threads, newest first.',
    input: z.object({ before: UtcTime.optional(), limit: z.number().int().min(1).max(100).default(30) }).strict(),
    output: z.object({ threads: z.array(ChatThread), next_before: UtcTime.optional() }).strict(),
  }),
  'chat.threads.create': route({
    path: '/api/chat/threads.create', method: 'POST', auth: 'owner', killSensitive: false, errors: ['bad_request', 'unavailable'],
    summary: 'Create an owner-scoped chat thread. Database RLS remains the authorization boundary.',
    input: z.object({ title: z.string().max(200).optional() }).strict(),
    output: z.object({ thread: ChatThread }).strict(),
  }),
  'chat.messages.list': route({
    path: '/api/chat/messages.list', method: 'POST', auth: 'owner', killSensitive: false, errors: ['bad_request', 'not_found', 'unavailable'],
    summary: 'List messages from one owner-scoped thread, in sequence order.',
    input: z.object({ thread_id: Uuid, before_sequence: z.number().int().min(0).optional(), limit: z.number().int().min(1).max(100).default(50) }).strict(),
    output: z.object({ messages: z.array(ChatMessage), next_before_sequence: z.number().int().min(0).optional() }).strict(),
  }),
  'chat.messages.send': route({
    path: '/api/chat/messages.send', method: 'POST', auth: 'owner', killSensitive: true, errors: ['bad_request', 'not_found', 'kill_switch_on', 'rate_limited', 'unavailable'],
    summary: 'Accept an owner chat message and start model streaming; content is not written to the events table.',
    input: z.object({
      thread_id: Uuid, message_id: Uuid.optional(), text: z.string().min(1).max(12000),
      data: z.array(ChatDataInput).max(10).optional(), attachments: z.array(ChatAttachmentInput).max(10).optional(), voice: ChatVoiceInput.optional(),
    }).strict(),
    output: z.object({ accepted: z.literal(true), thread_id: Uuid, message_id: Uuid, stream_path: z.literal('/api/chat/messages.stream') }).strict(),
  }),
  'chat.messages.stream': route({
    path: '/api/chat/messages.stream', method: 'POST', auth: 'owner', killSensitive: true, errors: ['bad_request', 'not_found', 'kill_switch_on', 'unavailable'],
    summary: 'Open the authenticated SSE stream for one owner message; text deltas travel only on this response, never in event rows.',
    input: z.object({ thread_id: Uuid, message_id: Uuid, after_index: z.number().int().min(0).optional() }).strict(),
    output: ChatStreamFrame, // one SSE frame; delta text exists only on this authenticated stream, never in the events table
  }),
  // S21 contract request (approved). Payloads carry references/metadata, never raw audio bytes.
  'voice.transcribe': route({
    path: '/api/voice/transcribe', method: 'POST', auth: 'owner', killSensitive: true, errors: ['bad_request', 'not_found', 'unavailable'],
    summary: 'Transcribe an already-uploaded audio reference. Audio provider adapter is supplied later by S13/S07.',
    input: VoiceTranscribeInput,
    output: z.object({ text: z.string().max(12000), language: z.string().max(35).optional(), duration_ms: z.number().int().nonnegative().optional() }).strict(),
  }),
  'voice.speak': route({
    path: '/api/voice/speak', method: 'POST', auth: 'owner', killSensitive: true, errors: ['bad_request', 'unavailable'],
    summary: 'Synthesize speech and return an audio reference. Audio provider adapter is supplied later by S13/S07.',
    input: VoiceSpeakInput,
    output: z.object({ audio_ref: z.string().min(1).max(500), mime_type: z.string().max(100), duration_ms: z.number().int().nonnegative().optional() }).strict(),
  }),
  // S08 Today, Tasks & Reminders (CR-1). All endpoints are POST, owner-authenticated, no-store.
  'tasks.tasks.list': route({
    path: '/api/tasks/tasks.list', method: 'POST', auth: 'owner', killSensitive: false, errors: ['bad_request', 'unavailable'],
    summary: 'List owner-scoped tasks.',
    input: Empty,
    output: z.object({ tasks: z.array(Task) }).strict(),
  }),
  'tasks.tasks.today': route({
    path: '/api/tasks/tasks.today', method: 'POST', auth: 'owner', killSensitive: false, errors: ['bad_request', 'unavailable'],
    summary: 'Return owner-local TodayProjection (focus counts, top 3 tasks, generic schedule).',
    input: Empty,
    output: TodayProjection,
  }),
  'tasks.tasks.create': route({
    path: '/api/tasks/tasks.create', method: 'POST', auth: 'owner', killSensitive: true, errors: ['bad_request', 'forbidden', 'conflict', 'payload_too_large', 'kill_switch_on', 'unavailable'],
    summary: 'Create an owner task.',
    input: z.object({
      title: z.string().min(1).max(500),
      notes: z.string().max(4000).nullable().optional(),
      due_at: UtcTime.nullable().optional(),
      ends_at: UtcTime.nullable().optional(),
      priority: TaskPriority.optional(),
      focus_today: z.boolean().optional(),
      repeat_rule: RepeatRule.nullable().optional(),
      time_zone: TimeZone.optional(),
      confirmed: z.boolean(),
      allow_clash: z.boolean().optional(),
    }).strict(),
    output: z.object({ task: Task }).strict(),
  }),
  'tasks.tasks.natural-add': route({
    path: '/api/tasks/tasks.natural-add', method: 'POST', auth: 'owner', killSensitive: true, errors: ['bad_request', 'forbidden', 'conflict', 'payload_too_large', 'kill_switch_on', 'unavailable'],
    summary: 'Parse Hindi/Hinglish natural language into a task or reminder; returns 409 conflict on ambiguous time, clash, duplicate, or sensitive content.',
    input: z.object({
      text: z.string().min(1).max(1000),
      confirmed: z.boolean(),
      allow_clash: z.boolean().optional(),
      allow_duplicate: z.boolean().optional(),
    }).strict(),
    output: z.object({ kind: z.enum(['task', 'reminder']), item: z.union([Task, Reminder]) }).strict(),
  }),
  'tasks.tasks.update': route({
    path: '/api/tasks/tasks.update', method: 'POST', auth: 'owner', killSensitive: true, errors: ['bad_request', 'forbidden', 'not_found', 'conflict', 'payload_too_large', 'kill_switch_on', 'unavailable'],
    summary: 'Update owner task fields.',
    input: z.object({
      id: Uuid,
      title: z.string().min(1).max(500).optional(),
      notes: z.string().max(4000).nullable().optional(),
      due_at: UtcTime.nullable().optional(),
      ends_at: UtcTime.nullable().optional(),
      priority: TaskPriority.optional(),
      repeat_rule: RepeatRule.nullable().optional(),
      focus_today: z.boolean().optional(),
      time_zone: TimeZone.optional(),
      confirmed: z.boolean(),
      allow_clash: z.boolean().optional(),
    }).strict(),
    output: z.object({ task: Task }).strict(),
  }),
  'tasks.tasks.link-project': route({
    path: '/api/tasks/tasks.link-project', method: 'POST', auth: 'owner', killSensitive: true, errors: ['bad_request', 'forbidden', 'not_found', 'conflict', 'kill_switch_on', 'unavailable'],
    summary: 'Link a task to an owner project via public.memory_links.',
    input: z.object({ task_id: Uuid, project_id: Uuid, confirmed: z.boolean() }).strict(),
    output: z.object({ linked: z.literal(true), link_id: Uuid.nullable() }).strict(),
  }),
  'tasks.tasks.complete': route({
    path: '/api/tasks/tasks.complete', method: 'POST', auth: 'owner', killSensitive: true, errors: ['bad_request', 'forbidden', 'not_found', 'conflict', 'kill_switch_on', 'unavailable'],
    summary: 'Idempotently complete an owner task and create exactly one next occurrence if recurring.',
    input: z.object({ id: Uuid, confirmed: z.boolean() }).strict(),
    output: z.object({ task: Task, next_task: Task.nullable(), already_completed: z.boolean().optional() }).strict(),
  }),
  'tasks.tasks.cancel': route({
    path: '/api/tasks/tasks.cancel', method: 'POST', auth: 'owner', killSensitive: false, errors: ['bad_request', 'forbidden', 'not_found', 'conflict', 'unavailable'],
    summary: 'Cancel an owner task.',
    input: z.object({ id: Uuid, confirmed: z.boolean() }).strict(),
    output: z.object({ task: Task }).strict(),
  }),
  'tasks.tasks.delete': route({
    path: '/api/tasks/tasks.delete', method: 'POST', auth: 'owner', killSensitive: true, errors: ['bad_request', 'forbidden', 'not_found', 'conflict', 'kill_switch_on', 'unavailable'],
    summary: 'Hard-delete an owner task after confirmation.',
    input: z.object({ id: Uuid, confirmed: z.boolean() }).strict(),
    output: z.object({ deleted: z.literal(true), id: Uuid }).strict(),
  }),
  'reminders.reminders.list': route({
    path: '/api/reminders/reminders.list', method: 'POST', auth: 'owner', killSensitive: false, errors: ['bad_request', 'unavailable'],
    summary: 'List owner-scoped reminders.',
    input: Empty,
    output: z.object({ reminders: z.array(Reminder) }).strict(),
  }),
  'reminders.reminders.create': route({
    path: '/api/reminders/reminders.create', method: 'POST', auth: 'owner', killSensitive: true, errors: ['bad_request', 'forbidden', 'conflict', 'payload_too_large', 'kill_switch_on', 'unavailable'],
    summary: 'Create a non-sensitive owner reminder and approved worker job; rejects medicine/T2 payloads.',
    input: z.object({
      text: z.string().min(1).max(500),
      remind_at: UtcTime,
      repeat_rule: RepeatRule.nullable().optional(),
      time_zone: TimeZone.optional(),
      task_id: Uuid.optional(),
      confirmed: z.boolean(),
      allow_duplicate: z.boolean().optional(),
    }).strict(),
    output: z.object({ reminder: Reminder }).strict(),
  }),
  'reminders.reminders.update': route({
    path: '/api/reminders/reminders.update', method: 'POST', auth: 'owner', killSensitive: true, errors: ['bad_request', 'forbidden', 'not_found', 'conflict', 'payload_too_large', 'kill_switch_on', 'unavailable'],
    summary: 'Update a non-sensitive owner reminder and replace its queued worker job atomically.',
    input: z.object({
      id: Uuid,
      text: z.string().min(1).max(500),
      remind_at: UtcTime,
      repeat_rule: RepeatRule.nullable().optional(),
      time_zone: TimeZone.optional(),
      confirmed: z.boolean(),
      allow_duplicate: z.boolean().optional(),
    }).strict(),
    output: z.object({ reminder: Reminder }).strict(),
  }),
  'reminders.reminders.complete': route({
    path: '/api/reminders/reminders.complete', method: 'POST', auth: 'owner', killSensitive: true, errors: ['bad_request', 'forbidden', 'not_found', 'conflict', 'kill_switch_on', 'unavailable'],
    summary: 'Mark an owner reminder done and cancel its queued worker job atomically.',
    input: z.object({ id: Uuid, confirmed: z.boolean() }).strict(),
    output: z.object({ reminder: Reminder }).strict(),
  }),
  'reminders.reminders.delete': route({
    path: '/api/reminders/reminders.delete', method: 'POST', auth: 'owner', killSensitive: true, errors: ['bad_request', 'forbidden', 'not_found', 'conflict', 'kill_switch_on', 'unavailable'],
    summary: 'Cancel any queued reminder job and hard-delete an owner reminder atomically.',
    input: z.object({ id: Uuid, confirmed: z.boolean() }).strict(),
    output: z.object({ deleted: z.literal(true), id: Uuid }).strict(),
  }),
  'reminders.reminders.cancel': route({
    path: '/api/reminders/reminders.cancel', method: 'POST', auth: 'owner', killSensitive: false, errors: ['bad_request', 'forbidden', 'not_found', 'conflict', 'unavailable'],
    summary: 'Cancel a pending owner reminder and its queued job atomically.',
    input: z.object({ id: Uuid, confirmed: z.boolean() }).strict(),
    output: z.object({ reminder: Reminder.optional(), cancelled: z.literal(true) }).strict(),
  }),
  'reminders.reminders.consume-memory': route({
    path: '/api/reminders/reminders.consume-memory', method: 'POST', auth: 'owner', killSensitive: true, errors: ['bad_request', 'conflict', 'unavailable'],
    summary: 'Validate S09 medicine reminder hand-off without echoing private fields; returns 409 conflict until S19 private vault is approved.',
    input: z.object({ request: MedicineReminderRequest }).strict(),
    output: z.object({ status: z.string().min(1).max(80), reason: z.string().min(1).max(120).optional() }).strict(),
  }),
  // S05 History + Activity Logs (CR-S05-CONTRACTS).
  'tasks.history.threads.list': route({
    path: '/api/tasks/history.threads.list',
    method: 'POST', auth: 'owner', killSensitive: false,
    errors: ['bad_request', 'forbidden', 'not_found', 'unavailable'],
    summary: 'List the signed-in owner’s recent chat threads; private titles are replaced by a generic label.',
    input: z.object({
      before: UtcTime.optional(),
      limit: z.number().int().min(1).max(50).optional(),
      confirmed: z.boolean().optional(),
    }).strict(),
    output: z.object({
      threads: z.array(HistoryThread),
      next_before: UtcTime.optional(),
    }).strict(),
  }),
  'tasks.history.messages.list': route({
    path: '/api/tasks/history.messages.list',
    method: 'POST', auth: 'owner', killSensitive: false,
    errors: ['bad_request', 'forbidden', 'not_found', 'unavailable'],
    summary: 'List completed messages from an owner-owned thread; sensitive content is masked and never sent to a model.',
    input: z.object({
      thread_id: Uuid,
      before_sequence: z.number().int().nonnegative().optional(),
      limit: z.number().int().min(1).max(100).optional(),
      confirmed: z.boolean().optional(),
    }).strict(),
    output: z.object({
      messages: z.array(HistoryMessage),
      next_before_sequence: z.number().int().nonnegative().optional(),
    }).strict(),
  }),
  'tasks.activity-logs.list': route({
    path: '/api/tasks/activity-logs.list',
    method: 'POST', auth: 'owner', killSensitive: false,
    errors: ['bad_request', 'forbidden', 'unavailable'],
    summary: 'List safe owner activity metadata with optional action, actor, result and time filters.',
    input: z.object({
      before: UtcTime.optional(),
      limit: z.number().int().min(1).max(100).optional(),
      confirmed: z.boolean().optional(),
      action: z.string().regex(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/).optional(),
      actor: z.string().regex(/^(owner|jarvis|worker|system|s[0-9]{2}[a-z]?)$/i).optional(),
      ok: z.boolean().optional(),
    }).strict(),
    output: z.object({
      items: z.array(ActivityItem),
      next_before: UtcTime.optional(),
    }).strict(),
  }),
  // S09 Memory, Notes/Files, Projects (CR-1).
  'memory.memory.list': route({
    path: '/api/memory/memory.list', method: 'POST', auth: 'owner', killSensitive: false, errors: ['bad_request', 'forbidden', 'unavailable'],
    summary: 'List owner memory with normal and private items separated.',
    input: Empty,
    output: z.object({ normal: z.array(MemoryItem), private: z.array(PrivatePlaceholder), total: z.number().int().nonnegative().nullable(), counts: NormalCounts }).strict(),
  }),
  'memory.memory.get': route({
    path: '/api/memory/memory.get', method: 'POST', auth: 'owner', killSensitive: false, errors: ['bad_request', 'forbidden', 'not_found', 'unavailable'],
    summary: 'Read one owner memory item or private placeholder.',
    input: Empty,
    output: z.union([MemoryItem, PrivatePlaceholder]),
  }),
  'memory.memory.remember': route({
    path: '/api/memory/memory.remember', method: 'POST', auth: 'owner', killSensitive: true, errors: ['bad_request', 'forbidden', 'conflict', 'payload_too_large', 'kill_switch_on', 'unavailable'],
    summary: 'Save an owner-requested memory item; private text is inserted directly as T2.',
    input: z.object({
      text: z.string().min(1).max(2000),
      title: z.string().min(1).max(200).optional(),
      kind: MemoryKind.optional(),
      tags: z.array(z.string().max(40)).max(12).optional(),
      pinned: z.boolean().optional(),
      private: z.boolean().optional(),
      confirmed: z.boolean(),
    }).strict(),
    output: z.object({ saved: z.literal(true), deduped: z.boolean(), item: z.union([MemoryItem, PrivatePlaceholder]) }).strict(),
  }),
  'memory.memory.update': route({
    path: '/api/memory/memory.update', method: 'POST', auth: 'owner', killSensitive: true, errors: ['bad_request', 'forbidden', 'not_found', 'conflict', 'payload_too_large', 'kill_switch_on', 'unavailable'],
    summary: 'Update owner memory with optimistic concurrency revision and sticky T2 privacy.',
    input: z.object({
      id: Uuid,
      revision: z.number().int().min(1),
      title: z.string().min(1).max(200).optional(),
      body: z.string().min(1).max(2000).optional(),
      tags: z.array(z.string().max(40)).max(12).optional(),
      private: z.boolean().optional(),
      confirmed: z.boolean(),
    }).strict(),
    output: z.union([MemoryItem, PrivatePlaceholder]),
  }),
  'memory.memory.forget': route({
    path: '/api/memory/memory.forget', method: 'POST', auth: 'owner', killSensitive: true, errors: ['bad_request', 'forbidden', 'not_found', 'conflict', 'kill_switch_on', 'unavailable'],
    summary: 'Hard-delete one owner memory after confirmation.',
    input: z.object({ id: Uuid, confirmed: z.boolean() }).strict(),
    output: z.object({ deleted: z.boolean(), derived_deleted: z.number().int().nonnegative(), links_deleted: z.number().int().nonnegative() }).strict(),
  }),
  'memory.memory.forget-all': route({
    path: '/api/memory/memory.forget-all', method: 'POST', auth: 'owner', killSensitive: true, errors: ['bad_request', 'forbidden', 'conflict', 'kill_switch_on', 'unavailable'],
    summary: 'Hard-delete all owner memories after fresh count and app confirmation.',
    input: z.object({ expectedCount: z.number().int().nonnegative(), confirmed: z.boolean() }).strict(),
    output: z.object({ deleted: z.number().int().nonnegative(), derived_deleted: z.number().int().nonnegative(), links_deleted: z.number().int().nonnegative() }).strict(),
  }),
  'memory.memory.export': route({
    path: '/api/memory/memory.export', method: 'POST', auth: 'owner', killSensitive: true, errors: ['bad_request', 'forbidden', 'conflict', 'kill_switch_on', 'unavailable'],
    summary: 'Export normal-tier owner memory as NDJSON attachment; private rows never exported.',
    input: z.object({ confirmed: z.boolean() }).strict(),
    output: z.string(),
  }),
  'memory.memory.stats': route({
    path: '/api/memory/memory.stats', method: 'POST', auth: 'owner', killSensitive: false, errors: ['bad_request', 'forbidden', 'unavailable'],
    summary: 'Read owner memory count summary without row text.',
    input: Empty,
    output: z.record(z.unknown()),
  }),
  'notes-files.workspace.notes.list': route({
    path: '/api/notes-files/workspace.notes.list', method: 'POST', auth: 'owner', killSensitive: false, errors: ['bad_request', 'forbidden', 'unavailable'],
    summary: 'List owner notes with normal and private placeholders separated.',
    input: Empty,
    output: z.object({ normal: z.array(WorkspaceNote), private: z.array(PrivatePlaceholder), counts: NormalCounts }).strict(),
  }),
  'notes-files.workspace.notes.get': route({
    path: '/api/notes-files/workspace.notes.get', method: 'POST', auth: 'owner', killSensitive: false, errors: ['bad_request', 'forbidden', 'not_found', 'unavailable'],
    summary: 'Read one owner note or private placeholder.',
    input: Empty,
    output: z.union([WorkspaceNote, PrivatePlaceholder]),
  }),
  'notes-files.workspace.notes.create': route({
    path: '/api/notes-files/workspace.notes.create', method: 'POST', auth: 'owner', killSensitive: true, errors: ['bad_request', 'forbidden', 'conflict', 'payload_too_large', 'kill_switch_on', 'unavailable'],
    summary: 'Create a classified owner note (up to 110 KB request cap).',
    input: z.object({
      title: z.string().min(1).max(200),
      body_md: z.string().max(100000).optional(),
      tags: z.array(z.string().max(40)).max(12).optional(),
      project_id: Uuid.nullable().optional(),
      pinned: z.boolean().optional(),
      private: z.boolean().optional(),
      confirmed: z.boolean(),
    }).strict(),
    output: z.union([WorkspaceNote, PrivatePlaceholder]),
  }),
  'notes-files.workspace.notes.update': route({
    path: '/api/notes-files/workspace.notes.update', method: 'POST', auth: 'owner', killSensitive: true, errors: ['bad_request', 'forbidden', 'not_found', 'conflict', 'payload_too_large', 'kill_switch_on', 'unavailable'],
    summary: 'Update a classified owner note with sticky T2 privacy (up to 110 KB request cap).',
    input: z.object({
      id: Uuid,
      revision: z.number().int().min(1),
      title: z.string().min(1).max(200).optional(),
      body_md: z.string().max(100000).optional(),
      tags: z.array(z.string().max(40)).max(12).optional(),
      pinned: z.boolean().optional(),
      private: z.boolean().optional(),
      confirmed: z.boolean(),
    }).strict(),
    output: z.union([WorkspaceNote, PrivatePlaceholder]),
  }),
  'notes-files.workspace.notes.delete': route({
    path: '/api/notes-files/workspace.notes.delete', method: 'POST', auth: 'owner', killSensitive: true, errors: ['bad_request', 'forbidden', 'conflict', 'kill_switch_on', 'unavailable'],
    summary: 'Hard-delete an owner note after confirmation.',
    input: z.object({ id: Uuid, confirmed: z.boolean() }).strict(),
    output: z.object({ deleted: z.boolean() }).strict(),
  }),
  'notes-files.workspace.files.list': route({
    path: '/api/notes-files/workspace.files.list', method: 'POST', auth: 'owner', killSensitive: false, errors: ['bad_request', 'forbidden', 'unavailable'],
    summary: 'List private owner file placeholders only.',
    input: Empty,
    output: z.object({ normal: z.array(z.never()), private: z.array(PrivatePlaceholder), counts: NormalCounts, upload_note: z.string() }).strict(),
  }),
  'notes-files.workspace.files.upload-url': route({
    path: '/api/notes-files/workspace.files.upload-url', method: 'POST', auth: 'owner', killSensitive: true, errors: ['bad_request', 'forbidden', 'conflict', 'payload_too_large', 'kill_switch_on', 'unavailable'],
    summary: 'Create an owner-token signed PUT upload URL for the private files bucket.',
    input: z.object({
      name: z.string().min(1).max(200),
      mime: AllowedFileMime,
      size_bytes: z.number().int().min(1).max(10485760),
      project_id: Uuid.nullable().optional(),
      tags: z.array(z.string().max(40)).max(12).optional(),
      confirmed: z.boolean(),
    }).strict(),
    output: z.object({
      id: Uuid,
      upload: z.object({ method: z.literal('PUT'), url: z.string().url(), headers: z.record(z.string()) }).strict(),
      private: z.literal(true),
    }).strict(),
  }),
  'notes-files.workspace.files.complete-upload': route({
    path: '/api/notes-files/workspace.files.complete-upload', method: 'POST', auth: 'owner', killSensitive: true, errors: ['bad_request', 'forbidden', 'not_found', 'conflict', 'kill_switch_on', 'unavailable'],
    summary: 'Complete and quarantine an owner file upload.',
    input: z.object({ id: Uuid, sha256: z.string().regex(/^[0-9a-f]{64}$/i), confirmed: z.boolean() }).strict(),
    output: z.object({ id: Uuid, status: z.literal('quarantined'), label: z.literal('Private file'), badge: z.literal('private') }).strict(),
  }),
  'notes-files.workspace.files.delete': route({
    path: '/api/notes-files/workspace.files.delete', method: 'POST', auth: 'owner', killSensitive: true, errors: ['bad_request', 'forbidden', 'conflict', 'kill_switch_on', 'unavailable'],
    summary: 'Delete an owner private Storage object and metadata row.',
    input: z.object({ id: Uuid, confirmed: z.boolean() }).strict(),
    output: z.object({ deleted: z.boolean() }).strict(),
  }),
  'notes-files.workspace.search': route({
    path: '/api/notes-files/workspace.search', method: 'POST', auth: 'owner', killSensitive: false, errors: ['bad_request', 'forbidden', 'unavailable'],
    summary: 'Search normal-tier owner notes only.',
    input: Empty,
    output: z.object({ normal: z.array(WorkspaceNote), private: z.array(z.never()), counts: NormalCounts }).strict(),
  }),
  'projects.workspace.projects.list': route({
    path: '/api/projects/workspace.projects.list', method: 'POST', auth: 'owner', killSensitive: false, errors: ['bad_request', 'forbidden', 'unavailable'],
    summary: 'List owner projects with normal and private placeholders separated.',
    input: Empty,
    output: z.object({ normal: z.array(WorkspaceProject), private: z.array(PrivatePlaceholder), counts: NormalCounts }).strict(),
  }),
  'projects.workspace.projects.get': route({
    path: '/api/projects/workspace.projects.get', method: 'POST', auth: 'owner', killSensitive: false, errors: ['bad_request', 'forbidden', 'not_found', 'unavailable'],
    summary: 'Read one owner project or private placeholder.',
    input: Empty,
    output: z.union([WorkspaceProject, PrivatePlaceholder]),
  }),
  'projects.workspace.projects.create': route({
    path: '/api/projects/workspace.projects.create', method: 'POST', auth: 'owner', killSensitive: true, errors: ['bad_request', 'forbidden', 'conflict', 'payload_too_large', 'kill_switch_on', 'unavailable'],
    summary: 'Create a classified owner project.',
    input: z.object({
      name: z.string().min(1).max(120),
      goal: z.string().min(1).max(1000).nullable().optional(),
      next_step: z.string().min(1).max(300).nullable().optional(),
      status: z.enum(['active', 'paused', 'done', 'archived']).optional(),
      due_at: UtcTime.nullable().optional(),
      tags: z.array(z.string().max(40)).max(12).optional(),
      private: z.boolean().optional(),
      confirmed: z.boolean(),
    }).strict(),
    output: z.union([WorkspaceProject, PrivatePlaceholder]),
  }),
  'projects.workspace.projects.update': route({
    path: '/api/projects/workspace.projects.update', method: 'POST', auth: 'owner', killSensitive: true, errors: ['bad_request', 'forbidden', 'not_found', 'conflict', 'payload_too_large', 'kill_switch_on', 'unavailable'],
    summary: 'Update an owner project with sticky T2 privacy.',
    input: z.object({
      id: Uuid,
      revision: z.number().int().min(1),
      name: z.string().min(1).max(120).optional(),
      goal: z.string().min(1).max(1000).nullable().optional(),
      next_step: z.string().min(1).max(300).nullable().optional(),
      status: z.enum(['active', 'paused', 'done', 'archived']).optional(),
      due_at: UtcTime.nullable().optional(),
      tags: z.array(z.string().max(40)).max(12).optional(),
      private: z.boolean().optional(),
      confirmed: z.boolean(),
    }).strict(),
    output: z.union([WorkspaceProject, PrivatePlaceholder]),
  }),
  'projects.workspace.projects.delete': route({
    path: '/api/projects/workspace.projects.delete', method: 'POST', auth: 'owner', killSensitive: true, errors: ['bad_request', 'forbidden', 'conflict', 'kill_switch_on', 'unavailable'],
    summary: 'Delete an owner project after confirmation.',
    input: z.object({ id: Uuid, confirmed: z.boolean() }).strict(),
    output: z.object({ deleted: z.boolean() }).strict(),
  }),
  'projects.workspace.projects.link-item': route({
    path: '/api/projects/workspace.projects.link-item', method: 'POST', auth: 'owner', killSensitive: true, errors: ['bad_request', 'forbidden', 'conflict', 'kill_switch_on', 'unavailable'],
    summary: 'Link an owner project to a memory, note, file, task, or project via memory_links.',
    input: z.object({
      src_type: LinkEntityType,
      src_id: Uuid,
      rel: z.string().regex(/^[a-z_]{2,40}$/),
      dst_type: LinkEntityType,
      dst_id: Uuid,
      confirmed: z.boolean(),
    }).strict(),
    output: z.object({ linked: z.literal(true), id: Uuid.optional() }).strict(),
  }),
  'projects.workspace.projects.unlink-item': route({
    path: '/api/projects/workspace.projects.unlink-item', method: 'POST', auth: 'owner', killSensitive: true, errors: ['bad_request', 'forbidden', 'conflict', 'kill_switch_on', 'unavailable'],
    summary: 'Remove an owner project link after confirmation.',
    input: z.object({ id: Uuid, confirmed: z.boolean() }).strict(),
    output: z.object({ unlinked: z.boolean() }).strict(),
  }),
} as const satisfies Record<string, Route>;

export type RouteName = keyof typeof ROUTES;
export type RequestOf<N extends RouteName> = z.input<(typeof ROUTES)[N]['input']>;
export type ResponseOf<N extends RouteName> = z.infer<(typeof ROUTES)[N]['output']>;
export { ERROR_CODES };
