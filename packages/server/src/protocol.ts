/**
 * Wire protocol between client and server. Every inbound message is validated with zod;
 * the server never trusts a client-supplied player id.
 */
import { z } from 'zod';
import type { GameEvent, GameState, HouseRules, LegalActions, BotLevel } from '@bt/engine';

export const nameSchema = z.string().trim().min(2).max(16);
export const avatarSchema = z.string().trim().min(1).max(32);
export const tokenSchema = z.string().trim().min(1).max(32);
export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{4,8}$/);
export const botLevelSchema = z.enum(['easy', 'medium', 'hard']);

export const rulesSchema = z
  .object({
    startingCash: z.number().int().min(100).max(100_000),
    salary: z.number().int().min(0).max(10_000),
    landOnStartBonus: z.number().int().min(0).max(10_000),
    jailFine: z.number().int().min(0).max(10_000),
    maxJailTurns: z.number().int().min(1).max(5),
    doubleRentOnFullSet: z.boolean(),
    auctionEnabled: z.boolean(),
    freeParkingJackpot: z.boolean(),
    evenBuild: z.boolean(),
    noRentInJail: z.boolean(),
    randomizeTurnOrder: z.boolean(),
    maxPlayers: z.number().int().min(2).max(8),
    turnTimerSeconds: z.number().int().min(0).max(600),
    timeLimitMinutes: z.number().int().min(0).max(240),
    mortgageInterestPct: z.number().int().min(0).max(50),
    auctionMinIncrement: z.number().int().min(1).max(1000),
    houseLimit: z.number().int().min(0).max(200).nullable(),
    hotelLimit: z.number().int().min(0).max(100).nullable(),
    bankruptcyAuction: z.boolean(),
    actionsAnytime: z.boolean(),
    salaryOnCardMove: z.boolean(),
    isPrivate: z.boolean(),
    fillWithBots: botLevelSchema.nullable(),
    voteKickEnabled: z.boolean(),
  })
  .partial();

const tradeSide = z.object({
  cash: z.number().int().min(0).max(1_000_000),
  properties: z.array(z.number().int().min(0).max(79)).max(40),
  jailCards: z.number().int().min(0).max(8),
});

/** Game actions as sent by the client (no playerId; the server fills it in). */
export const clientActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('roll') }),
  z.object({ type: z.literal('buy') }),
  z.object({ type: z.literal('declineBuy') }),
  z.object({ type: z.literal('bid'), amount: z.number().int().min(1).max(1_000_000) }),
  z.object({ type: z.literal('passBid') }),
  z.object({ type: z.literal('build'), tile: z.number().int().min(0).max(79) }),
  z.object({ type: z.literal('sellHouse'), tile: z.number().int().min(0).max(79) }),
  z.object({ type: z.literal('mortgage'), tile: z.number().int().min(0).max(79) }),
  z.object({ type: z.literal('unmortgage'), tile: z.number().int().min(0).max(79) }),
  z.object({ type: z.literal('payJail') }),
  z.object({ type: z.literal('useJailCard') }),
  z.object({ type: z.literal('endTurn') }),
  z.object({ type: z.literal('proposeTrade'), to: z.string().max(40), offer: tradeSide, request: tradeSide }),
  z.object({ type: z.literal('acceptTrade'), tradeId: z.string().max(40) }),
  z.object({ type: z.literal('declineTrade'), tradeId: z.string().max(40) }),
  z.object({ type: z.literal('cancelTrade'), tradeId: z.string().max(40) }),
  z.object({
    type: z.literal('counterTrade'),
    tradeId: z.string().max(40),
    offer: tradeSide,
    request: tradeSide,
  }),
  z.object({ type: z.literal('declareBankrupt') }),
  z.object({ type: z.literal('resign') }),
]);
export type ClientAction = z.infer<typeof clientActionSchema>;

export const createRoomSchema = z.object({
  name: nameSchema,
  avatar: avatarSchema,
  token: tokenSchema,
  mapId: z.string().min(2).max(40),
  rules: rulesSchema.optional(),
});

