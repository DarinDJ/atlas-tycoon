import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { GameSnapshot, RoomView, AckResult, ChatMessage } from '../src/protocol.js';
import { startServer, type RunningServer } from '../src/index.js';

let server: RunningServer;
let url: string;

function client(clientId: string): Socket {
  return connect(url, { auth: { clientId }, transports: ['websocket'], forceNew: true });
}

function ack<T>(socket: Socket, event: string, payload?: unknown): Promise<AckResult<T>> {
  return new Promise((resolve) => {
    if (payload === undefined) socket.emit(event, (r: AckResult<T>) => resolve(r));
    else socket.emit(event, payload, (r: AckResult<T>) => resolve(r));
  });
}

function once<T>(socket: Socket, event: string, pred?: (v: T) => boolean, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timeout waiting for ${event}`));
    }, timeoutMs);
    const handler = (v: T) => {
      if (pred && !pred(v)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(v);
    };
    socket.on(event, handler);
  });
}

const profile = (name: string) => ({ name, avatar: 'tiger', token: 'auto' });

beforeAll(async () => {
  server = await startServer({
    port: 0,
    dbPath: ':memory:',
    botDelayMs: 5,
    isTest: true,
    reconnectGraceSeconds: 1,
    afkTimeoutsBeforeBot: 2,
  });
  url = `http://127.0.0.1:${server.port}`;
});

afterAll(async () => {
  await server.close();
});

describe('http api', () => {
  it('serves health, maps and config', async () => {
    const health = (await (await fetch(`${url}/api/health`)).json()) as { ok: boolean };
    expect(health.ok).toBe(true);
    const maps = (await (await fetch(`${url}/api/maps`)).json()) as { id: string }[];
    expect(maps.some((m) => m.id === 'india-cities')).toBe(true);
    const full = (await (await fetch(`${url}/api/maps/india-cities`)).json()) as { tiles: unknown[] };
    expect(full.tiles).toHaveLength(40);
    expect((await fetch(`${url}/api/maps/nope`)).status).toBe(404);
  });
  it('runs the dev store flow and grants entitlements', async () => {
    const clientId = 'client_store_1';
    const products = (await (await fetch(`${url}/api/store/products`)).json()) as {
      products: { sku: string }[];
      providers: string[];
    };
    expect(products.providers).toContain('dev');
    const session = (await (
      await fetch(`${url}/api/store/checkout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sku: 'map-usa', provider: 'dev', clientId }),
      })
    ).json()) as { url: string };
    expect(session.url).toContain('/api/store/dev-complete');
    const done = await fetch(`${url}${session.url}`, { redirect: 'manual' });
    expect(done.status).toBe(302);
    const me = (await (await fetch(`${url}/api/me`, { headers: { 'x-client-id': clientId } })).json()) as {
      entitlements: string[];
    };
    expect(me.entitlements).toContain('usa-cities');
  });
  it('validates maps for the editor', async () => {
    const res = (await (
      await fetch(`${url}/api/editor/validate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ schema: 1 }),
      })
    ).json()) as { ok: boolean; issues: unknown[] };
    expect(res.ok).toBe(false);
    expect(res.issues.length).toBeGreaterThan(0);
  });
});

