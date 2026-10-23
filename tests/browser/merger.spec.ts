import { test, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

async function pdfFile(name: string, widths: number[]) {
  const doc = await PDFDocument.create();
  widths.forEach(width => doc.addPage([width, 400]));
  return { name, mimeType: 'application/pdf', buffer: Buffer.from(await doc.save()) };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Merge', exact: true }).click();
});

test('dragging reorders the queue and exported PDF; keyboard controls preserve focus', async ({ page }) => {
  await page.getByLabel('PDF files to merge').setInputFiles([
    await pdfFile('A.pdf', [200, 210]),
    await pdfFile('B.pdf', [300]),
    await pdfFile('C.pdf', [400]),
  ]);
  const rows = page.getByRole('list', { name: 'Merge order' }).getByRole('listitem');
  await expect(rows).toHaveCount(3);
  await page.getByTitle('Drag A.pdf to reorder').dragTo(rows.nth(2));
  await expect(rows.nth(2)).toContainText('A.pdf');
  await expect(page.getByRole('status')).toHaveText('A.pdf moved to position 3 of 3.');
  const up = page.getByRole('button', { name: 'Move A.pdf up', exact: true });
  await up.focus();
  await page.keyboard.press('Enter');
  await expect(up).toBeFocused();
  await expect(rows.nth(1)).toContainText('A.pdf');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download merged PDF', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('Merged_Document.pdf');
  const pdf = await PDFDocument.load(await readFile((await download.path())!));
  expect(pdf.getPages().map(p => p.getWidth())).toEqual([300, 200, 210, 400]);
});

test('invalid PDFs are rejected and selecting the same file twice creates independent entries', async ({ page }) => {
  const file = await pdfFile('same.pdf', [250]);
  const input = page.getByLabel('PDF files to merge');
  await input.setInputFiles([file, { name: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('invalid') }]);
  const rows = page.getByRole('list', { name: 'Merge order' }).getByRole('listitem');
  await expect(rows).toHaveCount(1);
  await expect(page.getByRole('alert')).toContainText('Could not add broken.pdf');
  await expect(page.getByRole('button', { name: 'Download merged PDF', exact: true })).toBeDisabled();
  await input.setInputFiles(file);
  await expect(rows).toHaveCount(2);
  await rows.nth(0).getByRole('button', { name: 'Remove same.pdf', exact: true }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.nth(0)).toContainText('same.pdf');
});

test('same-row and cancelled drags preserve order; boundary buttons are disabled', async ({ page }) => {
  await page.getByLabel('PDF files to merge').setInputFiles([await pdfFile('A.pdf', [200]), await pdfFile('B.pdf', [300])]);
  const rows = page.getByRole('list', { name: 'Merge order' }).getByRole('listitem');
  await expect(rows).toHaveCount(2);
  const handle = page.getByTitle('Drag A.pdf to reorder');
  await handle.dragTo(rows.nth(0));
  await expect(rows.nth(0)).toContainText('A.pdf');
  await handle.dispatchEvent('dragstart', { dataTransfer: await page.evaluateHandle(() => new DataTransfer()) });
  await handle.dispatchEvent('dragend');
  await expect(rows.nth(0)).toContainText('A.pdf');
  await expect(page.getByRole('button', { name: 'Move A.pdf up', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Move B.pdf down', exact: true })).toBeDisabled();
});
