import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';

const event = (name: string, year: number, municipalities = [
  { name: 'Helsingfors', primary: true, courses: ['Helsingin rata'] },
  { name: 'Esbo', primary: false, courses: ['Espoon rata'] },
]) => ({ name, year, startDate: `${year}-05-23`, endDate: `${year}-05-24`, competitionModel: 'Erilliskilpailu', divisionType: 'mixed', pdgaTier: 'C-tier', organizer: 'Testijärjestäjä', municipalities });
const source = { competitions: [
  event('Monikuntakilpailu', 2023),
  { ...event('Saman paikan kilpailu', 2023, [{ name: 'Helsinki', primary: true, courses: ['Helsingin rata'] }]), competitionModel: 'PDGA-liiga', pdgaTier: 'B-tier', organizer: 'Toinen järjestäjä' },
  event('Uudempi kilpailu', 2025, [{ name: 'Espoo', primary: true, courses: ['Espoon rata'] }]),
  event('<img src=x onerror=alert(1)>', 2025, [{ name: 'Tuntematon paikka', primary: true, courses: ['Puuttuva rata'] }]),
  { ...event('Virheellinen ajankohta', 2025), endDate: '2024-04-05' },
] };

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/data/SFL-Kilpailut_lopullinen.json', (route) => route.fulfill({ json: source }));
  await page.route('**/api/planner.php**', (route) => route.fulfill({ json: new URL(route.request().url()).searchParams.has('action') ? { authReady: true, role: null, csrfToken: 'test' } : {
    document: { version: 1, activeScenarioId: 'scenario', scenarios: [{
      id: 'scenario', name: 'Testiskenaario', description: '', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
      regions: [{ id: 'region', number: 1, name: 'Pääkaupunkiseutu', shortName: 'PKS', description: '', color: '#2563eb', opacity: 0.3, enabled: true, visible: true, municipalityCodes: ['091', '049'], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }],
    }] }, backups: [], revision: 'test',
  } }));
  await page.route('https://*.tile.openstreetmap.org/**', (route) => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=', 'base64') }));
});

