import type { MapDefinition, PropertyTile } from '../types/map.js';

export interface GroupBalance {
  groupId: string;
  name: string;
  tiles: number;
  /** Cost to buy every property in the set. */
  setCost: number;
  /** Cost to put a hotel on every property. */
  fullBuildCost: number;
  /** Total investment for set + hotels. */
  totalInvestment: number;
  /** Average base rent (no houses, no set bonus). */
  avgBaseRent: number;
  /** Average rent with a hotel. */
  avgHotelRent: number;
  /** Hotel rent / total investment per tile: higher = faster payback. */
  hotelRoi: number;
  /** Base rent / price. */
  baseRoi: number;
  /** Expected rent per opponent lap at hotel level (sum over set, landing prob ~ 1/tiles). */
  expectedHotelRentPerLap: number;
  /** Turns of opponent laps to pay back full investment (lower = stronger). */
  paybackLaps: number;
}

export interface BalanceReport {
  totalPropertyValue: number;
  startingCashRatio: number;
  groups: GroupBalance[];
  transports: { count: number; price: number; maxRent: number } | null;
  utilities: { count: number; price: number; maxMultiplier: number } | null;
  warnings: string[];
}

/** Static economic analysis of a map. Cheap; complements the bot-vs-bot simulator. */
export function analyzeBalance(map: MapDefinition): BalanceReport {
  const warnings: string[] = [];
  const n = map.tiles.length;
  const groups: GroupBalance[] = [];
  for (const g of map.groups) {
    const tiles = map.tiles.filter((t): t is PropertyTile => t.type === 'property' && t.group === g.id);
    if (tiles.length === 0) continue;
    const setCost = tiles.reduce((a, t) => a + t.price, 0);
    const fullBuildCost = tiles.reduce((a, t) => a + t.houseCost * 5, 0);
    const totalInvestment = setCost + fullBuildCost;
    const avgBaseRent = tiles.reduce((a, t) => a + t.rent[0], 0) / tiles.length;
    const avgHotelRent = tiles.reduce((a, t) => a + t.rent[5], 0) / tiles.length;
    const expectedHotelRentPerLap = tiles.reduce((a, t) => a + t.rent[5], 0) / n;
    const gb: GroupBalance = {
      groupId: g.id,
      name: g.name,
      tiles: tiles.length,
      setCost,
      fullBuildCost,
      totalInvestment,
      avgBaseRent,
      avgHotelRent,
      hotelRoi: avgHotelRent / (totalInvestment / tiles.length),
      baseRoi: avgBaseRent / (setCost / tiles.length),
      expectedHotelRentPerLap,
      paybackLaps: expectedHotelRentPerLap > 0 ? totalInvestment / expectedHotelRentPerLap : Infinity,
    };
    groups.push(gb);
    if (gb.hotelRoi < 0.3)
      warnings.push(
        `Group "${g.name}": hotel rent is weak relative to investment (ROI ${gb.hotelRoi.toFixed(2)})`,
      );
    if (gb.hotelRoi > 2.0)
      warnings.push(`Group "${g.name}": hotel rent is very strong (ROI ${gb.hotelRoi.toFixed(2)})`);
    if (gb.baseRoi < 0.03) warnings.push(`Group "${g.name}": base rent below 3% of price`);
  }
  // Monotonic check: later (pricier) groups should have higher payback strength, roughly.
  const rois = groups.map((g) => g.paybackLaps);
  for (let i = 1; i < rois.length; i++) {
    if (rois[i]! > rois[i - 1]! * 1.6)
      warnings.push(`Group "${groups[i]!.name}" pays back much slower than "${groups[i - 1]!.name}"`);
  }
  const transports = map.tiles.filter((t) => t.type === 'transport');
  const utilities = map.tiles.filter((t) => t.type === 'utility');
  const totalPropertyValue = map.tiles.reduce((a, t) => a + ('price' in t ? t.price : 0), 0);
  return {
    totalPropertyValue,
    startingCashRatio: map.economy.startingCash / Math.max(1, totalPropertyValue),
    groups,
    transports:
      transports.length > 0 && transports[0]!.type === 'transport'
        ? { count: transports.length, price: transports[0]!.price, maxRent: Math.max(...transports[0]!.rent) }
        : null,
    utilities:
      utilities.length > 0 && utilities[0]!.type === 'utility'
        ? {
            count: utilities.length,
            price: utilities[0]!.price,
            maxMultiplier: Math.max(...utilities[0]!.multipliers),
          }
        : null,
    warnings,
  };
}
