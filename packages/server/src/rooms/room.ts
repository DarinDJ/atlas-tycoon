import {
  applyAction,
  botDecide,
  createGame,
  legalActions,
  netWorth,
  resolveRules,
  waitingOn,
  type Action,
  type BotLevel,
  type GameEvent,
  type GameState,
  type HouseRules,
  type MapDefinition,
  type PlayerAction,
} from '@bt/engine';
import { nanoid } from 'nanoid';
import type { ChatMessage, GameSnapshot, RoomView, SeatView } from '../protocol.js';
import { censor } from '../security/profanity.js';

export interface Seat {
  playerId: string;
  /** null for bots and for kicked seats (nobody may reclaim them). */
  clientId: string | null;
  name: string;
  avatar: string;
  token: string;
  color: string;
  isBot: boolean;
  botLevel?: BotLevel;
  connected: boolean;
  /** Consecutive timeouts; reset when the player acts. */
  afkStrikes: number;
  disconnectedAt: number | null;
  /** The human seat was handed to a bot (AFK/kick). Reclaimable unless kicked. */
  autoBot: boolean;
}

export interface RoomCallbacks {
  onRoomChanged(room: Room): void;
  onGameChanged(room: Room, events: GameEvent[]): void;
  onChat(room: Room, msg: ChatMessage): void;
  onGameOver(room: Room): void;
  onPersist(room: Room): void;
}

export interface RoomOptions {
  botDelayMs: number;
  afkTimeoutsBeforeBot: number;
  reconnectGraceSeconds: number;
  now?: () => number;
}

export const PLAYER_COLORS = [
  '#e23d3d',
  '#1e4fd8',
  '#1fa64a',
  '#f2b705',
  '#8e44ad',
  '#e67e22',
  '#16a085',
  '#d6409b',
];
const BOT_NAMES = [
  'Arjun',
  'Sofia',
  'Kenji',
  'Amara',
  'Lucas',
  'Priya',
  'Mateo',
  'Zoe',
  'Omar',
  'Hana',
  'Diego',
  'Nia',
];
const MAX_CHAT = 100;

export interface RoomSnapshot {
  code: string;
  hostId: string;
  mapId: string;
  rulesOverrides: Partial<HouseRules>;
  status: 'lobby' | 'playing' | 'ended';
  seats: Seat[];
  game: GameState | null;
  chat: ChatMessage[];
  createdAt: number;
  startedAt: number | null;
}

export class Room {
  readonly code: string;
  hostId: string;
  readonly map: MapDefinition;
  rulesOverrides: Partial<HouseRules>;
  status: 'lobby' | 'playing' | 'ended' = 'lobby';
  seats: Seat[] = [];
  game: GameState | null = null;
  chat: ChatMessage[] = [];
  readonly createdAt: number;
  startedAt: number | null = null;
  updatedAt: number;
  spectators = new Set<string>();
  deadline: number | null = null;
  private deadlineTimer: NodeJS.Timeout | null = null;
  private botTimer: NodeJS.Timeout | null = null;
  private tickTimer: NodeJS.Timeout | null = null;
  private kickVotes = new Map<string, Set<string>>();
  mutes = new Map<string, Set<string>>();
  private readonly now: () => number;

  constructor(
    code: string,
    map: MapDefinition,
    hostId: string,
    rulesOverrides: Partial<HouseRules>,
    private cb: RoomCallbacks,
    private opts: RoomOptions,
  ) {
    this.code = code;
    this.map = map;
    this.hostId = hostId;
    this.rulesOverrides = rulesOverrides;
    this.now = opts.now ?? (() => Date.now());
    this.createdAt = this.now();
    this.updatedAt = this.createdAt;
  }

  // -------------------------------------------------------------------------
  // Snapshot / restore
  // -------------------------------------------------------------------------

  toSnapshot(): RoomSnapshot {
    return {
      code: this.code,
      hostId: this.hostId,
      mapId: this.map.id,
      rulesOverrides: this.rulesOverrides,
      status: this.status,
      seats: this.seats,
      game: this.game,
      chat: this.chat.slice(-30),
      createdAt: this.createdAt,
      startedAt: this.startedAt,
    };
  }

