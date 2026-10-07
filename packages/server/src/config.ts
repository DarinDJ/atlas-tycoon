import 'dotenv/config';

const env = process.env;

export const config = {
  port: Number(env.PORT ?? 3001),
  host: env.HOST ?? '0.0.0.0',
  /** Comma-separated list of allowed browser origins. */
  corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((s) => s.trim()),
  /** sqlite file path, or ':memory:' for tests. */
  dbPath: env.DB_PATH ?? './data/bharat.db',
  /** Bots act after a short, human-feeling delay. */
  botDelayMs: Number(env.BOT_DELAY_MS ?? 900),
  /** Consecutive timeouts before an AFK human seat is handed to a bot. */
  afkTimeoutsBeforeBot: Number(env.AFK_TIMEOUTS_BEFORE_BOT ?? 3),
  /** Minutes an idle lobby survives before cleanup. */
  idleRoomMinutes: Number(env.IDLE_ROOM_MINUTES ?? 30),
  /** Minutes a finished game stays visible before cleanup. */
  endedRoomMinutes: Number(env.ENDED_ROOM_MINUTES ?? 20),
  /** Seconds a disconnected player keeps their seat before auto-actions kick in regardless of the turn timer. */
  reconnectGraceSeconds: Number(env.RECONNECT_GRACE_SECONDS ?? 45),
  maxRooms: Number(env.MAX_ROOMS ?? 5000),
  analyticsAdapter: env.ANALYTICS_ADAPTER ?? 'console',
  analyticsEndpoint: env.ANALYTICS_ENDPOINT ?? '',
  /** When true, /api/store/dev-complete grants entitlements without a real payment. */
  storeDevMode: (env.STORE_DEV_MODE ?? 'true') === 'true',
  stripeSecretKey: env.STRIPE_SECRET_KEY ?? '',
  stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET ?? '',
  razorpayKeyId: env.RAZORPAY_KEY_ID ?? '',
  razorpayKeySecret: env.RAZORPAY_KEY_SECRET ?? '',
  razorpayWebhookSecret: env.RAZORPAY_WEBHOOK_SECRET ?? '',
  adsEnabled: (env.ADS_ENABLED ?? 'false') === 'true',
  publicUrl: env.PUBLIC_URL ?? 'http://localhost:5173',
  isTest: env.NODE_ENV === 'test' || !!env.VITEST,
};

export type Config = typeof config;
