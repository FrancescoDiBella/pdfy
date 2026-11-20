import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
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

function decodeAllStreams(doc: PDFDocument): string {
  const parts: string[] = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream) {
      try {
        parts.push(Buffer.from(decodePDFRawStream(obj).decode()).toString('latin1'));
      } catch {
        parts.push(Buffer.from(obj.getContents()).toString('latin1'));
      }
    }
  }
  return parts.join('\n');
}

function streamsContainText(streams: string, text: string): boolean {
  const hex = Buffer.from(text, 'latin1').toString('hex').toLowerCase();
  return streams.includes(text) || streams.toLowerCase().includes(hex);
}

test('Organize applies 6-zone headers, footers, and Bates numbering with deferred range validation and exports stamped PDF', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 840 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('/');
  const notice = page.getByRole('alert').filter({ hasText: 'PDFy is ready for offline use.' });
  await expect(notice).toBeVisible({ timeout: 30000 });
  await notice.getByRole('button', { name: 'Close' }).click();

  await navigate(page, 'Organize');
  const organizeTool = page.locator('[data-tool="organize"]');
  await organizeTool.getByRole('button', { name: 'Try a sample PDF', exact: true }).click();
  await expect(organizeTool.locator('.react-pdf__Page__canvas').first()).toBeVisible();

  await organizeTool.getByRole('button', { name: 'Page settings', exact: true }).click();
  const settingsDialog = page.getByRole('dialog', { name: 'Page settings', exact: true });
  await expect(settingsDialog).toBeVisible();

  // Expand native <details> accordion section
  await settingsDialog.locator('summary', { hasText: 'Headers, footers & Bates numbering' }).click();
  await settingsDialog.getByRole('switch', { name: 'Enable headers, footers & Bates stamps', exact: true }).check();

  // Configure Bates prefix, start number, digits, and header stamp
  await settingsDialog.getByRole('textbox', { name: 'Bates prefix', exact: true }).fill('CASE-');
  await settingsDialog.getByRole('spinbutton', { name: 'Bates start number', exact: true }).fill('100');
  await settingsDialog.getByRole('spinbutton', { name: 'Zero-pad digits', exact: true }).fill('5');
  await settingsDialog.getByRole('textbox', { name: 'Top left stamp', exact: true }).fill('CONFIDENTIAL EXHIBIT');

  // Verify deferred validation: invalid range flags aria-invalid on blur, then clears when corrected
  const rangeInput = settingsDialog.getByRole('textbox', { name: 'Stamp page range', exact: true });
  await expect(rangeInput).toHaveAttribute('aria-invalid', 'false');
  await rangeInput.fill('2-99');
  await rangeInput.blur();
  await expect(rangeInput).toHaveAttribute('aria-invalid', 'true');
  await expect(settingsDialog).toContainText(/Error:/);

  await rangeInput.fill('2-4');
  await rangeInput.blur();
  await expect(rangeInput).toHaveAttribute('aria-invalid', 'false');
  await expect(settingsDialog.getByTestId('bates-live-preview')).toContainText('CASE-00100');

  // Verify WCAG 2.2 AA & 320px dark-mode responsiveness with collapsible settings open
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await expectAccessible(page);

  await settingsDialog.getByRole('button', { name: 'Close page settings', exact: true }).click();

  // Page 1 skipped (cover), pages 2-4 show live Bates preview badges
  await expect(organizeTool.getByTestId('organizer-bates-badge-1')).toHaveCount(0);
  await expect(organizeTool.getByTestId('organizer-bates-badge-2')).toHaveText('CASE-00100');
  await expect(organizeTool.getByTestId('organizer-bates-badge-3')).toHaveText('CASE-00101');
  await expect(organizeTool.getByTestId('organizer-bates-badge-4')).toHaveText('CASE-00102');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    organizeTool.getByRole('button', { name: 'Download organized PDF', exact: true }).click(),
  ]);
  const exported = await PDFDocument.load(await readFile((await download.path())!));
  expect(exported.getPageCount()).toBe(4);
  const streams = decodeAllStreams(exported);
  expect(streamsContainText(streams, 'CASE-00100')).toBe(true);
  expect(streamsContainText(streams, 'CASE-00102')).toBe(true);
  expect(streamsContainText(streams, 'CONFIDENTIAL EXHIBIT')).toBe(true);
});
