import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

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
