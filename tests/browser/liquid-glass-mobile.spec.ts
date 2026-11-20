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
    .analyze();
  expect(results.violations).toEqual([]);
}

test('mobile thumb-zone Liquid Glass dock navigates tools, respects 44px touch targets, and hides in Edit or short landscape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await dismissOfflineNotice(page);

  const viewportMeta = await page.locator('meta[name="viewport"]').getAttribute('content');
  expect(viewportMeta).toContain('viewport-fit=cover');

  const headerBox = await page.locator('header').boundingBox();
  expect(headerBox).not.toBeNull();
  expect(headerBox!.height / 844).toBeLessThan(0.12);

  const dock = page.getByRole('navigation', { name: 'Quick tools', exact: true });
  await expect(dock).toBeVisible();

  const dockBox = await dock.locator('.pdfy-mobile-dock-bar').boundingBox();
  expect(dockBox).not.toBeNull();
  expect(dockBox!.height / 844).toBeLessThan(0.12);

  const dockButtons = dock.getByRole('button');
  expect(await dockButtons.count()).toBe(5);
  for (let index = 0; index < 5; index++) {
    const box = await dockButtons.nth(index).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }

  await dock.getByRole('button', { name: 'Organize', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Organize pages', exact: true })).toBeVisible();
  await expect(dock.getByRole('button', { name: 'Organize', exact: true })).toHaveAttribute('aria-current', 'page');

  await dock.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Compare PDFs', exact: true })).toBeVisible();

  await dock.getByRole('button', { name: 'More tools', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'PDF tools', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');

  await dock.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(dock).toBeHidden();
  await page.getByRole('button', { name: 'Return to workspace', exact: true }).click();
  await expect(dock).toBeVisible();

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(dock).toBeHidden();

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(dock).toHaveCount(0);
});

for (const colorScheme of ['light', 'dark'] as const) {
  for (const width of [320, 1280]) {
    test(`Liquid Glass workspace meets WCAG 2.2 AA and has zero overflow at ${width}px in ${colorScheme} mode`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.goto('/');
      await dismissOfflineNotice(page);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      await expectAccessible(page);
    });
  }
}
