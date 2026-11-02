import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  const clubs = JSON.parse(await readFile(new URL('../../jsondb/seurat.json', import.meta.url), 'utf8'));
  let sharedState = { document: null, backups: [], revision: null as string | null };
  let revision = 0;
  let role: 'writer' | 'admin' | null = 'writer';
  await page.route('**/api/planner.php**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const action = url.searchParams.get('action');
    if (action === 'session') return route.fulfill({ json: { authReady: true, role, csrfToken: 'test-csrf-token' } });
    if (action === 'login' && request.method() === 'POST') {
      role = request.postDataJSON().role;
      return route.fulfill({ json: { role, csrfToken: 'test-csrf-token' } });
    }
    if (action === 'logout' && request.method() === 'POST') {
      role = null;
      return route.fulfill({ json: { role, csrfToken: 'test-csrf-token' } });
    }
    if (action === 'admin/password' && request.method() === 'POST') {
      role = null;
      return route.fulfill({ json: { role, csrfToken: 'test-csrf-token' } });
    }
    if (request.method() === 'GET') return route.fulfill({ json: sharedState });
    const headers = route.request().headers();
    if (!role) return route.fulfill({ status: 401, json: { error: 'Kirjautuminen vaaditaan.' } });
    if (headers['x-csrf-token'] !== 'test-csrf-token') return route.fulfill({ status: 403, json: { error: 'CSRF-tarkistus epäonnistui.' } });
    const expected = headers['x-expected-revision'];
    const createOnly = headers['if-none-match'] === '*';
    if ((sharedState.revision === null && !createOnly) || (sharedState.revision !== null && expected !== sharedState.revision)) {
      return route.fulfill({ status: 409, json: { error: 'Suunnitelma muuttui.' } });
    }
    const body = route.request().postDataJSON();
    revision += 1;
    sharedState = { ...body, revision: `revision-${revision}` };
    return route.fulfill({ json: { revision: sharedState.revision } });
  });
  await page.route('https://*.tile.openstreetmap.org/**', (route) => route.fulfill({
    contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=', 'base64'),
  }));
  await page.route('**/api/clubs.php', (route) => route.fulfill({ json: clubs }));
});

async function open(page: Page) {
  await page.goto('/koodi0004/#/alueet');
  await expect(page.getByRole('button', { name: 'Uusi alue' })).toBeVisible();
  await expect(page.locator('.planner-shell')).toBeVisible();
}

async function loginAsAdmin(page: Page) {
  const logout = page.getByRole('button', { name: /Kirjaudu ulos/ });
  if (await logout.isVisible()) {
    await logout.click();
  }
  const loginButton = page.getByRole('button', { name: 'Kirjaudu', exact: true });
  await expect(loginButton).toBeVisible();
  await loginButton.click();
  await page.getByLabel('Tunnus').selectOption('admin');
  await page.getByLabel('Salasana').fill('test-admin-password');
  await page.getByRole('button', { name: 'Kirjaudu', exact: true }).last().click();
}

async function addMunicipality(page: Page, name: string) {
  await page.getByRole('searchbox', { name: 'Hae kuntaa nimellä' }).fill(name);
  await page.getByRole('list', { name: 'Kuntaluettelo' }).getByRole('checkbox', { name: new RegExp(`^${name}(?:\\s|$)`) }).check();
}

