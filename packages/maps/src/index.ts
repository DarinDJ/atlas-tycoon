import type { MapDefinition } from '@bt/engine';
import { indiaCities } from './india-cities.js';

/**
 * Map registry. To add a map: create `src/<id>.ts` exporting a MapDefinition and add it to the list.
 * Maps are plain data; `npm run validate -w @bt/maps` checks all of them.
 */
const registry: MapDefinition[] = [indiaCities];

export function register(map: MapDefinition): void {
  if (!registry.some((m) => m.id === map.id)) registry.push(map);
}

export function listMaps(): MapDefinition[] {
  return registry.slice();
}

export function getMap(id: string): MapDefinition | undefined {
  return registry.find((m) => m.id === id);
}

export const DEFAULT_MAP_ID = indiaCities.id;

export { indiaCities };
