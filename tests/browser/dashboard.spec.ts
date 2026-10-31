import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const fixture = (data: unknown[], recordCount = data.length) => ({
  metadata: { generatedAt: '2026-01-01T00:00:00Z', recordCount, source: 'test' },
  data,
});
const club = (index: number, overrides: Record<string, unknown> = {}) => ({
  seura: `Testiseura ${index}`, paikkakunta: index % 2 ? 'Kouvola' : 'Jyväskylä',
  latitude: 60 + (index % 100) * 0.09, longitude: 20 + (index % 80) * 0.14,
  jasenmaara: index, aanimaara: [10, 15, 20][index % 3], ...overrides,
});
const smallData = fixture([
  club(0, { jasenmaara: 0, latitude: 60, longitude: 25 }),
  club(1, { jasenmaara: 25, latitude: 60, longitude: 25 }),
  club(2, { jasenmaara: 100, latitude: 60, longitude: 25 }),
  club(3, { jasenmaara: 1000, aanimaara: 25, latitude: 69, longitude: 28,
    website: 'https://example.com', region: 'Lappi', foundedYear: 2000 }),
]);

async function load(page: Page, data = smallData) {
  await page.route('**/jsondb/seurat.json', (route) => route.fulfill({ json: data }));
  await page.goto('/koodi0004/');
  await expect(page.locator('.map-title p')).toContainText(`${data.data.length} /`);
}

test.beforeEach(async ({ page }) => {
  // Deterministic local tests do not depend on or request the public tile service.
  await page.route('https://*.tile.openstreetmap.org/**', (route) => route.fulfill({
    contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=', 'base64'),
  }));
});

test('all filters update markers, totals, distributions and empty state', async ({ page }) => {
  await load(page);
  await expect(page.locator('.metric-value').nth(1)).toContainText('1 125');
  await expect(page.locator('.metric-value').nth(3)).toContainText('62,5');
  await expect(page.locator('#vote-filter option')).toHaveCount(5);
  await page.getByRole('textbox', { name: 'Hae seuraa tai kuntaa' }).fill('jyvaskyla');
  await expect(page.locator('.map-title p')).toContainText('2 / 4');
  await expect(page.locator('.metric-value').nth(1)).toContainText('100 jäsentä');
  await page.getByLabel('Äänivalta', { exact: true }).selectOption('20');
  await expect(page.locator('.map-title p')).toContainText('1 / 4');
  await expect(page.locator('.chart-card').nth(1).locator('.bar-row').filter({ hasText: '20 ääntä' }).locator('.bar-value')).toHaveText('1');
  await page.getByLabel('Jäsenmäärä', { exact: false }).fill('25');
  await expect(page.locator('.map-title p')).toContainText('0 / 4');
  await expect(page.locator('.club-results')).toContainText('Ei suodattimia vastaavia seuroja');
  await expect(page.locator('.club-marker')).toHaveCount(0);
  await expect(page.locator('.club-cluster')).toHaveCount(0);
  await page.getByRole('button', { name: 'Tyhjennä suodattimet' }).click();
  await expect(page.locator('.map-title p')).toContainText('4 / 4');
});

test('keyboard marker and list selection, extensible details and focus restoration', async ({ page }) => {
  await load(page);
  const listEntry = page.locator('.club-result').first();
  await listEntry.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#club-detail-title')).toHaveText('Testiseura 3');
  await expect(page.getByRole('button', { name: 'Sulje seuran tiedot' })).toBeFocused();
  await expect(page.getByRole('link', { name: 'https://example.com' })).toHaveAttribute('href', 'https://example.com/');
  await expect(page.locator('.detail-fields')).toContainText('Perustamisvuosi');
  await page.keyboard.press('Escape');
  await expect(page.locator('.club-detail')).toHaveCount(0);
  await expect(listEntry).toBeFocused();
  await page.getByRole('textbox', { name: 'Hae seuraa tai kuntaa' }).fill('Testiseura 3');
  const marker = page.locator('.club-marker');
  await expect(marker).toHaveCount(1);
  await marker.focus();
  await expect(page.locator('.leaflet-tooltip')).toHaveCount(1);
  await expect(page.locator('.leaflet-tooltip')).toContainText('Jäseniä: 1 000');
  await page.keyboard.press('Enter');
  await expect(page.locator('#club-detail-title')).toHaveText('Testiseura 3');
});

