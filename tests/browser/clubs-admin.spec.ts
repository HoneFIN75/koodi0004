import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';

const existingClub = () => ({
  id: 'club_original',
  seura: 'Esimerkkiseura ry',
  paikkakunta: 'Helsinki',
  latitude: 60.17,
  longitude: 24.94,
  jasenmaara: 120,
  aanimaara: 15,
  contact: {
    name: 'Yhteyshenkilö',
    email: 'yhteys@example.fi',
    phone: '+358 40 123 4567',
    website: 'https://example.fi',
    instagram: '',
    tiktok: '',
    public: false,
  },
  details: { foundedYear: 2000 },
  archived: false,
});

async function setup(page: Page, initialRole: 'writer' | 'admin' = 'admin') {
  let role: 'writer' | 'admin' | null = initialRole;
  let revision = 'revision-0';
  let clubs = [existingClub()];
  let adminReads = 0;
  const writes: { body: { version: number; data: typeof clubs }; headers: Record<string, string> }[] = [];

  await page.route('**/api/planner.php**', async (route) => {
    const url = new URL(route.request().url());
    const action = url.searchParams.get('action');
    if (action === 'session') return route.fulfill({ json: { authReady: true, role, csrfToken: 'test-csrf-token' } });
    if (action === 'logout') {
      role = null;
      return route.fulfill({ json: { role: null, csrfToken: 'test-csrf-token' } });
    }
    return route.fulfill({ json: { document: null, backups: [], revision: null } });
  });

  await page.route('**/api/clubs.php**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.searchParams.get('view') === 'admin' || request.method() === 'PUT') {
      adminReads += 1;
      if (role !== 'admin') return route.fulfill({ status: 403, json: { error: 'Admin required.' } });
      if (request.method() === 'GET') return route.fulfill({ json: { version: 1, data: clubs, revision } });
      const headers = request.headers();
      const body = request.postDataJSON();
      writes.push({ body, headers });
      if (headers['x-csrf-token'] !== 'test-csrf-token' || headers['x-expected-revision'] !== revision) {
        return route.fulfill({ status: 409, json: { error: 'Seuratiedot ovat muuttuneet.' } });
      }
      clubs = body.data;
      revision = `revision-${writes.length}`;
      return route.fulfill({ json: { revision } });
    }
    return route.fulfill({ json: {
      metadata: { generatedAt: '2026-01-01T00:00:00Z', recordCount: clubs.filter((club) => !club.archived).length, source: 'test' },
      data: clubs.filter((club) => !club.archived),
    } });
  });
  await page.route('https://*.tile.openstreetmap.org/**', (route) => route.abort());
  return {
    get clubs() { return clubs; },
    get writes() { return writes; },
    get adminReads() { return adminReads; },
  };
}

