import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PDFDocument, StandardFonts } from 'pdf-lib';

async function multiPagePDF(pageCount = 4) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < pageCount; index++) {
    const page = doc.addPage([400, 520]);
    page.drawText(`Chapter ${index + 1}`, { x: 40, y: 460, size: 22, font });
    page.drawText(`Readable body copy for page ${index + 1}.`, { x: 40, y: 420, size: 12, font });
  }
  return { name: 'reader-modes-sample.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await doc.save()) };
}

async function dismissOfflineNotice(page: Page) {
  const notice = page.getByRole('alert').filter({ hasText: 'PDFy is ready for offline use.' });
  await expect(notice).toBeVisible({ timeout: 30000 });
  await notice.getByRole('button', { name: 'Close' }).click();
}

async function expectAccessible(page: Page) {
  await page.evaluate(async () => {
    const timed = document.getAnimations().filter(animation => animation.timeline === document.timeline);
    await Promise.all(timed.map(animation => animation.finished.catch(() => {})));
  });
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .exclude('.MuiSnackbar-root')
    .analyze();
  expect(results.violations).toEqual([]);
}

test('Read supports scroll-driven progress bar, two-page spread layout, and fullscreen focus mode', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 840 });
  await page.goto('/');
  await dismissOfflineNotice(page);

  await page.getByLabel('PDF to read').setInputFiles(await multiPagePDF(4));
  const pagesRegion = page.getByRole('region', { name: 'PDF pages', exact: true });
  await expect(pagesRegion.locator('.react-pdf__Page__canvas')).toHaveCount(4);

  const progressBar = page.getByTestId('reader-progress-bar');
  await expect(progressBar).toHaveAttribute('aria-hidden', 'true');
  await expect(pagesRegion).toHaveAttribute('data-layout-mode', 'single');

  // Enable two-page spread: page 1 solo cover, pages 2 and 3 side by side.
  const spreadToggle = page.getByRole('button', { name: 'Two-page spread', exact: true });
  await spreadToggle.click();
  await expect(spreadToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(pagesRegion).toHaveAttribute('data-layout-mode', 'spread');

  const page2Box = await page.locator('#viewer-page-2').boundingBox();
  const page3Box = await page.locator('#viewer-page-3').boundingBox();
  expect(page2Box).not.toBeNull();
  expect(page3Box).not.toBeNull();
  expect(Math.abs(page2Box!.y - page3Box!.y)).toBeLessThan(8);
  expect(page3Box!.x).toBeGreaterThan(page2Box!.x + page2Box!.width - 2);

  // Enter focus reading mode and verify floating Liquid Glass controls & Escape exit.
  const focusToggle = page.getByRole('button', { name: 'Focus reading mode', exact: true });
  await focusToggle.click();
  const focusControls = page.getByRole('toolbar', { name: 'Focus reading controls', exact: true });
  await expect(focusControls).toBeVisible();
  await expect(focusControls).toContainText('Page 1 / 4');

  await expectAccessible(page);

  await page.keyboard.press('Escape');
  await expect(focusControls).toHaveCount(0);
  await expect(focusToggle).toBeFocused();

  // Re-enter focus mode and exit via explicit button.
  await focusToggle.click();
  await expect(focusControls).toBeVisible();
  await focusControls.getByRole('button', { name: 'Exit focus', exact: true }).click();
  await expect(focusControls).toHaveCount(0);

  // Resizing to a narrow phone collapses two-page spread cleanly without overflow.
  await page.setViewportSize({ width: 320, height: 740 });
  await expect(pagesRegion).toHaveAttribute('data-layout-mode', 'single');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

for (const colorScheme of ['light', 'dark'] as const) {
  for (const width of [320, 1280]) {
    test(`reader spread and focus controls stay accessible at ${width}px in ${colorScheme} mode`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.goto('/');
      await dismissOfflineNotice(page);

      await page.getByLabel('PDF to read').setInputFiles(await multiPagePDF(3));
      await expect(page.locator('.react-pdf__Page__canvas')).toHaveCount(3);

      if (width >= 1000) {
        await page.getByRole('button', { name: 'Two-page spread', exact: true }).click();
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      await expectAccessible(page);

      await page.getByRole('button', { name: 'Focus reading mode', exact: true }).click();
      await expect(page.getByRole('toolbar', { name: 'Focus reading controls', exact: true })).toBeVisible();
      await expectAccessible(page);
      await page.getByRole('button', { name: 'Exit focus', exact: true }).click();
    });
  }
}
