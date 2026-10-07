import type { GameEvent } from '@bt/engine';
import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import type { Config } from './config.js';
import {
  addBotSchema,
  chatSchema,
  clientActionSchema,
  createRoomSchema,
  emoteSchema,
  joinRoomSchema,
  playerTargetSchema,
  quickMatchSchema,
  rulesSchema,
  type AckResult,
  type ChatMessage,
  type ClientToServer,
  type ServerToClient,
} from './protocol.js';
import type { Broadcaster, RoomManager } from './rooms/manager.js';
import type { Room } from './rooms/room.js';
import { containsProfanity, sanitizeName } from './security/profanity.js';
import { RateLimiter } from './security/rateLimit.js';

type Sock = Socket<ClientToServer, ServerToClient, Record<string, never>, SocketData>;
interface SocketData {
  clientId: string;
  roomCode: string | null;
  playerId: string | null;
  lobbySubscribed: boolean;
}

const EMOTES = new Set([
  '👍',
  '😂',
  '😭',
  '🔥',
  '🙏',
  '😱',
  '🤝',
  '💸',
  '🎉',
  '😈',
  'gg',
  'nice',
  'oops',
  'hurry',
  'trade?',
  'no',
]);

const ERRORS: Record<string, string> = {
  NO_ROOM: 'Room not found',
  ROOM_FULL: 'Room is full',
  GAME_IN_PROGRESS: 'The game has already started',
  NEED_PLAYERS: 'Need at least 2 players',
  NOT_HOST: 'Only the host can do that',
  NOT_YOUR_TURN: 'Not your turn',
  BAD_PHASE: 'You cannot do that right now',
  NO_CASH: 'Not enough cash',
  MAP_LOCKED: 'This map is a premium map pack',
  RATE_LIMIT: 'Slow down',
  INVALID: 'Invalid request',
  SERVER_FULL: 'Server is full, try again later',
  NOT_SEATED: 'You are spectating',
  IS_BOT: 'That seat is played by a bot',
};

function fail(code: string, message?: string): AckResult<never> {
  return { ok: false, code, message: message ?? ERRORS[code] ?? code };
}

