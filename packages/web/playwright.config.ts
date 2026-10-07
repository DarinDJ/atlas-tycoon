import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
  webServer: [
    {
      command: 'npm run start -w @bt/server',
      url: 'http://localhost:3001/api/health',
      reuseExistingServer: !process.env.CI,
      env: { PORT: '3001', DB_PATH: ':memory:', BOT_DELAY_MS: '50', CORS_ORIGINS: 'http://localhost:4173,http://localhost:5173', ANALYTICS_ADAPTER: 'noop', PUBLIC_URL: 'http://localhost:4173' },
      cwd: '../..',
      timeout: 60_000,
    },
    {
      command: 'npx vite preview --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
