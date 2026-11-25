export function failClosedPowerState() { return { status: 'blocked', poweredOff: true, unavailable: true, message: 'Safety state unavailable; actions are blocked.' }; }
export function powerStateFromRead(status, body) {
  if (status < 200 || status >= 300 || !body || body.ok !== true || typeof body.data?.kill !== 'boolean' || !Number.isInteger(body.data?.epoch) || body.data.epoch < 0) return failClosedPowerState();
  return body.data.kill
    ? { status: 'off', poweredOff: true, unavailable: false, epoch: body.data.epoch, message: 'JARVIS is powered off.' }
    : { status: 'on', poweredOff: false, unavailable: false, epoch: body.data.epoch, message: 'JARVIS is ready.' };
}
/** Deliberately one-way: this feature has no function or payload to switch kill=false. */
export function powerOffPayload() { return Object.freeze({ kill: true, confirm: true, reason: 'owner_power_off' }); }
export function powerStateAfterWrite(status, body) {
  const state = powerStateFromRead(status, body);
  if (state.status === 'off') return state;
  return failClosedPowerState();
}
export function mayShowApplication(state) { return state?.status === 'on' && state.poweredOff === false && state.unavailable === false; }
