import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

async function searchablePDF() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const p1 = doc.addPage([400, 600]);
  p1.drawText('Executive Summary', { x: 40, y: 540, size: 18, font });
  p1.drawText('Local PDFy search keeps documents offline.', { x: 40, y: 500, size: 12, font });
  const p2 = doc.addPage([400, 600]);
  p2.drawText('Appendix Reference', { x: 40, y: 540, size: 18, font });
  p2.drawText('Second local match appears on page two.', { x: 40, y: 500, size: 12, font });
  return { name: 'searchable-brief.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await doc.save()) };
}

async function expectNoPageOverflow(page: Page) {
  const layout = await page.evaluate(() => ({
    viewport: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewport);
}

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations).toEqual([]);
}

test('Read supports Ctrl+F text search navigation, outline sidebar, and plain-text download', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('PDF to read').setInputFiles(await searchablePDF());
  await expect(page.locator('.react-pdf__Page__canvas').first()).toBeVisible();

  await page.keyboard.press('Control+f');
  const searchInput = page.getByRole('textbox', { name: 'Find in document', exact: true });
  await expect(searchInput).toBeFocused();
  await searchInput.fill('local');

  await expect(page.getByText('1 / 2', { exact: true })).toBeVisible();
  await expect(page.getByText(/Page 1:/)).toBeVisible();

  await page.getByRole('button', { name: 'Next match', exact: true }).click();
  await expect(page.getByText('2 / 2', { exact: true })).toBeVisible();
  await expect(page.getByText(/Page 2:/)).toBeVisible();

  await page.getByRole('button', { name: 'Previous match', exact: true }).click();
  await expect(page.getByText('1 / 2', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Document outline', exact: true }).click();
  await expect(page.getByText(/This PDF has no embedded bookmarks/i)).toBeVisible();

  await page.getByRole('button', { name: 'Pages', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Go to page 2', exact: true })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download .txt', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('searchable-brief.txt');
  const path = await download.path();
  const content = await readFile(path!, 'utf8');
  expect(content).toContain('--- Page 1 ---');
  expect(content).toContain('Executive Summary');
  expect(content).toContain('--- Page 2 ---');
  expect(content).toContain('Appendix Reference');
});

for (const colorScheme of ['light', 'dark'] as const) {
  for (const width of [320, 1280]) {
    test(`reader search and sidebar stay accessible without overflow at ${width}px in ${colorScheme} mode`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.goto('/');
      await page.getByLabel('PDF to read').setInputFiles(await searchablePDF());
      await expect(page.locator('.react-pdf__Page__canvas').first()).toBeVisible();
      await page.getByRole('button', { name: 'Find in document', exact: true }).click();
      await page.getByRole('textbox', { name: 'Find in document', exact: true }).fill('local');
      await expect(page.getByText('1 / 2', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Document outline', exact: true }).click();
      await expectNoPageOverflow(page);
      await expectAccessible(page);
    });
  }
}
