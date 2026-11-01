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

async function addMunicipality(page: Page, name: string) {
  await page.getByRole('searchbox', { name: 'Hae kuntaa nimellä' }).fill(name);
  await page.getByRole('list', { name: 'Kuntaluettelo' }).getByRole('checkbox', { name: new RegExp(`^${name}`) }).check();
}

test('province overlay is independent from planner regions and restores saved map settings', async ({ page }) => {
  await open(page);
  await expect(page.locator('.province-fill').first()).toBeVisible();
  await expect(page.locator('.province-color-key')).toContainText('Uusimaa');
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

test('only Admin sees the password management area', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('button', { name: 'Admin', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /Kirjaudu ulos/ }).click();
  await page.getByRole('button', { name: 'Kirjaudu', exact: true }).click();
  await page.getByLabel('Tunnus').selectOption('admin');
  await page.getByLabel('Salasana').fill('test-admin-password');
  await page.getByRole('button', { name: 'Kirjaudu', exact: true }).last().click();
  const adminButton = page.getByRole('button', { name: 'Admin', exact: true });
  await expect(adminButton).toBeVisible();
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
  await expect(selector.locator('option:checked')).toHaveText('Ehdotus A');
  await page.getByRole('navigation', { name: 'Aluesuunnittelun näkymät' }).getByRole('button', { name: 'Kartta' }).click();
  await expect(page.locator('.region-row')).toHaveCount(0);
  await selector.selectOption({ label: 'Nykyrakenne' });
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
  await expect(page.getByLabel('Skenaario', { exact: true }).locator('option:checked')).toHaveText('Vanha suunnitelma');
  await page.reload();
  await expect(page.getByLabel('Skenaario', { exact: true }).locator('option:checked')).toHaveText('Vanha suunnitelma');
});