test('planner overview, regions, map and observations follow the requested order', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await expect(page.getByRole('heading', { name: 'Maakunta', exact: true })).toBeVisible();
  await expect(page.locator('.observations-panel')).toHaveJSProperty('open', false);
  await expect(page.getByText('Suunnitelman tarkistuksissa esiin nousseet huomiot')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tarkistukset', exact: true })).toHaveCount(0);

  const filters = page.locator('.filters-card');
  await expect(filters).toHaveJSProperty('open', false);
  await expect(filters.getByRole('combobox', { name: 'Kilpailujen vuodet', exact: true })).not.toBeVisible();
  await expect(page.locator('.region-list')).toBeVisible();
  await expect(filters.locator('.region-filter')).toHaveCount(0);
  await expect(filters.locator('.region-list')).toHaveCount(0);

  const layout = await page.evaluate(() => {
    const bounds = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
    return {
      regionListBottom: bounds('.region-list').bottom,
      filtersTop: bounds('.filters-card').top,
      mapTop: bounds('.planner-map-layout').top,
      mapBottom: bounds('.planner-map-layout').bottom,
      observationsTop: bounds('.observations-panel').top,
      regionColumns: getComputedStyle(document.querySelector('.region-list ul')!).gridTemplateColumns.split(' ').length,
    };
  });
  expect(layout.regionListBottom).toBeLessThanOrEqual(layout.filtersTop);
  expect(layout.filtersTop).toBeLessThanOrEqual(layout.mapTop);
  expect(layout.observationsTop).toBeGreaterThanOrEqual(layout.mapBottom);
  expect(layout.regionColumns).toBe(5);

  const observations = page.locator('.observations-panel');
  const summary = observations.locator('summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(observations).toHaveJSProperty('open', true);
  await expect(observations.locator('.warning-list, .validation-ok')).toBeVisible();
  await summary.click();
  await expect(observations).toHaveJSProperty('open', false);
});

test('planner filters collapse by default and keep competition-year controls available across views', async ({ page }) => {
  await page.route('**/jsondb/SFL-Kilpailut-2019-2026.json', (route) => route.fulfill({ json: [
    { 'Kilpailun nimi': 'Espoo Open', Vuosi: 2020, Kunta: 'Espoo' },
    { 'Kilpailun nimi': 'Helsinki Open', Vuosi: 2021, Kunta: 'Helsinki' },
  ] }));
  await open(page);

  const filters = page.locator('.filters-card');
  await expect(filters).toHaveJSProperty('open', false);
  await filters.locator(':scope > summary').click();
  const years = filters.getByRole('combobox', { name: 'Kilpailujen vuodet', exact: true });
  await expect(years).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  await years.selectOption('selected');
  await expect(filters.getByRole('group', { name: 'Valitse kilpailuvuodet' })).toBeVisible();
  await expect(filters.locator('.pill')).toHaveText('käytössä');

  await page.getByRole('button', { name: 'Kojelauta', exact: true }).click();
  await expect(page.locator('.filters-card')).toHaveCount(0);
  const globalYears = page.getByRole('combobox', { name: 'Kilpailujen vuodet', exact: true });
  await expect(globalYears).toBeVisible();
  await expect(globalYears).toHaveValue('selected');
  await page.getByRole('button', { name: 'Kartta', exact: true }).click();
  await filters.locator(':scope > summary').click();
  await filters.getByRole('button', { name: 'Tyhjennä suodattimet' }).click();
  await expect(filters.getByRole('combobox', { name: 'Kilpailujen vuodet', exact: true })).toHaveValue('all');
  await expect(filters.locator('.pill')).toHaveCount(0);
});

test('province overlay is independent from planner regions and restores saved map settings', async ({ page }) => {
  await open(page);
  await expect(page.locator('.province-overlay-controls')).toHaveJSProperty('open', true);
  await expect(page.locator('.province-fill').first()).toBeVisible();
  await expect(page.locator('.province-color-key')).toContainText('Uusimaa');
  await expect(page.locator('.map-legend-bar .legend-dot').nth(0)).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(page.locator('.map-legend-bar .legend-dot').nth(3)).toHaveCSS('background-color', 'rgb(22, 163, 74)');
  await page.getByLabel('Maakuntatason peittävyys').fill('64');
  await page.getByLabel('Näytä maakuntarajat').uncheck();
  await page.getByLabel('Näytä maakunnat').uncheck();
  await page.reload();
  await open(page);
  await expect(page.getByLabel('Maakuntatason peittävyys')).toHaveValue('64');
  await expect(page.getByLabel('Näytä maakuntarajat')).not.toBeChecked();
  await expect(page.getByLabel('Näytä maakunnat')).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Uusi alue' })).toBeVisible();
});

test('planner map hovers directly on a municipality and highlights its region', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Uusi alue' }).click();
  await page.getByLabel('Nimi', { exact: true }).fill('Lappi');
  await addMunicipality(page, 'Rovaniemi');
  await page.getByRole('button', { name: 'Sulje muokkaus' }).click();
  await page.getByLabel('Seurat').uncheck();

  const municipality = page.locator('.leaflet-municipality-pane path.municipality-698');
  await expect(municipality).toHaveCount(1);
  await municipality.scrollIntoViewIfNeeded();
  const target = await municipality.evaluate((element) => {
    const path = element as SVGPathElement;
    const bounds = path.getBBox();
    const matrix = path.getScreenCTM();
    if (!matrix) throw new Error('Municipality path is not rendered.');
    for (let row = 1; row < 20; row += 1) {
      for (let column = 1; column < 20; column += 1) {
        const point = new DOMPoint(bounds.x + bounds.width * column / 20, bounds.y + bounds.height * row / 20);
        if (path.isPointInFill(point)) {
          const screenPoint = point.matrixTransform(matrix);
          return { x: screenPoint.x, y: screenPoint.y };
        }
      }
    }
    throw new Error('Could not find a point inside the municipality path.');
  });
  await page.mouse.move(target.x, target.y);

  const tooltip = page.locator('.leaflet-tooltip');
  await expect(tooltip).toContainText('Kunta: Rovaniemi');
  await expect(tooltip).toContainText('Alue: Lappi');
  await expect.poll(() => municipality.evaluate((element) => getComputedStyle(element).cursor)).toBe('pointer');
  await expect.poll(() => municipality.evaluate((element) => getComputedStyle(element).fill)).toBe('rgb(100, 116, 139)');
});

