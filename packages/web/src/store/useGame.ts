import type { GameEvent, GameState, LegalActions, MapDefinition } from '@bt/engine';
import { create } from 'zustand';
import { api, type PublicRoom } from '../lib/api';
import { getSocket, request, type AckResult } from '../lib/socket';
import { getProfile } from '../lib/storage';
import { sfx } from '../lib/audio';

// Mirrors of the server's protocol views (kept local so the web bundle does not import the server).
export interface SeatView {
  playerId: string;
  name: string;
  avatar: string;
  token: string;
  color: string;
  isBot: boolean;
  botLevel?: 'easy' | 'medium' | 'hard';
  connected: boolean;
  isHost: boolean;
  kickVotes: number;
}
export interface RoomView {
  code: string;
  status: 'lobby' | 'playing' | 'ended';
  mapId: string;
  hostId: string;
  rules: GameState['rules'];
  seats: SeatView[];
  createdAt: number;
  deadline: number | null;
  waitingOn: string[];
  spectators: number;
}
export interface ChatMessage {
  id: string;
  playerId: string | null;
  name: string;
  text: string;
  emote?: string;
  at: number;
  system?: boolean;
}

export interface Toast {
  id: number;
  kind: 'error' | 'info' | 'success';
  text: string;
}

interface GameStore {
  connected: boolean;
  room: RoomView | null;
  map: MapDefinition | null;
  game: GameState | null;
  legal: LegalActions | null;
  me: string | null;
  chat: ChatMessage[];
  /** Events not yet consumed by the animation layer. */
  eventQueue: { seq: number; events: GameEvent[] }[];
  lastEvents: GameEvent[];
  lobby: PublicRoom[];
  toasts: Toast[];
  unreadChat: number;
  /** UI */
  selectedTile: number | null;
  tradeWith: string | null;

  init(): void;
  createRoom(
    mapId: string,
    rules: Record<string, unknown>,
  ): Promise<AckResult<{ code: string; playerId: string }>>;
  joinRoom(code: string): Promise<AckResult<{ code: string; playerId: string }>>;
  quickMatch(mapId?: string): Promise<AckResult<{ code: string; playerId: string }>>;
  leaveRoom(): Promise<void>;
  act(action: Record<string, unknown>): Promise<boolean>;
  emit<T = null>(event: string, payload?: unknown): Promise<AckResult<T>>;
  sendChat(text: string): void;
  sendEmote(emote: string): void;
  toast(kind: Toast['kind'], text: string): void;
  dismissToast(id: number): void;
  consumeEvents(): { seq: number; events: GameEvent[] } | null;
  selectTile(i: number | null): void;
  openTrade(playerId: string | null): void;
  markChatRead(): void;
  subscribeLobby(on: boolean): void;
}

let toastId = 0;
let initialised = false;

export const useGame = create<GameStore>((set, get) => ({
  connected: false,
  room: null,
  map: null,
  game: null,
  legal: null,
  me: null,
  chat: [],
  eventQueue: [],
  lastEvents: [],
  lobby: [],
  toasts: [],
  unreadChat: 0,
  selectedTile: null,
  tradeWith: null,

  init() {
    if (initialised) return;
    initialised = true;
    const s = getSocket();
    s.on('connect', () => {
      set({ connected: true });
      // After a reconnect, re-join the room we were in.
      const room = get().room;
      if (room) void get().joinRoom(room.code);
    });
    s.on('disconnect', () => set({ connected: false }));
    s.on('room:state', (view: RoomView) => {
      const prev = get().room;
      set({ room: view });
      if (!get().map || get().map!.id !== view.mapId) {
        void api.map(view.mapId).then((map) => set({ map }));
      }
      if (prev && prev.status !== 'playing' && view.status === 'playing') sfx.play('notify');
    });
    s.on('game:state', (snap: { state: GameState; legal: LegalActions | null }) => {
      set({ game: snap.state, legal: snap.legal });
    });
    s.on('game:events', (p: { seq: number; events: GameEvent[] }) => {
      set((st) => ({ eventQueue: [...st.eventQueue, p], lastEvents: p.events }));
    });
    s.on('chat:message', (msg: ChatMessage) => {
      set((st) => ({
        chat: [...st.chat.slice(-199), msg],
        unreadChat: msg.system ? st.unreadChat : st.unreadChat + 1,
      }));
      if (!msg.system && msg.playerId !== get().me) sfx.play('click');
    });
    s.on('room:error', (err: { code: string; message: string }) => get().toast('error', err.message));
    s.on('room:left', () => set({ room: null, game: null, legal: null, me: null, chat: [], eventQueue: [] }));
    s.on('lobby:list', (rooms: PublicRoom[]) => set({ lobby: rooms }));
  },

  async createRoom(mapId, rules) {
    const p = getProfile();
    const res = await request<{ code: string; playerId: string }>('room:create', { ...p, mapId, rules });
    if (res.ok) set({ me: res.data.playerId, chat: [], eventQueue: [] });
    return res;
  },

  async joinRoom(code) {
    const p = getProfile();
    const res = await request<{ code: string; playerId: string }>('room:join', { ...p, code });
    if (res.ok) set({ me: res.data.playerId || null });
    return res;
  },

  async quickMatch(mapId) {
    const p = getProfile();
    const res = await request<{ code: string; playerId: string }>('room:quickmatch', { ...p, mapId });
    if (res.ok) set({ me: res.data.playerId || null, chat: [], eventQueue: [] });
    return res;
  },

  async leaveRoom() {
    await request('room:leave');
    set({
      room: null,
      game: null,
      legal: null,
      me: null,
      chat: [],
      eventQueue: [],
      selectedTile: null,
      tradeWith: null,
    });
  },

  async act(action) {
    const res = await request<null>('game:action', action);
    if (!res.ok && res.code !== 'RATE_LIMIT') get().toast('error', res.message);
    return res.ok;
  },

  emit(event, payload) {
    return request(event, payload);
  },

  sendChat(text) {
    void request('chat:send', { text });
  },
  sendEmote(emote) {
    void request('chat:emote', { emote });
  },

  toast(kind, text) {
    const id = ++toastId;
    set((st) => ({ toasts: [...st.toasts.slice(-3), { id, kind, text }] }));
    setTimeout(() => get().dismissToast(id), 3500);
  },
  dismissToast(id) {
    set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) }));
  },

  consumeEvents() {
    const q = get().eventQueue;
    if (q.length === 0) return null;
    set({ eventQueue: q.slice(1) });
    return q[0]!;
  },

  selectTile: (i) => set({ selectedTile: i }),
  openTrade: (playerId) => set({ tradeWith: playerId }),
  markChatRead: () => set({ unreadChat: 0 }),
  subscribeLobby(on) {
    getSocket().emit(on ? 'lobby:subscribe' : 'lobby:unsubscribe');
  },
}));

/** Convenience selectors. */
export const selectMe = (s: GameStore) =>
  s.game && s.me ? (s.game.players.find((p) => p.id === s.me) ?? null) : null;
export const selectIsMyTurn = (s: GameStore) =>
  !!s.game && !!s.me && s.game.players[s.game.current]?.id === s.me;
