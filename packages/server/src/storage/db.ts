/**
 * Persistence. Default implementation uses Node's built-in SQLite (no native build step).
 * Swap in Postgres by implementing the same interface (see storage/postgres.ts stub).
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';

// Loaded via getBuiltinModule so bundlers/vitest never try to resolve 'node:sqlite'.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
function loadSqlite(): typeof import('node:sqlite') {
  const mod = (process as unknown as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule?.(
    'node:sqlite',
  );
  if (!mod) throw new Error('node:sqlite is not available in this Node version');
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  return mod as typeof import('node:sqlite');
}

export interface GameResultRow {
  roomCode: string;
  mapId: string;
  winnerClientId: string | null;
  winnerName: string | null;
  players: { clientId: string | null; name: string; isBot: boolean; rank: number; netWorth: number }[];
  turns: number;
  durationMs: number;
  endedAt: number;
}

export interface LeaderboardRow {
  clientId: string;
  name: string;
  wins: number;
  games: number;
  bestNetWorth: number;
}

export interface Storage {
  saveRoomSnapshot(code: string, status: string, json: string, updatedAt: number): void;
  deleteRoomSnapshot(code: string): void;
  loadActiveRoomSnapshots(since: number): { code: string; json: string }[];
  saveResult(r: GameResultRow): void;
  leaderboard(mapId: string | null, limit: number): LeaderboardRow[];
  grantEntitlement(clientId: string, sku: string, source: string): void;
  entitlements(clientId: string): string[];
  recordPurchase(p: {
    id: string;
    clientId: string;
    sku: string;
    provider: string;
    amount: number;
    currency: string;
    status: string;
  }): void;
  dailyChallengeProgress(clientId: string, day: string): Record<string, number>;
  bumpDailyChallenge(clientId: string, day: string, key: string, by: number): void;
  close(): void;
}

export class SqliteStorage implements Storage {
  private db: DatabaseSyncType;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    const { DatabaseSync } = loadSqlite();
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, status TEXT NOT NULL, json TEXT NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS results (
        id INTEGER PRIMARY KEY AUTOINCREMENT, room_code TEXT, map_id TEXT, winner_client_id TEXT, winner_name TEXT,
        players_json TEXT NOT NULL, turns INTEGER, duration_ms INTEGER, ended_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS player_stats (
        client_id TEXT NOT NULL, map_id TEXT NOT NULL, name TEXT NOT NULL, wins INTEGER NOT NULL DEFAULT 0,
        games INTEGER NOT NULL DEFAULT 0, best_net_worth INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (client_id, map_id)
      );
      CREATE TABLE IF NOT EXISTS entitlements (client_id TEXT NOT NULL, sku TEXT NOT NULL, source TEXT, granted_at INTEGER, PRIMARY KEY (client_id, sku));
      CREATE TABLE IF NOT EXISTS purchases (id TEXT PRIMARY KEY, client_id TEXT, sku TEXT, provider TEXT, amount INTEGER, currency TEXT, status TEXT, created_at INTEGER);
      CREATE TABLE IF NOT EXISTS daily (client_id TEXT NOT NULL, day TEXT NOT NULL, key TEXT NOT NULL, value INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (client_id, day, key));
    `);
  }

  saveRoomSnapshot(code: string, status: string, json: string, updatedAt: number): void {
    this.db
      .prepare(
        'INSERT INTO rooms (code, status, json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(code) DO UPDATE SET status=excluded.status, json=excluded.json, updated_at=excluded.updated_at',
      )
      .run(code, status, json, updatedAt);
  }

  deleteRoomSnapshot(code: string): void {
    this.db.prepare('DELETE FROM rooms WHERE code = ?').run(code);
  }

  loadActiveRoomSnapshots(since: number): { code: string; json: string }[] {
    return this.db
      .prepare("SELECT code, json FROM rooms WHERE status = 'playing' AND updated_at > ?")
      .all(since) as {
      code: string;
      json: string;
    }[];
  }

  saveResult(r: GameResultRow): void {
    this.db
      .prepare(
        'INSERT INTO results (room_code, map_id, winner_client_id, winner_name, players_json, turns, duration_ms, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        r.roomCode,
        r.mapId,
        r.winnerClientId,
        r.winnerName,
        JSON.stringify(r.players),
        r.turns,
        r.durationMs,
        r.endedAt,
      );
    const upsert = this.db.prepare(
      `INSERT INTO player_stats (client_id, map_id, name, wins, games, best_net_worth) VALUES (?, ?, ?, ?, 1, ?)
       ON CONFLICT(client_id, map_id) DO UPDATE SET wins = wins + excluded.wins, games = games + 1, name = excluded.name,
       best_net_worth = MAX(best_net_worth, excluded.best_net_worth)`,
    );
    for (const p of r.players) {
      if (!p.clientId || p.isBot) continue;
      const won = p.rank === 1 ? 1 : 0;
      upsert.run(p.clientId, r.mapId, p.name, won, p.netWorth);
      upsert.run(p.clientId, '*', p.name, won, p.netWorth);
    }
  }

  leaderboard(mapId: string | null, limit: number): LeaderboardRow[] {
    const rows = this.db
      .prepare(
        'SELECT client_id, name, wins, games, best_net_worth FROM player_stats WHERE map_id = ? ORDER BY wins DESC, games ASC LIMIT ?',
      )
      .all(mapId ?? '*', limit) as {
      client_id: string;
      name: string;
      wins: number;
      games: number;
      best_net_worth: number;
    }[];
    return rows.map((r) => ({
      clientId: r.client_id,
      name: r.name,
      wins: r.wins,
      games: r.games,
      bestNetWorth: r.best_net_worth,
    }));
  }

  grantEntitlement(clientId: string, sku: string, source: string): void {
    this.db
      .prepare('INSERT OR IGNORE INTO entitlements (client_id, sku, source, granted_at) VALUES (?, ?, ?, ?)')
      .run(clientId, sku, source, Date.now());
  }

  entitlements(clientId: string): string[] {
    return (
      this.db.prepare('SELECT sku FROM entitlements WHERE client_id = ?').all(clientId) as { sku: string }[]
    ).map((r) => r.sku);
  }

  recordPurchase(p: {
    id: string;
    clientId: string;
    sku: string;
    provider: string;
    amount: number;
    currency: string;
    status: string;
  }): void {
    this.db
      .prepare(
        'INSERT INTO purchases (id, client_id, sku, provider, amount, currency, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status',
      )
      .run(p.id, p.clientId, p.sku, p.provider, p.amount, p.currency, p.status, Date.now());
  }

  dailyChallengeProgress(clientId: string, day: string): Record<string, number> {
    const rows = this.db
      .prepare('SELECT key, value FROM daily WHERE client_id = ? AND day = ?')
      .all(clientId, day) as { key: string; value: number }[];
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  bumpDailyChallenge(clientId: string, day: string, key: string, by: number): void {
    this.db
      .prepare(
        'INSERT INTO daily (client_id, day, key, value) VALUES (?, ?, ?, ?) ON CONFLICT(client_id, day, key) DO UPDATE SET value = value + excluded.value',
      )
      .run(clientId, day, key, by);
  }

  close(): void {
    this.db.close();
  }
}

/** In-memory fallback (tests, or when the sqlite binding is unavailable). */
export class MemoryStorage implements Storage {
  rooms = new Map<string, { status: string; json: string; updatedAt: number }>();
  results: GameResultRow[] = [];
  ents = new Map<string, Set<string>>();
  daily = new Map<string, number>();
  saveRoomSnapshot(code: string, status: string, json: string, updatedAt: number): void {
    this.rooms.set(code, { status, json, updatedAt });
  }
  deleteRoomSnapshot(code: string): void {
    this.rooms.delete(code);
  }
  loadActiveRoomSnapshots(since: number): { code: string; json: string }[] {
    return [...this.rooms.entries()]
      .filter(([, r]) => r.status === 'playing' && r.updatedAt > since)
      .map(([code, r]) => ({ code, json: r.json }));
  }
  saveResult(r: GameResultRow): void {
    this.results.push(r);
  }
  leaderboard(mapId: string | null, limit: number): LeaderboardRow[] {
    const agg = new Map<string, LeaderboardRow>();
    for (const r of this.results) {
      if (mapId && r.mapId !== mapId) continue;
      for (const p of r.players) {
        if (!p.clientId || p.isBot) continue;
        const row = agg.get(p.clientId) ?? {
          clientId: p.clientId,
          name: p.name,
          wins: 0,
          games: 0,
          bestNetWorth: 0,
        };
        row.games++;
        if (p.rank === 1) row.wins++;
        row.bestNetWorth = Math.max(row.bestNetWorth, p.netWorth);
        agg.set(p.clientId, row);
      }
    }
    return [...agg.values()].sort((a, b) => b.wins - a.wins).slice(0, limit);
  }
  grantEntitlement(clientId: string, sku: string): void {
    if (!this.ents.has(clientId)) this.ents.set(clientId, new Set());
    this.ents.get(clientId)!.add(sku);
  }
  entitlements(clientId: string): string[] {
    return [...(this.ents.get(clientId) ?? [])];
  }
  recordPurchase(): void {}
  dailyChallengeProgress(clientId: string, day: string): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, v] of this.daily) {
      const [c, d, key] = k.split('|');
      if (c === clientId && d === day && key) out[key] = v;
    }
    return out;
  }
  bumpDailyChallenge(clientId: string, day: string, key: string, by: number): void {
    const k = `${clientId}|${day}|${key}`;
    this.daily.set(k, (this.daily.get(k) ?? 0) + by);
  }
  close(): void {}
}

export function openStorage(path: string): Storage {
  try {
    return new SqliteStorage(path);
  } catch (err) {
    console.warn('[storage] sqlite unavailable, using in-memory storage:', (err as Error).message);
    return new MemoryStorage();
  }
}
