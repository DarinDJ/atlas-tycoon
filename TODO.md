# TODO / known gaps

## Engine & bots
- [ ] Hard bots are not reliably stronger than medium after the trading rework (per-seat win rate medium 42% vs hard 29% in a 40-game mixed sample). Tune `required` ratios in `bots/index.ts#respondToTrade` and the hard valuation multipliers; add a tournament script to measure level vs level.
- [ ] 8-player games are long (median > 600 turns with medium bots). Either default `timeLimitMinutes` for 7–8 seats or let bots build hotels earlier when they have a cash lead.
- [ ] Rules not implemented: "property instead of cash on Free Parking", limited houses by default (supported, off), trading jail-free cards for cash only (works via trade UI, no shortcut).

## Server
- [ ] Redis adapter for multi-process socket.io (plan documented in README, not wired).
- [ ] Real Stripe/Razorpay SDK calls (stubs with `TODO(real-*)` in `packages/server/src/payments/index.ts`).
- [ ] Persist `chat:report` to a table and add a minimal admin page.
- [ ] Postgres adapter (`storage/postgres.ts` is a stub).
- [ ] Optional Google login (entitlements are keyed by guest id today; a login would merge ids).

## Web
- [ ] Real city artwork (slot: `tile.image`), real OG image.
- [ ] Tamil, Bengali, Marathi, Telugu dictionaries (slots exist in `src/i18n/index.ts`).
- [ ] Pre-render `/play/<map>` pages (vite-plugin-ssr / a build script) for crawlers that do not execute JS.
- [ ] Trade dialog: drag-and-drop properties, and show the counter-party's set progress.
- [ ] Spectator mode UI is minimal (no spectator list, chat read-only).
- [ ] Add a visual regression test for the board at phone widths.

## Ops
- [ ] `npm audit` job in CI; Dependabot.
- [ ] CSP header at the edge once ad/analytics domains are known.