test('one load across routes, default hidden, all/multiple/empty years synchronize every surface', async ({ page }) => {
  let requests = 0;
  page.on('request', (request) => { if (request.url().includes('SFL-Kilpailut_lopullinen.json')) requests++; });
  await page.goto('/koodi0004/');
  const panel = page.getByRole('region', { name: 'Kilpailut', exact: true });
  await expect(panel.getByRole('group', { name: 'Valitse vuodet · useita voi valita' })).toContainText('2023');
  await expect(page.locator('.competition-marker, .competition-cluster')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Kaikki vuodet', exact: true }).click();
  await expect(panel).toContainText('5 yksilöllistä kilpailua');
  await expect(panel).toContainText('Ilman ensisijaista karttakohdistusta: 1');
  await panel.getByLabel('2025', { exact: true }).uncheck();
  await expect(panel).toContainText('2 yksilöllistä kilpailua');
  await expect(panel.getByLabel('Karttamerkkien selite')).toContainText('2023');
  await expect(panel.getByLabel('Karttamerkkien selite')).not.toContainText('2025');
  await page.getByRole('link', { name: /Aluesuunnittelu/ }).click();
  await expect(page.locator('.region-row')).toContainText('Ensisijaiset kilpailut (suodatettu): 2');
  await page.getByRole('button', { name: 'Kojelauta', exact: true }).click();
  await expect(page.getByRole('figure', { name: 'Ensisijaiset kilpailut alueittain · suodatettu', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Vertailu', exact: true }).click();
  await expect(page.locator('.data-table')).toContainText('Ensisijaiset kilpailut');
  await expect(page.getByRole('region', { name: 'Vertailualueiden yhdiste · kilpailut' })).toContainText('Ensisijaisesti järjestetyt kilpailut2');
  await panel.getByLabel('2025', { exact: true }).check();
  await expect(panel).toContainText('5 yksilöllistä kilpailua');
  await panel.getByRole('button', { name: 'Tyhjennä vuosivalinta' }).click();
  await expect(panel).toContainText('Ei kilpailuja valituilla suodattimilla');
  await page.getByRole('link', { name: 'Seurakartta', exact: true }).click();
  await expect(panel).toContainText('Ei kilpailuja valituilla suodattimilla');
  expect(requests).toBe(1);
});

test('coincident events cluster once, spiderfy with keyboard, year labels, linked highlights and secondary search', async ({ page }) => {
  await page.goto('/koodi0004/');
  const panel = page.getByRole('region', { name: 'Kilpailut', exact: true });
  await panel.getByRole('button', { name: 'Kaikki vuodet', exact: true }).click();
  await panel.getByLabel('2025', { exact: true }).uncheck();
  const cluster = page.locator('.competition-cluster').first();
  await expect(cluster).toContainText('2');
  await cluster.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.competition-marker')).toHaveCount(2);
  const marker = page.locator('.competition-marker').filter({ hasText: '2023' }).first();
  await expect(marker).toHaveAttribute('aria-label', /2023.*Helsinki/);
  await marker.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.competition-popup')).toContainText('Ensisijainen kunta');
  await panel.getByRole('button', { name: /Monikuntakilpailu · 2023/ }).click();
  await expect(page.locator('.competition-highlight')).toHaveCount(2);
  await expect(panel.getByRole('region', { name: 'Kilpailun tiedot' })).toContainText('Esbo');
  await expect(panel.getByRole('region', { name: 'Kilpailun tiedot' })).toContainText('Espoon rata');
  await panel.getByLabel('Kunta · ensisijainen tai muu').fill('Esbo');
  await expect(panel).toContainText('1 yksilöllistä kilpailua');
  await expect(panel.locator('.competition-list')).toContainText('Monikuntakilpailu');
  await panel.getByLabel('Kunta · ensisijainen tai muu').fill('Helsinki');
  await expect(panel).toContainText('2 yksilöllistä kilpailua');
});

test('unresolved and invalid records remain searchable; dates and source text are not repaired or executed', async ({ page }) => {
  await page.goto('/koodi0004/');
  const panel = page.getByRole('region', { name: 'Kilpailut', exact: true });
  await panel.getByRole('button', { name: 'Kaikki vuodet', exact: true }).click();
  await panel.getByLabel('Hae kilpailua, kuntaa tai rataa').fill('Tuntematon');
  await expect(panel).toContainText('1 yksilöllistä kilpailua');
  await expect(page.locator('.competition-marker, .competition-cluster')).toHaveCount(0);
  await panel.locator('.competition-list button').click();
  await expect(panel.getByRole('region', { name: 'Kilpailun tiedot' })).toContainText('<img src=x onerror=alert(1)>');
  await expect(panel.locator('img')).toHaveCount(0);
  await panel.getByLabel('Hae kilpailua, kuntaa tai rataa').fill('Virheellinen');
  await panel.locator('.competition-list button').click();
  await expect(panel.getByRole('region', { name: 'Kilpailun tiedot' })).toContainText('5.4.2024');
  await expect(panel.getByRole('region', { name: 'Kilpailun tiedot' })).toContainText('Ei laskettavissa');
});

test('competition load errors are explicit and retryable', async ({ page }) => {
  let attempts = 0;
  await page.route('**/data/SFL-Kilpailut_lopullinen.json', (route) => ++attempts === 1 ? route.fulfill({ status: 503, body: 'Unavailable' }) : route.fulfill({ json: source }));
  await page.goto('/koodi0004/');
  const panel = page.getByRole('region', { name: 'Kilpailut', exact: true });
  await expect(panel.getByRole('alert')).toContainText('503');
  await panel.getByRole('button', { name: 'Yritä kilpailujen lataamista uudelleen' }).click();
  await expect(panel.getByRole('group', { name: 'Valitse vuodet · useita voi valita' })).toContainText('2025');
});

test('models, tiers, organizer, municipality and region filters share the same active result set and exports', async ({ page }) => {
  await page.goto('/koodi0004/#/alueet');
  const panel = page.getByRole('region', { name: 'Kilpailut', exact: true });
  await panel.getByRole('button', { name: 'Kaikki vuodet', exact: true }).click();
  await panel.getByRole('combobox', { name: 'Kilpailumalli', exact: true }).selectOption('PDGA-liiga');
  await expect(panel).toContainText('1 yksilöllistä kilpailua');
  await panel.getByRole('combobox', { name: 'PDGA-luokitus', exact: true }).selectOption('C-tier');
  await expect(panel).toContainText('Ei kilpailuja valituilla suodattimilla');
  await panel.getByRole('combobox', { name: 'PDGA-luokitus', exact: true }).selectOption('B-tier');
  await panel.getByRole('combobox', { name: 'Järjestäjä', exact: true }).selectOption('Toinen järjestäjä');
  await panel.getByLabel('Kilpailujen alue · ensisijainen kunta').selectOption('region');
  await expect(panel).toContainText('1 yksilöllistä kilpailua');
  await expect(page.locator('.region-row')).toContainText('Ensisijaiset kilpailut (suodatettu): 1');
  const downloaded = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Vie kilpailut JSON', exact: true }).click();
  const download = await downloaded;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const json = JSON.parse(Buffer.concat(chunks).toString());
  expect(json.uniqueCount).toBe(1);
  expect(json.filters.model).toBe('PDGA-liiga');
  expect(json.filters.regionId).toBe('region');
  expect(json.competitions[0].name).toBe('Saman paikan kilpailu');
  await panel.getByLabel('Kunta · ensisijainen tai muu').fill('Espoo');
  await expect(panel).toContainText('Ei kilpailuja valituilla suodattimilla');
});

test('enabled competition layer and details are keyboard accessible in both themes on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/koodi0004/');
  const panel = page.getByRole('region', { name: 'Kilpailut', exact: true });
  await panel.getByRole('button', { name: 'Kaikki vuodet', exact: true }).click();
  await panel.getByLabel('Hae kilpailua, kuntaa tai rataa').fill('Monikuntakilpailu');
  await panel.locator('.competition-list button').focus(); await page.keyboard.press('Enter');
  await expect(panel.getByRole('region', { name: 'Kilpailun tiedot' })).toBeVisible();
  for (const theme of ['dark', 'light']) {
    if (theme === 'light') await page.getByRole('button', { name: 'Vaihda vaaleaan tilaan' }).click();
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth, viewport: innerWidth,
      overflow: [...document.querySelectorAll('body *')].filter((node) => node.getBoundingClientRect().right > innerWidth && !node.closest('.leaflet-pane')).slice(0, 10).map((node) => ({ tag: node.tagName, class: node.className, right: node.getBoundingClientRect().right })),
    }));
    expect(dimensions.width, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport);
    const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(audit.violations).toEqual([]);
  }
});