  static fromSnapshot(snap: RoomSnapshot, map: MapDefinition, cb: RoomCallbacks, opts: RoomOptions): Room {
    const room = new Room(snap.code, map, snap.hostId, snap.rulesOverrides, cb, opts);
    room.status = snap.status;
    room.seats = snap.seats.map((s) => ({
      ...s,
      connected: s.isBot,
      disconnectedAt: s.isBot ? null : room.now(),
    }));
    room.game = snap.game;
    room.chat = snap.chat;
    room.startedAt = snap.startedAt;
    if (room.status === 'playing' && room.game) {
      // Everyone is disconnected after a restart; mark them so timers kick in.
      for (const s of room.seats)
        if (!s.isBot)
          room.game =
            room.applySystem({ type: 'sys:setConnected', playerId: s.playerId, connected: false }) ??
            room.game;
      room.afterChange([]);
    }
    return room;
  }

  // -------------------------------------------------------------------------
  // Views
  // -------------------------------------------------------------------------

  get rules(): HouseRules {
    return resolveRules(this.map, this.rulesOverrides);
  }

  seatOf(playerId: string): Seat | undefined {
    return this.seats.find((s) => s.playerId === playerId);
  }

  seatByClient(clientId: string): Seat | undefined {
    return this.seats.find((s) => s.clientId === clientId);
  }

  humans(): Seat[] {
    return this.seats.filter((s) => !s.isBot);
  }

  connectedHumans(): Seat[] {
    return this.seats.filter((s) => !s.isBot && s.connected);
  }

  view(): RoomView {
    const seats: SeatView[] = this.seats.map((s) => ({
      playerId: s.playerId,
      name: s.name,
      avatar: s.avatar,
      token: s.token,
      color: s.color,
      isBot: s.isBot,
      botLevel: s.botLevel,
      connected: s.connected,
      isHost: s.playerId === this.hostId,
      kickVotes: this.kickVotes.get(s.playerId)?.size ?? 0,
    }));
    return {
      code: this.code,
      status: this.status,
      mapId: this.map.id,
      hostId: this.hostId,
      rules: this.rules,
      seats,
      createdAt: this.createdAt,
      deadline: this.deadline,
      waitingOn: this.game ? waitingOn(this.game) : [],
      spectators: this.spectators.size,
    };
  }

  snapshotFor(playerId: string | null): GameSnapshot | null {
    if (!this.game) return null;
    return { state: this.game, legal: playerId ? legalActions(this.game, this.map, playerId) : null };
  }

  // -------------------------------------------------------------------------
  // Lobby
  // -------------------------------------------------------------------------

  private nextColor(): string {
    const used = new Set(this.seats.map((s) => s.color));
    return (
      PLAYER_COLORS.find((c) => !used.has(c)) ?? PLAYER_COLORS[this.seats.length % PLAYER_COLORS.length]!
    );
  }

  private uniqueName(name: string): string {
    let n = name;
    let i = 2;
    while (this.seats.some((s) => s.name.toLowerCase() === n.toLowerCase())) n = `${name} ${i++}`;
    return n.slice(0, 16);
  }

  /** Add a human seat. Throws a code string on failure. */
  addHuman(clientId: string, name: string, avatar: string, token: string): Seat {
    if (this.status !== 'lobby') throw 'GAME_IN_PROGRESS';
    if (this.seats.length >= this.rules.maxPlayers) throw 'ROOM_FULL';
    const seat: Seat = {
      playerId: `p_${nanoid(8)}`,
      clientId,
      name: this.uniqueName(name),
      avatar,
      token,
      color: this.nextColor(),
      isBot: false,
      connected: true,
      afkStrikes: 0,
      disconnectedAt: null,
      autoBot: false,
    };
    this.seats.push(seat);
    this.systemChat(`${seat.name} joined`);
    this.touch();
    return seat;
  }

  addBot(level: BotLevel): Seat {
    if (this.status !== 'lobby') throw 'GAME_IN_PROGRESS';
    if (this.seats.length >= this.rules.maxPlayers) throw 'ROOM_FULL';
    const base =
      BOT_NAMES[(this.seats.length * 7 + Math.floor(Math.random() * BOT_NAMES.length)) % BOT_NAMES.length]!;
    const seat: Seat = {
      playerId: `bot_${nanoid(6)}`,
      clientId: null,
      name: this.uniqueName(`${base} (bot)`),
      avatar: 'bot',
      token: ['auto', 'bike', 'kite', 'tabla', 'lotus', 'tiger', 'peacock', 'elephant'][
        this.seats.length % 8
      ]!,
      color: this.nextColor(),
      isBot: true,
      botLevel: level,
      connected: true,
      afkStrikes: 0,
      disconnectedAt: null,
      autoBot: false,
    };
    this.seats.push(seat);
    this.touch();
    return seat;
  }

