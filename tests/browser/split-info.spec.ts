import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PDFDocument } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

async function pdfFile(name = 'document.pdf', count = 3, title = 'Original title') {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  for (let index = 0; index < count; index++) pdf.addPage([200 + index * 10, 300]);
  return { name, mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save({ addDefaultPage: false })) };
}

async function navigate(page: Page, tool: string) {
  const menu = page.getByRole('button', { name: 'Open tools menu' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation', { name: 'PDF tools' }).getByRole('button', { name: tool, exact: true }).click();
}

async function keepWork(page: Page, tool: 'Split' | 'Info') {
  if (tool === 'Split') await expect(page.getByRole('textbox', { name: 'Page range', exact: true })).toHaveValue('1, 3');
  else await expect(page.getByRole('textbox', { name: 'Document title', exact: true })).toHaveValue('Keep my edits');
}

for (const tool of ['Split', 'Info'] as const) {
  test(`${tool} rejects bad files and preserves work until a validated replacement is confirmed`, async ({ page }, testInfo) => {
    await page.goto('/');
    await navigate(page, tool);
    const input = page.getByLabel(`PDF for ${tool}`, { exact: true });
    await input.setInputFiles(await pdfFile('same-name.pdf'));
    if (tool === 'Split') await page.getByRole('textbox', { name: 'Page range', exact: true }).fill('1, 3');
    else await page.getByRole('textbox', { name: 'Document title', exact: true }).fill('Keep my edits');
    const protectedPDF = await PDFDocument.create();
    protectedPDF.addPage();
    protectedPDF.context.trailerInfo.Encrypt = protectedPDF.context.register(protectedPDF.context.obj({ Filter: 'Standard' }));
    for (const invalid of [
      { name: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a PDF') },
      { name: 'protected.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await protectedPDF.save()) },
      await pdfFile('empty.pdf', 0),
    ]) {
      await input.setInputFiles(invalid);
      await expect(page.getByRole('alert').filter({ hasText: 'Could not open' })).toContainText(invalid.name);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await keepWork(page, tool);
    }
    await navigate(page, 'Read');
    await navigate(page, tool);
    await keepWork(page, tool);
    await input.setInputFiles(await pdfFile('same-name.pdf', 1, 'Replacement title'));
    await expect(page.getByRole('dialog', { name: `Replace the ${tool} document?` })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath(`${tool.toLowerCase()}-replacement-dialog.png`) });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Open another PDF', exact: true })).toBeFocused();
    await keepWork(page, tool);
    await page.getByRole('button', { name: 'Try a sample PDF', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Try a sample PDF', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Try a sample PDF', exact: true })).toBeFocused();
    await keepWork(page, tool);
    await input.setInputFiles(await pdfFile('same-name.pdf', 1, 'Replacement title'));
    await page.getByRole('button', { name: 'Replace document', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Open another PDF', exact: true })).toBeFocused();
    if (tool === 'Split') {
      await expect(page.getByRole('textbox', { name: 'Page range', exact: true })).toHaveValue('');
      await expect(page.getByRole('status')).toHaveText('0 of 1 pages selected');
    } else await expect(page.getByRole('textbox', { name: 'Document title', exact: true })).toHaveValue('Replacement title');
    await expect(page.getByRole('alert').filter({ hasText: 'Could not open' })).toHaveCount(0);
  });

  test(`${tool} does not open a replacement modal over a different tool after a slow read`, async ({ page }) => {
    await page.addInitScript(() => {
      const read = File.prototype.arrayBuffer;
      File.prototype.arrayBuffer = async function () {
        if (this.name === 'slow.pdf') await new Promise<void>(resolve => {
          document.documentElement.dataset.slowRead = 'pending';
          window.addEventListener('release-slow-read', () => resolve(), { once: true });
        });
        return read.call(this);
      };
    });
    await page.goto('/');
    await navigate(page, tool);
    const input = page.getByLabel(`PDF for ${tool}`, { exact: true });
    await input.setInputFiles(await pdfFile());
    if (tool === 'Split') await page.getByRole('textbox', { name: 'Page range', exact: true }).fill('1, 3');
    else await page.getByRole('textbox', { name: 'Document title', exact: true }).fill('Keep my edits');
    await input.setInputFiles(await pdfFile('slow.pdf'));
    await expect(page.locator('html')).toHaveAttribute('data-slow-read', 'pending');
    await navigate(page, 'Merge');
    await page.evaluate(() => window.dispatchEvent(new Event('release-slow-read')));
    await expect(input).toBeEnabled();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Merge PDFs', exact: true })).toBeFocused();
    await navigate(page, tool);
    await expect(page.getByRole('dialog', { name: `Replace the ${tool} document?` })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await keepWork(page, tool);
  });
}

test('Split supports keyboard selection, rejects invalid ranges, and exports pages in source order', async ({ page }) => {
  await page.goto('/');
  await navigate(page, 'Split');
  await page.getByLabel('PDF for Split', { exact: true }).setInputFiles(await pdfFile());
  const third = page.getByRole('button', { name: 'Page 3', exact: true });
  await third.focus();
  await page.keyboard.press('Space');
  await expect(third).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Page 1', exact: true }).focus();
  await page.keyboard.press('Enter');
  const range = page.getByRole('textbox', { name: 'Page range', exact: true });
  await expect(range).toHaveValue('1, 3');
  await range.fill('1-99999999999999999');
  await expect(page.getByText('Choose pages between 1 and 3.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download selected pages', exact: true })).toBeDisabled();
  await range.fill('3,1');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download selected pages', exact: true }).click();
  const download = await downloading;
  const result = await PDFDocument.load(await readFile((await download.path())!));
  expect(result.getPages().map(sheet => sheet.getWidth())).toEqual([200, 220]);
  expect(download.suggestedFilename()).toBe('extracted_document.pdf');
  await expect(range).toHaveValue('3,1');
});

test('Info exports changed fields and a cleared copy while preserving the working form', async ({ page }) => {
  await page.goto('/');
  await navigate(page, 'Info');
  await page.getByLabel('PDF for Info', { exact: true }).setInputFiles(await pdfFile());
  const title = page.getByRole('textbox', { name: 'Document title', exact: true });
  await title.fill('Edited title');
  let downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download updated PDF', exact: true }).click();
  let result = await PDFDocument.load(await readFile((await (await downloading).path())!), { updateMetadata: false });
  expect(result.getTitle()).toBe('Edited title');
  expect(result.getPageCount()).toBe(3);
  downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download without these fields', exact: true }).click();
  result = await PDFDocument.load(await readFile((await (await downloading).path())!), { updateMetadata: false });
  expect(result.getTitle()).toBe('');
  await expect(title).toHaveValue('Edited title');
});

for (const colorScheme of ['light', 'dark'] as const) {
  for (const width of [320, 1280]) {
    test(`Split and Info are accessible and responsive at ${width}px in ${colorScheme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.goto('/');
      const notice = page.getByRole('alert').filter({ hasText: 'PDFy is ready for offline use.' });
      await expect(notice).toBeVisible({ timeout: 30000 });
      await notice.getByRole('button', { name: 'Close' }).click();
      for (const tool of ['Split', 'Info']) {
        await navigate(page, tool);
        const empty = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
        expect(empty.violations).toEqual([]);
        await page.getByLabel(`PDF for ${tool}`, { exact: true }).setInputFiles(await pdfFile('A-very-long-document-name-that-must-wrap-without-clipping-controls-or-hiding-actions.pdf'));
        if (tool === 'Split') {
          await page.getByRole('textbox', { name: 'Page range', exact: true }).fill('1, 3');
          await expect(page.locator('[data-tool="split"] .react-pdf__Page__canvas').first()).toBeVisible();
        } else await expect(page.getByRole('textbox', { name: 'Document title', exact: true })).toHaveValue('Original title');
        const layout = await page.locator(`[data-tool="${tool === 'Split' ? 'split' : 'inspect'}"]`).evaluate(element => ({ width: element.clientWidth, scroll: element.scrollWidth, page: document.documentElement.scrollWidth, viewport: innerWidth }));
        expect(layout.scroll).toBeLessThanOrEqual(layout.width);
        expect(layout.page).toBeLessThanOrEqual(layout.viewport);
        const loaded = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
        expect(loaded.violations).toEqual([]);
        await page.screenshot({ animations: 'disabled', fullPage: true, path: testInfo.outputPath(`${tool.toLowerCase()}-responsive-${width}-${colorScheme}.png`) });
      }
    });
  }
}
