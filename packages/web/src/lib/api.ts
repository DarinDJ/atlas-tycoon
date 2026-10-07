import type { MapDefinition } from '@bt/engine';
import { getClientId } from './storage';

const BASE = import.meta.env.VITE_API_URL ?? '';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { 'x-client-id': getClientId() } });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return (await res.json()) as T;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-client-id': getClientId() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return (await res.json()) as T;
}

export interface MapSummary {
  id: string;
  name: string;
  tagline?: string;
  country: string;
  flag?: string;
  premium: boolean;
  currency: MapDefinition['currency'];
  theme: MapDefinition['theme'];
  tiles: number;
  properties: number;
  seo?: MapDefinition['seo'];
  i18n?: MapDefinition['i18n'];
}

export interface AppConfig {
  adsEnabled: boolean;
  storeProviders: string[];
  maps: MapSummary[];
}

export interface PublicRoom {
  code: string;
  mapId: string;
  hostName: string;
  players: number;
  maxPlayers: number;
  bots: number;
  status: 'lobby' | 'playing';
  createdAt: number;
}

export interface LeaderboardRow {
  clientId: string;
  name: string;
  wins: number;
  games: number;
  bestNetWorth: number;
}

export interface Product {
  sku: string;
  kind: 'map' | 'cosmetic' | 'pass';
  name: string;
  description: string;
  priceInr: number;
  priceUsd: number;
  grants: string[];
}

const mapCache = new Map<string, Promise<MapDefinition>>();

export const api = {
  config: () => get<AppConfig>('/api/config'),
  maps: () => get<MapSummary[]>('/api/maps'),
  map: (id: string) => {
    if (!mapCache.has(id)) mapCache.set(id, get<MapDefinition>(`/api/maps/${id}`));
    return mapCache.get(id)!;
  },
  rooms: () => get<PublicRoom[]>('/api/rooms'),
  room: (code: string) =>
    get<{ code: string; status: string; mapId: string; players: number; maxPlayers: number }>(
      `/api/rooms/${code}`,
    ),
  leaderboard: (mapId?: string) => get<LeaderboardRow[]>(`/api/leaderboard${mapId ? `?map=${mapId}` : ''}`),
  me: () => get<{ entitlements: string[]; daily: Record<string, number>; day: string }>('/api/me'),
  products: () => get<{ products: Product[]; providers: string[] }>('/api/store/products'),
  checkout: (sku: string, provider: string) =>
    post<{ provider: string; id: string; url: string }>('/api/store/checkout', {
      sku,
      provider,
      clientId: getClientId(),
    }),
  validateMap: (map: unknown) =>
    post<{ ok: boolean; issues: { level: string; path: string; message: string }[]; balance: unknown }>(
      '/api/editor/validate',
      map,
    ),
  simulate: (map: unknown, games: number, players: number) =>
    post<Record<string, unknown>>('/api/editor/simulate', { map, games, players }),
  track: (event: string, props?: Record<string, unknown>) =>
    post('/api/analytics', { event, props }).catch(() => undefined),
};
