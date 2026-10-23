import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

test('Pages opens offline PDFs and merges beneath /pdfy/ with correctly scoped caches', async ({ page, context }) => {
  test.setTimeout(60000);
  await page.goto('/pdfy/');
  await expect(page.getByRole('heading', { name: 'Open a PDF to get started', exact: true })).toBeVisible();
  await expect(page.getByText('PDFy is ready for offline use. Export your work before closing.')).toBeVisible({ timeout: 30000 });
  const scope = await page.evaluate(() => navigator.serviceWorker.ready.then(registration => registration.scope));
  expect(new URL(scope).pathname).toBe('/pdfy/');
  await context.setOffline(true);
  await page.reload();
  const source = await PDFDocument.create();
  const font = await source.embedFont(StandardFonts.Helvetica);
  source.addPage([300, 400]).drawText('Pages offline document', { x: 20, y: 200, size: 16, font });
  await page.getByLabel('PDF to read', { exact: true }).setInputFiles({ name: 'private-pages-document.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await source.save()) });
  await expect(page.locator('.react-pdf__Page__canvas').first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.react-pdf__Page__textContent').getByText('Pages offline document', { exact: true })).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Merge', exact: true }).click();
  await page.getByRole('button', { name: 'Try two sample PDFs', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download merged PDF', exact: true }).click();
  const merged = await PDFDocument.load(await readFile((await (await downloading).path())!));
  expect(merged.getPageCount()).toBe(4);
  const urls = await page.evaluate(async () => {
    const keys = await caches.keys();
    const requests = await Promise.all(keys.map(async key => (await caches.open(key)).keys()));
    return requests.flat().map(request => request.url);
  });
  expect(urls.length).toBeGreaterThan(0);
  expect(urls.every(url => new URL(url).origin === new URL(page.url()).origin && new URL(url).pathname.startsWith('/pdfy/'))).toBe(true);
  expect(urls.some(url => url.includes('/pdfy/assets/pdf.worker'))).toBe(true);
  expect(urls.some(url => url.includes('/pdfy/pdfjs/standard_fonts/'))).toBe(true);
  expect(urls.some(url => url.includes('/pdfy/pdfjs/cmaps/'))).toBe(true);
  expect(urls.some(url => url.includes('/pdfy/pdfjs/wasm/'))).toBe(true);
  expect(urls.some(url => url.includes('private-pages-document') || url.startsWith('blob:') || /\.pdf(?:\?|$)/i.test(url))).toBe(false);
});
