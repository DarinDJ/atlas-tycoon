import { z } from 'zod';
import type { MapDefinition } from '../types/map.js';

const localized = z.object({
  name: z.string().optional(),
  fact: z.string().optional(),
  text: z.string().optional(),
});

const tileBase = {
  id: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9_-]+$/, 'ids are lowercase slugs'),
  name: z.string().min(1).max(40),
  emoji: z.string().max(8).optional(),
  fact: z.string().max(300).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  image: z.string().max(500).optional(),
  i18n: z.record(z.string(), localized).optional(),
};

const money = z.number().int().min(0).max(1_000_000_000);

export const cardEffectSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('money'), amount: z.number().int() }),
  z.object({ kind: z.literal('moveTo'), tileId: z.string(), collectSalary: z.boolean().optional() }),
  z.object({ kind: z.literal('moveBy'), steps: z.number().int().min(-39).max(39) }),
  z.object({ kind: z.literal('gotoJail') }),
  z.object({ kind: z.literal('jailFree') }),
  z.object({ kind: z.literal('repairs'), perHouse: money, perHotel: money }),
  z.object({ kind: z.literal('eachPlayer'), amount: z.number().int() }),
  z.object({
    kind: z.literal('nearest'),
    tileType: z.enum(['transport', 'utility']),
    rentMultiplier: z.number().min(1).max(20).optional(),
  }),
]);

export const tileSchema = z.discriminatedUnion('type', [
  z.object({
    ...tileBase,
    type: z.literal('property'),
    group: z.string(),
    price: money,
    rent: z.tuple([money, money, money, money, money, money]),
    houseCost: money,
    mortgage: money.optional(),
  }),
  z.object({
    ...tileBase,
    type: z.literal('transport'),
    price: money,
    rent: z.array(money).min(1),
    mortgage: money.optional(),
  }),
  z.object({
    ...tileBase,
    type: z.literal('utility'),
    price: money,
    multipliers: z.array(z.number().min(0)).min(1),
    mortgage: money.optional(),
  }),
  z.object({
    ...tileBase,
    type: z.literal('tax'),
    amount: money,
    percentOfNetWorth: z.number().min(0).max(100).optional(),
  }),
  z.object({ ...tileBase, type: z.literal('luck') }),
  z.object({ ...tileBase, type: z.literal('treasure') }),
  z.object({ ...tileBase, type: z.literal('start') }),
  z.object({ ...tileBase, type: z.literal('jail') }),
  z.object({ ...tileBase, type: z.literal('gotojail') }),
  z.object({ ...tileBase, type: z.literal('freeparking') }),
  z.object({
    ...tileBase,
    type: z.literal('special'),
    effect: cardEffectSchema,
    description: z.string().max(200),
  }),
]);

export const cardSchema = z.object({
  id: z.string().min(1).max(40),
  text: z.string().min(1).max(300),
  effect: cardEffectSchema,
  i18n: z.record(z.string(), localized).optional(),
});

const hex = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'hex colour');

export const mapSchema = z.object({
  schema: z.literal(1),
  id: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(60),
  tagline: z.string().max(140).optional(),
  country: z.string().min(1).max(60),
  region: z.string().max(60).optional(),
  flag: z.string().max(8).optional(),
  premium: z.boolean().optional(),
  currency: z.object({
    code: z.string().length(3),
    symbol: z.string().min(1).max(4),
    style: z.enum(['plain', 'indian-lakh', 'compact']),
    locale: z.string().min(2).max(12),
  }),
  economy: z.object({
    startingCash: money.min(1),
    salary: money,
    jailFine: money,
    auctionMinIncrement: money.min(1),
  }),
  theme: z.object({
    primary: hex,
    secondary: hex,
    accent: hex,
    boardBg: hex,
    tileBg: hex,
    text: hex,
    centerGradient: z.string().max(300).optional(),
    font: z.string().max(80).optional(),
  }),
  audio: z
    .object({ music: z.string().optional(), dice: z.string().optional(), ambient: z.string().optional() })
    .optional(),
  groups: z.array(
    z.object({
      id: z.string().min(1).max(30),
      name: z.string().min(1).max(40),
      color: hex,
      marker: z.string().max(3).optional(),
      i18n: z.record(z.string(), localized).optional(),
    }),
  ),
  tiles: z.array(tileSchema).min(12).max(80),
  cards: z.object({ luck: z.array(cardSchema).min(4), treasure: z.array(cardSchema).min(4) }),
  deckNames: z.object({ luck: z.string(), treasure: z.string() }).optional(),
  i18n: z
    .record(
      z.string(),
      z.object({
        name: z.string().optional(),
        tagline: z.string().optional(),
        deckNames: z.object({ luck: z.string(), treasure: z.string() }).optional(),
      }),
    )
    .optional(),
  seo: z
    .object({
      title: z.string().optional(),
      description: z.string().optional(),
      keywords: z.array(z.string()).optional(),
    })
    .optional(),
});

