export type SessionState = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'confirming' | 'error';
export type SessionEvent =
  | 'press' | 'release' | 'transcribed' | 'transcribe_failed' | 'reply_ready' | 'reply_done'
  | 'barge_in' | 'stop' | 'need_confirm' | 'confirmed' | 'declined' | 'timeout' | 'fail' | 'reset' | 'kill';

const T: Record<SessionState, Partial<Record<SessionEvent, SessionState>>> = {
  idle:         { press: 'listening' },
  listening:    { release: 'transcribing', stop: 'idle' },
  transcribing: { transcribed: 'thinking', transcribe_failed: 'idle' },
  thinking:     { reply_ready: 'speaking', need_confirm: 'confirming', stop: 'idle' },
  speaking:     { reply_done: 'idle', barge_in: 'listening', press: 'listening', stop: 'idle', need_confirm: 'confirming' },
  confirming:   { confirmed: 'thinking', declined: 'idle', timeout: 'idle', stop: 'idle' }, // silence is NEVER "yes"
  error:        { reset: 'idle' },
};

// Any state can fail into 'error'. Kill switch always returns to idle.
export function next(state: SessionState, event: SessionEvent): SessionState {
  if (event === 'kill') return 'idle';
  if (event === 'fail') return 'error';
  return T[state][event] ?? state; // unknown event: stay where we are
}
