import type { GameEvent, HouseRules } from '@bt/engine';
import { getMap, listMaps, DEFAULT_MAP_ID } from '@bt/maps';
import { customAlphabet } from 'nanoid';
import type { AnalyticsAdapter } from '../analytics.js';
import type { Config } from '../config.js';
import type { Store } from '../payments/index.js';
import type { ChatMessage, PublicRoomSummary } from '../protocol.js';
import type { Storage } from '../storage/db.js';
import { Room, type RoomSnapshot, type Seat } from './room.js';

const codeGen = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 5);

/** How the manager pushes changes to connected clients. Implemented by the socket layer. */
export interface Broadcaster {
  roomChanged(room: Room): void;
  gameChanged(room: Room, events: GameEvent[]): void;
  chat(room: Room, msg: ChatMessage): void;
  gameOver(room: Room): void;
  lobbyChanged(): void;
}

export class RoomManager {
  readonly rooms = new Map<string, Room>();
  private persistTimers = new Map<string, NodeJS.Timeout>();
  private sweepTimer: NodeJS.Timeout | null = null;
  broadcaster: Broadcaster = {
    roomChanged: () => {},
    gameChanged: () => {},
    chat: () => {},
    gameOver: () => {},
    lobbyChanged: () => {},
  };

  constructor(
    private storage: Storage,
    private analytics: AnalyticsAdapter,
    private store: Store,
    private config: Config,
  ) {}

  startSweeper(): void {
    this.sweepTimer = setInterval(() => this.sweep(), 60_000);
  }

  stop(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    for (const t of this.persistTimers.values()) clearTimeout(t);
    for (const r of this.rooms.values()) r.destroy();
  }

  private callbacks() {
    return {
      onRoomChanged: (room: Room) => {
        this.broadcaster.roomChanged(room);
        this.broadcaster.lobbyChanged();
      },
      onGameChanged: (room: Room, events: GameEvent[]) => {
        this.broadcaster.gameChanged(room, events);
        for (const ev of events)
          if (ev.type === 'tradeAccepted') this.analytics.track('trade_completed', { room: room.code });
      },
      onChat: (room: Room, msg: ChatMessage) => this.broadcaster.chat(room, msg),
      onGameOver: (room: Room) => this.onGameOver(room),
      onPersist: (room: Room) => this.schedulePersist(room),
    };
  }

  private roomOptions() {
    return {
      botDelayMs: this.config.botDelayMs,
      afkTimeoutsBeforeBot: this.config.afkTimeoutsBeforeBot,
      reconnectGraceSeconds: this.config.reconnectGraceSeconds,
    };
  }

  create(
    clientId: string,
    name: string,
    avatar: string,
    token: string,
    mapId: string,
    rules: Partial<HouseRules> = {},
  ): { room: Room; seat: Seat } {
    if (this.rooms.size >= this.config.maxRooms) throw 'SERVER_FULL';
    const map = getMap(mapId) ?? getMap(DEFAULT_MAP_ID)!;
    if (!this.store.canPlayMap(clientId, map.id, map.premium)) throw 'MAP_LOCKED';
    // One active room per client as host keeps abuse down.
    for (const r of this.rooms.values()) {
      const s = r.seatByClient(clientId);
      if (s && r.status === 'lobby' && r.hostId === s.playerId && r.seats.length === 1) this.remove(r.code);
    }
    let code = codeGen();
    while (this.rooms.has(code)) code = codeGen();
    const room = new Room(code, map, '', rules, this.callbacks(), this.roomOptions());
    const seat = room.addHuman(clientId, name, avatar, token);
    room.hostId = seat.playerId;
    this.rooms.set(code, room);
    this.analytics.track('room_created', { room: code, map: map.id, private: !!rules.isPrivate });
    this.analytics.track('map_chosen', { map: map.id });
    this.broadcaster.lobbyChanged();
    return { room, seat };
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  /** Join or rejoin. Returns a seat, or null when joining as a spectator. */
  join(
    code: string,
    clientId: string,
    name: string,
    avatar: string,
    token: string,
  ): { room: Room; seat: Seat | null } {
    const room = this.get(code);
    if (!room) throw 'NO_ROOM';
    const existing = room.attach(clientId, name, avatar, token);
    if (existing) {
      this.analytics.track('player_returned', { room: code });
      return { room, seat: existing };
    }
    if (room.status === 'lobby') {
      const seat = room.addHuman(clientId, name, avatar, token);
      this.analytics.track('room_joined', { room: code });
      this.broadcaster.roomChanged(room);
      this.broadcaster.lobbyChanged();
      return { room, seat };
    }
    room.spectators.add(clientId);
    this.broadcaster.roomChanged(room);
    return { room, seat: null };
  }

  leave(code: string, clientId: string): void {
    const room = this.get(code);
    if (!room) return;
    const seat = room.seatByClient(clientId);
    if (
      seat &&
      room.status === 'playing' &&
      room.game &&
      !room.game.players.find((p) => p.id === seat.playerId)?.bankrupt
    ) {
      // Leaving mid-game: the seat is handed to a bot and cannot be reclaimed.
      room.detach(clientId);
      return;
    }
    room.detach(clientId);
    if (room.seats.length === 0 || room.humans().length === 0) this.remove(room.code);
    else this.broadcaster.roomChanged(room);
    this.broadcaster.lobbyChanged();
  }

  disconnect(code: string, clientId: string): void {
    const room = this.get(code);
    if (!room) return;
    room.detach(clientId);
    this.analytics.track('player_disconnected', { room: code, status: room.status });
    if (room.status === 'lobby' && room.humans().length === 0) this.remove(room.code);
    else this.broadcaster.roomChanged(room);
    this.broadcaster.lobbyChanged();
  }

  quickMatch(
    clientId: string,
    name: string,
    avatar: string,
    token: string,
    mapId?: string,
  ): { room: Room; seat: Seat | null } {
    const candidates = [...this.rooms.values()]
      .filter(
        (r) =>
          r.status === 'lobby' &&
          !r.rules.isPrivate &&
          r.seats.length < r.rules.maxPlayers &&
          (!mapId || r.map.id === mapId),
      )
      .sort((a, b) => b.seats.length - a.seats.length);
    const target = candidates[0];
    if (target) return this.join(target.code, clientId, name, avatar, token);
    const map = mapId && getMap(mapId) && !getMap(mapId)!.premium ? mapId : DEFAULT_MAP_ID;
    return this.create(clientId, name, avatar, token, map, {
      isPrivate: false,
      fillWithBots: 'medium',
      maxPlayers: 4,
    });
  }

  publicRooms(): PublicRoomSummary[] {
    return [...this.rooms.values()]
      .filter((r) => r.status === 'lobby' && !r.rules.isPrivate && r.humans().length > 0)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 50)
      .map((r) => ({
        code: r.code,
        mapId: r.map.id,
        hostName: r.seatOf(r.hostId)?.name ?? '?',
        players: r.seats.length,
        maxPlayers: r.rules.maxPlayers,
        bots: r.seats.filter((s) => s.isBot).length,
        status: 'lobby' as const,
        createdAt: r.createdAt,
      }));
  }

