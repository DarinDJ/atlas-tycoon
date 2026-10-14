/**
 * Load test: spins up N rooms of bot-filled games driven by one human socket each, measures
 * event throughput, CPU-ish latency (time from action ack to state broadcast) and memory.
 *
 *   npm run loadtest -w @bt/server -- --rooms 200 --url http://localhost:3001 --seconds 60
 */
import { io } from 'socket.io-client';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a.startsWith('--'))
    args.set(
      a.slice(2),
      process.argv[i + 1] && !process.argv[i + 1]!.startsWith('--') ? process.argv[++i]! : 'true',
    );
}
const rooms = Number(args.get('rooms') ?? 100);
const url = args.get('url') ?? 'http://localhost:3001';
const seconds = Number(args.get('seconds') ?? 60);

let states = 0;
let events = 0;
let errors = 0;
let ended = 0;
const latencies: number[] = [];

function ack<T>(
  socket: ReturnType<typeof io>,
  event: string,
  payload?: unknown,
): Promise<{ ok: boolean; data?: T; code?: string }> {
  return new Promise((resolve) =>
    payload === undefined ? socket.emit(event, resolve) : socket.emit(event, payload, resolve),
  );
}

async function spawn(i: number): Promise<void> {
  const socket = io(url, { auth: { clientId: `load_${i}_${Date.now()}` }, transports: ['websocket'] });
  await new Promise<void>((r) => socket.on('connect', () => r()));
  const created = await ack<{ code: string }>(socket, 'room:create', {
    name: `Load${i}`,
    avatar: 'tiger',
    token: 'auto',
    mapId: 'world-cities',
    rules: { isPrivate: true, fillWithBots: 'medium', maxPlayers: 4, turnTimerSeconds: 5 },
  });
  if (!created.ok) {
    errors++;
    return;
  }
  socket.on('game:state', () => states++);
  socket.on('game:events', (p: { events: unknown[] }) => (events += p.events.length));
  socket.on('room:state', (v: { status: string }) => {
    if (v.status === 'ended') ended++;
  });
  socket.on('room:error', (e: { code: string }) => {
    if (e.code !== 'BAD_PHASE' && e.code !== 'NOT_YOUR_TURN') errors++;
  });
  await ack(socket, 'room:start');
  // The human just lets the timer auto-act; occasionally measure action latency with an endTurn attempt.
  setInterval(() => {
    const t0 = performance.now();
    void ack(socket, 'game:action', { type: 'endTurn' }).then(() => latencies.push(performance.now() - t0));
  }, 3000);
}

const t0 = Date.now();
console.log(`Spawning ${rooms} rooms against ${url}…`);
for (let i = 0; i < rooms; i++) {
  void spawn(i);
  if (i % 25 === 24) await new Promise((r) => setTimeout(r, 250));
}
setInterval(async () => {
  const health = (await (await fetch(`${url}/api/health`)).json()) as { rooms: number; playing: number };
  const mem = process.memoryUsage().rss / 1e6;
  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] ?? 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
  console.log(
    `${((Date.now() - t0) / 1000).toFixed(0)}s rooms=${health.rooms} playing=${health.playing} ended=${ended} states=${states} events=${events} errors=${errors} ack p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms clientRSS=${mem.toFixed(0)}MB`,
  );
  if (Date.now() - t0 > seconds * 1000) process.exit(0);
}, 5000);
