/**
 * Postgres storage adapter (stub). Implement `Storage` with `pg`:
 *   npm i pg && set DB_URL=postgres://user:pass@host/db
 * Schema is the same as the SQLite one in db.ts (rooms, results, player_stats, entitlements, purchases, daily).
 * Wire it in index.ts:  const storage = cfg.dbUrl ? new PostgresStorage(cfg.dbUrl) : openStorage(cfg.dbPath)
 */
import type { GameResultRow, LeaderboardRow, Storage } from './db.js';

export class PostgresStorage implements Storage {
  constructor(private url: string) {
    void this.url;
    throw new Error('PostgresStorage is a stub: see packages/server/src/storage/postgres.ts');
  }
  saveRoomSnapshot(): void {}
  deleteRoomSnapshot(): void {}
  loadActiveRoomSnapshots(): { code: string; json: string }[] {
    return [];
  }
  saveResult(_r: GameResultRow): void {}
  leaderboard(): LeaderboardRow[] {
    return [];
  }
  grantEntitlement(): void {}
  entitlements(): string[] {
    return [];
  }
  recordPurchase(): void {}
  dailyChallengeProgress(): Record<string, number> {
    return {};
  }
  bumpDailyChallenge(): void {}
  close(): void {}
}
