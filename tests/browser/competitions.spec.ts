import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const competition = (name: string, year: number, municipality: string) => ({ 'Kilpailun nimi': name, Vuosi: year, Kunta: municipality });
const records = [
  competition('Duplicate', 2020, 'Espoo'), competition('Duplicate', 2020, 'Espoo'),
  competition('Helsinki Open', 2021, 'Helsinki'), competition('Espoo Open', 2022, 'Espoo'),
  competition('Turku Open', 2024, 'Turku'),
];

async function openMapControls(page: Page) {
  await page.locator('.dashboard-map-controls > summary').click();
  await expect(page.locator('.dashboard-map-controls')).toHaveAttribute('open', '');
}

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
  const competitionStat = detail.locator('.stat-card').filter({ hasText: 'Kilpailuja · valitut vuodet' });
  await expect(competitionStat).toContainText('3');
  await page.getByRole('combobox', { name: 'Kilpailujen vuodet', exact: true }).selectOption('selected');
  const yearChoices = page.getByRole('group', { name: 'Valitse kilpailuvuodet' });
  await yearChoices.getByLabel('2024').uncheck();
  await yearChoices.getByLabel('2020').check();
  await expect(competitionStat).toContainText('2');
  current = [...records, competition('New Espoo competition', 2024, 'Espoo')];
  await page.getByRole('button', { name: 'Päivitä kilpailuaineisto' }).click();
  await expect(competitionStat).toContainText('2');
  await page.getByRole('group', { name: 'Valitse kilpailuvuodet' }).getByLabel('2024').check();
  await expect(competitionStat).toContainText('3');
  await page.getByRole('button', { name: 'Kojelauta', exact: true }).click();
  await expect(page.locator('.stat-card').filter({ hasText: 'Kilpailuja valittuina vuosina' })).toContainText('4');
  await expect(page.locator('.stat-card').filter({ hasText: 'Alueiden kattamat kilpailut' })).toContainText('3');
  await page.getByRole('button', { name: 'Vertailu', exact: true }).click();
  await page.getByLabel('Kaavion mittari').selectOption('competitionCount');
  await expect(page.getByRole('table', { name: 'Aluevertailu', exact: true })).toContainText('Kilpailuja · valitut vuodet');
});