test('population appears in planner maps, region details, dashboards, comparisons and exports', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Uusi alue' }).click();
  await page.getByLabel('Nimi', { exact: true }).fill('Väestöalue');
  await addMunicipality(page, 'Helsinki');
  await addMunicipality(page, 'Espoo');
  await page.getByRole('button', { name: 'Valmis', exact: true }).click();
  await expect(page.locator('.region-detail')).toContainText('1 020 108');
  await expect(page.locator('.region-detail')).toContainText('510 054');
  await page.getByLabel('Väestökartta 2025').check();
  await expect(page.getByLabel('Väestökartan selite')).toContainText('Suurkaupunki');
  await page.getByRole('button', { name: 'Kojelauta', exact: true }).click();
  await expect(page.locator('.planner-main')).toContainText('5 652 881');
  await expect(page.locator('.planner-main')).toContainText('Väestö 2025 alueittain');
  await page.getByRole('button', { name: 'Vertailu', exact: true }).click();
  await page.getByLabel('Kaavion mittari').selectOption('population');
  await expect(page.getByRole('table', { name: 'Aluevertailu', exact: true })).toContainText('1 020 108');
  await loginAsAdmin(page);
  await page.getByRole('button', { name: 'Tuonti ja vienti', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Kuntien väestöanalyysi' })).toContainText('308 kuntaa');
});

test('clustered clubs can be separated on the planner map', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/clubs.php', (route) => route.fulfill({
    json: {
      metadata: { generatedAt: '2026-01-01T00:00:00Z', recordCount: 2, source: 'test' },
      data: [
        { id: 'hippo', seura: 'Team Hippo ry', paikkakunta: 'Espoo', latitude: 60.20549, longitude: 24.6559, jasenmaara: 25, aanimaara: 10 },
        { id: 'puskasoturit', seura: 'Puskasoturit ry', paikkakunta: 'Espoo', latitude: 60.20549, longitude: 24.6559, jasenmaara: 373, aanimaara: 20 },
      ],
    },
  }));
  await open(page);
  const map = page.locator('.planner-map');
  const cluster = map.locator('.club-cluster').first();
  await expect(cluster).toBeVisible();
  await cluster.click();
  const remainingCluster = map.locator('.club-cluster');
  if (await remainingCluster.count()) await remainingCluster.first().click();
  await expect(map.locator('.club-marker[title^="Team Hippo ry"]')).toBeVisible();
  await expect(map.locator('.club-marker[title^="Puskasoturit ry"]')).toBeVisible();
});

