import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PDFDocument } from 'pdf-lib';

async function pdfBytes(pageCount = 1) {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) pdf.addPage([320, 420]);
  return await pdf.save();
}

async function pdfFile(name: string, pageCount = 1) {
  return { name, mimeType: 'application/pdf', bytes: Array.from(await pdfBytes(pageCount)) };
}

async function navigate(page: Page, label: string) {
  const menu = page.getByRole('button', { name: 'Open tools menu' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation', { name: 'PDF tools' }).getByRole('button', { name: label, exact: true }).click();
}

async function dispatchDragEnter(page: Page, files: Array<{ name: string; mimeType: string; bytes: number[] }>) {
  await page.evaluate(items => {
    const dt = new DataTransfer();
    for (const item of items) {
      dt.items.add(new File([new Uint8Array(item.bytes)], item.name, { type: item.mimeType }));
    }
    (window as unknown as { __pdfyTestDT?: DataTransfer }).__pdfyTestDT = dt;
    window.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
    window.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, files);
}

async function dispatchDropFromSavedDT(page: Page) {
  await page.evaluate(() => {
    const dt = (window as unknown as { __pdfyTestDT?: DataTransfer }).__pdfyTestDT;
    window.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  });
}

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations).toEqual([]);
}

test('global drag-and-drop opens PDFs in active tool, appends to Merge, protects active sessions, and warns on non-PDF drops', async ({ page }) => {
  await page.goto('/');

  // Dropping while Read is empty opens immediately without confirmation
  await dispatchDragEnter(page, [await pdfFile('dropped-read.pdf', 2)]);
  await expect(page.getByTestId('global-pdf-drop-overlay')).toContainText('Drop PDF to open in Read');
  await dispatchDropFromSavedDT(page);
  await expect(page.getByTestId('global-pdf-drop-overlay')).toHaveCount(0);
  await expect(page.getByText('dropped-read.pdf', { exact: true })).toBeVisible();

  // Dropping non-PDF warns without discarding the active Read document
  await dispatchDragEnter(page, [{ name: 'notes.txt', mimeType: 'text/plain', bytes: Array.from(Buffer.from('hello')) }]);
  await dispatchDropFromSavedDT(page);
  await expect(page.getByRole('alert').filter({ hasText: 'Drop a PDF file (.pdf)' })).toBeVisible();
  await expect(page.getByText('dropped-read.pdf', { exact: true })).toBeVisible();

  // Dropping another PDF while Read has an active document asks confirmation
  await dispatchDragEnter(page, [await pdfFile('second-read.pdf', 1)]);
  await dispatchDropFromSavedDT(page);
  await expect(page.getByRole('dialog', { name: 'Replace the Read document?' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByText('dropped-read.pdf', { exact: true })).toBeVisible();

  await dispatchDragEnter(page, [await pdfFile('second-read.pdf', 1)]);
  await dispatchDropFromSavedDT(page);
  await page.getByRole('button', { name: 'Replace document', exact: true }).click();
  await expect(page.getByText('second-read.pdf', { exact: true })).toBeVisible();

  // Dropping multiple PDFs in Merge appends directly to queue
  await navigate(page, 'Merge');
  await dispatchDragEnter(page, [await pdfFile('part-a.pdf', 1), await pdfFile('part-b.pdf', 2)]);
  await expect(page.getByTestId('global-pdf-drop-overlay')).toContainText('Drop PDF(s) to add to Merge');
  await dispatchDropFromSavedDT(page);
  await expect(page.getByText('Your files (2 files · 3 pages)')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download merged PDF', exact: true })).toBeEnabled();
});

test('cross-tool handoffs connect Read, Compress, Organize, Forms, and Edit with session protection', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');

  await page.getByLabel('PDF to read', { exact: true }).setInputFiles({
    name: 'chain-source.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await pdfBytes(2)),
  });
  await expect(page.locator('.react-pdf__Page__canvas').first()).toBeVisible();

  // Read -> Compress
  await page.getByRole('button', { name: 'Compress PDF', exact: true }).click();
  const compressTool = page.locator('[data-tool="compress"]');
  await expect(compressTool.getByRole('heading', { name: 'chain-source.pdf', exact: true })).toBeVisible();

  await compressTool.getByRole('button', { name: 'Lossless Cleanup', exact: true }).click();
  await compressTool.getByRole('button', { name: 'Compress PDF', exact: true }).click();
  await expect(compressTool.getByRole('button', { name: 'Organize…', exact: true })).toBeVisible();

  // Compress -> Organize
  await compressTool.getByRole('button', { name: 'Organize…', exact: true }).click();
  const organizeTool = page.locator('[data-tool="organize"]');
  await expect(organizeTool.getByRole('heading', { name: 'compressed_chain-source.pdf', exact: true })).toBeVisible();
  await expect(organizeTool.getByText('2 pages', { exact: true })).toBeVisible();

  // Organize -> Compress (asks confirmation because Compress already has an active doc)
  await organizeTool.getByRole('button', { name: 'Add blank after page 1', exact: true }).click();
  await organizeTool.getByRole('button', { name: 'Compress…', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Replace the Compress document?' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(organizeTool.getByRole('button', { name: 'Compress…', exact: true })).toBeFocused();

  await organizeTool.getByRole('button', { name: 'Compress…', exact: true }).click();
  await page.getByRole('button', { name: 'Replace document', exact: true }).click();
  await expect(compressTool.getByRole('heading', { name: 'organized_compressed_chain-source.pdf', exact: true })).toBeVisible();

  // Back to Organize -> Edit, then check Document actions menu includes Organize pages… & Compress PDF…
  await navigate(page, 'Organize');
  await organizeTool.getByRole('button', { name: 'Edit…', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Document title' })).toHaveValue('organized_compressed_chain-source');
  await page.getByRole('button', { name: 'Document actions', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Organize pages…', exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Compress PDF…', exact: true })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Organize pages…', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Replace the Organize document?' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Return to workspace', exact: true }).click();

  // Forms -> Compress handoff on sample form (Forms preloads sharedFile from Read, so confirm sample replacement)
  await navigate(page, 'Forms');
  const formsTool = page.locator('[data-tool="forms"]');
  await formsTool.getByRole('button', { name: 'Try a sample PDF', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Replace the Forms document?' })).toBeVisible();
  await page.getByRole('button', { name: 'Replace document', exact: true }).click();
  await expect(formsTool.getByRole('button', { name: 'Compress…', exact: true })).toBeVisible();
  await expectAccessible(page);
});

test('PWA launchQueue opens OS-launched PDF files into Read', async ({ page }) => {
  await page.addInitScript(() => {
    const fakeSetConsumer = (cb: (params: { files: Array<{ getFile: () => Promise<File> }> }) => void) => {
      (window as unknown as { __launchConsumer?: typeof cb }).__launchConsumer = cb;
    };
    const w = window as unknown as { launchQueue?: { setConsumer: typeof fakeSetConsumer } };
    if (w.launchQueue) {
      Object.defineProperty(w.launchQueue, 'setConsumer', { configurable: true, writable: true, value: fakeSetConsumer });
    } else {
      Object.defineProperty(window, 'launchQueue', { configurable: true, value: { setConsumer: fakeSetConsumer } });
    }
  });

  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __launchConsumer?: unknown }).__launchConsumer));
  const sample = await pdfFile('os-opened.pdf', 1);
  await page.evaluate(fileInfo => {
    const consumer = (window as unknown as {
      __launchConsumer?: (params: { files: Array<{ getFile: () => Promise<File> }> }) => void;
    }).__launchConsumer;
    if (!consumer) throw new Error('launchQueue consumer was not registered');
    const file = new File([new Uint8Array(fileInfo.bytes)], fileInfo.name, { type: fileInfo.mimeType });
    consumer({ files: [{ getFile: async () => file }] });
  }, sample);

  await expect(page.getByText('os-opened.pdf', { exact: true })).toBeVisible();
  await expectAccessible(page);
});
