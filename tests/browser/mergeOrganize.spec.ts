import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PDFDocument } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

async function pdfFileWithWidths(name: string, widths: number[]) {
  const doc = await PDFDocument.create();
  widths.forEach(width => doc.addPage([width, 400]));
  return { name, mimeType: 'application/pdf', buffer: Buffer.from(await doc.save()) };
}

async function navigate(page: Page, label: string) {
  const menu = page.getByRole('button', { name: 'Open tools menu' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation', { name: 'PDF tools' }).getByRole('button', { name: label, exact: true }).click();
}

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations).toEqual([]);
}

test('merges PDFs directly into Organize, appends another PDF, reorders, deletes with Undo, and downloads final PDF', async ({ page }) => {
  await page.goto('/');
  await navigate(page, 'Merge');

  await page.getByLabel('PDF files to merge').setInputFiles([
    await pdfFileWithWidths('part-a.pdf', [200, 240]),
    await pdfFileWithWidths('part-b.pdf', [300]),
  ]);
  await page.getByRole('textbox', { name: 'Download filename', exact: true }).fill('combined-deck');
  await page.getByRole('button', { name: 'Merge & organize pages', exact: true }).click();

  const organizeTool = page.locator('[data-tool="organize"]');
  await expect(page.getByRole('heading', { name: 'Organize pages', exact: true })).toBeVisible();
  await expect(organizeTool.getByRole('heading', { name: 'combined-deck.pdf', exact: true })).toBeVisible();
  await expect(organizeTool.getByText('3 pages', { exact: true })).toBeVisible();

  // Move page 3 earlier -> page 2 (widths become 200, 300, 240)
  await organizeTool.getByRole('button', { name: 'Move page 3 earlier', exact: true }).click();
  await expect(organizeTool.getByRole('heading', { name: /Page 2 · Source 3/ })).toBeVisible();

  // Jump page 1 directly to Position 3 via the mobile-friendly Move-to-position menu (widths become 300, 240, 200)
  await organizeTool.getByRole('button', { name: 'Move page 1 to position…', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Position 3', exact: true }).click();
  await expect(organizeTool.getByRole('heading', { name: /Page 3 · Source 1/ })).toBeVisible();

  // Touch-drag page 1 grip onto page 2 card (widths become 240, 300, 200)
  const handle1 = organizeTool.getByTestId('organizer-drag-handle-1');
  const card2Box = (await organizeTool.locator('[data-organize-page-id]').nth(1).boundingBox())!;
  const targetX = card2Box.x + card2Box.width / 2;
  const targetY = card2Box.y + card2Box.height / 2;
  await handle1.dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 1, clientX: targetX, clientY: targetY });
  await handle1.dispatchEvent('pointermove', { pointerType: 'touch', pointerId: 1, clientX: targetX, clientY: targetY });
  await handle1.dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 1, clientX: targetX, clientY: targetY });
  await expect(organizeTool.getByRole('heading', { name: /Page 1 · Source 2/ })).toBeVisible();
  await expect(organizeTool.getByRole('heading', { name: /Page 2 · Source 3/ })).toBeVisible();

  // Delete page 1, test one-click Undo, then delete page 2 permanently (leaving widths 240, 200)
  await organizeTool.getByRole('button', { name: 'Delete page 1', exact: true }).click();
  await expect(organizeTool.getByText('2 pages', { exact: true })).toBeVisible();
  const undoBanner = organizeTool.getByRole('alert').filter({ hasText: 'Removed page 1.' });
  await expect(undoBanner).toBeVisible();
  await undoBanner.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(organizeTool.getByText('3 pages', { exact: true })).toBeVisible();

  await organizeTool.getByRole('button', { name: 'Delete page 2', exact: true }).click();
  await expect(organizeTool.getByText('2 pages', { exact: true })).toBeVisible();

  // Append a third PDF right inside Organize (+1 page of width 380) -> widths 240, 200, 380
  await organizeTool.getByLabel('Add PDF files to organize', { exact: true }).setInputFiles([
    await pdfFileWithWidths('part-c.pdf', [380]),
  ]);
  await expect(organizeTool.getByText('3 pages', { exact: true })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await organizeTool.getByRole('button', { name: 'Download organized PDF', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('organized_combined-deck.pdf');
  const exported = await PDFDocument.load(await readFile((await download.path())!));
  expect(exported.getPages().map(p => p.getWidth())).toEqual([240, 200, 380]);

  // Merging again asks before replacing existing Organize work and restores focus cleanly on Cancel
  await navigate(page, 'Merge');
  await page.getByRole('button', { name: 'Merge & organize pages', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Replace the Organize document?' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Merge & organize pages', exact: true })).toBeFocused();
});

for (const colorScheme of ['light', 'dark'] as const) {
  for (const width of [320, 1280]) {
    test(`merge-to-organize flow passes WCAG 2.2 AA and avoids overflow at ${width}px in ${colorScheme} mode`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 800 });
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.goto('/');
      const notice = page.getByRole('alert').filter({ hasText: 'PDFy is ready for offline use.' });
      await expect(notice).toBeVisible({ timeout: 30000 });
      await notice.getByRole('button', { name: 'Close' }).click();

      await navigate(page, 'Merge');
      await page.getByRole('button', { name: 'Try two sample PDFs', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Merge & organize pages', exact: true })).toBeEnabled();
      await expectAccessible(page);

      await page.getByRole('button', { name: 'Merge & organize pages', exact: true }).click();
      const organizeTool = page.locator('[data-tool="organize"]');
      await expect(organizeTool.locator('.react-pdf__Page__canvas').first()).toBeVisible();

      const layout = await organizeTool.evaluate(el => ({
        width: el.clientWidth,
        scroll: el.scrollWidth,
        docWidth: document.documentElement.scrollWidth,
        viewport: innerWidth,
      }));
      expect(layout.scroll).toBeLessThanOrEqual(layout.width);
      expect(layout.docWidth).toBeLessThanOrEqual(layout.viewport);
      await expectAccessible(page);
      await page.screenshot({ animations: 'disabled', fullPage: true, path: testInfo.outputPath(`merge-organize-${width}-${colorScheme}.png`) });
    });
  }
}