export const joinRoomSchema = z.object({
  code: roomCodeSchema,
  name: nameSchema,
  avatar: avatarSchema,
  token: tokenSchema,
});

export const chatSchema = z.object({ text: z.string().trim().min(1).max(200) });
export const emoteSchema = z.object({ emote: z.string().min(1).max(16) });
export const addBotSchema = z.object({ level: botLevelSchema });
export const playerTargetSchema = z.object({ playerId: z.string().max(40) });
export const quickMatchSchema = z.object({
  name: nameSchema,
  avatar: avatarSchema,
  token: tokenSchema,
  mapId: z.string().max(40).optional(),
});

// ---------------------------------------------------------------------------
// Server -> client views
// ---------------------------------------------------------------------------

export interface SeatView {
  playerId: string;
  name: string;
  avatar: string;
  token: string;
  color: string;
  isBot: boolean;
  botLevel?: BotLevel;
  connected: boolean;
  isHost: boolean;
  /** Vote-kick votes received. */
  kickVotes: number;
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

export interface RoomView {
  code: string;
  status: 'lobby' | 'playing' | 'ended';
  mapId: string;
  hostId: string;
  rules: HouseRules;
  seats: SeatView[];
  createdAt: number;
  /** Deadline (epoch ms) for the players currently expected to act, or null. */
  deadline: number | null;
  waitingOn: string[];
  spectators: number;
}

export interface GameSnapshot {
  state: GameState;
  /** Legal actions for the receiving player. */
  legal: LegalActions | null;
}

export interface PublicRoomSummary {
  code: string;
  mapId: string;
  hostName: string;
  players: number;
  maxPlayers: number;
  bots: number;
  status: 'lobby' | 'playing';
  createdAt: number;
}

export interface ServerToClient {
  'room:state': (view: RoomView) => void;
  'game:state': (snap: GameSnapshot) => void;
  'game:events': (payload: { seq: number; events: GameEvent[] }) => void;
  'chat:message': (msg: ChatMessage) => void;
  'room:error': (err: { code: string; message: string }) => void;
  'room:left': () => void;
  'lobby:list': (rooms: PublicRoomSummary[]) => void;
}

export interface ClientToServer {
  'room:create': (
    payload: unknown,
    ack: (res: AckResult<{ code: string; playerId: string }>) => void,
  ) => void;
  'room:join': (payload: unknown, ack: (res: AckResult<{ code: string; playerId: string }>) => void) => void;
  'room:quickmatch': (
    payload: unknown,
    ack: (res: AckResult<{ code: string; playerId: string }>) => void,
  ) => void;
  'room:leave': (ack?: (res: AckResult<null>) => void) => void;
  'room:settings': (payload: unknown, ack?: (res: AckResult<null>) => void) => void;
  'room:addBot': (payload: unknown, ack?: (res: AckResult<null>) => void) => void;
  'room:removeBot': (payload: unknown, ack?: (res: AckResult<null>) => void) => void;
  'room:kick': (payload: unknown, ack?: (res: AckResult<null>) => void) => void;
  'room:voteKick': (payload: unknown, ack?: (res: AckResult<null>) => void) => void;
  'room:start': (ack?: (res: AckResult<null>) => void) => void;
  'room:newGame': (ack?: (res: AckResult<null>) => void) => void;
  'room:sync': (ack?: (res: AckResult<null>) => void) => void;
  'game:action': (payload: unknown, ack?: (res: AckResult<null>) => void) => void;
  'chat:send': (payload: unknown, ack?: (res: AckResult<null>) => void) => void;
  'chat:emote': (payload: unknown, ack?: (res: AckResult<null>) => void) => void;
  'chat:mute': (payload: unknown, ack?: (res: AckResult<null>) => void) => void;
  'chat:report': (payload: unknown, ack?: (res: AckResult<null>) => void) => void;
  'lobby:subscribe': () => void;
  'lobby:unsubscribe': () => void;
}

export type AckResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

export interface SocketAuth {
  clientId: string;
}
