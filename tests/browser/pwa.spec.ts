import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, resolve, sep } from 'node:path';

test.setTimeout(60000);

test('reopens offline, renders a local PDF and merges without caching documents', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByText('PDFy is ready for offline use. Export your work before closing.')).toBeVisible({ timeout: 30000 });
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await context.setOffline(true);
  await page.reload();
  const source = await PDFDocument.create();
  const font = await source.embedFont(StandardFonts.Helvetica);
  source.addPage([300, 400]).drawText('Offline document', { x: 20, y: 200, size: 16, font });
  await page.locator('input[type="file"]').setInputFiles({ name: 'private-document.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await source.save()) });
  await expect(page.locator('.react-pdf__Page__canvas').first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.react-pdf__Page__textContent').getByText('Offline document').first()).toBeVisible();
  await page.getByRole('button', { name: 'Merge', exact: true }).click();
  await page.getByRole('button', { name: 'Try two sample PDFs', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download merged PDF', exact: true }).click();
  const download = await downloadPromise;
  const merged = await PDFDocument.load(await readFile((await download.path())!));
  expect(merged.getPageCount()).toBe(4);
  const cacheURLs = await page.evaluate(async () => {
    const keys = await caches.keys();
    const requests = await Promise.all(keys.map(async key => (await caches.open(key)).keys()));
    return requests.flat().map(request => request.url);
  });
  expect(cacheURLs.some(url => url.includes('pdf.worker'))).toBe(true);
  expect(cacheURLs.some(url => url.includes('/pdfjs/standard_fonts/'))).toBe(true);
  expect(cacheURLs.some(url => url.includes('/pdfjs/cmaps/'))).toBe(true);
  expect(cacheURLs.some(url => url.includes('/pdfjs/wasm/'))).toBe(true);
  expect(cacheURLs.some(url => url.startsWith('blob:') || url.includes('private-document') || /\.pdf(?:\?|$)/i.test(url))).toBe(false);
  expect(cacheURLs.every(url => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
});

for (const initiallyControlled of [false, true]) {
  test(`an update reloads a ${initiallyControlled ? 'controlled' : 'first-visit'} tab only after consent and preserves other tabs`, async ({ page, context }, testInfo) => {
    // Isolated origin serves a changed worker without mutating the build used by other tests.
    let revision = 1;
    const root = resolve('dist');
    const mime: Record<string, string> = {
      '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
      '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
      '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
    };
    const server = createServer(async (request, response) => {
      try {
        const path = new URL(request.url || '/', 'http://localhost').pathname;
        const file = resolve(root, `.${path === '/' ? '/index.html' : path}`);
        if (!file.startsWith(root + sep)) { response.writeHead(404).end(); return; }
        const contents = await readFile(file);
        response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        response.end(path === '/sw.js' ? `${contents.toString()}\n// Test revision ${revision}\n` : contents);
      } catch { response.writeHead(404).end(); }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const otherTab = await context.newPage();
    try {
      await page.goto(origin);
      await expect(page.getByText('PDFy is ready for offline use. Export your work before closing.')).toBeVisible({ timeout: 30000 });
      if (initiallyControlled) await page.reload();
      expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(initiallyControlled);
      await otherTab.goto(origin);
      for (const tab of [page, otherTab]) {
        await tab.getByRole('button', { name: 'Merge', exact: true }).click();
        await tab.getByRole('button', { name: 'Try two sample PDFs', exact: true }).click();
        await tab.getByRole('textbox', { name: 'Download filename' }).fill('unsaved-name');
        await tab.evaluate(() => { document.documentElement.dataset.sessionMarker = 'original'; });
      }
      revision = 2;
      await page.evaluate(async () => { await (await navigator.serviceWorker.ready).update(); });
      await expect(page.getByRole('button', { name: 'Review update', exact: true })).toBeVisible({ timeout: 15000 });
      await page.getByRole('button', { name: 'Review update', exact: true }).click();
      if (!initiallyControlled) {
        await expect(page.getByRole('dialog', { name: 'Update PDFy?', exact: true })).toBeVisible();
        await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('update-confirmation-desktop.png') });
      }
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(page.getByRole('textbox', { name: 'Download filename' })).toHaveValue('unsaved-name');
      await page.getByRole('button', { name: 'Review update', exact: true }).click();
      await page.getByRole('button', { name: 'Reload and update', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Open a PDF to get started' })).toBeVisible();
      await expect(otherTab.getByRole('textbox', { name: 'Download filename' })).toHaveValue('unsaved-name');
      await expect(otherTab.locator('html')).toHaveAttribute('data-session-marker', 'original');
      await expect(otherTab.getByRole('button', { name: 'Review update', exact: true })).toBeVisible();
      await otherTab.getByRole('button', { name: 'Review update', exact: true }).click();
      await otherTab.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(otherTab.getByRole('textbox', { name: 'Download filename' })).toHaveValue('unsaved-name');
      await otherTab.getByRole('button', { name: 'Review update', exact: true }).click();
      await otherTab.getByRole('button', { name: 'Reload and update', exact: true }).click();
      await expect(otherTab.getByRole('heading', { name: 'Open a PDF to get started' })).toBeVisible();
      await expect(otherTab.locator('html')).not.toHaveAttribute('data-session-marker', 'original');
    } finally {
      await otherTab.close();
      await page.close();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
}
