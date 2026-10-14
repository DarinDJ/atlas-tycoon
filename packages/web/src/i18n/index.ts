import type { GameEvent, GameState, MapDefinition } from '@bt/engine';
import { formatMoney } from '@bt/engine';
import { useCallback } from 'react';
import { create } from 'zustand';
import { en, type Dict, type TKey } from './en';
import { hi } from './hi';
import { readJson, writeJson } from '../lib/storage';

export type Lang = 'en' | 'hi' | 'ta' | 'bn' | 'mr' | 'te';

/** Add a language: import its dictionary and register it here. Missing keys fall back to English. */
const DICTS: Record<Lang, Partial<Dict>> = { en, hi, ta: {}, bn: {}, mr: {}, te: {} };

export const LANGUAGES: { code: Lang; label: string; ready: boolean }[] = [
  { code: 'en', label: 'English', ready: true },
  { code: 'hi', label: 'हिन्दी', ready: true },
  { code: 'ta', label: 'தமிழ்', ready: false },
  { code: 'bn', label: 'বাংলা', ready: false },
  { code: 'mr', label: 'मराठी', ready: false },
  { code: 'te', label: 'తెలుగు', ready: false },
];

interface I18nState {
  lang: Lang;
  setLang(l: Lang): void;
}

export const useI18n = create<I18nState>((set) => ({
  lang: readJson<Lang>('bt.lang', 'en'),
  setLang: (lang) => {
    writeJson('bt.lang', lang);
    document.documentElement.lang = lang;
    set({ lang });
  },
}));

export function translate(lang: Lang, key: TKey, params: Record<string, string | number> = {}): string {
  const raw = DICTS[lang]?.[key] ?? en[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) =>
    params[k] !== undefined ? String(params[k]) : `{${k}}`,
  );
}

/** Hook: t('key', { n: 2 }) */
export function useT() {
  const lang = useI18n((s) => s.lang);
  // Stable per language so it is safe to use in effect dependency lists.
  return useCallback(
    (key: TKey, params?: Record<string, string | number>) => translate(lang, key, params),
    [lang],
  );
}

// ---------------------------------------------------------------------------
// Map-aware helpers (tile names, card text, money)
// ---------------------------------------------------------------------------

export function tileName(map: MapDefinition, idx: number, lang: Lang): string {
  const t = map.tiles[idx];
  if (!t) return `#${idx}`;
  return t.i18n?.[lang]?.name ?? t.name;
}

export function tileFact(map: MapDefinition, idx: number, lang: Lang): string | undefined {
  const t = map.tiles[idx];
  return t?.i18n?.[lang]?.fact ?? t?.fact;
}

export function groupName(map: MapDefinition, groupId: string, lang: Lang): string {
  const g = map.groups.find((x) => x.id === groupId);
  return g?.i18n?.[lang]?.name ?? g?.name ?? groupId;
}

export function cardText(map: MapDefinition, deck: 'luck' | 'treasure', cardId: string, lang: Lang): string {
  const c = map.cards[deck].find((x) => x.id === cardId);
  return c?.i18n?.[lang]?.text ?? c?.text ?? '';
}

export function deckName(map: MapDefinition, deck: 'luck' | 'treasure', lang: Lang): string {
  return (
    map.i18n?.[lang]?.deckNames?.[deck] ??
    map.deckNames?.[deck] ??
    translate(lang, deck === 'luck' ? 'game.luck' : 'game.treasure')
  );
}

export function mapName(map: Pick<MapDefinition, 'name' | 'i18n'>, lang: Lang): string {
  return map.i18n?.[lang]?.name ?? map.name;
}

export function money(map: MapDefinition, amount: number): string {
  return formatMoney(amount, map.currency);
}

