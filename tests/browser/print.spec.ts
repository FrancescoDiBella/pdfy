import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PDFDocument } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

async function pdfFile(name = 'print-sample.pdf', count = 3) {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < count; index++) pdf.addPage([400, 560]);
  return { name, mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save({ addDefaultPage: false })) };
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

async function expectNoPageOverflow(page: Page) {
  const layout = await page.evaluate(() => ({
    viewport: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewport);
}

test('print supports smart presets, odd/even subsets, OS print sheet rendering, and PDF fallback', async ({ page }) => {
  await page.goto('/');
  await navigate(page, 'Print');
  await page.getByRole('button', { name: 'Try a sample PDF', exact: true }).click();

  await expect(page.getByText('4 source pages · 4 output sheets (portrait)')).toBeVisible();
  await expect(page.locator('[data-testid="print-preview-sheet"] .react-pdf__Page__canvas')).toBeVisible();

  await page.getByRole('button', { name: '2-up Handout', exact: true }).click();
  await expect(page.getByText('4 source pages · 2 output sheets (landscape)')).toBeVisible();

  await page.getByRole('button', { name: 'Booklet', exact: true }).click();
  await expect(page.getByText(/Two-sided \(Flip on short edge\)/)).toBeVisible();
  await expect(page.getByText('4 source pages · 2 output sheets (landscape)')).toBeVisible();

  await page.getByRole('button', { name: 'Eco Ink-Saver', exact: true }).click();
  await expect(page.getByTestId('print-preview-sheet')).toHaveCSS('filter', /grayscale/);

  await page.getByRole('combobox', { name: 'Page subset (duplex helper)' }).click();
  await page.getByRole('option', { name: /Odd pages only/ }).click();
  await expect(page.getByText('4 source pages · 1 output sheet (landscape)')).toBeVisible();

  await page.getByRole('switch', { name: /Add footer stamp/ }).click();
  await page.getByRole('textbox', { name: 'Optional footer note' }).fill('Board packet');

  await page.evaluate(() => {
    (window as unknown as { __printCalls?: number }).__printCalls = 0;
    window.print = () => {
      (window as unknown as { __printCalls?: number }).__printCalls = ((window as unknown as { __printCalls?: number }).__printCalls ?? 0) + 1;
    };
  });

  await page.getByRole('button', { name: 'Print with OS printer…', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Sent 1 sheet to your OS print dialog.' })).toBeVisible();

  const printDom = await page.evaluate(() => ({
    calls: (window as unknown as { __printCalls?: number }).__printCalls,
    sheetCount: document.querySelectorAll('#pdfy-print-root .pdfy-print-sheet').length,
    pageStyle: document.getElementById('pdfy-print-page-style')?.textContent ?? '',
  }));
  expect(printDom.calls).toBe(1);
  expect(printDom.sheetCount).toBe(1);
  expect(printDom.pageStyle).toContain('@page');

  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(page.locator('#pdfy-print-root')).toHaveCount(0);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download print-ready PDF', exact: true }).click();
  const download = await downloadPromise;
  const exported = await PDFDocument.load(await readFile((await download.path())!));
  expect(exported.getPageCount()).toBe(1);
  const { width, height } = exported.getPage(0).getSize();
  expect(width).toBeGreaterThan(height);
});

test('print receives handoffs from Read, Edit, and Organize with session replacement protection', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('PDF to read', { exact: true }).setInputFiles(await pdfFile('reader-source.pdf', 2));
  await expect(page.locator('.react-pdf__Page__canvas').first()).toBeVisible();

  await page.getByRole('main').getByRole('button', { name: 'Print PDF', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Print PDF', exact: true })).toBeVisible();
  const printTool = page.locator('[data-tool="print"]');
  await expect(printTool.getByRole('heading', { name: 'reader-source.pdf', exact: true })).toBeVisible();
  await expect(printTool.getByText('2 source pages · 2 output sheets (portrait)')).toBeVisible();

  await navigate(page, 'Edit');
  await expect(page.locator('#editor-session .react-pdf__Page__canvas')).toBeVisible();
  await page.getByRole('textbox', { name: 'Document title' }).fill('Edited Packet');
  await page.getByRole('button', { name: 'Document actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Print PDF…', exact: true }).click();

  await expect(page.getByRole('dialog', { name: 'Replace the Print document?' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Document actions', exact: true })).toBeFocused();

  await page.getByRole('button', { name: 'Document actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Print PDF…', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Replace the Print document?' })).toBeVisible();
  await page.getByRole('button', { name: 'Replace document', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Print PDF', exact: true })).toBeVisible();
  await expect(printTool.getByRole('heading', { name: 'Edited Packet.pdf', exact: true })).toBeVisible();
  await expect(printTool.locator('[data-testid="print-preview-sheet"] .react-pdf__Page__canvas')).toBeVisible();

  await navigate(page, 'Organize');
  const organizeTool = page.locator('[data-tool="organize"]');
  await expect(organizeTool.getByText('2 pages', { exact: true })).toBeVisible();
  await organizeTool.getByRole('button', { name: 'Add blank after page 1', exact: true }).click();
  await expect(organizeTool.getByText('3 pages', { exact: true })).toBeVisible();
  await organizeTool.getByRole('button', { name: 'Print…', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Replace the Print document?' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(organizeTool.getByRole('button', { name: 'Print…', exact: true })).toBeFocused();

  await organizeTool.getByRole('button', { name: 'Print…', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Replace the Print document?' })).toBeVisible();
  await page.getByRole('button', { name: 'Replace document', exact: true }).click();
  await expect(printTool.getByRole('heading', { name: 'organized_reader-source.pdf', exact: true })).toBeVisible();
  await expect(printTool.getByText('3 source pages · 3 output sheets (portrait)')).toBeVisible();
});

for (const colorScheme of ['light', 'dark'] as const) {
  for (const width of [320, 1280]) {
    test(`print workspace passes WCAG 2.2 AA and avoids overflow at ${width}px in ${colorScheme} mode`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 800 });
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.goto('/');
      const notice = page.getByRole('alert').filter({ hasText: 'PDFy is ready for offline use.' });
      await expect(notice).toBeVisible({ timeout: 30000 });
      await notice.getByRole('button', { name: 'Close' }).click();

      await navigate(page, 'Print');
      await expectAccessible(page);
      await expectNoPageOverflow(page);

      await page.getByRole('button', { name: 'Try a sample PDF', exact: true }).click();
      await expect(page.locator('[data-testid="print-preview-sheet"] .react-pdf__Page__canvas')).toBeVisible();
      const printBoxOverflow = await page.locator('[data-tool="print"]').evaluate(element => ({
        width: element.clientWidth,
        scroll: element.scrollWidth,
      }));
      expect(printBoxOverflow.scroll).toBeLessThanOrEqual(printBoxOverflow.width);
      await expectAccessible(page);
      await expectNoPageOverflow(page);
      await page.screenshot({ animations: 'disabled', fullPage: true, path: testInfo.outputPath(`print-responsive-${width}-${colorScheme}.png`) });
    });
  }
}
