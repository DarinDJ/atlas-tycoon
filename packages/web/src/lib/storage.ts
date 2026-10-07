/** Safe localStorage helpers (private mode, quota, SSR). */
export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function randomId(len = 24): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

/** Stable guest identity. */
export function getClientId(): string {
  let id = readJson<string | null>('bt.clientId', null);
  if (!id) {
    id = randomId();
    writeJson('bt.clientId', id);
  }
  return id;
}

export interface Profile {
  name: string;
  avatar: string;
  token: string;
}

export function getProfile(): Profile {
  return readJson<Profile>('bt.profile', { name: '', avatar: 'tiger', token: 'auto' });
}

export function saveProfile(p: Profile): void {
  writeJson('bt.profile', p);
}
