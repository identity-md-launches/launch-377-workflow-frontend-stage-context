import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', timeout: 45000, workers: 1,
  outputDir: '../test/scratch/playwright-results', reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4173/preview/', headless: true,
    launchOptions: { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } },
  webServer: { command: 'node scripts/serve.mjs', url: 'http://127.0.0.1:4173/preview/', reuseExistingServer: true },
});
