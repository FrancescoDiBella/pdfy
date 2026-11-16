import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PDFDocument } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

async function navigate(page: Page, label: string) {
  const menu = page.getByRole('button', { name: 'Open tools menu' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation', { name: 'PDF tools' }).getByRole('button', { name: label, exact: true }).click();
}

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations).toEqual([]);
}

test('compress optimizes sample PDF with presets, renders Before/After preview, downloads, and hands off to Print', async ({ page }) => {
  await page.goto('/');
  await navigate(page, 'Compress');

  const compressTool = page.locator('[data-tool="compress"]');
  await compressTool.getByRole('button', { name: 'Try a sample PDF', exact: true }).click();
  await expect(compressTool.getByText(/4 pages/)).toBeVisible();

  await compressTool.getByRole('button', { name: 'Lossless Cleanup', exact: true }).click();
  await compressTool.getByRole('button', { name: 'Compress PDF', exact: true }).click();
  await expect(compressTool.locator('[data-testid="compress-preview-sheet"] .react-pdf__Page__canvas')).toBeVisible();
  await expect(compressTool.getByText(/Original:/)).toBeVisible();
  await expect(compressTool.getByText(/Output:/)).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await compressTool.getByRole('button', { name: 'Download compressed PDF', exact: true }).click();
  const download = await downloadPromise;
  const pdf = await PDFDocument.load(await readFile((await download.path())!));
  expect(pdf.getPageCount()).toBe(4);

  await compressTool.getByRole('button', { name: 'Maximum Shrink (108 DPI)', exact: true }).click();
  await compressTool.getByRole('button', { name: 'Re-optimize PDF', exact: true }).click();
  await expect(compressTool.getByText(/Profile: 108 DPI · 56% JPEG · Grayscale/)).toBeVisible();
  await expect(compressTool.locator('[data-testid="compress-preview-sheet"] .react-pdf__Page__canvas')).toBeVisible();

  await compressTool.getByRole('button', { name: 'Print…', exact: true }).click();
  const printTool = page.locator('[data-tool="print"]');
  await expect(printTool.getByRole('heading', { name: 'compressed_Quarterly_Operations_Dossier.pdf', exact: true })).toBeVisible();
});

for (const colorScheme of ['light', 'dark'] as const) {
  for (const width of [320, 1280]) {
    test(`compress workspace passes WCAG 2.2 AA and avoids overflow at ${width}px in ${colorScheme} mode`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 800 });
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.goto('/');
      const notice = page.getByRole('alert').filter({ hasText: 'PDFy is ready for offline use.' });
      await expect(notice).toBeVisible({ timeout: 30000 });
      await notice.getByRole('button', { name: 'Close' }).click();

      await navigate(page, 'Compress');
      await expectAccessible(page);
      const compressTool = page.locator('[data-tool="compress"]');
      await compressTool.getByRole('button', { name: 'Try a sample PDF', exact: true }).click();
      await compressTool.getByRole('button', { name: 'Compress PDF', exact: true }).click();
      await expect(compressTool.locator('[data-testid="compress-preview-sheet"] .react-pdf__Page__canvas')).toBeVisible();

      const layout = await compressTool.evaluate(el => ({
        width: el.clientWidth,
        scroll: el.scrollWidth,
        docWidth: document.documentElement.scrollWidth,
        viewport: innerWidth,
      }));
      expect(layout.scroll).toBeLessThanOrEqual(layout.width);
      expect(layout.docWidth).toBeLessThanOrEqual(layout.viewport);
      await expectAccessible(page);
      await page.screenshot({ animations: 'disabled', fullPage: true, path: testInfo.outputPath(`compress-responsive-${width}-${colorScheme}.png`) });
    });
  }
}