test('competition counts are a controllable layer on the existing homepage club map', async ({ page }) => {
  await page.route('**/jsondb/SFL-Kilpailut-2019-2026.json', (route) => route.fulfill({ json: [
    competition('Duplicate', 2020, 'Espoo'), competition('Duplicate', 2020, 'Espoo'),
    competition('Helsinki Open', 2021, 'Helsinki'), competition('Espoo Open', 2021, 'Espoo'),
  ] }));
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1, name: /Suomen seurat/ })).toBeVisible();
  await expect(page.locator('.competition-map-section')).toHaveCount(0);
  const mapSection = page.locator('.map-section');
  const controls = page.locator('.dashboard-map-controls');
  await expect(controls).not.toHaveAttribute('open', '');
  await expect(mapSection.locator('.map-canvas')).toBeVisible();
  const competitionMetrics = page.locator('.dashboard-competition-metrics');
  await expect(competitionMetrics).toBeVisible();
  await expect(page.getByTestId('competition-total')).toHaveText('4');
  expect(await competitionMetrics.evaluate((element) => Boolean(
    element.compareDocumentPosition(document.querySelector('.dashboard-map-controls')!)
      & Node.DOCUMENT_POSITION_FOLLOWING,
  ))).toBe(true);
  await expect(controls.getByRole('combobox', { name: 'Kilpailujen vuodet', exact: true })).toBeHidden();
  await controls.locator(':scope > summary').focus();
  await page.keyboard.press('Enter');
  await expect(controls).toHaveAttribute('open', '');
  await expect(controls.getByRole('combobox', { name: 'Kilpailujen vuodet', exact: true })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(controls).not.toHaveAttribute('open', '');
  await expect(page.getByTestId('competition-total')).toBeVisible();
  await openMapControls(page);
  await expect(page.getByTestId('competition-total')).toHaveText('4');
  await expect(mapSection.locator('.map-canvas')).toBeVisible();
  const competitionLayer = controls.getByLabel('Kilpailumäärät kunnittain');
  await expect(competitionLayer).not.toBeChecked();
  await expect(mapSection.locator('.competition-layer-municipality')).toHaveCount(0);
  await competitionLayer.check();
  const espoo = mapSection.locator('.competition-layer-municipality[aria-label^="Espoo,"]');
  await expect(espoo).toHaveAttribute('aria-label', 'Espoo, 3 kilpailuriviä');
  await expect(mapSection.locator('.competition-layer-legend')).toBeVisible();
  await expect(mapSection.locator('.competition-layer-legend')).toContainText('Kilpailurivejä kunnittain');
  await expect(mapSection.locator('.club-marker')).toHaveCount(1);
  await page.reload();
  await expect(controls).not.toHaveAttribute('open', '');
  await openMapControls(page);
  await expect(controls.getByLabel('Kilpailumäärät kunnittain')).toBeChecked();
  await expect(page.locator('.map-section .competition-layer-municipality')).not.toHaveCount(0);

  await page.getByRole('combobox', { name: 'Kilpailujen vuodet' }).selectOption('selected');
  const selectedYears = page.getByRole('group', { name: 'Valitse kilpailuvuodet' });
  await selectedYears.getByLabel('2021').uncheck();
  await selectedYears.getByLabel('2020').check();
  await expect(page.getByTestId('competition-total')).toHaveText('2');
  await expect(espoo).toHaveAttribute('aria-label', 'Espoo, 2 kilpailuriviä');
  await competitionLayer.uncheck();
  await expect(mapSection.locator('.competition-layer-municipality')).toHaveCount(0);
  await page.reload();
  await openMapControls(page);
  await expect(controls.getByLabel('Kilpailumäärät kunnittain')).not.toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('one competition year filter controls the homepage and regional planning views', async ({ page }) => {
  await page.route('**/jsondb/SFL-Kilpailut-2019-2026.json', (route) => route.fulfill({ json: records }));
  await page.goto('./');
  await openMapControls(page);
  const total = page.getByTestId('competition-total');
  await expect(total).toHaveText('5');
  await page.getByRole('combobox', { name: 'Kilpailujen vuodet', exact: true }).selectOption('selected');
  const years = page.getByRole('group', { name: 'Valitse kilpailuvuodet' });
  await years.getByLabel('2024', { exact: true }).uncheck();
  await years.getByLabel('2020', { exact: true }).check();
  await expect(total).toHaveText('2');
  await expect(page.getByRole('region', { name: 'Seurat' }).locator('.metric-value').first()).toContainText('1 seuraa');
  await page.getByRole('link', { name: /Aluesuunnittelu/ }).click();
  await expect(page.getByRole('combobox', { name: 'Kilpailujen vuodet', exact: true })).toHaveValue('selected');
  await page.getByRole('button', { name: 'Kojelauta', exact: true }).click();
  await expect(page.locator('.stat-card').filter({ hasText: 'Kilpailuja valittuina vuosina' })).toContainText('2');
  await page.getByRole('button', { name: 'Vertailu', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Kilpailujen vuodet', exact: true })).toHaveValue('selected');
  await expect(page.locator('.map-options')).toHaveCount(0);
  await page.getByRole('button', { name: 'Kartta', exact: true }).click();
  await expect(page.locator('.map-options')).toHaveCount(1);
  await page.getByRole('combobox', { name: 'Kilpailujen vuodet', exact: true }).selectOption('range');
  await page.getByRole('combobox', { name: 'Alkuvuosi', exact: true }).selectOption('2021');
  await page.getByRole('combobox', { name: 'Loppuvuosi', exact: true }).selectOption('2022');
  await page.getByRole('button', { name: 'Kojelauta', exact: true }).click();
  await expect(page.locator('.stat-card').filter({ hasText: 'Kilpailuja valittuina vuosina' })).toContainText('2');
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
  await openMapControls(page);
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
  await openMapControls(page);
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
  response = records;
  await page.getByRole('button', { name: 'Päivitä kilpailuaineisto' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Kilpailujen vuodet', exact: true }).selectOption('selected');
  await page.getByRole('group', { name: 'Valitse kilpailuvuodet' }).getByLabel('2024').uncheck();
  await expect(page.getByTestId('competition-total')).toHaveText('0');
  await expect(page.locator('.dashboard-competition-metrics')).toContainText('Ei valittuja vuosia');
  response = [];
  await page.getByRole('button', { name: 'Päivitä kilpailuaineisto' }).click();
  await page.getByRole('combobox', { name: 'Kilpailujen vuodet', exact: true }).selectOption('all');
  await expect(page.getByTestId('competition-total')).toHaveText('0');
});

test('competition controls are keyboard accessible and fit mobile in both themes', async ({ page }) => {
  await page.route('**/jsondb/SFL-Kilpailut-2019-2026.json', (route) => route.fulfill({ json: records }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await expect(page.getByTestId('competition-total')).toHaveText('5');
  await expect(page.locator('.dashboard-competition-metrics')).toBeVisible();
  await openMapControls(page);
  await page.getByRole('combobox', { name: 'Kilpailujen vuodet', exact: true }).selectOption('selected');
  const checkbox = page.getByRole('group', { name: 'Valitse kilpailuvuodet' }).getByLabel('2020');
  await checkbox.focus();
  await page.keyboard.press('Space');
  await expect(checkbox).toBeChecked();
  for (const theme of ['dark', 'light']) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    const accessibility = await new AxeBuilder({ page }).include('.dashboard-map-controls').include('.map-section').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(accessibility.violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
