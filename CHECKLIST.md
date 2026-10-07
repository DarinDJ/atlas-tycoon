# Launch checklist (things only you can do)

## Naming & legal
- [ ] Pick the final name (working title "Bharat Tycoon"). Run a trademark search (India: ipindia.gov.in TM search; also USPTO/WIPO) and check domain + app-store availability. Rename in `packages/web/src/config/brand.ts`, `packages/web/index.html`, the PWA manifest in `packages/web/vite.config.ts`, `fly.toml`/`render.yaml` app names, and `public/sitemap.xml` URLs.
- [ ] Have a lawyer glance at the card texts / tile names if you want extra comfort; everything is original, but "look and feel" claims exist in this genre.
- [ ] Privacy policy & terms: the text in `pages/HowToPlay.tsx#privacy` is a placeholder. Put your legal entity, contact email (`BRAND.supportEmail`) and DPDP/GDPR specifics in.

## Infrastructure
- [ ] Buy the domain; point `app.` (or root) at the static host and `api.` at the server.
- [ ] Deploy the server (Fly.io: `fly launch` with the included `fly.toml`, create the `gamedata` volume; or Render/Railway with `packages/server/Dockerfile`). Set env: `CORS_ORIGINS`, `PUBLIC_URL`, `TRUST_PROXY=true`, `STORE_DEV_MODE=false`, `ANALYTICS_ADAPTER`.
- [ ] Deploy the web app (Vercel/Cloudflare Pages, root `packages/web`, env `VITE_API_URL=https://api.yourdomain`). Update `public/sitemap.xml` and `robots.txt` with the real domain.
- [ ] Set up uptime monitoring on `/api/health`, and backups of the SQLite volume (or move to Postgres: `packages/server/src/storage/postgres.ts` stub).

## Monetization
- [ ] Google AdSense/AdMob account; paste the ad tag into `packages/web/src/components/AdSlot.tsx` and set `ADS_ENABLED=true`. Keep ads out of the board (already enforced).
- [ ] Razorpay account (UPI for India) and Stripe account; add keys to the server env and finish the two `TODO(real-*)` blocks in `packages/server/src/payments/index.ts` (create a payment link / checkout session with `clientId` + `sku` in metadata). Point the provider webhooks at `/api/store/webhook/razorpay` and `/api/store/webhook/stripe`.
- [ ] Decide prices (`PRODUCTS` in `payments/index.ts`); amounts are in paise/cents.

## Content
- [ ] Real city artwork: drop images into `packages/web/public/art/<map>/<tile-id>.jpg` and set `image` on each tile (the procedural skyline is the fallback). Suggested size 600×300, <60 KB each.
- [ ] Review the Hindi strings (`packages/web/src/i18n/hi.ts`, map `i18n.hi` blocks) with a native speaker; add Tamil/Bengali/Marathi/Telugu dictionaries in `packages/web/src/i18n/` (slots exist in `LANGUAGES`).
- [ ] Fact-check the "Did you know?" blurbs on all five maps (written from general knowledge).
- [ ] Real music/SFX if you want them (current sounds are synthesized; `lib/audio.ts`).

## Growth
- [ ] Google Search Console: submit `sitemap.xml`; verify the `/play/<map>` pages render their meta tags (they are set client-side; consider pre-rendering with a static-site step if you want crawler-perfect SEO).
- [ ] Analytics backend: set `ANALYTICS_ADAPTER=http` and `ANALYTICS_ENDPOINT` (PostHog, your own collector, …).
- [ ] WhatsApp share text lives in `i18n` key `lobby.inviteText` / `results.shareWin`; add a nice OG image (replace `public/og.png`).
