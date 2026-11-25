export function projectProfileStatus(user, devices = []) {
  const email = typeof user?.email === 'string' && user.email.length <= 180 ? user.email.trim() : null;
  const list = Array.isArray(devices) ? devices.filter((device) => device && typeof device.online === 'boolean') : [];
  return { email, session: email ? 'Active' : 'Unavailable', devices: list.length, devicesOnline: list.filter((device) => device.online).length };
}
