import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function dismissOfflineNotice(page: Page) {
  const notice = page.getByRole('alert').filter({ hasText: 'PDFy is ready for offline use.' });
  await expect(notice).toBeVisible({ timeout: 30000 });
  await notice.getByRole('button', { name: 'Close' }).click();
}

async function expectAccessible(page: Page) {
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {})));
  });
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .exclude('.MuiSnackbar-root')
    .analyze();
  expect(results.violations).toEqual([]);
}

test('command palette opens with Ctrl+K, filters by keyword, switches tools and themes, and light-dismisses', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 840 });
  await page.goto('/');
  await dismissOfflineNotice(page);

  await page.keyboard.press('Control+k');
  const dialog = page.locator('dialog.pdfy-command-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('closedby', 'any');

  const input = dialog.getByRole('searchbox', { name: 'Quick command palette', exact: true });
  await expect(input).toBeFocused();

  await input.fill('bates');
  await expect(dialog.getByRole('button', { name: /Organize pages/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Organize pages', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Quick jump', exact: true }).click();
  await expect(dialog).toBeVisible();
  await input.fill('dark');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('workspace')).toHaveAttribute('data-theme', 'dark');

  // Open again and verify backdrop light-dismiss (click outside dialog box).
  await page.keyboard.press('Control+k');
  await expect(dialog).toBeVisible();
  await page.mouse.click(10, 10);
  await expect(dialog).toBeHidden();

  // Open via trigger button and verify Escape dismissal restores focus.
  const trigger = page.getByRole('button', { name: 'Quick jump', exact: true });
  await trigger.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

for (const colorScheme of ['light', 'dark'] as const) {
  for (const width of [320, 1280]) {
    test(`command palette passes WCAG 2.2 AA and avoids overflow at ${width}px in ${colorScheme} mode`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.goto('/');
      await dismissOfflineNotice(page);

      await page.getByRole('button', { name: 'Quick jump', exact: true }).click();
      const dialog = page.locator('dialog.pdfy-command-dialog');
      await expect(dialog).toBeVisible();

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      await expectAccessible(page);

      await dialog.getByRole('button', { name: 'Close command palette', exact: true }).click();
      await expect(dialog).toBeHidden();
    });
  }
}
