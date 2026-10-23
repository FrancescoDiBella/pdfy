import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/pages',
  outputDir: './test-results/pages',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://127.0.0.1:4174',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined },
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4174 --strictPort --base=/pdfy/',
    url: 'http://127.0.0.1:4174/pdfy/',
    reuseExistingServer: false,
  },
});
