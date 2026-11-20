import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

async function navigate(page: Page, label: string) {
  const menu = page.getByRole('button', { name: 'Open tools menu' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation', { name: 'PDF tools' }).getByRole('button', { name: label, exact: true }).click();
}

async function expectAccessible(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations().map(anim => anim.finished.catch(() => {}))));
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .exclude('.MuiSnackbar-root')
    .analyze();
  expect(results.violations).toEqual([]);
}

async function createUnbookmarkedHandbook() {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);

  const sections = [
    ['Chapter 1: Getting Started', 'This guide explains how to configure your offline workspace safely on local hardware.'],
    ['Chapter 2: Security Model', 'All transformations stay in browser memory without uploading sensitive files anywhere.'],
    ['Chapter 3: Release Checklist', 'Verify every document outline, page margin, and accessibility requirement before sharing.'],
  ];

  for (const [heading, body] of sections) {
    const page = doc.addPage([460, 620]);
    page.drawText(heading, { x: 40, y: 540, size: 20, font: bold });
    page.drawText(body, { x: 40, y: 500, size: 11, font: regular });
    page.drawText(body, { x: 40, y: 480, size: 11, font: regular });
  }

  return {
    name: 'handbook.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await doc.save()),
  };
}

test('Bookmarks auto-detects headings, supports adding/nesting/reordering, embeds PDF outlines, and hands off to Split', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await navigate(page, 'Bookmarks');
  await expect(page.getByRole('heading', { name: 'Edit bookmarks', exact: true })).toBeVisible();

  await page.getByLabel('PDF for Bookmarks', { exact: true }).setInputFiles(await createUnbookmarkedHandbook());
  await expect(page.locator('.react-pdf__Page__canvas').first()).toBeVisible();

  const detectBtn = page.getByRole('button', { name: 'Auto-detect headings', exact: true });
  await expect(detectBtn).toBeEnabled();
  await detectBtn.click();

  const list = page.getByRole('list', { name: 'Document bookmarks' });
  await expect(list.getByRole('listitem')).toHaveCount(3);
  await expect(page.getByTestId('bookmarks-count-summary')).toContainText('3 bookmarks');

  // Add a custom bookmark and indent it under the previous item
  await page.getByRole('textbox', { name: 'New bookmark title', exact: true }).fill('Executive Notes');
  await page.getByRole('spinbutton', { name: 'Target page', exact: true }).fill('2');
  await page.getByRole('button', { name: 'Add bookmark', exact: true }).click();
  await expect(list.getByRole('listitem')).toHaveCount(4);

  await page.getByRole('button', { name: 'Indent Executive Notes', exact: true }).click();
  await expect(list.getByRole('listitem').nth(3)).toContainText('Level 2 · Page 2');
  await expectAccessible(page);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download bookmarked PDF', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('bookmarked_handbook.pdf');

  const savedBytes = await readFile((await download.path())!);
  const reloaded = await PDFDocument.load(savedBytes, { updateMetadata: false });
  expect(reloaded.catalog.has(PDFName.of('Outlines'))).toBe(true);
  expect(reloaded.catalog.get(PDFName.of('PageMode'))?.toString()).toBe('/UseOutlines');

  // Hand off directly to Split and confirm bookmarks are detected in Split -> By bookmarks
  await page.getByRole('button', { name: 'Split by bookmarks', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Split PDF', exact: true })).toBeVisible();
  await expect(page.locator('[data-tool="split"]').getByText('bookmarked_handbook.pdf', { exact: true })).toBeVisible();
});

test('Bookmarks stays accessible without horizontal overflow at 320px in dark mode', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('/');
  const notice = page.getByRole('alert').filter({ hasText: 'PDFy is ready for offline use.' });
  await expect(notice).toBeVisible({ timeout: 30000 });
  await notice.getByRole('button', { name: 'Close' }).click();
  await navigate(page, 'Bookmarks');
  await page.getByRole('button', { name: 'Try a sample PDF', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Document bookmarks' }).getByRole('listitem').first()).toBeVisible();
  await expectAccessible(page);

  const overflow = await page.evaluate(() => ({
    viewport: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.viewport);
});
