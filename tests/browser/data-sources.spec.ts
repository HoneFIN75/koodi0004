import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const clubs = {
  metadata: { generatedAt: '2026-01-02T10:00:00Z', recordCount: 2, source: 'test' },
  data: [
    { seura: 'Seura A', paikkakunta: 'Helsinki', jasenmaara: 10, aanimaara: 10, latitude: 60.17, longitude: 24.94 },
    { seura: 'Seura B', paikkakunta: 'Espoo', jasenmaara: 20, aanimaara: 10, latitude: 60.21, longitude: 24.66 },
  ],
};
const competitions = [
  { 'Kilpailun nimi': 'Kilpailu A', Vuosi: 2024, Kunta: 'Helsinki' },
  { 'Kilpailun nimi': 'Kilpailu B', Vuosi: 2025, Kunta: 'Espoo' },
  { 'Kilpailun nimi': 'Kilpailu C', Vuosi: 2025, Kunta: 'Espoo' },
];
const region = (id: string) => ({
  id, number: 1, name: 'Alue', shortName: '', description: '', color: '#16a34a',
  opacity: 0.4, enabled: true, visible: true, municipalityCodes: ['091'],
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-02-03T11:00:00Z',
});
const planning = {
  version: 1, activeScenarioId: 'one',
  scenarios: [
    { id: 'one', name: 'Ensimmäinen', description: '', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-02-03T11:00:00Z', regions: [region('first')] },
    { id: 'two', name: 'Toinen', description: '', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-02-03T11:00:00Z', regions: [region('second'), { ...region('third'), enabled: false }] },
  ],
};

function summaryValue(page: Page, label: string) {
  return page.locator('.data-source-summary-grid > div').filter({ has: page.getByText(label, { exact: true }) }).locator('dd');
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/clubs.php', (route) => route.fulfill({ json: clubs }));
  await page.route('**/api/planner.php**', (route) => route.fulfill({ json: { document: planning, backups: [], revision: 'test' } }));
  await page.route('**/jsondb/SFL-Kilpailut-2019-2026.json', (route) => route.fulfill({ json: competitions }));
  const geography = JSON.parse(await readFile(new URL('../../public/geo/kunnat.geojson', import.meta.url), 'utf8'));
  geography.metadata.generatedAt = '2026-01-01T00:00:00Z';
  await page.route('**/geo/kunnat.geojson', (route) => route.fulfill({ json: geography }));
  await page.route('https://*.tile.openstreetmap.org/**', (route) => route.fulfill({
    contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=', 'base64'),
  }));
});

test('standalone source documentation has accessible cards, live unfiltered counts and source timestamps', async ({ page }) => {
  await page.goto('#/datalahteet');
  await expect(page).toHaveTitle('Datalähteet — Suomen frisbeegolfseurat');
  await expect(page.getByRole('heading', { level: 1, name: 'Datalähteet' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Päänavigaatio' }).getByRole('link', { name: 'Datalähteet' })).toHaveAttribute('aria-current', 'page');
  const cards = page.locator('.data-source-card');
  await expect(cards).toHaveCount(6);
  await expect(cards.first()).toHaveJSProperty('open', false);
  await cards.first().locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(cards.first()).toHaveJSProperty('open', true);
  await expect(cards.first()).toContainText('Mahdolliset yhteystiedot näytetään julkisessa näkymässä vain');
  await expect(summaryValue(page, 'Seurojen määrä')).toHaveText('2');
  await expect(summaryValue(page, 'Kilpailujen määrä')).toHaveText('3');
  await expect(summaryValue(page, 'Kuntien määrä')).toHaveText('308');
  await expect(summaryValue(page, 'Maakuntien määrä')).toHaveText('19');
  await expect(summaryValue(page, 'Käyttäjän luomien alueiden määrä')).toHaveText('3');
  await expect(summaryValue(page, 'Viimeisin päivitysajankohta').locator('time')).toHaveAttribute('datetime', '2026-02-03T11:00:00.000Z');

  for (let index = 1; index < 6; index++) await cards.nth(index).locator('summary').click();
  const competitionMetadata = page.getByRole('region', { name: 'Kilpailut: metatiedot' });
  await expect(competitionMetadata).toContainText('Ei saatavilla');
  await expect(competitionMetadata).toContainText('2024–2025');
  await expect(page.getByRole('heading', { name: 'Kunnat ja kartta', exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Vaihda vaaleaan tilaan' }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  for (const width of [320, 390, 650, 768, 950, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('link', { name: 'Datalähteet', exact: true })).toBeVisible();
  }
});

test('navigation and browser history connect the dashboard, source page and planner', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.map-title p')).toContainText('2 / 2');
  await page.getByRole('textbox', { name: 'Hae seuraa tai kuntaa' }).fill('Seura A');
  await page.locator('.dashboard-competition-overview').getByRole('combobox', { name: 'Kilpailujen vuodet' }).selectOption('selected');
  await expect(page.locator('.map-title p')).toContainText('1 / 2');
  await page.getByRole('link', { name: 'Datalähteet', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Datalähteet' })).toBeVisible();
  await expect(summaryValue(page, 'Seurojen määrä')).toHaveText('2');
  await expect(summaryValue(page, 'Kilpailujen määrä')).toHaveText('3');
  await page.reload();
  await expect(summaryValue(page, 'Seurojen määrä')).toHaveText('2');
  await page.getByRole('link', { name: 'Aluesuunnittelu', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'ALUESUUNNITTELU' })).toBeVisible();
  await page.getByRole('link', { name: 'Datalähteet', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Datalähteet' })).toBeVisible();
  await page.getByRole('link', { name: 'Tilastot', exact: true }).click();
  await expect(page.locator('#tilastot')).toBeInViewport();
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: 'Datalähteet' })).toBeVisible();
  await page.goForward();
  await expect(page.locator('#tilastot')).toBeInViewport();
  await page.getByRole('link', { name: 'Datalähteet', exact: true }).click();
  await page.getByRole('link', { name: 'Kartta', exact: true }).click();
  await expect(page.locator('#kartta')).toBeInViewport();
});

test('unavailable sources remain unknown and independent source retries recover', async ({ page }) => {
  await page.route('**/api/clubs.php', (route) => route.fulfill({ status: 503 }));
  await page.route('**/jsondb/regions.json', (route) => route.fulfill({ status: 503 }));
  await page.route('**/api/planner.php**', (route) => route.fulfill({ status: 503 }));
  await page.route('**/jsondb/SFL-Kilpailut-2019-2026.json', (route) => route.fulfill({ status: 503 }));
  await page.goto('#/datalahteet');
  await expect(page.getByRole('alert').filter({ hasText: 'Kaikkia aineistoja ei voitu ladata' })).toBeVisible();
  for (const label of ['Seurojen määrä', 'Kilpailujen määrä', 'Maakuntien määrä', 'Käyttäjän luomien alueiden määrä']) {
    await expect(summaryValue(page, label)).toHaveText('Ei saatavilla');
  }
  await expect(summaryValue(page, 'Kuntien määrä')).toHaveText('308');
  await expect(page.locator('.data-source-card')).toHaveCount(6);

  await page.route('**/api/clubs.php', (route) => route.fulfill({ json: clubs }));
  await page.unroute('**/jsondb/regions.json');
  await page.route('**/api/planner.php**', (route) => route.fulfill({ json: { document: planning, backups: [], revision: 'test' } }));
  await page.route('**/jsondb/SFL-Kilpailut-2019-2026.json', (route) => route.fulfill({ json: competitions }));
  await page.getByRole('button', { name: 'Yritä uudelleen', exact: true }).click();
  await page.getByRole('button', { name: 'Yritä suunnitelmien latausta uudelleen' }).click();
  await page.getByRole('button', { name: 'Yritä kilpailujen latausta uudelleen' }).click();
  await expect(summaryValue(page, 'Seurojen määrä')).toHaveText('2');
  await expect(summaryValue(page, 'Kilpailujen määrä')).toHaveText('3');
  await expect(summaryValue(page, 'Maakuntien määrä')).toHaveText('19');
  await expect(summaryValue(page, 'Käyttäjän luomien alueiden määrä')).toHaveText('3');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('competition refresh updates totals and failed refresh clearly marks retained data as stale', async ({ page }) => {
  await page.goto('#/datalahteet');
  await expect(summaryValue(page, 'Kilpailujen määrä')).toHaveText('3');
  await page.route('**/jsondb/SFL-Kilpailut-2019-2026.json', (route) => route.fulfill({ json: competitions.slice(0, 1) }));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(summaryValue(page, 'Kilpailujen määrä')).toHaveText('1');
  await page.route('**/jsondb/SFL-Kilpailut-2019-2026.json', (route) => route.fulfill({ status: 503 }));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('alert')).toContainText('Tieto voi olla vanhentunut');
  await expect(summaryValue(page, 'Kilpailujen määrä')).toHaveText('1');
});

test('known empty sources display zero and missing source dates are not replaced with the load time', async ({ page }) => {
  await page.route('**/api/clubs.php', (route) => route.fulfill({ json: { metadata: { recordCount: 0, source: 'test' }, data: [] } }));
  await page.route('**/api/planner.php**', (route) => route.fulfill({ json: { document: null, backups: [], revision: null } }));
  await page.route('**/jsondb/SFL-Kilpailut-2019-2026.json', (route) => route.fulfill({ json: [] }));
  const geography = JSON.parse(await readFile(new URL('../../public/geo/kunnat.geojson', import.meta.url), 'utf8'));
  delete geography.metadata.generatedAt;
  await page.route('**/geo/kunnat.geojson', (route) => route.fulfill({ json: geography }));
  await page.goto('#/datalahteet');
  await expect(summaryValue(page, 'Seurojen määrä')).toHaveText('0');
  await expect(summaryValue(page, 'Kilpailujen määrä')).toHaveText('0');
  await expect(summaryValue(page, 'Käyttäjän luomien alueiden määrä')).toHaveText('0');
  await expect(summaryValue(page, 'Viimeisin päivitysajankohta')).toHaveText('Ei saatavilla');
});
