import { defineConfig, devices } from '@playwright/test';

// Smoke tests for the Phase 1 flows (D-39): a handful, run in CI after the unit tests.
export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:8788',
    trace: 'retain-on-failure',
    locale: 'ko-KR',
  },
  webServer: {
    command: 'bash e2e/serve.sh',
    cwd: '..',
    url: 'http://localhost:8788/api/v1/health',
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      testIgnore: /mobile/,
    },
    // 375px: the narrowest common phone width (Phase 2 exit criteria), on Pixel 7 emulation.
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], viewport: { width: 375, height: 740 } },
      testMatch: /mobile/,
    },
  ],
});
