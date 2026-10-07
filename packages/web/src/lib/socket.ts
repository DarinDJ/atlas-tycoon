import { io, type Socket } from 'socket.io-client';
import { getClientId } from './storage';

export type AckResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

let socket: Socket | null = null;

/** Lazily connected singleton. Same-origin in production; Vite proxies /socket.io in dev. */
export function getSocket(): Socket {
  if (socket) return socket;
  socket = io(import.meta.env.VITE_API_URL ?? '/', {
    auth: { clientId: getClientId() },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
    autoConnect: true,
  });
  return socket;
}

/** Emit with an acknowledgement, resolving to the server's AckResult. */
export function request<T>(event: string, payload?: unknown, timeoutMs = 10_000): Promise<AckResult<T>> {
  const s = getSocket();
  return new Promise((resolve) => {
    const timer = setTimeout(
      () => resolve({ ok: false, code: 'TIMEOUT', message: 'Server did not respond' }),
      timeoutMs,
    );
    const cb = (res: AckResult<T>) => {
      clearTimeout(timer);
      resolve(res);
    };
    if (payload === undefined) s.emit(event, cb);
    else s.emit(event, payload, cb);
  });
}
