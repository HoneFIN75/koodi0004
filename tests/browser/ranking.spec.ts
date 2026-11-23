import { expect, test } from '@playwright/test';

test('club ranking hides the redundant club count while aggregate rankings retain it', async ({ page }) => {
  await page.route('**/api/clubs.php', (route) => route.fulfill({ json: {
    metadata: { generatedAt: '2026-01-01T00:00:00Z', recordCount: 2, source: 'test' },
    data: [
    { seura: 'Suurin seura ry', paikkakunta: 'Helsinki', latitude: 60.17, longitude: 24.94, jasenmaara: 500, aanimaara: 25 },
    { seura: 'Toinen seura ry', paikkakunta: 'Espoo', latitude: 60.2, longitude: 24.6, jasenmaara: 100, aanimaara: 15 },
  ] } }));
  await page.goto('./');

  const clubRanking = page.locator('.ranking-card').filter({ hasText: 'Suurimmat seurat' });
  const municipalityRanking = page.locator('.ranking-card').filter({ hasText: 'Suurimmat kunnat' });

  await expect(clubRanking.locator('.ranking-row').first()).toBeVisible();
  await expect(clubRanking.locator('.rank-name span')).toHaveCount(0);
  await expect(municipalityRanking.locator('.rank-name span').first()).toContainText('seuraa');
});