test('full production dataset renders unique primary markers and responsive year filtering', async ({ page }) => {
  await page.unroute('**/data/SFL-Kilpailut_lopullinen.json');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/koodi0004/');
  const panel = page.getByRole('region', { name: 'Kilpailut', exact: true });
  await expect(panel.getByRole('group', { name: 'Valitse vuodet · useita voi valita' })).toContainText('2026');
  const start = Date.now();
  await panel.getByRole('button', { name: 'Kaikki vuodet', exact: true }).click();
  await expect(panel).toContainText('2304 yksilöllistä kilpailua');
  const audit = JSON.parse(await readFile(new URL('../../COMPETITION-DATA-QUALITY.json', import.meta.url), 'utf8'));
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('.competition-cluster')].reduce((sum, cluster) => sum + Number.parseInt(cluster.textContent ?? '0'), 0) + document.querySelectorAll('.competition-marker').length)).toBe(audit.mapEligibleCount);
  expect(Date.now() - start).toBeLessThan(5000);
  await panel.getByRole('button', { name: 'Tyhjennä vuosivalinta' }).click();
  await panel.getByLabel('2023', { exact: true }).check();
  await panel.getByLabel('2025', { exact: true }).check();
  await expect(panel).toContainText('782 yksilöllistä kilpailua');
  await expect(panel.getByLabel('Karttamerkkien selite')).toContainText('2023');
  await expect(panel.getByLabel('Karttamerkkien selite')).toContainText('2025');
  await expect(panel.locator('.competition-list button')).toHaveCount(50);
});
