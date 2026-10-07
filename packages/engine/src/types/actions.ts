import type { BotLevel } from './rules.js';
import type { TradeSide } from './state.js';

export type PlayerAction =
  | { type: 'roll'; playerId: string }
  | { type: 'buy'; playerId: string }
  | { type: 'declineBuy'; playerId: string }
  | { type: 'bid'; playerId: string; amount: number }
  | { type: 'passBid'; playerId: string }
  | { type: 'build'; playerId: string; tile: number }
  | { type: 'sellHouse'; playerId: string; tile: number }
  | { type: 'mortgage'; playerId: string; tile: number }
  | { type: 'unmortgage'; playerId: string; tile: number }
  | { type: 'payJail'; playerId: string }
  | { type: 'useJailCard'; playerId: string }
  | { type: 'endTurn'; playerId: string }
  | { type: 'proposeTrade'; playerId: string; to: string; offer: TradeSide; request: TradeSide }
  | { type: 'acceptTrade'; playerId: string; tradeId: string }
  | { type: 'declineTrade'; playerId: string; tradeId: string }
  | { type: 'cancelTrade'; playerId: string; tradeId: string }
  | { type: 'counterTrade'; playerId: string; tradeId: string; offer: TradeSide; request: TradeSide }
  | { type: 'declareBankrupt'; playerId: string }
  | { type: 'resign'; playerId: string };

/** Actions only the server may dispatch. */
export type SystemAction =
  | { type: 'sys:timeUp' }
  | { type: 'sys:tick'; elapsedMs: number }
  | { type: 'sys:autoAct'; playerId: string }
  | { type: 'sys:setBot'; playerId: string; isBot: boolean; level?: BotLevel }
  | { type: 'sys:setConnected'; playerId: string; connected: boolean };

export type Action = PlayerAction | SystemAction;
export type ActionType = Action['type'];

export const PLAYER_ACTION_TYPES: ReadonlySet<string> = new Set<PlayerAction['type']>([
  'roll',
  'buy',
  'declineBuy',
  'bid',
  'passBid',
  'build',
  'sellHouse',
  'mortgage',
  'unmortgage',
  'payJail',
  'useJailCard',
  'endTurn',
  'proposeTrade',
  'acceptTrade',
  'declineTrade',
  'cancelTrade',
  'counterTrade',
  'declareBankrupt',
  'resign',
]);