export function attachSockets(
  io: Server<ClientToServer, ServerToClient>,
  manager: RoomManager,
  config: Config,
): void {
  const roomSockets = new Map<string, Set<Sock>>();
  const lobbySubscribers = new Set<Sock>();
  const actionLimiter = new RateLimiter(10, 20);
  const chatLimiter = new RateLimiter(1, 4);
  const connectLimiter = new RateLimiter(config.connectRatePerIp, config.connectRatePerIp * 5);
  const generalLimiter = new RateLimiter(20, 40);
  setInterval(() => {
    actionLimiter.sweep();
    chatLimiter.sweep();
    connectLimiter.sweep();
    generalLimiter.sweep();
  }, 60_000).unref();

  const socketsIn = (code: string): Set<Sock> => roomSockets.get(code) ?? new Set();

  const broadcaster: Broadcaster = {
    roomChanged(room: Room) {
      const view = room.view();
      for (const s of socketsIn(room.code)) s.emit('room:state', view);
    },
    gameChanged(room: Room, events: GameEvent[]) {
      if (!room.game) return;
      for (const s of socketsIn(room.code)) {
        const snap = room.snapshotFor(s.data.playerId);
        if (snap) {
          s.emit('game:state', snap);
          if (events.length) s.emit('game:events', { seq: room.game.seq, events });
        }
      }
    },
    chat(room: Room, msg: ChatMessage) {
      for (const s of socketsIn(room.code)) {
        if (msg.playerId && s.data.playerId && room.mutes.get(s.data.playerId)?.has(msg.playerId)) continue;
        s.emit('chat:message', msg);
      }
    },
    gameOver() {},
    lobbyChanged() {
      if (lobbySubscribers.size === 0) return;
      const list = manager.publicRooms();
      for (const s of lobbySubscribers) s.emit('lobby:list', list);
    },
  };
  manager.broadcaster = broadcaster;

  io.use((socket, next) => {
    const auth = socket.handshake.auth as { clientId?: unknown };
    const parsed = z
      .string()
      .min(8)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/)
      .safeParse(auth.clientId);
    if (!parsed.success) return next(new Error('BAD_CLIENT_ID'));
    const ip = socket.handshake.address ?? 'unknown';
    if (!connectLimiter.take(ip)) return next(new Error('RATE_LIMIT'));
    socket.data.clientId = parsed.data;
    socket.data.roomCode = null;
    socket.data.playerId = null;
    socket.data.lobbySubscribed = false;
    next();
  });

  io.on('connection', (socket: Sock) => {
    const sid = socket.id;

    const enterRoom = (room: Room, playerId: string | null) => {
      leaveCurrent(false);
      socket.data.roomCode = room.code;
      socket.data.playerId = playerId;
      if (!roomSockets.has(room.code)) roomSockets.set(room.code, new Set());
      roomSockets.get(room.code)!.add(socket);
      socket.emit('room:state', room.view());
      const snap = room.snapshotFor(playerId);
      if (snap) socket.emit('game:state', snap);
      for (const msg of room.chat.slice(-30)) socket.emit('chat:message', msg);
      broadcaster.roomChanged(room);
    };

    const leaveCurrent = (notify: boolean) => {
      const code = socket.data.roomCode;
      if (!code) return;
      roomSockets.get(code)?.delete(socket);
      if (roomSockets.get(code)?.size === 0) roomSockets.delete(code);
      // Only mark the player disconnected if no other socket of theirs is still in the room.
      const stillThere = [...socketsIn(code)].some((s) => s.data.clientId === socket.data.clientId);
      if (!stillThere) {
        if (notify) manager.leave(code, socket.data.clientId);
        else manager.disconnect(code, socket.data.clientId);
      }
      socket.data.roomCode = null;
      socket.data.playerId = null;
    };

    const guard = <T>(fn: () => T): AckResult<T> => {
      try {
        return { ok: true, data: fn() };
      } catch (err) {
        if (typeof err === 'string') return fail(err);
        console.error('[socket] unexpected', err);
        return fail('INTERNAL', 'Something went wrong');
      }
    };

    const limited = (limiter: RateLimiter, key = sid): boolean => {
      if (limiter.take(key)) return false;
      socket.emit('room:error', { code: 'RATE_LIMIT', message: ERRORS.RATE_LIMIT! });
      return true;
    };

    socket.on('room:create', (payload, ack) => {
      if (limited(generalLimiter)) return ack(fail('RATE_LIMIT'));
      const p = createRoomSchema.safeParse(payload);
      if (!p.success) return ack(fail('INVALID', p.error.issues[0]?.message));
      const rules = p.data.rules ? rulesSchema.parse(p.data.rules) : {};
      const res = guard(() =>
        manager.create(
          socket.data.clientId,
          sanitizeName(p.data.name),
          p.data.avatar,
          p.data.token,
          p.data.mapId,
          rules,
        ),
      );
      if (!res.ok) return ack(res);
      enterRoom(res.data.room, res.data.seat.playerId);
      ack({ ok: true, data: { code: res.data.room.code, playerId: res.data.seat.playerId } });
    });

    socket.on('room:join', (payload, ack) => {
      if (limited(generalLimiter)) return ack(fail('RATE_LIMIT'));
      const p = joinRoomSchema.safeParse(payload);
      if (!p.success) return ack(fail('INVALID', p.error.issues[0]?.message));
      const res = guard(() =>
        manager.join(
          p.data.code,
          socket.data.clientId,
          sanitizeName(p.data.name),
          p.data.avatar,
          p.data.token,
        ),
      );
      if (!res.ok) return ack(res);
      enterRoom(res.data.room, res.data.seat?.playerId ?? null);
      ack({ ok: true, data: { code: res.data.room.code, playerId: res.data.seat?.playerId ?? '' } });
    });

    socket.on('room:quickmatch', (payload, ack) => {
      if (limited(generalLimiter)) return ack(fail('RATE_LIMIT'));
      const p = quickMatchSchema.safeParse(payload);
      if (!p.success) return ack(fail('INVALID'));
      const res = guard(() =>
        manager.quickMatch(
          socket.data.clientId,
          sanitizeName(p.data.name),
          p.data.avatar,
          p.data.token,
          p.data.mapId,
        ),
      );
      if (!res.ok) return ack(res);
      enterRoom(res.data.room, res.data.seat?.playerId ?? null);
      ack({ ok: true, data: { code: res.data.room.code, playerId: res.data.seat?.playerId ?? '' } });
    });

    socket.on('room:leave', (ack) => {
      leaveCurrent(true);
      socket.emit('room:left');
      ack?.({ ok: true, data: null });
    });

    socket.on('room:sync', (ack) => {
      const room = socket.data.roomCode ? manager.get(socket.data.roomCode) : undefined;
      if (!room) return ack?.(fail('NO_ROOM'));
      socket.emit('room:state', room.view());
      const snap = room.snapshotFor(socket.data.playerId);
      if (snap) socket.emit('game:state', snap);
      ack?.({ ok: true, data: null });
    });

    const withRoom = (
      ack: ((r: AckResult<null>) => void) | undefined,
      fn: (room: Room, playerId: string) => void,
      hostOnly = false,
    ) => {
      if (limited(generalLimiter)) return ack?.(fail('RATE_LIMIT'));
      const room = socket.data.roomCode ? manager.get(socket.data.roomCode) : undefined;
      if (!room) return ack?.(fail('NO_ROOM'));
      const playerId = socket.data.playerId;
      if (!playerId) return ack?.(fail('NOT_SEATED'));
      if (hostOnly && room.hostId !== playerId) return ack?.(fail('NOT_HOST'));
      const res = guard(() => fn(room, playerId));
      if (res.ok) {
        broadcaster.roomChanged(room);
        broadcaster.lobbyChanged();
      }
      ack?.(res.ok ? { ok: true, data: null } : res);
    };

    socket.on('room:settings', (payload, ack) => {
      const p = rulesSchema.safeParse(payload);
      if (!p.success) return ack?.(fail('INVALID', p.error.issues[0]?.message));
      withRoom(ack, (room) => room.updateRules(p.data), true);
    });

    socket.on('room:addBot', (payload, ack) => {
      const p = addBotSchema.safeParse(payload);
      if (!p.success) return ack?.(fail('INVALID'));
      withRoom(ack, (room) => void room.addBot(p.data.level), true);
    });

    socket.on('room:removeBot', (payload, ack) => {
      const p = playerTargetSchema.safeParse(payload);
      if (!p.success) return ack?.(fail('INVALID'));
      withRoom(
        ack,
        (room) => {
          const seat = room.seatOf(p.data.playerId);
          if (!seat?.isBot) throw 'BAD_TARGET';
          room.removeSeat(seat.playerId);
        },
        true,
      );
    });

    socket.on('room:kick', (payload, ack) => {
      const p = playerTargetSchema.safeParse(payload);
      if (!p.success) return ack?.(fail('INVALID'));
      withRoom(
        ack,
        (room, me) => {
          if (p.data.playerId === me) throw 'BAD_TARGET';
          const seat = room.seatOf(p.data.playerId);
          if (!seat) throw 'BAD_TARGET';
          room.removeSeat(seat.playerId);
          for (const s of socketsIn(room.code)) {
            if (s.data.playerId === seat.playerId) {
              s.data.playerId = null;
              s.emit('room:left');
              roomSockets.get(room.code)?.delete(s);
              s.data.roomCode = null;
            }
          }
        },
        true,
      );
    });

    socket.on('room:voteKick', (payload, ack) => {
      const p = playerTargetSchema.safeParse(payload);
      if (!p.success) return ack?.(fail('INVALID'));
      withRoom(ack, (room, me) => {
        const r = room.voteKick(me, p.data.playerId);
        if (!r.kicked)
          room.systemChat(
            `Vote to replace ${room.seatOf(p.data.playerId)?.name ?? '?'} with a bot: ${r.votes}/${r.needed}`,
          );
      });
    });

    socket.on('room:start', (ack) => withRoom(ack, (room) => room.start(), true));
    socket.on('room:newGame', (ack) => withRoom(ack, (room) => room.newGame(), true));

    socket.on('game:action', (payload, ack) => {
      if (limited(actionLimiter)) return ack?.(fail('RATE_LIMIT'));
      const p = clientActionSchema.safeParse(payload);
      if (!p.success) return ack?.(fail('INVALID', p.error.issues[0]?.message));
      const room = socket.data.roomCode ? manager.get(socket.data.roomCode) : undefined;
      if (!room) return ack?.(fail('NO_ROOM'));
      const playerId = socket.data.playerId;
      if (!playerId) return ack?.(fail('NOT_SEATED'));
      const err = room.dispatch(playerId, p.data);
      if (err) {
        socket.emit('room:error', { code: err, message: ERRORS[err] ?? err });
        return ack?.(fail(err));
      }
      ack?.({ ok: true, data: null });
    });

    socket.on('chat:send', (payload, ack) => {
      if (limited(chatLimiter)) return ack?.(fail('RATE_LIMIT'));
      const p = chatSchema.safeParse(payload);
      if (!p.success) return ack?.(fail('INVALID'));
      const room = socket.data.roomCode ? manager.get(socket.data.roomCode) : undefined;
      if (!room) return ack?.(fail('NO_ROOM'));
      const seat = socket.data.playerId ? room.seatOf(socket.data.playerId) : undefined;
      room.sendChat(seat?.playerId ?? null, seat?.name ?? 'spectator', p.data.text);
      ack?.({ ok: true, data: null });
    });

    socket.on('chat:emote', (payload, ack) => {
      if (limited(chatLimiter)) return ack?.(fail('RATE_LIMIT'));
      const p = emoteSchema.safeParse(payload);
      if (!p.success || !EMOTES.has(p.data.emote)) return ack?.(fail('INVALID'));
      const room = socket.data.roomCode ? manager.get(socket.data.roomCode) : undefined;
      if (!room) return ack?.(fail('NO_ROOM'));
      const seat = socket.data.playerId ? room.seatOf(socket.data.playerId) : undefined;
      if (!seat) return ack?.(fail('NOT_SEATED'));
      room.sendChat(seat.playerId, seat.name, p.data.emote, p.data.emote);
      ack?.({ ok: true, data: null });
    });

    socket.on('chat:mute', (payload, ack) => {
      const p = playerTargetSchema.safeParse(payload);
      if (!p.success) return ack?.(fail('INVALID'));
      withRoom(ack, (room, me) => {
        if (!room.mutes.has(me)) room.mutes.set(me, new Set());
        const set = room.mutes.get(me)!;
        if (set.has(p.data.playerId)) set.delete(p.data.playerId);
        else set.add(p.data.playerId);
      });
    });

    socket.on('chat:report', (payload, ack) => {
      const p = playerTargetSchema.safeParse(payload);
      if (!p.success) return ack?.(fail('INVALID'));
      withRoom(ack, (room, me) => {
        const target = room.seatOf(p.data.playerId);
        const recent = room.chat.filter((m) => m.playerId === p.data.playerId).slice(-5);
        console.warn('[report]', {
          room: room.code,
          by: me,
          target: target?.name,
          flagged: recent.some((m) => containsProfanity(m.text)),
          recent: recent.map((m) => m.text),
        });
      });
    });

    socket.on('lobby:subscribe', () => {
      lobbySubscribers.add(socket);
      socket.data.lobbySubscribed = true;
      socket.emit('lobby:list', manager.publicRooms());
    });
    socket.on('lobby:unsubscribe', () => {
      lobbySubscribers.delete(socket);
      socket.data.lobbySubscribed = false;
    });

    socket.on('disconnect', () => {
      lobbySubscribers.delete(socket);
      leaveCurrent(false);
      actionLimiter.forget(sid);
      chatLimiter.forget(sid);
      generalLimiter.forget(sid);
    });
  });
}