  remove(code: string): void {
    const room = this.rooms.get(code);
    if (!room) return;
    room.destroy();
    this.rooms.delete(code);
    const t = this.persistTimers.get(code);
    if (t) clearTimeout(t);
    this.persistTimers.delete(code);
    this.storage.deleteRoomSnapshot(code);
  }

  private onGameOver(room: Room): void {
    const game = room.game!;
    const players = room.results();
    const winner = players[0];
    this.storage.saveResult({
      roomCode: room.code,
      mapId: room.map.id,
      winnerClientId: winner?.clientId ?? null,
      winnerName: winner?.name ?? null,
      players,
      turns: game.turn,
      durationMs: (game.endedAt ?? Date.now()) - game.startedAt,
      endedAt: game.endedAt ?? Date.now(),
    });
    const day = new Date().toISOString().slice(0, 10);
    for (const p of players) {
      if (!p.clientId || p.isBot) continue;
      this.storage.bumpDailyChallenge(p.clientId, day, 'games', 1);
      if (p.rank === 1) this.storage.bumpDailyChallenge(p.clientId, day, 'wins', 1);
      this.storage.bumpDailyChallenge(p.clientId, day, `map:${room.map.id}`, 1);
    }
    this.analytics.track('game_finished', {
      room: room.code,
      map: room.map.id,
      turns: game.turn,
      players: players.length,
      bots: players.filter((p) => p.isBot).length,
      durationMs: (game.endedAt ?? Date.now()) - game.startedAt,
      winnerIsBot: winner?.isBot ?? null,
    });
    this.broadcaster.gameOver(room);
  }

  private schedulePersist(room: Room): void {
    if (this.config.isTest) return;
    if (this.persistTimers.has(room.code)) return;
    this.persistTimers.set(
      room.code,
      setTimeout(() => {
        this.persistTimers.delete(room.code);
        if (!this.rooms.has(room.code)) return;
        try {
          this.storage.saveRoomSnapshot(
            room.code,
            room.status,
            JSON.stringify(room.toSnapshot()),
            Date.now(),
          );
        } catch (err) {
          console.warn('[persist] failed', (err as Error).message);
        }
      }, 2000),
    );
  }

  /** Bring back games that were in progress before a restart (players reconnect by clientId). */
  restore(): number {
    let n = 0;
    for (const row of this.storage.loadActiveRoomSnapshots(Date.now() - 60 * 60 * 1000)) {
      try {
        const snap = JSON.parse(row.json) as RoomSnapshot;
        const map = getMap(snap.mapId);
        if (!map) continue;
        const room = Room.fromSnapshot(snap, map, this.callbacks(), this.roomOptions());
        this.rooms.set(room.code, room);
        n++;
      } catch (err) {
        console.warn('[restore] skipped room', row.code, (err as Error).message);
      }
    }
    return n;
  }

  sweep(now = Date.now()): void {
    for (const room of this.rooms.values()) {
      const idleMs = now - room.updatedAt;
      const noHumans = room.connectedHumans().length === 0;
      if (room.status === 'lobby' && (noHumans || idleMs > this.config.idleRoomMinutes * 60_000))
        this.remove(room.code);
      else if (room.status === 'ended' && idleMs > this.config.endedRoomMinutes * 60_000)
        this.remove(room.code);
      else if (room.status === 'playing' && noHumans && idleMs > 10 * 60_000) this.remove(room.code);
    }
  }

  stats() {
    let playing = 0;
    let players = 0;
    for (const r of this.rooms.values()) {
      if (r.status === 'playing') playing++;
      players += r.connectedHumans().length;
    }
    return { rooms: this.rooms.size, playing, players, maps: listMaps().length };
  }
}
