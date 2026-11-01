import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const competition = (name: string, year: number, municipality: string) => ({ 'Kilpailun nimi': name, Vuosi: year, Kunta: municipality });
const records = [
  competition('Duplicate', 2020, 'Espoo'), competition('Duplicate', 2020, 'Espoo'),
  competition('Helsinki Open', 2021, 'Helsinki'), competition('Espoo Open', 2022, 'Espoo'),
  competition('Turku Open', 2024, 'Turku'),
];

test.beforeEach(async ({ page }) => {
  let document: unknown = null;
  let backups: unknown[] = [];
  let revision: string | null = null;
  await page.route('**/api/planner.php**', async (route) => {
    const request = route.request();
    if (new URL(request.url()).searchParams.get('action') === 'session') {
      return route.fulfill({ json: { authReady: true, role: 'writer', csrfToken: 'test-token' } });
    }
    if (request.method() === 'GET') return route.fulfill({ json: { document, backups, revision } });
    const payload = request.postDataJSON();
    document = payload.document; backups = payload.backups; revision = 'test-revision';
    return route.fulfill({ json: { revision } });
  });
  await page.route('https://*.tile.openstreetmap.org/**', (route) => route.fulfill({ status: 204 }));
  await page.route('**/api/clubs.php', (route) => route.fulfill({ json: { data: [
    { seura: 'Testiseura', paikkakunta: 'Espoo', jasenmaara: 10, aanimaara: 10, latitude: 60.2, longitude: 24.6 },
  ] } }));
});

test('region statistics, coverage and trends update when years, municipality assignments and data change', async ({ page }) => {
  let current = records;
  await page.route('**/jsondb/SFL-Kilpailut-2019-2026.json', (route) => route.fulfill({ json: current }));
  await page.goto('./#/alueet');
  await page.getByRole('button', { name: 'Uusi alue' }).click();
  await page.getByRole('searchbox', { name: 'Hae kuntaa nimellä' }).fill('Espoo');
  await page.getByRole('list', { name: 'Kuntaluettelo' }).getByRole('checkbox', { name: /^Espoo/ }).check();
  await page.getByRole('button', { name: 'Sulje muokkaus' }).click();
  const detail = page.locator('.region-detail');
  await expect(detail.locator('.stat-card').filter({ hasText: 'Kilpailuja · valitut vuodet' })).toContainText('3');
  await page.getByRole('combobox', { name: 'Kilpailujen vuodet', exact: true }).selectOption('selected');
  await page.getByRole('group', { name: 'Valitse kilpailuvuodet' }).getByLabel('2020').check();
  await expect(detail.locator('.stat-card').filter({ hasText: 'Kilpailuja · valitut vuodet' })).toContainText('2');
  await expect(detail.getByTestId('competition-total')).toHaveText('2');
  current = [...records, competition('New Espoo competition', 2024, 'Espoo')];
  await page.getByRole('button', { name: 'Päivitä kilpailuaineisto' }).click();
  await expect(detail.getByTestId('competition-total')).toHaveText('3');
  await page.getByRole('button', { name: 'Kojelauta', exact: true }).click();
  await expect(page.getByTestId('competition-total')).toHaveText('4');
  await expect(page.locator('.stat-card').filter({ hasText: 'Alueiden kattamat kilpailut' })).toContainText('3');
  await page.getByRole('button', { name: 'Vertailu', exact: true }).click();
  await page.getByLabel('Kaavion mittari').selectOption('competitionCount');
  await expect(page.getByRole('table', { name: 'Aluevertailu', exact: true })).toContainText('Kilpailuja · valitut vuodet');
});

