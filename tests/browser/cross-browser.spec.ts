import { test, expect, type Page } from '@playwright/test';

const clubs = {
  metadata: { generatedAt: '2026-01-01T00:00:00Z', lastUpdatedAt: '2025-12-31T10:00:00Z', recordCount: 3, source: 'test' },
  data: [
    { seura: 'Jyväskylä Disc Golf', paikkakunta: 'Jyväskylä', latitude: 62.24, longitude: 25.75, jasenmaara: 25, aanimaara: 10 },
    { seura: 'Kouvola Disc Golf', paikkakunta: 'Kouvola', latitude: 60.87, longitude: 26.7, jasenmaara: 80, aanimaara: 10 },
    { seura: 'Turku Disc Golf', paikkakunta: 'Turku', latitude: 60.45, longitude: 22.27, jasenmaara: 120, aanimaara: 15 },
  ],
};

async function mockMapTiles(page: Page) {
  await page.route('https://*.tile.openstreetmap.org/**', (route) => route.fulfill({
    contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=', 'base64'),
  }));
}

test('dashboard map and club filters work together', async ({ page }) => {
  await mockMapTiles(page);
  await page.route('**/api/clubs.php', (route) => route.fulfill({ json: clubs }));
  await page.goto('./');

  const map = page.locator('.map-canvas');
  await expect(map).toBeVisible();
  await expect(page.locator('.map-title p')).toContainText('3 / 3');
  await page.locator('.dashboard-map-controls > summary').click();
  await page.getByRole('textbox', { name: 'Hae seuraa tai kuntaa' }).fill('Jyväskylä');
  await expect(page.locator('.map-title p')).toContainText('1 / 3');
  await expect(page.locator('.club-results')).toContainText('Jyväskylä Disc Golf');
  await expect(page.locator('.club-results')).not.toContainText('Kouvola Disc Golf');
  await expect(map.locator('.club-marker')).toHaveCount(1);
  await expect(map).toBeVisible();
});

test('public planner login can create and persist a region', async ({ page }) => {
  await mockMapTiles(page);
  let role: 'writer' | null = null;
  let saved: { document: unknown; backups: unknown[]; revision: string | null } = {
    document: null,
    backups: [],
    revision: null,
  };
  await page.route('**/api/planner.php**', async (route) => {
    const request = route.request();
    const action = new URL(request.url()).searchParams.get('action');
    if (action === 'session') {
      return route.fulfill({ json: { authReady: true, role, csrfToken: 'cross-browser-csrf-token' } });
    }
    if (action === 'login' && request.method() === 'POST') {
      role = request.postDataJSON().role;
      return route.fulfill({ json: { role, csrfToken: 'cross-browser-csrf-token' } });
    }
    if (request.method() === 'GET') return route.fulfill({ json: saved });
    saved = { ...request.postDataJSON(), revision: 'cross-browser-revision' };
    return route.fulfill({ json: { revision: saved.revision } });
  });
  await page.route('**/api/clubs.php', (route) => route.fulfill({ json: clubs }));
  await page.goto('./#/alueet');

  await expect(page.getByRole('button', { name: 'Uusi alue' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Kirjaudu', exact: true }).click();
  await page.getByLabel('Tunnus').selectOption('writer');
  await page.getByLabel('Salasana').fill('test-writer-password');
  await page.getByRole('button', { name: 'Kirjaudu', exact: true }).last().click();
  await page.getByRole('button', { name: 'Uusi alue' }).click();
  await page.getByLabel('Nimi', { exact: true }).fill('Firefox smoke alue');
  await page.getByRole('searchbox', { name: 'Hae kuntaa nimellä' }).fill('Turku');
  await page.getByRole('list', { name: 'Kuntaluettelo' }).getByRole('checkbox', { name: /^Turku(?:\s|$)/ }).check();
  await expect(page.locator('.save-indicator')).toContainText('Tallennettu');
  await expect(page.locator('.region-row').filter({ hasText: 'Firefox smoke alue' })).toContainText('1 kuntaa');

  await page.reload();
  await expect(page.locator('.region-row').filter({ hasText: 'Firefox smoke alue' })).toContainText('1 kuntaa');
});
