import { useEffect, useState } from 'react';
import { api } from './api';

let cache: string[] | null = null;
let inflight: Promise<string[]> | null = null;
const listeners = new Set<(e: string[]) => void>();

export function loadEntitlements(force = false): Promise<string[]> {
  if (cache && !force) return Promise.resolve(cache);
  if (!inflight || force) {
    inflight = api
      .me()
      .then((me) => {
        cache = me.entitlements;
        listeners.forEach((l) => l(cache!));
        return cache;
      })
      .catch(() => cache ?? [])
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Entitlements of the current guest (cosmetics, maps, no-ads). */
export function useEntitlements(): string[] {
  const [ents, setEnts] = useState<string[]>(cache ?? []);
  useEffect(() => {
    listeners.add(setEnts);
    void loadEntitlements();
    return () => {
      listeners.delete(setEnts);
    };
  }, []);
  return ents;
}