test('selected region details do not cause horizontal overflow', async ({ page }) => {
  for (const width of [1440, 1100]) {
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    await page.getByRole('button', { name: 'Uusi alue' }).click();
    await page.getByLabel('Nimi', { exact: true }).fill('Lappi');
    await addMunicipality(page, 'Rovaniemi');
    await page.getByRole('button', { name: 'Sulje muokkaus' }).click();

    await expect(page.locator('.region-detail-wide')).toBeVisible();
    const overflow = await page.locator('.planner-map-layout').evaluate((layout) => ({
      clientWidth: layout.clientWidth,
      scrollWidth: layout.scrollWidth,
      mapWidth: layout.querySelector('.planner-map-column')?.getBoundingClientRect().width,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
    expect(overflow.mapWidth).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    if (width === 1440) await page.reload();
  }
});

test('selected region statistics span below the map at desktop and mobile widths', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Uusi alue' }).click();
  await page.getByLabel('Nimi', { exact: true }).fill('Pohjois-Pohjanmaa');
  await addMunicipality(page, 'Oulu');
  await page.getByRole('button', { name: 'Sulje muokkaus' }).click();

  const detail = page.locator('.region-detail-wide');
  for (const width of [1440, 1100, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(detail).toBeVisible();
    const layout = await page.evaluate(() => {
      const mapLayout = document.querySelector('.planner-map-layout')!;
      const detailContainer = document.querySelector('.region-detail-wide')!;
      const map = mapLayout.querySelector('.planner-map-column')!.getBoundingClientRect();
      const regionList = document.querySelector('.region-list')!.getBoundingClientRect();
      const content = detailContainer.getBoundingClientRect();
      return {
        mapBottom: map.bottom,
        regionListBottom: regionList.bottom,
        detailTop: content.top,
        detailWidth: content.width,
        layoutWidth: mapLayout.getBoundingClientRect().width,
        statsColumnCount: getComputedStyle(detailContainer.querySelector('.stat-grid')!).gridTemplateColumns.split(' ').length,
      };
    });
    expect(layout.detailTop).toBeGreaterThanOrEqual(Math.max(layout.mapBottom, layout.regionListBottom));
    expect(layout.detailWidth).toBeGreaterThan(layout.layoutWidth * 0.9);
    expect(layout.statsColumnCount).toBe(width > 1280 ? 5 : width > 860 ? 4 : 2);
  }
});

test('region names remain fully visible in the sidebar at desktop and mobile widths', async ({ page }) => {
  const name = 'Pohjois-Suomen frisbeegolfseurojen yhteistoiminta-alue';
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await page.getByRole('button', { name: 'Uusi alue' }).click();
  await page.getByLabel('Nimi', { exact: true }).fill(name);
  await addMunicipality(page, 'Rovaniemi');
  await page.getByRole('button', { name: 'Sulje muokkaus' }).click();

  const regionName = page.locator('.region-row-text strong').filter({ hasText: name });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(regionName).toHaveText(name);
    await expect(regionName).toBeVisible();
    const dimensions = await regionName.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      textOverflow: getComputedStyle(element).textOverflow,
      whiteSpace: getComputedStyle(element).whiteSpace,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
    expect(dimensions.textOverflow).not.toBe('ellipsis');
    expect(dimensions.whiteSpace).not.toBe('nowrap');
  }
});

test('region actions appear above full-width region details', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Uusi alue' }).click();
  await page.getByLabel('Nimi', { exact: true }).fill('Esimerkkialue');
  await addMunicipality(page, 'Rovaniemi');
  await page.getByRole('button', { name: 'Sulje muokkaus' }).click();

  const row = page.locator('.region-row').filter({ hasText: 'Esimerkkialue' });
  const actions = row.locator('.row-actions');
  const details = row.locator('.region-row-main');

  await expect(actions).toBeVisible();
  const layout = await row.evaluate((element) => {
    const actions = element.querySelector('.row-actions')!.getBoundingClientRect();
    const details = element.querySelector('.region-row-main')!.getBoundingClientRect();
    const text = element.querySelector('.region-row-text')!.getBoundingClientRect();
    return { actionsBottom: actions.bottom, detailsTop: details.top, textWidth: text.width, rowWidth: element.getBoundingClientRect().width };
  });
  expect(layout.actionsBottom).toBeLessThanOrEqual(layout.detailsTop);
  expect(layout.textWidth).toBeGreaterThan(layout.rowWidth * 0.6);
});

test('creates a region, analyses it, undoes, redoes and restores after reload', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Uusi alue' }).click();
  await page.getByLabel('Nimi', { exact: true }).fill('Ahvenanmaa ja Turku');
  await addMunicipality(page, 'Maarianhamina');
  await addMunicipality(page, 'Turku');
  const row = page.locator('.region-row').filter({ hasText: 'Ahvenanmaa ja Turku' });
  await expect(row).toContainText('2 kuntaa');

  await page.getByRole('button', { name: /^Kumoa/ }).click();
  await expect(row).toContainText('1 kuntaa');
  await page.getByRole('button', { name: /^Tee uudelleen/ }).click();
  await expect(row).toContainText('2 kuntaa');

  await page.getByRole('button', { name: 'Sulje muokkaus' }).click();
  await row.locator('.region-row-main').click();
  const detail = page.locator('.region-detail');
  await expect(detail.locator('.stat-card').filter({ hasText: 'Kuntia' })).toContainText('2');
  await expect(detail).toContainText('Suomen pinta-alasta');

  await expect(page.locator('.save-indicator')).toContainText('Tallennettu');
  await page.reload();
  await expect(page.locator('.region-row').filter({ hasText: 'Ahvenanmaa ja Turku' })).toContainText('2 kuntaa');
});

