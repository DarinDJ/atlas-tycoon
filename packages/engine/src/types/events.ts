/**
 * Events are emitted by the reducer so clients can animate and log.
 * They are data only; the client translates them via i18n keys.
 */
export type GameEvent =
  | { type: 'gameStarted'; order: string[] }
  | { type: 'turnStarted'; playerId: string; turn: number }
  | { type: 'rolled'; playerId: string; dice: [number, number]; doubles: boolean; inJail: boolean }
  | { type: 'moved'; playerId: string; from: number; to: number; passedStart: boolean; teleport?: boolean }
  | { type: 'salary'; playerId: string; amount: number }
  | { type: 'paid'; from: string | null; to: string | null; amount: number; reason: PayReason; tile?: number }
  | { type: 'rentDue'; playerId: string; owner: string; tile: number; amount: number }
  | { type: 'offeredProperty'; playerId: string; tile: number; price: number }
  | { type: 'bought'; playerId: string; tile: number; price: number }
  | { type: 'declined'; playerId: string; tile: number }
  | { type: 'cardDrawn'; playerId: string; deck: 'luck' | 'treasure'; cardId: string }
  | { type: 'jailed'; playerId: string; reason: 'doubles' | 'tile' | 'card' }
  | { type: 'jailRollFailed'; playerId: string; turnsLeft: number }
  | { type: 'leftJail'; playerId: string; how: 'paid' | 'card' | 'doubles' | 'forced' }
  | { type: 'auctionStarted'; tile: number; participants: string[] }
  | { type: 'bid'; playerId: string; amount: number; tile: number }
  | { type: 'passedBid'; playerId: string; tile: number }
  | { type: 'auctionEnded'; tile: number; winner: string | null; amount: number }
  | { type: 'built'; playerId: string; tile: number; houses: number; cost: number }
  | { type: 'soldHouse'; playerId: string; tile: number; houses: number; refund: number }
  | { type: 'mortgaged'; playerId: string; tile: number; amount: number }
  | { type: 'unmortgaged'; playerId: string; tile: number; amount: number }
  | { type: 'tradeProposed'; tradeId: string; from: string; to: string }
  | { type: 'tradeAccepted'; tradeId: string; from: string; to: string }
  | { type: 'tradeDeclined'; tradeId: string; by: string }
  | { type: 'tradeCancelled'; tradeId: string; by: string }
  | { type: 'tradeCountered'; tradeId: string; newTradeId: string; by: string }
  | { type: 'tradeExpired'; tradeId: string }
  | { type: 'debt'; playerId: string; creditor: string | null; amount: number }
  | { type: 'debtSettled'; playerId: string }
  | { type: 'bankrupt'; playerId: string; creditor: string | null }
  | { type: 'jackpot'; playerId: string; amount: number }
  | { type: 'freeParking'; playerId: string }
  | { type: 'tax'; playerId: string; tile: number; amount: number }
  | { type: 'special'; playerId: string; tile: number }
  | { type: 'resigned'; playerId: string }
  | { type: 'replacedByBot'; playerId: string }
  | { type: 'connection'; playerId: string; connected: boolean }
  | { type: 'turnEnded'; playerId: string }
  | { type: 'timeUp' }
  | { type: 'gameOver'; winner: string | null; ranking: string[] };

export type PayReason =
  | 'rent'
  | 'tax'
  | 'card'
  | 'jailFine'
  | 'purchase'
  | 'auction'
  | 'build'
  | 'sellHouse'
  | 'mortgage'
  | 'unmortgage'
  | 'trade'
  | 'repairs'
  | 'bankruptcy'
  | 'special'
  | 'salary';
