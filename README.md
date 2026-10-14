# Atlas Tycoon

A free, no-signup, multiplayer property-trading board game for the browser, in the spirit of richup.io.
2–8 players (or bots), and every map is a real place: World Cities is the default, with Europe, USA, UK and an India map alongside.

- **Engine**: pure, deterministic TypeScript reducer with seeded RNG, 89 unit tests, bot AI, and a bot-vs-bot balance simulator.
- **Server**: Node + socket.io, fully authoritative (clients only send intents), rooms with share codes, reconnection, turn timers, AFK → bot takeover, vote-kick, chat with profanity filter, rate limiting, SQLite persistence (Node's built-in `node:sqlite`, no native build).
- **Web**: React + Vite + Tailwind + Framer Motion + Zustand, installable PWA, mobile-first, English + Hindi, map editor with balance simulator, store/ads/analytics plumbing, Playwright e2e.
- **Maps**: World Cities, Europe Grand Tour, India Cities (free), USA Cities and UK Cities (premium packs). Each colour group is one country/state/region. Adding a map is one data file.

Rename the game in `packages/web/src/config/brand.ts` (plus `index.html` and the PWA manifest in `vite.config.ts`).

---

## Quick start

```bash
# Node >= 22.13 (uses the built-in sqlite module)
npm install
npm run dev          # server on :3001, web on :5173 (Vite proxies /api and /socket.io)
```

Open http://localhost:5173, enter a name, click **Play vs bots**.

One-command container run (needs Docker):

```bash
docker compose up --build   # http://localhost:8080
```

Other commands:

| Command | What it does |
| --- | --- |
| `npm test` | engine + maps + server test suites (Vitest) |
| `npm run test:e2e` | Playwright: full bot game, two-browser room, store, editor (`npx playwright install chromium` first) |
| `npm run lint` / `npm run typecheck` / `npm run format` | ESLint, tsc, Prettier |
| `npm run validate-maps` | schema + semantic validation and static balance report for every map |
| `npm run simulate -- --map world-cities --games 500 --players 4 --levels medium,hard` | bot-vs-bot simulator (≈0.3 s/game) |
| `npm run loadtest -w @bt/server -- --rooms 300` | spin up N bot rooms against a running server |
| `npm run export -w @bt/maps` | dump every map as JSON (for the editor / CDN) |

---

## Architecture

```
packages/
  engine/   pure game logic (no I/O)            -> shared by server, web, simulator
  maps/     map data files + validate/simulate scripts
  server/   express + socket.io authoritative server, storage, store/analytics adapters
  web/      React PWA (lobby, board, editor, store, SEO landing pages)
```

### Engine (`packages/engine`)

- `createGame(map, seats, rules, seed)` → `GameState`; `applyAction(state, action, map)` → `{ ok, state, events }`.
  Never mutates; uses immer. Every random draw comes from `state.rng = { seed, count }`, so any snapshot replays identically.
- `GameEvent`s (`rolled`, `moved`, `paid`, `cardDrawn`, `auctionEnded`, …) drive client animation and the log; the client translates them.
- `legalActions(state, map, playerId)` returns exactly what a player may do now (the UI never guesses).
- `checks.ts` holds the legality rules, used by both the reducer (throws) and queries (booleans).
- Bots: `botDecide(state, map, playerId, level)` is a pure function; three levels (`easy`/`medium`/`hard`) differ in valuation, auction caps, building, and trading (set-completion offers, counters, late-game urgency).
- `validateMap()` (zod + semantic checks), `analyzeBalance()` (ROI / payback per colour group), `runSimulations()`.

Turn flow: `preRoll → (roll) → awaitBuy | auction | debt → postRoll → endTurn`. Doubles return to `preRoll`; three doubles jail. Debts block the game until the debtor sells/mortgages/trades or goes bankrupt (automatic when liquidation value cannot cover the debt).

### Server (`packages/server`)

- `rooms/room.ts`: one `Room` per code — seats, rules, chat, game state, timers (turn deadline, bot ticks, timed-mode ticks), AFK handling, vote-kick, snapshots.
- `rooms/manager.ts`: create/join/quick-match/public list, persistence (debounced snapshots restore in-progress games after a restart), results → leaderboard + daily challenges.
- `sockets.ts`: every message validated with zod (`protocol.ts`), per-socket token-bucket rate limits, player id always taken from the socket, never the payload.
- `http.ts`: `/api/maps`, `/api/rooms`, `/api/leaderboard`, `/api/me`, store endpoints, editor validate/simulate, analytics sink, health.
- `payments/`: product catalogue + `StripeProvider`/`RazorpayProvider` adapters (webhook signature verification implemented, checkout creation stubbed with `TODO(real-*)`), `dev` provider for test mode.
- `storage/db.ts`: `Storage` interface; SQLite implementation; in-memory fallback; `postgres.ts` stub.

### Web (`packages/web`)

- `store/useGame.ts` (Zustand) mirrors room/game state from the socket; `legal` comes from the server for the current player.
- `components/board/*`: CSS-grid board (`boardGeometry` works for any multiple-of-4 tile count), hopping tokens (Framer Motion), tumbling dice, procedural city art (`lib/tileArt.ts`, replaced by `tile.image` when real artwork exists).
- `i18n/`: tiny dictionary-based i18n (`en`, `hi`; `ta/bn/mr/te` slots ready), map strings come from the map file (`i18n` blocks per tile/card/group).
- Cosmetics (`config/cosmetics.ts`) and themes are data; premium items check entitlements.
- `pages/Editor.tsx`: edit tiles/groups/cards/economy with live preview, validate, simulate, import/export JSON.
- `pages/MapLanding.tsx`: `/play/:mapId` SEO page with title/meta/JSON-LD.

---

## How to add a map

1. Copy `packages/maps/src/india-cities.ts` to `packages/maps/src/<your-id>.ts` (or build it in the in-app editor and export JSON, then paste the object).
2. Keep the structure: 40 tiles (any multiple of 4 works), tile 0 = `start`, one `jail`, groups of 2–3 properties, 16+16 cards. Card `moveTo` effects reference tile `id`s.
3. Register it in `packages/maps/src/index.ts`.
4. `npm run validate-maps` then `npm run simulate -- --map <your-id> --games 300` and tune until seat win-rates are even and games finish.
5. Optional: add `i18n.hi` strings, `image` URLs for real artwork, `theme` colours, `audio` keys, `seo` text. Set `premium: true` and add a product in `packages/server/src/payments/index.ts` to sell it.

Amounts are plain integers; the `currency.style` decides formatting (`indian-lakh` renders 150 as ₹1.5 Cr).

---

## Deploy

**Server** (stateful, needs a disk for SQLite): Fly.io (`fly.toml` included: `fly launch --no-deploy`, `fly volumes create gamedata`, `fly deploy`), Render (`render.yaml`), Railway (use `packages/server/Dockerfile`). Set `CORS_ORIGINS`, `PUBLIC_URL`, `TRUST_PROXY=true`, payment keys. See `packages/server/.env.example`.

**Web** (static): Vercel (`packages/web/vercel.json`, root directory `packages/web`, build `npm run build -w @bt/web` from the repo root, output `packages/web/dist`) or Cloudflare Pages. Set `VITE_API_URL=https://your-server` at build time. The server must list the web origin in `CORS_ORIGINS`.

**Single box**: `docker compose up` serves everything on one origin via nginx.

### Scaling plan (1,000+ concurrent rooms)

Measured on a laptop with `npm run loadtest -w @bt/server` (one human socket + 3 bots per room, server env `CONNECT_RATE_PER_IP=1000`):

| Rooms | Bot pace | State broadcasts/s | Action ack p50 / p95 | Errors |
| --- | --- | --- | --- | --- |
| 300 | every 0.3 s (stress) | ~270 | 9 ms / 20 ms | 0 |
| 1000 | every 1.5 s (realistic) | ~400 | 15 ms / 40 ms | 0 |

- A room is ~30–60 KB of state and a few timers; one Node process holds a few thousand rooms. CPU per action is ~0.2 ms in the engine plus JSON serialisation per connected socket (the dominant cost at scale).
- Horizontal: run N server processes behind a sticky load balancer, add `@socket.io/redis-adapter`, and shard rooms by code (`hash(code) % N`) so a room always lives on one process. Snapshots in Postgres/Redis let any process resume a room.
- Send-side cost is dominated by broadcasting the full `GameState` (~20–40 KB) per change; if needed switch to JSON patches (immer already produces them) — the client store would apply patches instead of replacing state.
- Keep SQLite for a single box; move to Postgres (adapter stub provided) for multi-node.

---

## Security & abuse

- Server-authoritative: the engine rejects any illegal action; clients never carry authority or ids.
- zod validation on every socket message and HTTP body; token-bucket rate limits per socket (actions 10/s, chat 1/s) and per IP (HTTP, connections).
- Names and chat are filtered (`security/profanity.ts`, English + common Hindi transliterations); players can mute and report.
- No accounts: a random `clientId` in localStorage identifies a guest; it is only an opaque key for seats, results and entitlements.
- Payments: webhooks are HMAC-verified; test mode never charges. Consent banner gates ads/analytics (GDPR/DPDP).

---

## Monetization & growth hooks

- Ads: `AdSlot` component (home, lobby, results only) behind `ADS_ENABLED` + consent + no-ads entitlement. Drop the AdSense/AdMob tag in `AdSlot.tsx`.
- Store: map packs, cosmetics, supporter pass; Stripe (cards, global) + Razorpay (UPI, India) adapters; entitlements per guest id.
- Analytics: pluggable adapter (`console`, `noop`, `http`) on the server; client posts to `/api/analytics`.
- Share: WhatsApp invite links in the lobby, shareable PNG result card, `/play/<map>` landing pages with meta tags + JSON-LD, leaderboards, daily challenges.

See `DECISIONS.md` for design decisions and `TODO.md` for known gaps.