test('public users can browse but cannot edit until signing in', async ({ page }) => {
  await page.route('**/api/planner.php?action=session', async (route) => route.fulfill({
    json: { authReady: true, role: null, csrfToken: 'anonymous-csrf-token' },
  }));
  await page.goto('/koodi0004/#/alueet');
  await expect(page.getByRole('heading', { name: 'ALUESUUNNITTELU' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Uusi alue' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Kirjaudu', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Kirjaudu', exact: true }).click();
  await page.getByLabel('Tunnus').selectOption('writer');
  await page.getByLabel('Salasana').fill('test-writer-password');
  await page.getByRole('button', { name: 'Kirjaudu', exact: true }).last().click();
  await expect(page.getByRole('button', { name: 'Uusi alue' })).toBeVisible();
});

test('expired login does not open a login panel or show a login-required banner', async ({ page }) => {
  await open(page);
  await page.route('**/api/planner.php**', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') return route.fulfill({ status: 401, json: { error: 'Kirjautuminen vaaditaan.' } });
    if (new URL(request.url()).searchParams.get('action') === 'session') {
      return route.fulfill({ json: { authReady: true, role: null, csrfToken: 'anonymous-csrf-token' } });
    }
    return route.continue();
  });
  await page.getByRole('button', { name: 'Uusi alue' }).click();
  await expect(page.locator('.save-indicator')).toContainText('Tallennus epäonnistui');
  await expect(page.locator('.auth-panel')).toHaveCount(0);
  await expect(page.getByText(/Kirjoittaminen vaatii kirjautumisen/)).toHaveCount(0);
});

test('only Admin sees the password management area', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('button', { name: 'Admin', exact: true })).toHaveCount(0);
  const views = page.getByRole('navigation', { name: 'Aluesuunnittelun näkymät' });
  await expect(views.getByRole('button', { name: 'Varmuuskopiot', exact: true })).toHaveCount(0);
  await expect(views.getByRole('button', { name: 'Tuonti ja vienti', exact: true })).toHaveCount(0);
  await loginAsAdmin(page);
  const adminButton = page.getByRole('button', { name: 'Admin', exact: true });
  await expect(adminButton).toBeVisible();
  await expect(views.getByRole('button', { name: 'Varmuuskopiot', exact: true })).toBeVisible();
  await expect(views.getByRole('button', { name: 'Tuonti ja vienti', exact: true })).toBeVisible();
  await adminButton.click();
  await expect(page.getByRole('heading', { name: 'Admin · tunnusten hallinta' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Kirjoittajan salasana' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Adminin salasana' })).toBeVisible();
  await expect(page.getByLabel('Nykyinen Admin-salasana')).toHaveCount(2);
});

