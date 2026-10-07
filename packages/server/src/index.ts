import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { createAnalytics } from './analytics.js';
import { config } from './config.js';
import { createHttpApp } from './http.js';
import { RazorpayProvider, Store, StripeProvider } from './payments/index.js';
import type { ClientToServer, ServerToClient } from './protocol.js';
import { RoomManager } from './rooms/manager.js';
import { attachSockets } from './sockets.js';
import { openStorage, type Storage } from './storage/db.js';

export interface RunningServer {
  port: number;
  manager: RoomManager;
  storage: Storage;
  close(): Promise<void>;
}

/** Boot everything. Used by index (production) and by integration tests (port 0, in-memory db). */
export async function startServer(overrides: Partial<typeof config> = {}): Promise<RunningServer> {
  const cfg = { ...config, ...overrides };
  const storage = openStorage(cfg.dbPath);
  const analytics = createAnalytics(cfg.isTest ? 'noop' : cfg.analyticsAdapter, cfg.analyticsEndpoint);
  const store = new Store(
    storage,
    [
      new StripeProvider(cfg.stripeSecretKey, cfg.stripeWebhookSecret),
      new RazorpayProvider(cfg.razorpayKeyId, cfg.razorpayKeySecret, cfg.razorpayWebhookSecret),
    ],
    cfg.storeDevMode,
  );
  const manager = new RoomManager(storage, analytics, store, cfg);
  const app = createHttpApp(manager, storage, store, analytics, cfg);
  const httpServer = createServer(app);
  const io = new Server<ClientToServer, ServerToClient>(httpServer, {
    cors: { origin: cfg.corsOrigins, credentials: false },
    pingInterval: 10_000,
    pingTimeout: 20_000,
    maxHttpBufferSize: 64 * 1024,
    transports: ['websocket', 'polling'],
  });
  attachSockets(io, manager, cfg);
  const restored = manager.restore();
  if (restored) console.log(`[server] restored ${restored} in-progress rooms`);
  manager.startSweeper();

  await new Promise<void>((resolve) => httpServer.listen(cfg.port, cfg.host, resolve));
  const addr = httpServer.address();
  const port = typeof addr === 'object' && addr ? addr.port : cfg.port;
  return {
    port,
    manager,
    storage,
    async close() {
      manager.stop();
      io.disconnectSockets(true);
      await new Promise<void>((resolve) => io.close(() => resolve()));
      storage.close();
    },
  };
}

const isMain = process.argv[1] && /index\.(ts|js)$/.test(process.argv[1]) && !process.env.VITEST;
if (isMain) {
  startServer()
    .then((s) => console.log(`[server] Atlas Tycoon server listening on :${s.port}`))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