export interface ValidationIssue {
  level: 'error' | 'warning';
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  map?: MapDefinition;
}

/** Schema + semantic validation of a map definition. */
export function validateMap(input: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  const parsed = mapSchema.safeParse(input);
  if (!parsed.success) {
    for (const i of parsed.error.issues)
      issues.push({ level: 'error', path: i.path.join('.'), message: i.message });
    return { ok: false, issues };
  }
  const map = parsed.data as MapDefinition;
  const err = (path: string, message: string) => issues.push({ level: 'error', path, message });
  const warn = (path: string, message: string) => issues.push({ level: 'warning', path, message });

  // Unique ids
  const ids = new Set<string>();
  map.tiles.forEach((t, i) => {
    if (ids.has(t.id)) err(`tiles.${i}.id`, `Duplicate tile id "${t.id}"`);
    ids.add(t.id);
  });
  const groupIds = new Set(map.groups.map((g) => g.id));
  if (groupIds.size !== map.groups.length) err('groups', 'Duplicate group ids');

  // Required tiles
  const count = (type: string) => map.tiles.filter((t) => t.type === type).length;
  if (count('start') !== 1) err('tiles', 'Exactly one start tile is required');
  if (map.tiles[0]?.type !== 'start') err('tiles.0', 'The first tile must be the start tile');
  if (count('jail') !== 1) err('tiles', 'Exactly one jail tile is required');
  if (count('gotojail') > 1) err('tiles', 'At most one go-to-jail tile');
  if (count('freeparking') > 1) err('tiles', 'At most one free parking tile');
  if (map.tiles.length % 4 !== 0) warn('tiles', 'Tile count should be a multiple of 4 for a square board');
  if (count('luck') > 0 && map.cards.luck.length === 0)
    err('cards.luck', 'Luck tiles exist but the deck is empty');
  if (count('treasure') > 0 && map.cards.treasure.length === 0)
    err('cards.treasure', 'Treasure tiles exist but the deck is empty');

  // Groups
  const groupMembers = new Map<string, number[]>();
  map.tiles.forEach((t, i) => {
    if (t.type !== 'property') return;
    if (!groupIds.has(t.group)) err(`tiles.${i}.group`, `Unknown group "${t.group}"`);
    groupMembers.set(t.group, [...(groupMembers.get(t.group) ?? []), i]);
    if (t.rent.some((r, k) => k > 0 && r < (t.rent[k - 1] ?? 0)))
      warn(`tiles.${i}.rent`, 'Rent should increase with houses');
    if (t.houseCost <= 0) warn(`tiles.${i}.houseCost`, 'House cost is zero');
    if (t.mortgage !== undefined && t.mortgage > t.price) err(`tiles.${i}.mortgage`, 'Mortgage above price');
  });
  for (const g of map.groups) {
    const members = groupMembers.get(g.id) ?? [];
    if (members.length === 0) warn(`groups.${g.id}`, 'Group has no properties');
    if (members.length > 4) warn(`groups.${g.id}`, 'Groups with more than 4 properties are hard to complete');
  }

  // Cards
  const allCards = [
    ...map.cards.luck.map((c) => ({ c, d: 'luck' })),
    ...map.cards.treasure.map((c) => ({ c, d: 'treasure' })),
  ];
  const cardIds = new Set<string>();
  for (const { c, d } of allCards) {
    if (cardIds.has(c.id)) err(`cards.${d}`, `Duplicate card id "${c.id}"`);
    cardIds.add(c.id);
    if (c.effect.kind === 'moveTo' && !ids.has(c.effect.tileId))
      err(`cards.${d}.${c.id}`, `Unknown tile "${c.effect.tileId}"`);
    if (c.effect.kind === 'nearest' && count(c.effect.tileType) === 0)
      err(`cards.${d}.${c.id}`, `No ${c.effect.tileType} tiles`);
  }
  map.tiles.forEach((t, i) => {
    if (t.type === 'special' && t.effect.kind === 'moveTo' && !ids.has(t.effect.tileId))
      err(`tiles.${i}.effect`, 'Unknown tile');
  });

  // Economy sanity
  const prices = map.tiles.flatMap((t) => ('price' in t ? [t.price] : []));
  const totalPrice = prices.reduce((a, b) => a + b, 0);
  if (totalPrice > 0 && map.economy.startingCash * 4 < totalPrice * 0.5) {
    warn('economy.startingCash', 'Starting cash looks low relative to total property value');
  }
  if (map.economy.salary > map.economy.startingCash) warn('economy.salary', 'Salary exceeds starting cash');

  return { ok: !issues.some((i) => i.level === 'error'), issues, map };
}