  removeSeat(playerId: string): void {
    if (this.status !== 'lobby') throw 'GAME_IN_PROGRESS';
    const seat = this.seatOf(playerId);
    if (!seat) throw 'NO_PLAYER';
    this.seats = this.seats.filter((s) => s.playerId !== playerId);
    if (!seat.isBot) this.systemChat(`${seat.name} left`);
    if (this.hostId === playerId) this.electHost();
    this.touch();
  }

  private electHost(): void {
    const next = this.seats.find((s) => !s.isBot && s.connected) ?? this.seats.find((s) => !s.isBot);
    if (next) this.hostId = next.playerId;
  }

  updateRules(partial: Partial<HouseRules>): void {
    if (this.status !== 'lobby') throw 'GAME_IN_PROGRESS';
    this.rulesOverrides = { ...this.rulesOverrides, ...partial };
    if (this.seats.length > this.rules.maxPlayers) this.rulesOverrides.maxPlayers = this.seats.length;
    this.touch();
  }

  /** Reconnect an existing seat (same clientId). */
  attach(clientId: string, name?: string, avatar?: string, token?: string): Seat | undefined {
    const seat = this.seatByClient(clientId);
    if (!seat) return undefined;
    seat.connected = true;
    seat.disconnectedAt = null;
    seat.afkStrikes = 0;
    if (this.status === 'lobby') {
      if (name) seat.name = this.uniqueName(name);
      if (avatar) seat.avatar = avatar;
      if (token) seat.token = token;
    }
    if (this.game) {
      let next = this.applySystem({ type: 'sys:setConnected', playerId: seat.playerId, connected: true });
      if (seat.autoBot) {
        seat.autoBot = false;
        seat.isBot = false;
        next = this.applySystem({ type: 'sys:setBot', playerId: seat.playerId, isBot: false }) ?? next;
      }
      if (next) {
        this.game = next;
        this.afterChange([]);
      }
    }
    this.touch();
    return seat;
  }

  detach(clientId: string): void {
    const seat = this.seatByClient(clientId);
    if (!seat) {
      this.spectators.delete(clientId);
      return;
    }
    seat.connected = false;
    seat.disconnectedAt = this.now();
    if (this.status === 'lobby') {
      // Lobby: leaving is final.
      this.seats = this.seats.filter((s) => s !== seat);
      this.systemChat(`${seat.name} left`);
      if (this.hostId === seat.playerId) this.electHost();
    } else if (this.game) {
      const next = this.applySystem({ type: 'sys:setConnected', playerId: seat.playerId, connected: false });
      if (next) this.game = next;
      if (this.hostId === seat.playerId) this.electHost();
      this.afterChange([]);
    }
    this.touch();
  }

  // -------------------------------------------------------------------------
  // Game lifecycle
  // -------------------------------------------------------------------------

  start(seed?: number): void {
    if (this.status !== 'lobby') throw 'GAME_IN_PROGRESS';
    const rules = this.rules;
    if (rules.fillWithBots) {
      while (this.seats.length < rules.maxPlayers) this.addBot(rules.fillWithBots);
    }
    if (this.seats.length < 2) throw 'NEED_PLAYERS';
    this.game = createGame(
      this.map,
      this.seats.map((s) => ({
        id: s.playerId,
        name: s.name,
        avatar: s.avatar,
        token: s.token,
        color: s.color,
        isBot: s.isBot,
        botLevel: s.botLevel,
      })),
      this.rulesOverrides,
      seed,
      this.now(),
    );
    this.status = 'playing';
    this.startedAt = this.now();
    this.kickVotes.clear();
    for (const s of this.seats) s.afkStrikes = 0;
    this.systemChat('Game started. Good luck!');
    if (this.game.rules.timeLimitMinutes > 0) {
      this.tickTimer = setInterval(() => this.tick(), 10_000);
    }
    this.touch();
    this.afterChange([]);
  }

  /** Return to the lobby with the same seats after a game ends. */
  newGame(): void {
    if (this.status !== 'ended') throw 'GAME_NOT_OVER';
    this.clearTimers();
    this.game = null;
    this.status = 'lobby';
    this.startedAt = null;
    this.seats = this.seats.filter((s) => s.isBot || s.connected);
    for (const s of this.seats) {
      if (s.autoBot) {
        s.autoBot = false;
        s.isBot = false;
      }
    }
    this.touch();
  }

  private applySystem(action: Action): GameState | null {
    if (!this.game) return null;
    const res = applyAction(this.game, action, this.map, { now: this.now() });
    if (!res.ok) return null;
    this.pendingEvents.push(...res.events);
    return res.state;
  }

  private pendingEvents: GameEvent[] = [];

