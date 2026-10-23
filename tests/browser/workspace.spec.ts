import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PDFDocument } from 'pdf-lib';

async function pdfFile(name: string, pageCount = 1) {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < pageCount; index++) pdf.addPage([300, 400]);
  return { name, mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) };
}

async function navigate(page: Page, label: string) {
  const menu = page.getByRole('button', { name: 'Open tools menu' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation', { name: 'PDF tools' }).getByRole('button', { name: label, exact: true }).click();
}

async function dismissOfflineNotice(page: Page) {
  const notice = page.getByRole('alert').filter({ hasText: 'PDFy is ready for offline use.' });
  await expect(notice).toBeVisible({ timeout: 30000 });
  await notice.getByRole('button', { name: 'Close' }).click();
}

async function expectNoPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations).toEqual([]);
}

test('mobile navigation supports keyboard dismissal, focus restoration, and a skip link', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to workspace' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Read PDF', exact: true })).toBeFocused();
  const menu = page.getByRole('button', { name: 'Open tools menu' });
  await menu.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('navigation', { name: 'PDF tools' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
  await navigate(page, 'Merge');
  await expect(page.getByRole('heading', { name: 'Merge PDFs', exact: true })).toBeFocused();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expectNoPageOverflow(page);
});

test('appearance follows the system and preserves an explicit choice across reloads', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.getByTestId('workspace')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.getByTestId('workspace')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Appearance: System' }).click();
  await page.getByRole('menuitemradio', { name: 'Dark', exact: true }).click();
  await page.reload();
  await expect(page.getByTestId('workspace')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Appearance: Dark' })).toBeVisible();
  await page.getByRole('button', { name: 'Appearance: Dark' }).click();
  await page.getByRole('menuitemradio', { name: 'System', exact: true }).click();
  await expect(page.getByTestId('workspace')).toHaveAttribute('data-theme', 'light');
});

test('merger order and filename survive navigation while hidden controls leave the accessibility tree', async ({ page }) => {
  await page.goto('/');
  await navigate(page, 'Merge');
  await page.getByLabel('PDF files to merge').setInputFiles([await pdfFile('first.pdf'), await pdfFile('second.pdf')]);
  await page.getByRole('button', { name: 'Move second.pdf up', exact: true }).click();
  await page.getByRole('textbox', { name: 'Download filename' }).fill('my-work');
  await navigate(page, 'Read');
  await expect(page.getByRole('textbox', { name: 'Download filename' })).toHaveCount(0);
  await navigate(page, 'Split');
  await navigate(page, 'Merge');
  await expect(page.getByRole('textbox', { name: 'Download filename' })).toHaveValue('my-work');
  await expect(page.getByRole('list', { name: 'Merge order' }).getByRole('listitem').first()).toContainText('second.pdf');
});

test('reader errors preserve the current file and thumbnails work with a keyboard', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('PDF to read').setInputFiles(await pdfFile('original.pdf', 2));
  await expect(page.locator('.react-pdf__Page__canvas').first()).toBeVisible();
  await page.getByLabel('PDF to read').setInputFiles({ name: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a PDF') });
  await expect(page.getByRole('alert').filter({ hasText: 'Could not open' })).toContainText('broken.pdf');
  await expect(page.getByText('original.pdf', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Page thumbnails', exact: true }).click();
  const thumbnail = page.getByRole('button', { name: 'Go to page 2', exact: true });
  await thumbnail.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#viewer-page-2')).toBeFocused();
  await page.getByLabel('PDF to read').setInputFiles(await pdfFile('replacement.pdf'));
  await expect(page.getByText('replacement.pdf', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Could not open' })).toHaveCount(0);
});

test('editor state survives returning to the workspace and handoffs require confirmation', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await navigate(page, 'Edit');
  await page.getByRole('button', { name: 'Blank A4 Canvas', exact: true }).click();
  await page.getByRole('textbox', { name: 'Document title' }).fill('Work in progress');
  await page.getByRole('button', { name: 'Text Block', exact: true }).click();
  await expect(page.getByText('Double-click to edit text…', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Return to workspace', exact: true }).click();
  await page.keyboard.press('Delete');
  await navigate(page, 'Edit');
  await expect(page.getByRole('textbox', { name: 'Document title' })).toHaveValue('Work in progress');
  await expect(page.getByText('Double-click to edit text…', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Return to workspace', exact: true }).click();
  await page.getByLabel('PDF to read').setInputFiles(await pdfFile('replacement.pdf'));
  const edit = page.getByRole('button', { name: 'Edit PDF', exact: true });
  await edit.click();
  await expect(page.getByRole('dialog', { name: 'Replace the Edit document?' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(edit).toBeFocused();
  await navigate(page, 'Edit');
  await expect(page.getByRole('textbox', { name: 'Document title' })).toHaveValue('Work in progress');
  await page.getByRole('button', { name: 'Return to workspace', exact: true }).click();
  await edit.click();
  await page.getByRole('button', { name: 'Replace document', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Document title' })).toHaveValue('replacement');
  await expect(page.getByText('Double-click to edit text…', { exact: true })).toHaveCount(0);
});

test('opening a new reader file does not overwrite an existing organizer session', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('PDF to read').setInputFiles(await pdfFile('organize-me.pdf'));
  await page.getByRole('button', { name: 'Organize pages', exact: true }).click();
  await page.locator('[data-tool="organize"] input[type="checkbox"]').first().check();
  const watermark = page.getByRole('textbox', { name: 'Watermark Text', exact: true });
  await watermark.fill('Keep this text');
  await navigate(page, 'Read');
  await page.getByLabel('PDF to read').setInputFiles(await pdfFile('different.pdf'));
  await navigate(page, 'Organize');
  await expect(watermark).toHaveValue('Keep this text');
  await expect(page.getByText('organize-me.pdf', { exact: true })).toBeVisible();
});

for (const colorScheme of ['light', 'dark'] as const) {
  for (const width of [320, 1280]) {
    test(`reader and merger accessibility and layout at ${width}px in ${colorScheme} mode`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.goto('/');
      await dismissOfflineNotice(page);
      await expectNoPageOverflow(page);
      await expectAccessible(page);
      await page.screenshot({ path: testInfo.outputPath(`reader-${width}-${colorScheme}.png`) });
      await navigate(page, 'Merge');
      await page.getByLabel('PDF files to merge').setInputFiles([
        await pdfFile('A-very-long-document-name-without-spaces-that-must-wrap-instead-of-hiding-the-file.pdf'),
        await pdfFile('second.pdf'),
      ]);
      await expect(page.getByRole('button', { name: 'Download merged PDF' })).toBeEnabled();
      await expectNoPageOverflow(page);
      await expectAccessible(page);
      await page.screenshot({ path: testInfo.outputPath(`merger-${width}-${colorScheme}.png`) });
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download merged PDF' }).click();
      expect((await download).suggestedFilename()).toBe('Merged_Document.pdf');
    });
  }
}
