import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page }) => {
  await page.route('https://*.tile.openstreetmap.org/**', (route) => route.fulfill({
    contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=', 'base64'),
  }));
});

async function open(page: Page) {
  await page.goto('/koodi0004/#/alueet');
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
