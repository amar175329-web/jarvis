// Event-type registry: the list of event names JARVIS knows. An event not listed here is REJECTED.
// live=true means: it reaches the screen/phone instantly, but NOT through the events table.
// It travels through its own table (liveVia), which is already in the realtime publication.
// Everything else is stored only and read when the app opens (decision: LEAD, 2026-11-07).
// To add a type: propose it to S00/LEAD, then add it here with a payload schema and a test.
import { z } from 'zod';

export type LiveTable = 'phone_commands' | 'system_state' | 'tasks' | 'reminders';
export type EventTypeDef = { live: false; payload: z.ZodTypeAny } | { live: true; liveVia: LiveTable; payload: z.ZodTypeAny };

const uuid = z.string().uuid();
const taskRef = z.object({ task_id: uuid, title: z.string().max(500).optional() }).strict();
const reminderRef = z.object({ reminder_id: uuid, due_at: z.string().datetime({ offset: true }).optional() }).strict();
const phoneCmd = z.object({ command_id: uuid, device_id: uuid, error: z.string().max(1000).optional() }).strict();
const live = (liveVia: LiveTable, payload: z.ZodTypeAny): EventTypeDef => ({ live: true, liveVia, payload });
const stored = (payload: z.ZodTypeAny): EventTypeDef => ({ live: false, payload });

export const EVENT_TYPES = {
  // live, delivered by their own table
  'task.created': live('tasks', taskRef),
  'task.updated': live('tasks', taskRef),
  'task.completed': live('tasks', taskRef),
  'task.deleted': live('tasks', taskRef),
  'reminder.created': live('reminders', reminderRef),
  'reminder.due': live('reminders', reminderRef),
  'reminder.cancelled': live('reminders', reminderRef),
  'phone.command.queued': live('phone_commands', phoneCmd),
  'phone.command.sent': live('phone_commands', phoneCmd),
  'phone.command.running': live('phone_commands', phoneCmd),
  'phone.command.done': live('phone_commands', phoneCmd),
  'phone.command.failed': live('phone_commands', phoneCmd),
  'phone.command.cancelled': live('phone_commands', phoneCmd),
  'phone.command.expired': live('phone_commands', phoneCmd),
  'system.kill.changed': live('system_state', z.object({ kill: z.boolean(), epoch: z.number().int().min(0), reason: z.string().max(500).optional() }).strict()),
  // stored only
  'activity.logged': stored(z.object({ summary: z.string().max(500), area: z.string().max(100).optional() }).strict()),
  'device.paired': stored(z.object({ device_id: uuid, kind: z.string().max(50) }).strict()),
  'device.revoked': stored(z.object({ device_id: uuid }).strict()),
  'memory.saved': stored(z.object({ memory_id: uuid, kind: z.string().max(50) }).strict()),
  'bot.run.finished': stored(z.object({ bot_key: z.string().max(100), ok: z.boolean(), error: z.string().max(1000).optional() }).strict()),
  'model.usage.recorded': stored(z.object({ model: z.string().max(100), tokens_in: z.number().int().min(0), tokens_out: z.number().int().min(0) }).strict()),
  // S21 approved event contract. These are metadata-only; never place transcripts or audio bytes here.
  'voice.session.started': stored(z.object({ session_id: uuid, source: z.enum(['app', 'phone']) }).strict()),
  'voice.session.ended': stored(z.object({ session_id: uuid, reason: z.enum(['user', 'idle', 'error', 'kill_switch']).optional(), duration_ms: z.number().int().nonnegative().optional() }).strict()),
  'voice.speech.started': stored(z.object({ session_id: uuid, speech_id: uuid, direction: z.enum(['input', 'output']), language: z.string().max(35).optional() }).strict()),
  'voice.speech.interrupted': stored(z.object({ session_id: uuid, speech_id: uuid, reason: z.enum(['user', 'barge_in', 'kill_switch', 'error']).optional() }).strict()),
  'voice.stop.requested': stored(z.object({ session_id: uuid, source: z.enum(['app', 'phone']) }).strict()),
  'persona.mode.changed': stored(z.object({ session_id: uuid.optional(), previous_mode: z.string().max(50).optional(), mode: z.string().min(1).max(50) }).strict()),
  // S22 BRAIN approved event contract (LEAD 2026-11-10). Metadata only: NEVER passwords, secrets or fingerprint data. Secrets are only {{secret:name}} handles.
  'brain.decision.made': stored(z.object({ trace_id: z.string().min(1).max(100), power_id: z.string().max(100).optional(), level: z.number().int().min(0).max(4).nullable(), why: z.string().min(1).max(200), result: z.string().max(200) }).strict()),
  'brain.action.requested': stored(z.object({ trace_id: z.string().min(1).max(100), power_id: z.string().max(100) }).strict()),
  'brain.confirm.needed': stored(z.object({ trace_id: z.string().min(1).max(100), power_id: z.string().max(100), channel: z.enum(['phone_voice', 'app_tap', 'app_voice']), needs_fingerprint: z.boolean() }).strict()),
  'brain.confirm.answered': stored(z.object({ trace_id: z.string().min(1).max(100), answer: z.enum(['yes', 'no', 'unclear', 'no_answer']), fingerprint_ok: z.boolean().optional() }).strict()),
  'brain.action.done': stored(z.object({ trace_id: z.string().min(1).max(100), power_id: z.string().max(100), ok: z.boolean(), error: z.string().max(500).optional() }).strict()),
  // S07 CHAT events (LEAD accepted CR-2, 2026-11-13). Metadata only: never text, deltas, file refs or transcripts.
  'chat.thread.created': stored(z.object({ thread_id: uuid }).strict()),
  'chat.message.created': stored(z.object({ thread_id: uuid, message_id: uuid, role: z.enum(['user', 'assistant']) }).strict()),
  'chat.message.started': stored(z.object({ thread_id: uuid, message_id: uuid }).strict()),
  'chat.message.delta': stored(z.object({ thread_id: uuid, message_id: uuid, index: z.number().int().min(0) }).strict()),
  'chat.message.completed': stored(z.object({ thread_id: uuid, message_id: uuid, chunk_count: z.number().int().min(0) }).strict()),
  'chat.message.error': stored(z.object({ thread_id: uuid, message_id: uuid, code: z.string().min(1).max(80) }).strict()),
  'chat.attachment.referenced': stored(z.object({ thread_id: uuid, message_id: uuid, attachment_id: uuid, mime_type: z.string().min(1).max(100) }).strict()),
  // S09 MEMORY events (LEAD accepted CR-2, 2026-11-11). Metadata only: NEVER memory text.
  'memory.updated': stored(z.object({ memory_id: z.string().uuid(), kind: z.string().max(40) }).strict()),
  'memory.forgotten': stored(z.object({ count: z.number().int().min(0), all: z.boolean().optional() }).strict()),
  'memory.exported': stored(z.object({ count: z.number().int().min(0), format: z.string().max(20) }).strict()),
} as const satisfies Record<string, EventTypeDef>;

export type EventTypeName = keyof typeof EVENT_TYPES;