  /** Apply a player's action. Returns an error code or null. */
  dispatch(playerId: string, action: Omit<PlayerAction, 'playerId'>): string | null {
    if (!this.game || this.status !== 'playing') return 'NO_GAME';
    const seat = this.seatOf(playerId);
    if (!seat) return 'NO_PLAYER';
    if (seat.isBot && !seat.autoBot) return 'IS_BOT';
    if (seat.autoBot) {
      // A human returning from AFK takes their seat back.
      seat.autoBot = false;
      seat.isBot = false;
      const restored = this.applySystem({ type: 'sys:setBot', playerId, isBot: false });
      if (restored) this.game = restored;
    }
    const full = { ...action, playerId } as PlayerAction;
    const res = applyAction(this.game, full, this.map, { now: this.now() });
    if (!res.ok) return res.error;
    seat.afkStrikes = 0;
    this.game = res.state;
    this.afterChange(res.events);
    return null;
  }

  /** Common path after any state change: broadcast, timers, bots, game over. */
  private afterChange(events: GameEvent[]): void {
    const all = [...this.pendingEvents, ...events];
    this.pendingEvents = [];
    this.touch();
    this.cb.onGameChanged(this, all);
    if (!this.game) return;
    if (this.game.status === 'ended' && this.status === 'playing') {
      this.status = 'ended';
      this.clearTimers();
      this.deadline = null;
      const winner = this.game.winner ? this.seatOf(this.game.winner) : null;
      this.systemChat(winner ? `${winner.name} wins!` : 'Game over.');
      this.cb.onRoomChanged(this);
      this.cb.onGameOver(this);
      return;
    }
    this.scheduleDeadline();
    this.scheduleBots();
    this.cb.onRoomChanged(this);
  }

  // -------------------------------------------------------------------------
  // Timers
  // -------------------------------------------------------------------------

  /** Players the game is waiting on, plus anyone sitting on an incoming trade offer. */
  private pendingPlayers(): string[] {
    if (!this.game) return [];
    const ids = new Set(waitingOn(this.game));
    for (const t of this.game.trades) if (t.status === 'pending') ids.add(t.to);
    return [...ids];
  }

  private scheduleDeadline(): void {
    if (this.deadlineTimer) clearTimeout(this.deadlineTimer);
    this.deadlineTimer = null;
    if (!this.game || this.status !== 'playing') {
      this.deadline = null;
      return;
    }
    const humans = this.pendingPlayers()
      .map((id) => this.seatOf(id))
      .filter((s): s is Seat => !!s && !s.isBot);
    if (humans.length === 0) {
      this.deadline = null;
      return;
    }
    const timer = this.game.rules.turnTimerSeconds;
    const anyDisconnected = humans.some((s) => !s.connected);
    let ms: number;
    if (timer > 0) ms = timer * 1000;
    else if (anyDisconnected) ms = this.opts.reconnectGraceSeconds * 1000;
    else {
      this.deadline = null;
      return; // no timer and everyone is present: wait indefinitely
    }
    if (anyDisconnected) ms = Math.min(ms, this.opts.reconnectGraceSeconds * 1000);
    this.deadline = this.now() + ms;
    this.deadlineTimer = setTimeout(() => this.onDeadline(), ms);
  }

  private onDeadline(): void {
    this.deadlineTimer = null;
    if (!this.game || this.status !== 'playing') return;
    const pending = this.pendingPlayers();
    let changed = false;
    for (const id of pending) {
      const seat = this.seatOf(id);
      if (!seat || seat.isBot) continue;
      seat.afkStrikes += 1;
      const hand = seat.afkStrikes >= this.opts.afkTimeoutsBeforeBot;
      if (hand && !seat.autoBot) {
        seat.autoBot = true;
        seat.isBot = true;
        seat.botLevel = 'medium';
        const next = this.applySystem({ type: 'sys:setBot', playerId: id, isBot: true, level: 'medium' });
        if (next) this.game = next;
        this.systemChat(`${seat.name} is away; a bot is playing their turns until they return.`);
        changed = true;
      } else {
        const next = this.applySystem({ type: 'sys:autoAct', playerId: id });
        if (next) {
          this.game = next;
          changed = true;
        }
      }
    }
    if (changed) this.afterChange([]);
    else this.scheduleDeadline();
  }

  private scheduleBots(): void {
    if (this.botTimer) return;
    if (!this.game || this.status !== 'playing') return;
    const bots = this.pendingPlayers().filter((id) => this.seatOf(id)?.isBot);
    if (bots.length === 0) return;
    this.botTimer = setTimeout(() => this.botTick(), this.opts.botDelayMs);
  }