test('Admin can create, edit, archive and restore clubs with revision and CSRF protection', async ({ page }) => {
  const state = await setup(page);
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/koodi0004/#/alueet/seurahallinta');

  await expect(page.getByRole('button', { name: 'Seurahallinta' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Seurahallinta' })).toBeVisible();
  await expect(page.getByText('Esimerkkiseura ry')).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).include('.clubs-admin').analyze();
  expect(accessibility.violations).toEqual([]);
  await page.getByRole('button', { name: 'Muokkaa: Esimerkkiseura ry' }).click();
  const formAccessibility = await new AxeBuilder({ page }).include('.clubs-admin-form').analyze();
  expect(formAccessibility.violations).toEqual([]);
  await page.getByLabel('Seuran nimi').fill('Päivitetty seura ry');
  await page.getByLabel('Yhteyshenkilön nimi').fill('Uusi yhteyshenkilö');
  await page.getByLabel('Näytä yhteystiedot julkisessa seurakartassa').check();
  await page.getByRole('button', { name: 'Tallenna seura' }).click();

  await expect(page.locator('.clubs-admin [role="status"]')).toContainText('tallennettiin');
  expect(state.writes[0].headers['x-csrf-token']).toBe('test-csrf-token');
  expect(state.writes[0].headers['x-expected-revision']).toBe('revision-0');
  expect(state.clubs[0].seura).toBe('Päivitetty seura ry');
  expect(state.clubs[0].contact.public).toBe(true);

  await page.getByRole('button', { name: 'Arkistoi: Päivitetty seura ry' }).click();
  await expect(page.locator('.clubs-admin [role="status"]')).toContainText('arkistoitiin');
  expect(state.clubs[0].archived).toBe(true);
  await page.getByLabel('Näytä arkistoidut').check();
  await page.getByRole('button', { name: 'Palauta: Päivitetty seura ry' }).click();
  await expect(page.locator('.clubs-admin [role="status"]')).toContainText('palautettiin');
  expect(state.clubs[0].archived).toBe(false);

  await page.getByRole('button', { name: 'Lisää seura' }).click();
  await page.getByLabel('Seuran nimi').fill('Uusi seura ry');
  await page.getByLabel('Paikkakunta').fill('Turku');
  await page.getByLabel('Jäsenmäärä').fill('320');
  await page.getByLabel('Sähköposti').fill('seura@example.fi');
  await page.getByRole('button', { name: 'Tallenna seura' }).click();
  await expect(page.locator('.clubs-admin [role="status"]')).toContainText('lisättiin');
  expect(state.clubs).toHaveLength(2);
  expect(state.clubs[1].aanimaara).toBe(20);
  expect(state.writes).toHaveLength(4);
});

test('Writer cannot see or load the Admin club management route', async ({ page }) => {
  const state = await setup(page, 'writer');
  await page.goto('/koodi0004/#/alueet/seurahallinta');

  await expect(page.getByRole('navigation', { name: 'Aluesuunnittelun näkymät' }).getByRole('button', { name: 'Seurahallinta' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Seurahallinta on vain Adminille' })).toBeVisible();
  expect(state.adminReads).toBe(0);
});

test('JSON export requires privacy acknowledgement and retains full backup data', async ({ page }) => {
  const state = await setup(page);
  await page.goto('/koodi0004/#/alueet/seurahallinta');

  const exportButton = page.getByRole('button', { name: 'Vie seurat JSON-tiedostona' });
  await expect(exportButton).toBeDisabled();
  await page.getByLabel(/Ymmärrän, että vientitiedosto/).check();
  const download = page.waitForEvent('download');
  await exportButton.click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^seurakartta-seurat-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await file.path();
  expect(path).not.toBeNull();
  const exported = JSON.parse(await readFile(path!, 'utf8'));
  expect(exported.format).toBe('seurakartta-clubs');
  expect(exported.version).toBe(1);
  expect(exported.clubs[0].contact.email).toBe('yhteys@example.fi');
  expect(exported.clubs[0].contact.public).toBe(false);
  expect(state.writes).toHaveLength(0);
});

test('JSON import previews merge changes and rejects invalid data before writing', async ({ page }) => {
  const state = await setup(page);
  await page.goto('/koodi0004/#/alueet/seurahallinta');
  const newClub = existingClub();
  newClub.id = 'club_imported';
  newClub.seura = 'Tuotu seura ry';
  newClub.paikkakunta = 'Turku';
  newClub.jasenmaara = 320;
  newClub.aanimaara = 20;
  await page.locator('input[type="file"]').setInputFiles({
    name: 'tuonti.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      format: 'seurakartta-clubs',
      version: 1,
      exportedAt: '2026-11-01T12:00:00.000Z',
      clubs: [newClub],
    })),
  });

  await expect(page.locator('.clubs-import-preview')).toContainText('Lisätty 1');
  await expect(page.getByRole('button', { name: 'Tuo esikatseltu aineisto' })).toBeEnabled();
  await page.getByRole('button', { name: 'Tuo esikatseltu aineisto' }).click();
  await expect(page.locator('.clubs-admin [role="status"]')).toContainText('JSON-tuonti valmis');
  expect(state.clubs).toHaveLength(2);
  expect(state.clubs[1].id).toBe('club_imported');
  expect(state.writes).toHaveLength(1);
  await page.getByRole('navigation', { name: 'Aluesuunnittelun näkymät' }).getByRole('button', { name: 'Kartta' }).click();
  await expect(page.locator('.map-status')).toContainText('2 / 2 seuraa');
  await page.getByRole('navigation', { name: 'Aluesuunnittelun näkymät' }).getByRole('button', { name: 'Seurahallinta' }).click();

  await page.locator('input[type="file"]').setInputFiles({
    name: 'virheellinen.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ format: 'wrong', version: 3, clubs: [] })),
  });
  await expect(page.locator('.clubs-admin [role="alert"]')).toContainText('ei tueta');
  expect(state.writes).toHaveLength(1);
});

test('full replacement requires a downloaded current backup and a separate confirmation', async ({ page }) => {
  const state = await setup(page);
  await page.goto('/koodi0004/#/alueet/seurahallinta');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'korvaus.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      format: 'seurakartta-clubs',
      version: 1,
      exportedAt: '2026-11-01T12:00:00.000Z',
      clubs: [],
    })),
  });
  await page.getByLabel('Korvaa koko aineisto').check();

  const replaceButton = page.getByRole('button', { name: 'Korvaa koko aineisto', exact: true });
  await expect(replaceButton).toBeDisabled();
  const backupDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Lataa nykyisen aineiston varmuuskopio' }).click();
  const download = await backupDownload;
  const path = await download.path();
  const backup = JSON.parse(await readFile(path!, 'utf8'));
  expect(backup.clubs).toHaveLength(1);
  expect(backup.clubs[0].contact.email).toBe('yhteys@example.fi');
  await page.getByLabel(/Vahvistan nykyisen koko aineiston/).check();
  await expect(replaceButton).toBeEnabled();
  await replaceButton.click();

  await expect(page.locator('.clubs-admin [role="status"]')).toContainText('poistuu korvauksessa 1');
  expect(state.clubs).toHaveLength(0);
  expect(state.writes).toHaveLength(1);
});
