// The API list. One entry per route. Route names: /api/<group>/<action> (decision 003).
// Request = JSON body (POST). Response data goes inside { ok: true, data }. Errors: see errors.ts.
import { z } from 'zod';
import { Uuid, UtcTime, IdempotencyKey, Empty, Device, DeviceKind, PhoneCommand, PhoneCommandBody, KillState, Envelope } from './common.ts';
import { ERROR_CODES, type ErrorCode } from './errors.ts';

export const ROUTE_PATH_RE = /^\/api\/[a-z0-9-]+\/[a-z0-9]+(\.[a-z0-9-]+)*$/;
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
} as const satisfies Record<string, Route>;

export type RouteName = keyof typeof ROUTES;
export type RequestOf<N extends RouteName> = z.input<(typeof ROUTES)[N]['input']>;
export type ResponseOf<N extends RouteName> = z.infer<(typeof ROUTES)[N]['output']>;
export { ERROR_CODES };
