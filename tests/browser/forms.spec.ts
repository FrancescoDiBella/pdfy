import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PDFDocument } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

async function flatPdfFile(name = 'flat-document.pdf') {
  const pdf = await PDFDocument.create();
  pdf.addPage([400, 560]);
  return { name, mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) };
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

test('forms tool edits sample AcroForm fields, exports editable and flattened PDFs, and hands off to Print', async ({ page }) => {
  await page.goto('/');
  await navigate(page, 'Forms');
  await page.getByRole('button', { name: 'Try a sample PDF', exact: true }).click();

  const formsTool = page.locator('[data-tool="forms"]');
  await expect(formsTool.getByText('1 page · 6 interactive fields')).toBeVisible();
  await expect(formsTool.locator('[data-testid="forms-preview-sheet"] .react-pdf__Page__canvas')).toBeVisible();

  await formsTool.getByRole('textbox', { name: 'Full Name' }).fill('Grace Hopper');
  await formsTool.getByRole('radio', { name: 'Admin' }).check();
  await formsTool.getByRole('checkbox', { name: 'Accept Security Policy' }).uncheck();

  const editableDownloadPromise = page.waitForEvent('download');
  await formsTool.getByRole('button', { name: 'Download filled PDF', exact: true }).click();
  const editableDownload = await editableDownloadPromise;
  const editablePdf = await PDFDocument.load(await readFile((await editableDownload.path())!));
  const editableForm = editablePdf.getForm();
  expect(editableForm.getTextField('Full Name').getText()).toBe('Grace Hopper');
  expect(editableForm.getRadioGroup('Access Tier').getSelected()).toBe('Admin');
  expect(editableForm.getCheckBox('Accept Security Policy').isChecked()).toBe(false);

  await formsTool.getByRole('switch', { name: /Flatten fields on download/ }).click();
  const flatDownloadPromise = page.waitForEvent('download');
  await formsTool.getByRole('button', { name: 'Download flattened PDF', exact: true }).click();
  const flatDownload = await flatDownloadPromise;
  const flatPdf = await PDFDocument.load(await readFile((await flatDownload.path())!));
  expect(flatPdf.getForm().getFields().length).toBe(0);

  await formsTool.getByRole('button', { name: 'Print…', exact: true }).click();
  const printTool = page.locator('[data-tool="print"]');
  await expect(printTool.getByRole('heading', { name: 'filled_Workspace_Access_Request_Form.pdf', exact: true })).toBeVisible();
});

test('forms tool explains when a PDF has no interactive fields and offers Edit handoff', async ({ page }) => {
  await page.goto('/');
  await navigate(page, 'Forms');
  await page.getByLabel('PDF for Forms', { exact: true }).setInputFiles(await flatPdfFile());
  const formsTool = page.locator('[data-tool="forms"]');
  await expect(formsTool.getByText('1 page · 0 interactive fields')).toBeVisible();
  await expect(formsTool.getByText(/No interactive AcroForm fields were detected/)).toBeVisible();
  await formsTool.getByRole('button', { name: 'Add text or signatures in Edit instead', exact: true }).click();
  await expect(page.locator('#editor-session .react-pdf__Page__canvas')).toBeVisible();
});

for (const colorScheme of ['light', 'dark'] as const) {
  for (const width of [320, 1280]) {
    test(`forms workspace passes WCAG 2.2 AA and avoids overflow at ${width}px in ${colorScheme} mode`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 800 });
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.goto('/');
      const notice = page.getByRole('alert').filter({ hasText: 'PDFy is ready for offline use.' });
      await expect(notice).toBeVisible({ timeout: 30000 });
      await notice.getByRole('button', { name: 'Close' }).click();

      await navigate(page, 'Forms');
      await expectAccessible(page);
      await page.getByRole('button', { name: 'Try a sample PDF', exact: true }).click();
      await expect(page.locator('[data-testid="forms-preview-sheet"] .react-pdf__Page__canvas')).toBeVisible();
      const layout = await page.locator('[data-tool="forms"]').evaluate(el => ({
        width: el.clientWidth,
        scroll: el.scrollWidth,
        docWidth: document.documentElement.scrollWidth,
        viewport: innerWidth,
      }));
      expect(layout.scroll).toBeLessThanOrEqual(layout.width);
      expect(layout.docWidth).toBeLessThanOrEqual(layout.viewport);
      await expectAccessible(page);
      await page.screenshot({ animations: 'disabled', fullPage: true, path: testInfo.outputPath(`forms-responsive-${width}-${colorScheme}.png`) });
    });
  }
}