/** Human-readable line for an event (for the log). */
export function describeEvent(
  ev: GameEvent,
  state: GameState,
  map: MapDefinition,
  lang: Lang,
  meId?: string | null,
): string | null {
  const t = (key: TKey, params?: Record<string, string | number>) => translate(lang, key, params);
  // Always use the real name: "you is bankrupt" reads badly and Hindi verbs agree differently.
  const name = (id: string | null | undefined): string => {
    if (!id) return t('app.bank');
    return state.players.find((p) => p.id === id)?.name ?? id;
  };
  void meId;
  const tile = (i: number) => tileName(map, i, lang);
  const m = (n: number) => money(map, n);
  switch (ev.type) {
    case 'gameStarted':
      return t('ev.gameStarted');
    case 'turnStarted':
      return null;
    case 'rolled':
      return t('ev.rolled', {
        name: name(ev.playerId),
        a: ev.dice[0],
        b: ev.dice[1],
        doubles: ev.doubles ? t('ev.doubles') : '',
      });
    case 'moved':
      return ev.teleport ? null : t('ev.moved', { name: name(ev.playerId), tile: tile(ev.to) });
    case 'salary':
      return t('ev.salary', { name: name(ev.playerId), amount: m(ev.amount) });
    case 'rentDue':
      return null;
    case 'paid':
      if (ev.reason === 'rent' && ev.tile !== undefined)
        return t('ev.rent', {
          name: name(ev.from),
          amount: m(ev.amount),
          to: name(ev.to),
          tile: tile(ev.tile),
        });
      if (
        ev.reason === 'purchase' ||
        ev.reason === 'auction' ||
        ev.reason === 'build' ||
        ev.reason === 'mortgage' ||
        ev.reason === 'sellHouse' ||
        ev.reason === 'unmortgage'
      )
        return null;
      if (ev.from === null)
        return t('ev.received', {
          name: name(ev.to),
          amount: m(ev.amount),
          reason: t(`reason.${ev.reason}` as TKey),
        });
      return t('ev.paid', {
        name: name(ev.from),
        amount: m(ev.amount),
        reason: t(`reason.${ev.reason}` as TKey),
      });
    case 'offeredProperty':
      return t('ev.offered', { tile: tile(ev.tile), price: m(ev.price) });
    case 'bought':
      return t('ev.bought', { name: name(ev.playerId), tile: tile(ev.tile), price: m(ev.price) });
    case 'declined':
      return t('ev.declined', { name: name(ev.playerId), tile: tile(ev.tile) });
    case 'cardDrawn':
      return t('ev.card', { name: name(ev.playerId), text: cardText(map, ev.deck, ev.cardId, lang) });
    case 'jailed':
      return t('ev.jailed', { name: name(ev.playerId) });
    case 'jailRollFailed':
      return t('ev.jailRollFailed', { name: name(ev.playerId), n: ev.turnsLeft });
    case 'leftJail':
      return t('ev.leftJail', { name: name(ev.playerId), how: t(`ev.how.${ev.how}` as TKey) });
    case 'auctionStarted':
      return t('ev.auctionStarted', { tile: tile(ev.tile) });
    case 'bid':
      return t('ev.bid', { name: name(ev.playerId), amount: m(ev.amount), tile: tile(ev.tile) });
    case 'passedBid':
      return t('ev.passedBid', { name: name(ev.playerId) });
    case 'auctionEnded':
      return ev.winner
        ? t('ev.auctionWon', { name: name(ev.winner), tile: tile(ev.tile), amount: m(ev.amount) })
        : t('ev.auctionNone', { tile: tile(ev.tile) });
    case 'built':
      return t('ev.built', {
        name: name(ev.playerId),
        tile: tile(ev.tile),
        houses: ev.houses === 5 ? t('game.hotel') : t('game.houses', { n: ev.houses }),
      });
    case 'soldHouse':
      return t('ev.soldHouse', { name: name(ev.playerId), tile: tile(ev.tile) });
    case 'mortgaged':
      return t('ev.mortgaged', { name: name(ev.playerId), tile: tile(ev.tile), amount: m(ev.amount) });
    case 'unmortgaged':
      return t('ev.unmortgaged', { name: name(ev.playerId), tile: tile(ev.tile) });
    case 'tradeProposed':
      return t('ev.tradeProposed', { name: name(ev.from), to: name(ev.to) });
    case 'tradeAccepted':
      return t('ev.tradeAccepted', { name: name(ev.from), to: name(ev.to) });
    case 'tradeDeclined':
      return t('ev.tradeDeclined', { name: name(ev.by) });
    case 'tradeCancelled':
      return t('ev.tradeCancelled', { name: name(ev.by) });
    case 'tradeCountered':
      return t('ev.tradeCountered', { name: name(ev.by) });
    case 'tradeExpired':
      return null;
    case 'debt':
      return t('ev.debt', { name: name(ev.playerId), amount: m(ev.amount), to: name(ev.creditor) });
    case 'debtSettled':
      return t('ev.debtSettled', { name: name(ev.playerId) });
    case 'bankrupt':
      return t('ev.bankrupt', { name: name(ev.playerId) });
    case 'jackpot':
      return t('ev.jackpot', { name: name(ev.playerId), amount: m(ev.amount) });
    case 'freeParking':
      return t('ev.freeParking', { name: name(ev.playerId) });
    case 'tax':
      return t('ev.tax', { name: name(ev.playerId), amount: m(ev.amount) });
    case 'special':
      return t('ev.special', { name: name(ev.playerId), tile: tile(ev.tile) });
    case 'resigned':
      return t('ev.resigned', { name: name(ev.playerId) });
    case 'replacedByBot':
      return t('ev.replacedByBot', { name: name(ev.playerId) });
    case 'connection':
      return t(ev.connected ? 'ev.connected' : 'ev.disconnected', { name: name(ev.playerId) });
    case 'turnEnded':
      return null;
    case 'timeUp':
      return t('ev.timeUp');
    case 'gameOver':
      return ev.winner ? t('ev.gameOver', { name: name(ev.winner) }) : t('ev.gameOverNone');
    default:
      return null;
  }
}
