export type KillView = { visible: boolean; kill: boolean; unavailable: boolean; saving: boolean; epoch: number };

const unavailableView = (): KillView => ({ visible: true, kill: true, unavailable: true, saving: false, epoch: -1 });

/** Missing identity means hide the control; any uncertain safety state is visible and treated as ON. */
export function parseKillRead(status: number, body: unknown): KillView | null {
  if (status === 401 || status === 403 || status === 404) return null;
  if (status < 200 || status >= 300 || !body || typeof body !== 'object') return unavailableView();
  const data = (body as { ok?: unknown; data?: unknown }).data as { kill?: unknown; epoch?: unknown } | undefined;
  if ((body as { ok?: unknown }).ok !== true || typeof data?.kill !== 'boolean' || !Number.isInteger(data.epoch) || (data.epoch as number) < 0) return unavailableView();
  return { visible: true, kill: data.kill, unavailable: false, saving: false, epoch: data.epoch as number };
}

/** A failed or unverifiable write must never render the switch as OFF. */
export function parseKillWrite(status: number, body: unknown): KillView {
  if (status < 200 || status >= 300 || !body || typeof body !== 'object') return unavailableView();
  const data = (body as { ok?: unknown; data?: unknown }).data as { kill?: unknown; epoch?: unknown } | undefined;
  if ((body as { ok?: unknown }).ok !== true || typeof data?.kill !== 'boolean' || !Number.isInteger(data.epoch) || (data.epoch as number) < 0) return unavailableView();
  return { visible: true, kill: data.kill, unavailable: false, saving: false, epoch: data.epoch as number };
}

export function canToggleKill(view: KillView): boolean {
  return view.visible && !view.unavailable && !view.saving;
}

export function killButtonLabel(view: KillView): string {
  return view.unavailable ? 'Safety unavailable — treated as ON' : view.kill ? 'Turn kill switch OFF' : 'Turn kill switch ON';
}
