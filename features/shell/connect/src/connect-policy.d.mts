export type ConnectedDevice = { id: string; name: string; kind: string; pairedAt: string | null; lastSeenAt: string | null; online: boolean };
export function projectDevice(row: unknown, nowMs?: number): ConnectedDevice | null;
export function profileStatus(user: unknown, devices?: ConnectedDevice[]): { email: string | null; deviceCount: number; onlineCount: number; status: string };
