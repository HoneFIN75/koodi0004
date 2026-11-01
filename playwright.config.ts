import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  workers: 2,
  use: {
    baseURL: 'http://127.0.0.1:5180/koodi0004/',
    browserName: 'chromium',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'mkdir -p dist/koodi0004 && cp -R dist/api dist/assets dist/jsondb dist/geo dist/index.html dist/koodi0004/ && npm run preview -- --host 127.0.0.1 --port 5180',
    url: 'http://127.0.0.1:5180/koodi0004/',
    reuseExistingServer: false,
  },
});
