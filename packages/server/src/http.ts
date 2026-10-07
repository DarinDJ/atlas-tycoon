import { listMaps, getMap } from '@bt/maps';
import { validateMap, analyzeBalance, runSimulations, type BotLevel } from '@bt/engine';
import express, { type Express, type Request, type Response } from 'express';
import { z } from 'zod';
import type { AnalyticsAdapter, AnalyticsEvent } from './analytics.js';
import type { Config } from './config.js';
import { PRODUCTS, type Store } from './payments/index.js';
import type { RoomManager } from './rooms/manager.js';
import { RateLimiter } from './security/rateLimit.js';
import type { Storage } from './storage/db.js';

const clientIdSchema = z
  .string()
  .min(8)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);

/** Public map summary (no card decks) for the lobby and SEO pages. */
export function mapSummary(id: string) {
  const m = getMap(id);
  if (!m) return null;
  return {
    id: m.id,
    name: m.name,
    tagline: m.tagline,
    country: m.country,
    flag: m.flag,
    premium: !!m.premium,
    currency: m.currency,
    theme: m.theme,
    tiles: m.tiles.length,
    properties: m.tiles.filter((t) => t.type === 'property').length,
    seo: m.seo,
    i18n: m.i18n,
  };
}

export function createHttpApp(
  manager: RoomManager,
  storage: Storage,
  store: Store,
  analytics: AnalyticsAdapter,
  config: Config,
): Express {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);
  // Generous: many users share an IP behind NAT/proxies. Abuse is also bounded by socket limits.
  const apiLimiter = new RateLimiter(40, 120);
  const simLimiter = new RateLimiter(0.2, 2);
  setInterval(() => apiLimiter.sweep(), 60_000).unref();

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    const origin = req.headers.origin;
    if (origin && config.corsOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'content-type, x-client-id');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    if (!apiLimiter.take(req.ip ?? 'ip')) return res.status(429).json({ error: 'RATE_LIMIT' });
    next();
  });

  // Webhooks need the raw body for signature checks.
  app.post('/api/store/webhook/:provider', express.text({ type: '*/*', limit: '256kb' }), (req, res) => {
    const ok = store.handleWebhook(
      req.params.provider,
      typeof req.body === 'string' ? req.body : '',
      req.headers,
    );
    if (ok) analytics.track('purchase_completed', { provider: req.params.provider });
    res.status(ok ? 200 : 400).json({ ok });
  });

  app.use(express.json({ limit: '512kb' }));

  app.get('/api/health', (_req, res) =>
    res.json({
      ok: true,
      ...manager.stats(),
      uptime: process.uptime(),
      memoryMb: Math.round(process.memoryUsage().rss / 1e6),
    }),
  );

  app.get('/api/config', (_req, res) =>
    res.json({
      adsEnabled: config.adsEnabled,
      storeProviders: store.availableProviders(),
      maps: listMaps().map((m) => mapSummary(m.id)),
    }),
  );

  app.get('/api/maps', (_req, res) => res.json(listMaps().map((m) => mapSummary(m.id))));
  app.get('/api/maps/:id', (req, res) => {
    const m = getMap(req.params.id);
    if (!m) return res.status(404).json({ error: 'NO_MAP' });
    res.json(m);
  });

  app.get('/api/rooms', (_req, res) => res.json(manager.publicRooms()));
  app.get('/api/rooms/:code', (req, res) => {
    const room = manager.get(req.params.code);
    if (!room) return res.status(404).json({ error: 'NO_ROOM' });
    const v = room.view();
    res.json({
      code: v.code,
      status: v.status,
      mapId: v.mapId,
      players: v.seats.length,
      maxPlayers: v.rules.maxPlayers,
      isPrivate: v.rules.isPrivate,
    });
  });

  app.get('/api/leaderboard', (req, res) => {
    const mapId = typeof req.query.map === 'string' ? req.query.map : null;
    res.json(storage.leaderboard(mapId, 50));
  });

  app.get('/api/me', (req, res) => {
    const cid = clientIdSchema.safeParse(req.header('x-client-id'));
    if (!cid.success) return res.status(400).json({ error: 'BAD_CLIENT_ID' });
    const day = new Date().toISOString().slice(0, 10);
    res.json({
      entitlements: store.entitlements(cid.data),
      daily: storage.dailyChallengeProgress(cid.data, day),
      day,
    });
  });

  // ---- Store --------------------------------------------------------------
  app.get('/api/store/products', (_req, res) =>
    res.json({ products: PRODUCTS, providers: store.availableProviders() }),
  );
  app.post('/api/store/checkout', async (req, res) => {
    const body = z
      .object({ sku: z.string(), provider: z.string(), clientId: clientIdSchema })
      .safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'INVALID' });
    try {
      const session = await store.checkout(
        body.data.sku,
        body.data.provider,
        body.data.clientId,
        config.publicUrl,
      );
      analytics.track('purchase_started', { sku: body.data.sku, provider: body.data.provider });
      res.json(session);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });
  app.get('/api/store/dev-complete', (req, res) => {
    if (!config.storeDevMode) return res.status(403).json({ error: 'DEV_MODE_OFF' });
    const q = z
      .object({ sku: z.string(), clientId: clientIdSchema, purchase: z.string() })
      .safeParse(req.query);
    if (!q.success) return res.status(400).json({ error: 'INVALID' });
    store.fulfil(q.data.clientId, q.data.sku, q.data.purchase, 'dev');
    analytics.track('purchase_completed', { sku: q.data.sku, provider: 'dev' });
    res.redirect(`${config.publicUrl}/store?purchased=${encodeURIComponent(q.data.sku)}`);
  });

  // ---- Analytics (client-side events) ---------------------------------------
  app.post('/api/analytics', (req, res) => {
    const body = z
      .object({ event: z.string().max(40), props: z.record(z.unknown()).optional() })
      .safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'INVALID' });
    analytics.track(body.data.event as AnalyticsEvent, { ...body.data.props, source: 'client' });
    res.json({ ok: true });
  });

  // ---- Map editor services --------------------------------------------------
  app.post('/api/editor/validate', (req, res) => {
    const v = validateMap(req.body);
    res.json({ ok: v.ok, issues: v.issues, balance: v.map ? analyzeBalance(v.map) : null });
  });
  app.post('/api/editor/simulate', (req: Request, res: Response) => {
    if (!simLimiter.take(req.ip ?? 'ip')) return res.status(429).json({ error: 'RATE_LIMIT' });
    const body = z
      .object({
        map: z.unknown(),
        games: z.number().int().min(1).max(300).default(50),
        players: z.number().int().min(2).max(8).default(4),
        levels: z.array(z.enum(['easy', 'medium', 'hard'])).optional(),
      })
      .safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'INVALID' });
    const v = validateMap(body.data.map);
    if (!v.ok || !v.map) return res.status(400).json({ error: 'INVALID_MAP', issues: v.issues });
    const rep = runSimulations(v.map, body.data.games, {
      players: body.data.players,
      levels: body.data.levels as BotLevel[] | undefined,
      seed: Date.now() % 100_000,
    });
    res.json(rep);
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'NOT_FOUND' }));
  return app;
}
