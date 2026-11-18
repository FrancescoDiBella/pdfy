import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PDFDocument, PDFRawStream, StandardFonts, decodePDFRawStream } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

async function navigate(page: Page, label: string) {
  const menu = page.getByRole('button', { name: 'Open tools menu' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation', { name: 'PDF tools' }).getByRole('button', { name: label, exact: true }).click();
}

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
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

function streamsContainText(decodedStreams: string, text: string): boolean {
  const hex = Buffer.from(text, 'latin1').toString('hex').toLowerCase();
  return decodedStreams.includes(text) || decodedStreams.toLowerCase().includes(hex);
}

async function createRedactionFixture() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);

  const page1 = doc.addPage([595.28, 841.89]);
  page1.drawText('CONFIDENTIAL-SSN-4821', { x: 60, y: 740, size: 22, font });

  const page2 = doc.addPage([595.28, 841.89]);
  page2.drawText('KEEP-CRISP-VECTOR-PAGE-2', { x: 60, y: 740, size: 22, font });

  return {
    name: 'redaction-check.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await doc.save()),
  };
}

async function createOrganizeCropFixture() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const sizes: Array<[number, number]> = [
    [400, 600],
    [400, 600],
    [500, 800],
  ];
  sizes.forEach(([w, h], index) => {
    const page = doc.addPage([w, h]);
    page.drawText(`Crop test page ${index + 1}`, { x: 60, y: h / 2, size: 16, font });
  });
  return {
    name: 'crop-margins.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await doc.save()),
  };
}

test('Edit flattens redacted pages at high DPI so secret text streams are stripped while keeping unredacted pages vectorized', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await navigate(page, 'Edit');

  await page.getByLabel('PDF to edit', { exact: true }).setInputFiles(await createRedactionFixture());
  await expect(page.locator('.react-pdf__Page__canvas').first()).toBeVisible();

  // Add a Cover area (redact) element on Page 1 over CONFIDENTIAL-SSN-4821
  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  await page.getByRole('dialog', { name: 'Editor tools', exact: true }).getByRole('button', { name: 'Cover area', exact: true }).click();
  await expect(page.getByRole('dialog', { includeHidden: true })).toHaveCount(0);

  // Position the redaction box over the secret text (top-left of Page 1) and verify accessibility
  await page.getByRole('button', { name: 'Properties', exact: true }).click();
  const burnSwitch = page.getByRole('switch', { name: 'Burn-in redactions on export' });
  await expect(burnSwitch).toBeChecked();
  await page.getByRole('spinbutton', { name: 'Horizontal position', exact: true }).fill('40');
  await page.getByRole('spinbutton', { name: 'Vertical position', exact: true }).fill('80');
  await page.getByRole('spinbutton', { name: 'Width', exact: true }).fill('420');
  await page.getByRole('spinbutton', { name: 'Height', exact: true }).fill('90');
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Close item properties', exact: true }).click();

  // Export with Burn-in redactions enabled (default)
  const burnedDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
  const burnedPath = (await (await burnedDownloadPromise).path())!;
  const burnedPdf = await PDFDocument.load(await readFile(burnedPath));
  expect(burnedPdf.getPageCount()).toBe(2);

  const burnedStreams = decodeAllStreams(burnedPdf);
  expect(streamsContainText(burnedStreams, 'CONFIDENTIAL-SSN-4821')).toBe(false);
  expect(streamsContainText(burnedStreams, 'KEEP-CRISP-VECTOR-PAGE-2')).toBe(true);

  // Open burned PDF in Read and verify Page 1 has no extractable secret text while Page 2 remains selectable
  await page.getByRole('button', { name: 'Return to workspace', exact: true }).click();
  await page.getByLabel('PDF to read', { exact: true }).setInputFiles(burnedPath);
  await expect(page.locator('[data-tool="view"] #viewer-page-1 .react-pdf__Page__canvas')).toBeVisible();
  await expect(page.locator('[data-tool="view"] #viewer-page-2 .react-pdf__Page__textContent').getByText('KEEP-CRISP-VECTOR-PAGE-2')).toBeVisible();
  await expect(page.locator('[data-tool="view"] .react-pdf__Page__textContent').getByText('CONFIDENTIAL-SSN-4821')).toHaveCount(0);

  // Opting out of burn-in via Document actions keeps non-destructive vector streams
  await navigate(page, 'Edit');
  await page.getByRole('button', { name: 'Document actions', exact: true }).click();
  const menuCheckbox = page.getByRole('menuitemcheckbox', { name: 'Burn-in redactions (1 page)', exact: true });
  await expect(menuCheckbox).toHaveAttribute('aria-checked', 'true');
  await menuCheckbox.click();

  const overlayOnlyPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
  const overlayOnlyPath = (await (await overlayOnlyPromise).path())!;
  const overlayOnlyPdf = await PDFDocument.load(await readFile(overlayOnlyPath));
  expect(streamsContainText(decodeAllStreams(overlayOnlyPdf), 'CONFIDENTIAL-SSN-4821')).toBe(true);
});

