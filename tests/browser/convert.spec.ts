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

test('convert Images to PDF supports sample scan, reordering, rotation, PDF export, and Print handoff', async ({ page }) => {
  await page.goto('/');
  await navigate(page, 'Convert');

  const convertTool = page.locator('[data-tool="convert"]');
  await convertTool.getByRole('button', { name: 'Add sample scan', exact: true }).click();
  await convertTool.getByRole('button', { name: 'Add sample scan', exact: true }).click();

  await expect(convertTool.getByText('Image queue (2)')).toBeVisible();

  await convertTool.getByRole('button', { name: /Rotate Sample_Receipt_Scan\.png right/ }).first().click();
  await expect(convertTool.getByText('720 × 960 px · 90°')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await convertTool.getByRole('button', { name: 'Download PDF', exact: true }).click();
  const download = await downloadPromise;
  const pdf = await PDFDocument.load(await readFile((await download.path())!));
  expect(pdf.getPageCount()).toBe(2);

  await convertTool.getByRole('button', { name: 'Print…', exact: true }).click();
  const printTool = page.locator('[data-tool="print"]');
  await expect(printTool.getByRole('heading', { name: 'Converted_Images.pdf', exact: true })).toBeVisible();
  await expect(printTool.getByText('2 source pages · 2 output sheets (landscape)')).toBeVisible();
});

test('convert PDF to Images renders selectable pages as downloadable PNG or JPEG files', async ({ page }) => {
  await page.goto('/');
  await navigate(page, 'Convert');

  const convertTool = page.locator('[data-tool="convert"]');
  await convertTool.getByRole('tab', { name: 'PDF to Images', exact: true }).click();
  await convertTool.getByRole('button', { name: 'Try a sample PDF', exact: true }).click();

  await expect(convertTool.getByText('4 source pages · 4 selected to render')).toBeVisible();
  await convertTool.getByRole('button', { name: 'Custom range', exact: true }).click();
  await convertTool.getByRole('textbox', { name: 'Page range' }).fill('1, 3');
  await expect(convertTool.getByText('4 source pages · 2 selected to render')).toBeVisible();

  await convertTool.getByRole('button', { name: 'Render page images', exact: true }).click();
  await expect(convertTool.getByText('Rendered images (2)')).toBeVisible();

  const imgDownloadPromise = page.waitForEvent('download');
  await convertTool.getByRole('button', { name: 'Download PNG', exact: true }).first().click();
  const imgDownload = await imgDownloadPromise;
  expect(imgDownload.suggestedFilename()).toBe('Quarterly_Operations_Dossier_page_1.png');
});

for (const colorScheme of ['light', 'dark'] as const) {
  for (const width of [320, 1280]) {
    test(`convert workspace passes WCAG 2.2 AA and avoids overflow at ${width}px in ${colorScheme} mode`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 800 });
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.goto('/');
      const notice = page.getByRole('alert').filter({ hasText: 'PDFy is ready for offline use.' });
      await expect(notice).toBeVisible({ timeout: 30000 });
      await notice.getByRole('button', { name: 'Close' }).click();

      await navigate(page, 'Convert');
      await expectAccessible(page);
      const convertTool = page.locator('[data-tool="convert"]');
      await convertTool.getByRole('button', { name: 'Add sample scan', exact: true }).click();
      await expect(convertTool.getByText('Image queue (1)')).toBeVisible();

      const layout = await convertTool.evaluate(el => ({
        width: el.clientWidth,
        scroll: el.scrollWidth,
        docWidth: document.documentElement.scrollWidth,
        viewport: innerWidth,
      }));
      expect(layout.scroll).toBeLessThanOrEqual(layout.width);
      expect(layout.docWidth).toBeLessThanOrEqual(layout.viewport);
      await expectAccessible(page);
      await page.screenshot({ animations: 'disabled', fullPage: true, path: testInfo.outputPath(`convert-responsive-${width}-${colorScheme}.png`) });
    });
  }
}
