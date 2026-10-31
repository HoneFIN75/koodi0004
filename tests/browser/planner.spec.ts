import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page }) => {
  let sharedState = { document: null, backups: [], revision: null as string | null };
  let revision = 0;
  await page.route('**/api/planner.php', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: sharedState });
    const headers = route.request().headers();
    if (headers['x-planner-write-key'] !== 'test-shared-write-key') return route.fulfill({ status: 401, json: { error: 'Kirjoitusavain vaaditaan.' } });
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
});

async function open(page: Page) {
  await page.goto('/koodi0004/#/alueet');
  await expect(page.getByRole('heading', { name: 'Palvelintallennus vaatii kirjoitusavaimen' })).toBeVisible();
  await page.getByLabel('Palvelimen kirjoitusavain').fill('test-shared-write-key');
  await page.getByRole('button', { name: 'Yritä tallentaa' }).click();
  await expect(page.getByRole('button', { name: 'Uusi alue' })).toBeVisible();
  await expect(page.locator('.save-indicator')).toContainText('Tallennettu');
}

async function addMunicipality(page: Page, name: string) {
  await page.getByRole('searchbox', { name: 'Hae kuntaa nimellä' }).fill(name);
  await page.getByRole('list', { name: 'Kuntaluettelo' }).getByRole('checkbox', { name: new RegExp(`^${name}`) }).check();
}

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

test('all views render and pass axe checks in both themes', async ({ page }) => {
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
  await expect(page.getByRole('button', { name: 'Siirrä selaimen suunnitelma palvelimelle' })).toBeDisabled();
  expect(writes).toHaveLength(0);

  await page.getByLabel('Palvelimen kirjoitusavain').fill('test-shared-write-key');
  await expect(page.getByRole('button', { name: 'Siirrä selaimen suunnitelma palvelimelle' })).toBeEnabled();
  await page.getByRole('button', { name: 'Siirrä selaimen suunnitelma palvelimelle' }).click();
  await expect(page.getByLabel('Skenaario', { exact: true }).locator('option:checked')).toHaveText('Vanha suunnitelma');
  await page.reload();
  await expect(page.getByLabel('Skenaario', { exact: true }).locator('option:checked')).toHaveText('Vanha suunnitelma');
});