test('Organize applies document-wide margin crop presets and per-page custom CropBox overrides cleanly across viewports', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');
  const notice = page.getByRole('alert').filter({ hasText: 'PDFy is ready for offline use.' });
  await expect(notice).toBeVisible({ timeout: 30000 });
  await notice.getByRole('button', { name: 'Close' }).click();

  await navigate(page, 'Organize');
  const organizeTool = page.locator('[data-tool="organize"]');
  await organizeTool.getByLabel('PDF for Organize', { exact: true }).setInputFiles(await createOrganizeCropFixture());
  await expect(organizeTool.locator('.react-pdf__Page__canvas').first()).toBeVisible();

  // Rotate page 2 clockwise
  await organizeTool.getByRole('button', { name: 'Rotate page 2', exact: true }).click();

  // Open Page settings and set document default to Trim 8%
  await organizeTool.getByRole('button', { name: 'Page settings', exact: true }).click();
  const settingsDialog = page.getByRole('dialog', { name: 'Page settings', exact: true });
  await expect(settingsDialog).toBeVisible();
  await settingsDialog.getByRole('radio', { name: 'Trim 8%', exact: true }).check();

  // Override Page 3 with Custom margins (Top 10%, Bottom 20%, Left 5%, Right 15%)
  await settingsDialog.getByRole('combobox', { name: 'Apply margin crop to', exact: true }).click();
  await page.getByRole('option', { name: 'Page 3', exact: true }).click();
  await settingsDialog.getByRole('radio', { name: 'Custom margins', exact: true }).check();
  await settingsDialog.getByRole('spinbutton', { name: 'Top margin (%)', exact: true }).fill('10');
  await settingsDialog.getByRole('spinbutton', { name: 'Bottom margin (%)', exact: true }).fill('20');
  await settingsDialog.getByRole('spinbutton', { name: 'Left margin (%)', exact: true }).fill('5');
  await settingsDialog.getByRole('spinbutton', { name: 'Right margin (%)', exact: true }).fill('15');

  // Accessibility & 320px reflow check with Page settings open
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await expectAccessible(page);

  await settingsDialog.getByRole('button', { name: 'Close page settings', exact: true }).click();
  await expect(organizeTool.getByRole('heading', { name: /Page 1 · Source 1 · 0° · Trim 8%/ })).toBeVisible();
  await expect(organizeTool.getByRole('heading', { name: /Page 2 · Source 2 · 90° · Trim 8%/ })).toBeVisible();
  await expect(organizeTool.getByRole('heading', { name: /Page 3 · Source 3 · 0° · Custom crop/ })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await organizeTool.getByRole('button', { name: 'Download organized PDF', exact: true }).click();
  const exportedPath = (await (await downloadPromise).path())!;
  const exported = await PDFDocument.load(await readFile(exportedPath));

  expect(exported.getPageCount()).toBe(3);
  expect(exported.getPage(0).getCropBox()).toEqual({ x: 32, y: 48, width: 336, height: 504 });
  expect(exported.getPage(1).getRotation().angle).toBe(90);
  expect(exported.getPage(1).getCropBox()).toEqual({ x: 32, y: 48, width: 336, height: 504 });
  expect(exported.getPage(2).getCropBox()).toEqual({ x: 25, y: 160, width: 400, height: 560 });
});