test('coincident clubs cluster and expand with keyboard navigation', async ({ page }) => {
  await load(page, fixture(smallData.data.slice(0, 3)));
  const cluster = page.locator('.club-cluster').first();
  await expect(cluster).toContainText('3');
  await cluster.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.club-marker')).toHaveCount(3);
  await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(3);
  await expect(cluster).toHaveAttribute('tabindex', '-1');
  await expect(cluster).toHaveAttribute('aria-hidden', 'true');
});

test('600 clubs, stale metadata and future member/vote values adapt automatically', async ({ page }) => {
  const data = fixture(Array.from({ length: 600 }, (_, index) => club(index, { aanimaara: index % 4 ? 10 : 30 })), 185);
  const start = Date.now();
  await load(page, data);
  await expect(page.locator('.data-warning')).toContainText('600');
  await expect(page.locator('.metric-value').first()).toContainText('600 seuraa');
  await expect(page.locator('.metric-value').nth(1)).toContainText('179 700');
  await expect(page.locator('.club-result')).toHaveCount(12);
  await page.getByRole('button', { name: 'Näytä lisää seuroja' }).click();
  await expect(page.locator('.club-result')).toHaveCount(24);
  await expect(page.locator('#vote-filter option[value=\"30\"]')).toHaveCount(1);
  const represented = await page.evaluate(() =>
    [...document.querySelectorAll('.club-cluster')].reduce((sum, cluster) => sum + Number.parseInt(cluster.textContent ?? '0'), 0)
      + document.querySelectorAll('.club-marker').length,
  );
  expect(represented).toBe(600);
  expect(Date.now() - start).toBeLessThan(5000);
});

test('partial data, safe text and empty datasets remain usable', async ({ page }) => {
  await load(page, fixture([club(0, {
    latitude: null, jasenmaara: null, aanimaara: null,
    seura: '<img src=x onerror=alert(1)>', website: 'javascript:alert(1)', constructor: 'custom field',
  })]));
  await expect(page.locator('.map-title p')).toContainText('0 kartalla');
  await expect(page.locator('.metric-value').nth(2)).toContainText('Ei tietoa');
  await page.locator('.club-result').click();
  await expect(page.locator('#club-detail-title')).toHaveText('<img src=x onerror=alert(1)>');
  await expect(page.locator('.club-detail img')).toHaveCount(0);
  await expect(page.locator('.club-detail a')).toHaveCount(0);
  await expect(page.locator('.detail-fields')).toContainText('custom field');
  await load(page, fixture([]));
  await expect(page.locator('.data-warning')).toContainText('ei ole vielä seuroja');
  await expect(page.locator('.metric-value').first()).toContainText('0 seuraa');
});

test('failed data load can be retried; tile failures are explicit', async ({ page }) => {
  let attempts = 0;
  await page.route('**/jsondb/seurat.json', (route) => {
    attempts++;
    return attempts === 1 ? route.fulfill({ status: 503, body: '' }) : route.fulfill({ json: smallData });
  });
  await page.route('https://*.tile.openstreetmap.org/**', (route) => route.abort());
  await page.goto('/koodi0004/');
  await expect(page.getByRole('alert')).toContainText('503');
  await page.getByRole('button', { name: 'Yritä uudelleen' }).click();
  await expect(page.locator('.map-title p')).toContainText('4 / 4');
  await expect(page.locator('.tile-error')).toBeVisible();
});

test('loading is announced and reduced-motion preferences are respected', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/jsondb/seurat.json', async (route) => {
    await pending;
    await route.fulfill({ json: smallData });
  });
  await page.goto('/koodi0004/');
  await expect(page.locator('.loading-state')).toBeVisible();
  await expect(page.locator('.metric-card')).toHaveCount(0);
  release();
  await expect(page.locator('.map-title p')).toContainText('4 / 4');
  await expect(page.locator('.leaflet-fade-anim')).toHaveCount(0);
  await expect(page.locator('.loading-state')).toHaveCount(0);
});

for (const width of [1440, 390, 320]) {
  test(`responsive, keyboard accessible and WCAG audit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await load(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const theme of ['dark', 'light']) {
      if (theme === 'light') await page.getByRole('button', { name: 'Vaihda vaaleaan tilaan' }).click();
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(results.violations).toEqual([]);
    }
    await page.locator('.club-result').first().click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const details = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(details.violations).toEqual([]);
  });
}