describe('rooms over sockets', () => {
  it('rejects connections without a client id', async () => {
    const s = connect(url, { auth: {}, transports: ['websocket'], forceNew: true });
    const err = await new Promise<Error>((resolve) => s.on('connect_error', resolve));
    expect(err.message).toBe('BAD_CLIENT_ID');
    s.close();
  });

  it('creates a room, joins, starts and plays a turn', async () => {
    const a = client('client_aaaaaaaa');
    const b = client('client_bbbbbbbb');
    const created = await ack<{ code: string; playerId: string }>(a, 'room:create', {
      ...profile('Asha'),
      mapId: 'india-cities',
      rules: { randomizeTurnOrder: false, turnTimerSeconds: 0 },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error('create failed');
    const code = created.data.code;
    expect(code).toMatch(/^[A-Z0-9]{5}$/);

    const twoSeats = once<RoomView>(a, 'room:state', (v) => v.seats.length === 2);
    const joined = await ack<{ code: string; playerId: string }>(b, 'room:join', {
      ...profile('Bala'),
      code: code.toLowerCase(),
    });
    expect(joined.ok).toBe(true);
    if (!joined.ok) throw new Error('join failed');

    const view = await twoSeats;
    expect(view.seats.map((s) => s.name)).toEqual(['Asha', 'Bala']);
    expect(view.hostId).toBe(created.data.playerId);

    // Non-host cannot start.
    const notHost = await ack<null>(b, 'room:start');
    expect(notHost.ok).toBe(false);
    if (!notHost.ok) expect(notHost.code).toBe('NOT_HOST');

    const statePromise = once<GameSnapshot>(a, 'game:state');
    const started = await ack<null>(a, 'room:start');
    expect(started.ok).toBe(true);
    const snap = await statePromise;
    expect(snap.state.players).toHaveLength(2);
    expect(snap.legal?.roll).toBe(true);

    // Wrong player cannot roll.
    const bad = await ack<null>(b, 'game:action', { type: 'roll' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe('NOT_YOUR_TURN');

    // Garbage is rejected by validation.
    const invalid = await ack<null>(a, 'game:action', { type: 'bid', amount: 'lots' });
    expect(invalid.ok).toBe(false);

    const rolled = once<{ events: { type: string }[] }>(b, 'game:events', (p) =>
      p.events.some((e) => e.type === 'rolled'),
    );
    const roll = await ack<null>(a, 'game:action', { type: 'roll' });
    expect(roll.ok).toBe(true);
    const ev = await rolled;
    expect(ev.events.some((e) => e.type === 'moved')).toBe(true);

    // Chat is delivered and censored.
    const chat = once<ChatMessage>(b, 'chat:message', (m) => m.name === 'Asha');
    await ack<null>(a, 'chat:send', { text: 'hello you shit' });
    expect((await chat).text).toBe('hello you ****');

    // Reconnect with the same client id lands in the same seat.
    a.close();
    const a2 = client('client_aaaaaaaa');
    const snap2Promise = once<GameSnapshot>(a2, 'game:state');
    const re = await ack<{ code: string; playerId: string }>(a2, 'room:join', { ...profile('Asha'), code });
    expect(re.ok).toBe(true);
    if (re.ok) expect(re.data.playerId).toBe(created.data.playerId);
    const snap2 = await snap2Promise;
    expect(snap2.state.players.find((p) => p.id === created.data.playerId)?.connected).toBe(true);
    a2.close();
    b.close();
  });

  it('plays a full game with bots after the human resigns, and records results', async () => {
    const a = client('client_cccccccc');
    const created = await ack<{ code: string; playerId: string }>(a, 'room:create', {
      ...profile('Chitra'),
      mapId: 'india-cities',
      rules: { turnTimerSeconds: 0, isPrivate: true },
    });
    if (!created.ok) throw new Error('create failed');
    const fourSeats = once<RoomView>(a, 'room:state', (v) => v.seats.length === 4);
    for (const level of ['easy', 'medium', 'hard'] as const) {
      const r = await ack<null>(a, 'room:addBot', { level });
      expect(r.ok).toBe(true);
    }
    const view = await fourSeats;
    expect(view.seats.filter((s) => s.isBot)).toHaveLength(3);
    const ended = once<RoomView>(a, 'room:state', (v) => v.status === 'ended', 60_000);
    await ack<null>(a, 'room:start');
    const resign = await ack<null>(a, 'game:action', { type: 'resign' });
    expect(resign.ok).toBe(true);
    const finalView = await ended;
    expect(finalView.status).toBe('ended');
    const room = server.manager.get(created.data.code)!;
    expect(room.game?.winner).toBeTruthy();
    expect(room.results()[0]?.rank).toBe(1);
    const lb = (await (await fetch(`${url}/api/leaderboard`)).json()) as { name: string; games: number }[];
    expect(lb.some((r) => r.name === 'Chitra')).toBe(true);
    // Back to lobby for another round.
    const again = await ack<null>(a, 'room:newGame');
    expect(again.ok).toBe(true);
    expect(server.manager.get(created.data.code)!.status).toBe('lobby');
    expect(server.manager.get(created.data.code)!.seats.length).toBe(4);
    a.close();
  }, 70_000);

  it('auto-acts on turn timer and hands an AFK seat to a bot', async () => {
    const a = client('client_dddddddd');
    const b = client('client_eeeeeeee');
    const created = await ack<{ code: string; playerId: string }>(a, 'room:create', {
      ...profile('Dev'),
      mapId: 'india-cities',
      rules: { randomizeTurnOrder: false, turnTimerSeconds: 1, isPrivate: true },
    });
    if (!created.ok) throw new Error('create failed');
    const joined = await ack<{ code: string; playerId: string }>(b, 'room:join', {
      ...profile('Esha'),
      code: created.data.code,
    });
    if (!joined.ok) throw new Error('join failed');
    const playing = once<RoomView>(a, 'room:state', (v) => v.status === 'playing');
    // Dev never acts: after 2 timeouts the seat becomes a bot.
    const botted = once<{ events: { type: string; playerId?: string }[] }>(
      b,
      'game:events',
      (p) => p.events.some((e) => e.type === 'replacedByBot'),
      15_000,
    );
    await ack<null>(a, 'room:start');
    const view = await playing;
    expect(view.deadline).not.toBeNull();
    expect(
      (await botted).events.some((e) => e.type === 'replacedByBot' && e.playerId === created.data.playerId),
    ).toBe(true);
    // Dev comes back and acts: the seat is restored.
    const room = server.manager.get(created.data.code)!;
    const seat = room.seatOf(created.data.playerId)!;
    expect(seat.autoBot).toBe(true);
    await ack<null>(a, 'room:sync');
    // Any action (even an illegal one) reclaims the seat.
    await ack<null>(a, 'game:action', { type: 'endTurn' });
    expect(seat.autoBot).toBe(false);
    expect(seat.isBot).toBe(false);
    a.close();
    b.close();
  }, 30_000);

  it('lists public rooms and quick-matches into them', async () => {
    const host = client('client_ffffffff');
    const created = await ack<{ code: string }>(host, 'room:create', {
      ...profile('Farah'),
      mapId: 'india-cities',
      rules: { isPrivate: false },
    });
    if (!created.ok) throw new Error('create failed');
    const list = (await (await fetch(`${url}/api/rooms`)).json()) as { code: string }[];
    expect(list.some((r) => r.code === created.data.code)).toBe(true);
    const guest = client('client_gggggggg');
    const qm = await ack<{ code: string }>(guest, 'room:quickmatch', profile('Gopal'));
    expect(qm.ok).toBe(true);
    if (qm.ok) expect(qm.data.code).toBe(created.data.code);
    const priv = client('client_hhhhhhhh');
    const p = await ack<{ code: string }>(priv, 'room:create', {
      ...profile('Hari'),
      mapId: 'india-cities',
      rules: { isPrivate: true },
    });
    if (!p.ok) throw new Error('create failed');
    const list2 = (await (await fetch(`${url}/api/rooms`)).json()) as { code: string }[];
    expect(list2.some((r) => r.code === p.data.code)).toBe(false);
    host.close();
    guest.close();
    priv.close();
  });

  it('blocks premium maps for guests without entitlement', async () => {
    const s = client('client_iiiiiiii');
    const r = await ack<{ code: string }>(s, 'room:create', { ...profile('Ira'), mapId: 'usa-cities' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MAP_LOCKED');
    s.close();
  });
});