test('all views render and pass axe checks in both themes', async ({ page }) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await loginAsAdmin(page);
  await page.getByRole('button', { name: 'Uusi alue' }).click();
  await addMunicipality(page, 'Helsinki');
  for (const view of ['Kartta', 'Kojelauta', 'Vertailu', 'Kohdistamattomat', 'Skenaariot', 'Varmuuskopiot', 'Tuonti ja vienti']) {
    await page.getByRole('navigation', { name: 'Aluesuunnittelun näkymät' }).getByRole('button', { name: new RegExp(`^${view}`) }).click();
    for (const theme of ['dark', 'light']) {
      const toggle = page.getByRole('button', { name: theme === 'dark' ? 'Vaihda tummaan teemaan' : 'Vaihda vaaleaan teemaan' });
      if (await toggle.count()) await toggle.click();
      const results = await new AxeBuilder({ page }).exclude('.leaflet-container').analyze();
      expect(results.violations.map((item) => `${view}/${theme}: ${item.id} ${item.nodes.map((node) => node.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
    }
  }
});

test('scenarios can be created and switched without leaking regions', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Uusi alue' }).click();
  await page.getByRole('navigation', { name: 'Aluesuunnittelun näkymät' }).getByRole('button', { name: 'Skenaariot' }).click();
  await page.getByLabel('Uuden skenaarion nimi').fill('Ehdotus A');
  await page.getByRole('button', { name: 'Luo skenaario' }).click();
  const selector = page.getByLabel('Skenaario', { exact: true });
  await expect(selector.locator('option:checked')).toHaveText('Skenaario: Ehdotus A');
  await page.getByRole('navigation', { name: 'Aluesuunnittelun näkymät' }).getByRole('button', { name: 'Kartta' }).click();
  await expect(page.locator('.region-row')).toHaveCount(0);
  await selector.selectOption({ label: 'Skenaario: Nykyrakenne' });
  await expect(page.locator('.region-row')).toHaveCount(1);
});

test('browser data migrates only after explicit confirmation when the server is empty', async ({ page }) => {
  const legacyDocument = {
    version: 1,
    activeScenarioId: 'legacy-scenario',
    scenarios: [{ id: 'legacy-scenario', name: 'Vanha suunnitelma', description: '', regions: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
  };
  await page.goto('/koodi0004/');
  await page.evaluate(async (document) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('koodi0004-region-planner', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('kv');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('kv', 'readwrite');
      transaction.objectStore('kv').put(document, 'region-planner:document');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  }, legacyDocument);
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/planner.php') && request.method() === 'PUT') writes.push(request.method());
  });
  await page.goto('/koodi0004/#/alueet');
  await expect(page.getByRole('heading', { name: 'Palvelin ei sisällä vielä suunnitelmaa' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Siirrä selaimen suunnitelma palvelimelle' })).toBeEnabled();
  expect(writes).toHaveLength(0);

  await page.getByRole('button', { name: 'Siirrä selaimen suunnitelma palvelimelle' }).click();
  await expect(page.getByLabel('Skenaario', { exact: true }).locator('option:checked')).toHaveText('Skenaario: Vanha suunnitelma');
  await page.reload();
  await expect(page.getByLabel('Skenaario', { exact: true }).locator('option:checked')).toHaveText('Skenaario: Vanha suunnitelma');
});
