import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PDFDocument } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

async function navigate(page: Page, label: string) {
  const menu = page.getByRole('button', { name: 'Open tools menu' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation', { name: 'PDF tools' }).getByRole('button', { name: label, exact: true }).click();
}

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .exclude('.MuiSnackbar-root')
    .analyze();
  expect(results.violations).toEqual([]);
}

function readZipEntries(bytes: Uint8Array): Array<{ name: string; data: Uint8Array }> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const entries: Array<{ name: string; data: Uint8Array }> = [];
  let cursor = 0;
  while (cursor + 4 <= bytes.length && view.getUint32(cursor, true) === 0x04034b50) {
    const compSize = view.getUint32(cursor + 18, true);
    const nameLen = view.getUint16(cursor + 26, true);
    const extraLen = view.getUint16(cursor + 28, true);
    const name = decoder.decode(bytes.subarray(cursor + 30, cursor + 30 + nameLen));
    const dataStart = cursor + 30 + nameLen + extraLen;
    entries.push({ name, data: bytes.subarray(dataStart, dataStart + compSize) });
    cursor = dataStart + compSize;
  }
  return entries;
}

test('Split supports equal chunks ZIP export, bookmark splitting on sample dossier, and handoff to Organize', async ({ page }) => {
  await page.goto('/');
  await navigate(page, 'Split');

  // Load the built-in 4-page multi-section dossier sample (which includes embedded bookmarks)
  await page.getByRole('button', { name: 'Try a sample PDF', exact: true }).click();
  await expect(page.getByText('Quarterly_Operations_Dossier.pdf', { exact: true })).toBeVisible();
  await expect(page.locator('.react-pdf__Page__canvas').first()).toBeVisible();

  // 1. Equal chunks mode (2 pages per file -> 2 PDFs inside 1 ZIP)
  await page.getByRole('button', { name: 'Equal chunks', exact: true }).click();
  const list = page.getByRole('list', { name: 'Split output parts' });
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await expect(list).toContainText('Pages 1–2');
  await expect(list).toContainText('Pages 3–4');
  await expectAccessible(page);

  const [chunkZipDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download all as ZIP', exact: true }).click(),
  ]);
  expect(chunkZipDownload.suggestedFilename()).toBe('Quarterly_Operations_Dossier_split.zip');
  const chunkZipPath = await chunkZipDownload.path();
  const chunkEntries = readZipEntries(await readFile(chunkZipPath!));
  expect(chunkEntries.map(e => e.name)).toEqual([
    'Quarterly_Operations_Dossier_part_01_p1-2.pdf',
    'Quarterly_Operations_Dossier_part_02_p3-4.pdf',
  ]);
  const part1 = await PDFDocument.load(chunkEntries[0].data);
  const part2 = await PDFDocument.load(chunkEntries[1].data);
  expect(part1.getPageCount()).toBe(2);
  expect(part2.getPageCount()).toBe(2);

  // 2. By bookmarks mode (4 embedded top-level bookmarks -> 4 named PDFs in 1 ZIP)
  await page.getByRole('button', { name: 'By bookmarks', exact: true }).click();
  await expect(list.getByRole('listitem')).toHaveCount(4);
  await expect(list).toContainText('Zero-Trust Client-Side Document Architecture');
  await expect(list).toContainText('Operational Readiness & Release Sign-Off');
  await expectAccessible(page);

  const [bookmarkZipDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download all as ZIP', exact: true }).click(),
  ]);
  const bookmarkEntries = readZipEntries(await readFile((await bookmarkZipDownload.path())!));
  expect(bookmarkEntries).toHaveLength(4);
  expect(bookmarkEntries[0].name).toContain('Zero-Trust');

  // 3. Extract pages + Handoff to Organize
  await page.getByRole('button', { name: 'Extract pages', exact: true }).click();
  await page.getByRole('textbox', { name: 'Page range', exact: true }).fill('1, 4');
  await page.getByRole('button', { name: 'Open extracted in Organize', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Organize pages', exact: true })).toBeVisible();
  await expect(page.getByText('extracted_Quarterly_Operations_Dossier.pdf', { exact: true })).toBeVisible();
});

test('Smart Split stays accessible without horizontal overflow at 320px in dark mode', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('/');
  await navigate(page, 'Split');
  await page.getByRole('button', { name: 'Try a sample PDF', exact: true }).click();
  await page.getByRole('button', { name: 'Equal chunks', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Split output parts' })).toBeVisible();
  await expectAccessible(page);

  const overflow = await page.evaluate(() => ({
    viewport: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.viewport);
});
