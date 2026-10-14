# Decisions log

Running record of product/engineering decisions made autonomously while building Atlas Tycoon.

## Stack & structure
- **npm workspaces** instead of pnpm/turbo: no extra install on a fresh machine; four packages (`engine`, `maps`, `server`, `web`).
- **Engine is a pure reducer** (`applyAction(state, action, map)` returning `{state, events}`), using `immer` for structural sharing and a seeded `mulberry32` RNG stored in state (`{seed, count}`), so any snapshot replays identically.
- Events are data (`GameEvent`), translated by the client; the state keeps the last 300 events as a log so late joiners see history. The log is appended outside the immer draft after profiling showed array proxies were 85% of simulator time.
- **Node's built-in `node:sqlite`** for persistence (Node >= 22.13, no native build). Loaded via `process.getBuiltinModule` so Vite/Vitest never try to bundle it; falls back to in-memory storage if unavailable. A Postgres adapter only needs to implement `Storage`.
- Bots live in the engine (`botDecide`) so the server, the CLI simulator and the map editor share one AI.

## Rules interpretation
- Tax tiles with both `amount` and `percentOfNetWorth` charge the **lower** of the two (player-friendly; no modal needed).
- Mortgaging requires the whole colour group to have no houses (standard). Unmortgage costs value + `mortgageInterestPct` (10%).
- Properties with buildings anywhere in their group cannot be traded; mortgaged properties transfer with their mortgage and no transfer fee.
- Auction: all non-bankrupt players participate (including the decliner), free-for-all bidding with a minimum increment; it ends when everyone except the high bidder has passed. No bids = property stays with the bank.
- A player who cannot pay enters a **debt phase** (can sell houses, mortgage, trade). If liquidation value can never cover the debt, bankruptcy is automatic. Bankruptcy to a player transfers everything (houses sold to the bank first); to the bank, properties return unowned (optional rule: auction them).
- Three doubles = jail, doubles after leaving jail by rolling do not grant an extra turn. After `maxJailTurns` failed rolls the fine is charged automatically and the player moves.
- Build/mortgage/trade are allowed at any time by default (`actionsAnytime`, richup-style); a house rule restricts them to your own turn.
- Timed mode: richest net worth wins when the clock runs out (server ticks every 10 s).

## Multiplayer
- No accounts: a random `clientId` in localStorage identifies a guest. Reconnecting with the same id reclaims the seat in any room.
- Disconnected or idle players get auto-actions on the turn timer; after 3 consecutive timeouts (configurable) the seat is handed to a medium bot. The human can reclaim it by sending any action. Vote-kick hands the seat to a bot permanently (majority of other connected humans).
- Leaving a lobby is final; leaving mid-game keeps the seat alive for reconnection.
- Rooms live in memory; snapshots are persisted (debounced 2 s) so a restart restores in-progress games for an hour. Horizontal scaling plan is in README (sticky sessions + socket.io Redis adapter, rooms sharded by code).
- Full `GameState` is sent on every change (~20-40 KB). Diffs were not worth the complexity at 2-8 players per room.

## Maps
- India amounts are stored in **lakhs** and formatted as `₹60 L` / `₹1.5 Cr`; starting cash ₹15 Cr. Other maps use plain currency.
- All five maps reuse the same rent/price tables by board position so balance work transfers; names, cards, art and theme are per map.
- India Cities utilities are Power Grid and Telecom Tower because the standard board only has two utility slots.
- Premium maps (USA, UK) can be *joined* by anyone; only *creating* a room with them needs an entitlement.

## Monetization
- Payments are adapters (`StripeProvider`, `RazorpayProvider`) with HMAC webhook verification already wired; checkout creation is stubbed behind clear `TODO(real-*)` markers. A `dev` provider completes purchases instantly when `STORE_DEV_MODE=true`.
- Ads are behind `ADS_ENABLED` and only render in lobby/results screens, never on the board.

## 2026-10-08 feedback round
- **Renamed to "Atlas Tycoon"** (working title, one-file rename in `packages/web/src/config/brand.ts`): the game is global; India is one map among several. Default map is now World Cities; bot names are international.
- **Clusters = one country/state/region per colour group** on the World, USA and UK maps (richup-style), with the flag/regional emoji on every tile of the group. India maps keep regional clusters.
- **Animation sequencing**: the client replays server event batches through `lib/animator.ts` (dice tumble ~0.95 s, then pawn hops, then card flip). The board renders `visual` positions that lag the authoritative state, so pawns never move while dice are still rolling.
- **Pawns are the player's avatar on a disc in the player's colour**; "token" cosmetics became pawn shapes/finishes. Ownership on tiles is a solid colour strip plus the owner's mini pawn instead of a faint tint.
- **Default theme is dark ("night")** with light board tiles; all UI colours are theme variables.
- **Trade dialog** is a fixed-height two-column layout (give | get) with cash sliders and property chips so both sides fit one laptop screen.

## 2026-10-14 feedback round
- **One India map only.** The Heritage & Tourism map was removed; India Cities stays as the single free India-themed map. Replaced by **Europe – Grand Tour** (free, one country per colour group).
- Bot names, store cosmetics and marketing copy are culture-neutral. Hindi remains available as a UI language (it is localisation, not theming); Razorpay stays as an optional payment adapter for Indian players.
