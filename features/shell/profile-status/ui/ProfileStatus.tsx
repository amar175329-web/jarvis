import { projectProfileStatus } from '../src/profile-policy.mjs';
import './profile-status.css';
type Props = { user: { email?: string } | null; devices?: { online: boolean }[]; onOpenConnect?: () => void };
export function ProfileStatus({ user, devices = [], onOpenConnect }: Props) {
  const status = projectProfileStatus(user, devices);
  return <section className="card jarvis-profile-status"><div className="jarvis-profile-status__avatar" aria-hidden="true">{status.email?.slice(0,1).toUpperCase() ?? '?'}</div><div className="jarvis-profile-status__body"><b>{status.email ?? 'Owner session unavailable'}</b><small>Personal workspace · {status.session}</small><small>{status.devicesOnline} of {status.devices} devices online</small></div>{onOpenConnect && <button type="button" onClick={onOpenConnect}>Devices</button>}</section>;
}