test('homepage shows compact competition KPIs and the dynamic full data period', async ({ page }) => {
  await page.route('**/jsondb/SFL-Kilpailut-2019-2026.json', (route) => route.fulfill({ json: [
    competition('Duplicate', 2020, 'Espoo'), competition('Duplicate', 2020, 'Espoo'),
    competition('Helsinki Open', 2021, 'Helsinki'), competition('Espoo Open', 2021, 'Espoo'),
  ] }));
  await page.goto('./');
  await expect(page.getByRole('region', { name: 'Seurat' }).locator('.metric-card')).toHaveCount(3);
  await expect(page.getByRole('region', { name: 'Jäsenmäärät' }).locator('.metric-card')).toHaveCount(3);
  await expect(page.getByRole('region', { name: 'Seurojen kotikunnat' }).locator('.metric-card')).toHaveCount(3);
  const summary = page.getByRole('region', { name: 'Kilpailujen yhteenveto' });
  await expect(summary).toContainText('Aineistovuodet 2020–2021 · 2 vuotta');
  const metrics = summary.locator('.metric-card');
  await expect(metrics).toHaveCount(3);
  await expect(metrics.nth(0)).toContainText('4 kilpailua');
  await expect(metrics.nth(1)).toContainText('2 kuntaa');
  await expect(metrics.nth(2)).toContainText('2 kilpailua / kunta');
  await expect(summary.locator('table')).toHaveCount(0);

  await summary.getByRole('combobox', { name: 'Kilpailujen vuodet', exact: true }).selectOption('selected');
  const selectedYears = summary.getByRole('group', { name: 'Valitse kilpailuvuodet' });
  await selectedYears.getByLabel('2020').check();
  await selectedYears.getByLabel('2021').uncheck();
  await expect(summary).toContainText('Aineistovuodet 2020–2021 · 2 vuotta');
  await expect(summary.getByRole('status')).toContainText('Avainluvut · 2020');
  await expect(metrics.nth(0)).toContainText('2 kilpailua');
  await expect(metrics.nth(1)).toContainText('1 kunta');
  await expect(metrics.nth(2)).toContainText('2 kilpailua / kunta');
});

