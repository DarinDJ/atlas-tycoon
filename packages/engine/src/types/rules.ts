export type BotLevel = 'easy' | 'medium' | 'hard';

export interface HouseRules {
  startingCash: number;
  salary: number;
  /** Extra cash for landing exactly on Start (0 = none). */
  landOnStartBonus: number;
  jailFine: number;
  maxJailTurns: number;
  doubleRentOnFullSet: boolean;
  auctionEnabled: boolean;
  freeParkingJackpot: boolean;
  evenBuild: boolean;
  noRentInJail: boolean;
  randomizeTurnOrder: boolean;
  maxPlayers: number;
  /** Seconds per decision. 0 = no timer. */
  turnTimerSeconds: number;
  /** Minutes until the richest player wins. 0 = last player standing only. */
  timeLimitMinutes: number;
  mortgageInterestPct: number;
  auctionMinIncrement: number;
  /** null = unlimited supply. */
  houseLimit: number | null;
  hotelLimit: number | null;
  /** Properties of a player who goes bankrupt to the bank are auctioned (true) or returned to the bank (false). */
  bankruptcyAuction: boolean;
  /** Allow building/mortgaging/trading outside your own turn. */
  actionsAnytime: boolean;
  /** Collect salary when a card moves you past Start. */
  salaryOnCardMove: boolean;
  /** Private rooms are not listed in the public lobby. */
  isPrivate: boolean;
  /** Seats not filled by humans are filled with bots at this level (null = none). */
  fillWithBots: BotLevel | null;
  voteKickEnabled: boolean;
}

export const DEFAULT_RULES: HouseRules = {
  startingCash: 1500,
  salary: 200,
  landOnStartBonus: 0,
  jailFine: 50,
  maxJailTurns: 3,
  doubleRentOnFullSet: true,
  auctionEnabled: true,
  freeParkingJackpot: false,
  evenBuild: true,
  noRentInJail: false,
  randomizeTurnOrder: true,
  maxPlayers: 8,
  turnTimerSeconds: 60,
  timeLimitMinutes: 0,
  mortgageInterestPct: 10,
  auctionMinIncrement: 10,
  houseLimit: null,
  hotelLimit: null,
  bankruptcyAuction: false,
  actionsAnytime: true,
  salaryOnCardMove: true,
  isPrivate: false,
  fillWithBots: null,
  voteKickEnabled: true,
};