  private botTick(): void {
    this.botTimer = null;
    if (!this.game || this.status !== 'playing') return;
    for (const id of this.pendingPlayers()) {
      const seat = this.seatOf(id);
      if (!seat?.isBot) continue;
      const action = botDecide(this.game, this.map, id, seat.botLevel);
      const act: Action = action ?? { type: 'sys:autoAct', playerId: id };
      const res = applyAction(this.game, act, this.map, { now: this.now() });
      if (!res.ok) {
        const fallback = applyAction(this.game, { type: 'sys:autoAct', playerId: id }, this.map, {
          now: this.now(),
        });
        if (!fallback.ok) continue;
        this.game = fallback.state;
        this.afterChange(fallback.events);
        return;
      }
      this.game = res.state;
      this.afterChange(res.events);
      return;
    }
  }

  private tick(): void {
    if (!this.game || this.status !== 'playing' || !this.startedAt) return;
    const next = this.applySystem({ type: 'sys:tick', elapsedMs: this.now() - this.startedAt });
    if (next && next !== this.game) {
      this.game = next;
      this.afterChange([]);
    }
  }

  clearTimers(): void {
    if (this.deadlineTimer) clearTimeout(this.deadlineTimer);
    if (this.botTimer) clearTimeout(this.botTimer);
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.deadlineTimer = this.botTimer = this.tickTimer = null;
  }

  // -------------------------------------------------------------------------
  // Social
  // -------------------------------------------------------------------------

  sendChat(playerId: string | null, name: string, text: string, emote?: string): ChatMessage {
    const msg: ChatMessage = { id: nanoid(8), playerId, name, text: censor(text), emote, at: this.now() };
    this.chat.push(msg);
    if (this.chat.length > MAX_CHAT) this.chat.splice(0, this.chat.length - MAX_CHAT);
    this.cb.onChat(this, msg);
    return msg;
  }

  systemChat(text: string): void {
    const msg: ChatMessage = {
      id: nanoid(8),
      playerId: null,
      name: 'system',
      text,
      at: this.now(),
      system: true,
    };
    this.chat.push(msg);
    if (this.chat.length > MAX_CHAT) this.chat.splice(0, this.chat.length - MAX_CHAT);
    this.cb.onChat(this, msg);
  }

  /** Vote to hand a seat to a bot. Majority of other connected humans required. */
  voteKick(voterId: string, targetId: string): { kicked: boolean; votes: number; needed: number } {
    if (!this.rules.voteKickEnabled) throw 'KICK_DISABLED';
    if (this.status !== 'playing') throw 'NOT_PLAYING';
    const target = this.seatOf(targetId);
    const voter = this.seatOf(voterId);
    if (!target || !voter || target.isBot || voterId === targetId) throw 'BAD_TARGET';
    const votes = this.kickVotes.get(targetId) ?? new Set<string>();
    votes.add(voterId);
    this.kickVotes.set(targetId, votes);
    const voters = this.connectedHumans().filter((s) => s.playerId !== targetId).length;
    const needed = Math.max(1, Math.floor(voters / 2) + 1);
    if (votes.size >= needed) {
      target.isBot = true;
      target.autoBot = false;
      target.botLevel = 'medium';
      target.clientId = null; // cannot reclaim
      target.connected = true;
      const next = this.applySystem({ type: 'sys:setBot', playerId: targetId, isBot: true, level: 'medium' });
      if (next) this.game = next;
      this.kickVotes.delete(targetId);
      if (this.hostId === targetId) this.electHost();
      this.systemChat(`${target.name} was voted out; a bot takes over.`);
      this.afterChange([]);
      return { kicked: true, votes: votes.size, needed };
    }
    this.cb.onRoomChanged(this);
    return { kicked: false, votes: votes.size, needed };
  }

  // -------------------------------------------------------------------------
  // Results
  // -------------------------------------------------------------------------

  results(): {
    playerId: string;
    clientId: string | null;
    name: string;
    isBot: boolean;
    rank: number;
    netWorth: number;
  }[] {
    if (!this.game) return [];
    return this.game.ranking.map((id, i) => {
      const seat = this.seatOf(id);
      return {
        playerId: id,
        clientId: seat?.clientId ?? null,
        name: seat?.name ?? id,
        isBot: seat?.isBot ?? false,
        rank: i + 1,
        netWorth: netWorth(this.game!, this.map, id),
      };
    });
  }

  private touch(): void {
    this.updatedAt = this.now();
    this.cb.onPersist(this);
  }

  destroy(): void {
    this.clearTimers();
  }
}