test('year selection is shared across views, scopes and exports, without competition map controls', async ({ page }) => {
  await page.route('**/jsondb/SFL-Kilpailut-2019-2026.json', (route) => route.fulfill({ json: records }));
  await page.goto('./');
  const total = page.getByTestId('competition-total');
  await expect(total).toHaveText('5');
  await expect(page.getByRole('region', { name: 'Kilpailujen yhteenveto' }).getByLabel('Kilpailujen vuodet')).toBeVisible();
  await page.getByRole('combobox', { name: 'Kilpailujen vuodet', exact: true }).selectOption('selected');
  const years = page.getByRole('group', { name: 'Valitse kilpailuvuodet' });
  await years.getByLabel('2020', { exact: true }).check();
  await expect(total).toHaveText('3');
  await expect(page.getByRole('region', { name: 'Kilpailujen yhteenveto' }).locator('.metric-card').first()).toContainText('3 kilpailua');
  await expect(page.getByRole('region', { name: 'Seurat' }).locator('.metric-value').first()).toContainText('1 seuraa');
  const analytics = page.getByRole('region', { name: 'Suomen kilpailutoiminta', exact: true });
  await analytics.getByRole('combobox', { name: 'Kunnan osallistumistrendi' }).selectOption('Espoo');
  await expect(analytics.getByRole('heading', { name: 'Kilpailuaktiivisuus · Espoo' })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await analytics.getByRole('button', { name: 'Vie kilpailutilastot CSV' }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  if (!stream) throw new Error('CSV download did not provide a readable stream.');
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const csv = Buffer.concat(chunks).toString('utf8');
  expect(csv).toContain(';2020;');
  expect(csv).toContain(';2024;');
  expect(csv).not.toContain(';2021;');
  expect(csv).not.toContain(';2022;');
  await page.locator('.club-result').click();
  await expect(page.getByRole('region', { name: 'Espoo: kilpailutoiminta' })).toContainText('2 kilpailua');
  await page.getByRole('link', { name: /Aluesuunnittelu/ }).click();
  await page.getByRole('button', { name: 'Kojelauta', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Valitse kilpailuvuodet' }).getByLabel('2020', { exact: true })).toBeChecked();
  await expect(page.getByTestId('competition-total')).toHaveText('3');
  await page.getByRole('button', { name: 'Vertailu', exact: true }).click();
  await expect(page.getByTestId('competition-total')).toHaveText('3');
  await expect(page.locator('.map-options')).toHaveCount(0);
  await page.getByRole('button', { name: 'Kartta', exact: true }).click();
  await expect(page.locator('.map-options')).not.toContainText('Kilpailu');
  await page.getByRole('combobox', { name: 'Kilpailujen vuodet', exact: true }).selectOption('range');
  await page.getByRole('combobox', { name: 'Alkuvuosi', exact: true }).selectOption('2021');
  await page.getByRole('combobox', { name: 'Loppuvuosi', exact: true }).selectOption('2022');
  await page.getByRole('button', { name: 'Kojelauta', exact: true }).click();
  await expect(page.getByTestId('competition-total')).toHaveText('2');
});

test('polling reloads changed content and discovers new years without a page reload', async ({ page }) => {
  let current = records;
  let requests = 0;
  await page.route('**/jsondb/SFL-Kilpailut-2019-2026.json', (route) => {
    requests += 1;
    return route.fulfill({ json: current });
  });
  await page.clock.install();
  await page.goto('./');
  await expect(page.getByTestId('competition-total')).toHaveText('5');
  current = [...records, competition('Future', 2031, 'New municipality')];
  await page.clock.fastForward(60_001);
  await expect(page.getByTestId('competition-total')).toHaveText('6');
  expect(requests).toBeGreaterThan(1);
  await page.getByRole('combobox', { name: 'Kilpailujen vuodet', exact: true }).selectOption('selected');
  await expect(page.getByTestId('competition-total')).toHaveText('1');
  await expect(page.getByRole('group', { name: 'Valitse kilpailuvuodet' }).getByLabel('2031')).toBeChecked();
  current = [...current, competition('Second future', 2031, 'New municipality')];
  await page.clock.fastForward(60_001);
  await expect(page.getByTestId('competition-total')).toHaveText('2');
});

test('load failures, stale refresh, invalid data, empty selection and retry remain explicit', async ({ page }) => {
  let response: unknown = records;
  let status = 503;
  await page.route('**/jsondb/SFL-Kilpailut-2019-2026.json', (route) => route.fulfill({ status, json: response }));
  await page.goto('./');
  await expect(page.getByRole('alert')).toContainText('HTTP 503');
  await expect(page.getByTestId('competition-total')).toHaveCount(0);
  status = 200;
  await page.getByRole('button', { name: 'Päivitä kilpailuaineisto' }).click();
  await expect(page.getByTestId('competition-total')).toHaveText('5');
  response = [{ Vuosi: 2025 }];
  await page.getByRole('button', { name: 'Päivitä kilpailuaineisto' }).click();
  await expect(page.getByRole('alert')).toContainText('rivi 1');
  await expect(page.getByRole('alert')).toContainText('vanhentuneita');
  await expect(page.getByTestId('competition-total')).toHaveText('5');
  await expect(page.getByRole('button', { name: 'Vie kilpailutilastot CSV' })).toBeDisabled();
  response = records;
  await page.getByRole('button', { name: 'Päivitä kilpailuaineisto' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Kilpailujen vuodet', exact: true }).selectOption('selected');
  await page.getByRole('group', { name: 'Valitse kilpailuvuodet' }).getByLabel('2024').uncheck();
  await expect(page.getByTestId('competition-total')).toHaveText('0');
  await expect(page.getByRole('region', { name: 'Suomen kilpailutoiminta', exact: true })).toContainText('Valitussa rajauksessa ei ole kilpailuja');
  response = [];
  await page.getByRole('button', { name: 'Päivitä kilpailuaineisto' }).click();
  await page.getByRole('combobox', { name: 'Kilpailujen vuodet', exact: true }).selectOption('all');
  await expect(page.getByTestId('competition-total')).toHaveText('0');
});

test('competition views are keyboard accessible and fit mobile in both themes', async ({ page }) => {
  await page.route('**/jsondb/SFL-Kilpailut-2019-2026.json', (route) => route.fulfill({ json: records }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await expect(page.getByTestId('competition-total')).toHaveText('5');
  await page.getByRole('combobox', { name: 'Kilpailujen vuodet', exact: true }).selectOption('selected');
  const checkbox = page.getByRole('group', { name: 'Valitse kilpailuvuodet' }).getByLabel('2020');
  await checkbox.focus();
  await page.keyboard.press('Space');
  await expect(checkbox).toBeChecked();
  for (const theme of ['dark', 'light']) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    const accessibility = await new AxeBuilder({ page }).include('.dashboard-competition-overview').include('.competition-filters').include('.competition-analytics').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(accessibility.violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
