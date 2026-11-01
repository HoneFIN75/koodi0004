import { expect, test } from '@playwright/test';

test('club ranking hides the redundant club count while aggregate rankings retain it', async ({ page }) => {
  await page.goto('./');

  const clubRanking = page.locator('.ranking-card').filter({ hasText: 'Suurimmat seurat' });
  const municipalityRanking = page.locator('.ranking-card').filter({ hasText: 'Suurimmat kunnat' });

  await expect(clubRanking.locator('.ranking-row').first()).toBeVisible();
  await expect(clubRanking.locator('.rank-name span')).toHaveCount(0);
  await expect(municipalityRanking.locator('.rank-name span').first()).toContainText('seuraa');
});
