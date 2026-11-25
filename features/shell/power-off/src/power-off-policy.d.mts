export type PowerState = { status: 'on' | 'off' | 'blocked'; poweredOff: boolean; unavailable: boolean; epoch?: number; message: string };
export function failClosedPowerState(): PowerState;
export function powerStateFromRead(status: number, body: unknown): PowerState;
export function powerOffPayload(): Readonly<{ kill: true; reason: 'owner_power_off' }>;
export function powerStateAfterWrite(status: number, body: unknown): PowerState;
export function mayShowApplication(state: PowerState | null): boolean;
