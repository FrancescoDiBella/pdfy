import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

async function navigate(page: Page, label: string) {
  const menu = page.getByRole('button', { name: 'Open tools menu' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation', { name: 'PDF tools' }).getByRole('button', { name: label, exact: true }).click();
}

async function expectAccessible(page: Page) {
  const offlineNotice = page.getByRole('alert').filter({ hasText: 'PDFy is ready for offline use.' });
  if (await offlineNotice.isVisible()) {
    await offlineNotice.getByRole('button', { name: 'Close' }).click();
    await expect(offlineNotice).toHaveCount(0);
  }
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .exclude('.MuiSnackbar-root')
    .analyze();
  expect(results.violations).toEqual([]);
}

async function createLeakyPdfFixture() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([420, 560]);
  pdf.setTitle('Secret Roadmap');
  pdf.setAuthor('Alice');
  pdf.setCreator('InternalTool');
  pdf.setCreationDate(new Date('2025-02-01T08:00:00Z'));

  const xmp = pdf.context.register(
    pdf.context.stream('<x:xmpmeta>Hidden XML metadata</x:xmpmeta>', { Type: 'Metadata', Subtype: 'XML' }),
  );
  pdf.catalog.set(PDFName.of('Metadata'), xmp);

  const form = pdf.getForm();
  const field = form.createTextField('reviewer');
  field.setText('Alice');
  field.addToPage(page, { x: 40, y: 460, width: 160, height: 24 });

  const comment = pdf.context.register(
    pdf.context.obj({
      Type: 'Annot',
      Subtype: 'Text',
      Rect: [40, 380, 64, 404],
      Contents: PDFString.of('Internal note'),
    }),
  );
  const annots = page.node.Annots();
  if (annots) annots.push(comment);
  else page.node.set(PDFName.of('Annots'), pdf.context.obj([comment]));

  pdf.catalog.set(PDFName.of('Outlines'), pdf.context.register(pdf.context.obj({ Type: 'Outlines', Count: 0 })));
  pdf.catalog.set(PDFName.of('OpenAction'), pdf.context.obj({ S: 'JavaScript', JS: PDFString.of('1+1') }));

  return {
    name: 'leaky-doc.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await pdf.save()),
  };
}

test('Info audits all 6 privacy categories, deeply sanitizes a copy, verifies cleanliness, and hands off to Read', async ({ page }) => {
  await page.goto('/');
  await navigate(page, 'Info');
  await page.getByLabel('PDF for Info', { exact: true }).setInputFiles(await createLeakyPdfFixture());

  await expect(page.getByTestId('privacy-findings-summary')).toHaveText('6 of 6 categories detected');
  await expect(page.getByRole('list', { name: 'Privacy audit findings' })).toContainText('Embedded XML stream');
  await expect(page.getByRole('list', { name: 'Privacy audit findings' })).toContainText('1 non-form annotation');
  await expectAccessible(page);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Sanitize & download PDF', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('sanitized_leaky-doc.pdf');

  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  const sanitizedBytes = await readFile(downloadPath!);
  const reloaded = await PDFDocument.load(sanitizedBytes, { updateMetadata: false });
  expect(reloaded.context.trailerInfo.Info).toBeUndefined();
  expect(reloaded.catalog.has(PDFName.of('Metadata'))).toBe(false);
  expect(reloaded.catalog.has(PDFName.of('AcroForm'))).toBe(false);
  expect(reloaded.catalog.has(PDFName.of('Outlines'))).toBe(false);
  expect(reloaded.catalog.has(PDFName.of('OpenAction'))).toBe(false);
  expect(reloaded.getPage(0).node.has(PDFName.of('Annots'))).toBe(false);

  await expect(page.getByTestId('sanitize-verification-alert')).toContainText('0 of 6 categories remaining');
  await expectAccessible(page);

  await page.getByRole('button', { name: 'Open sanitized copy in Read', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Read PDF', exact: true })).toBeVisible();
  await expect(page.getByText('sanitized_leaky-doc.pdf', { exact: true })).toBeVisible();
});
