import { test, expect } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PDFDocument, StandardFonts, PDFName, PDFDict } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

async function navigate(page: Page, tool: string) {
  const menu = page.getByRole('button', { name: 'Open tools menu' });
  if (await menu.isVisible()) await menu.tap();
  await page.getByRole('navigation', { name: 'PDF tools' }).getByRole('button', { name: tool, exact: true }).tap();
}

async function start(page: Page, tool = 'Edit') {
  await page.goto('/');
  const ready = page.getByRole('alert').filter({ hasText: 'PDFy is ready for offline use.' });
  await expect(ready).toBeVisible({ timeout: 30000 });
  await ready.getByRole('button', { name: 'Close' }).tap();
  await navigate(page, tool);
}

async function pdfFile(pages = 2) {
  const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < pages; index++) pdf.addPage([300 + index, 400]).drawText(`Source page ${index + 1}`, { x: 20, y: 300, size: 18, font });
  return { name: 'phone-work.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) };
}

async function expectFitted(page: Page) {
  await expect(async () => {
  const frame = await page.getByRole('region', { name: 'PDF editing canvas', exact: true }).boundingBox();
  const viewport = await page.getByRole('region', { name: 'Editor document viewport', exact: true }).boundingBox();
  expect(frame).not.toBeNull(); expect(viewport).not.toBeNull();
  expect(frame!.width).toBeGreaterThan(200);
  expect(frame!.width).toBeLessThanOrEqual(viewport!.width);
  expect(frame!.x).toBeGreaterThanOrEqual(viewport!.x);
  expect(frame!.x + frame!.width).toBeLessThanOrEqual(viewport!.x + viewport!.width);
  expect(viewport!.height).toBeGreaterThan(140);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
  }).toPass({ timeout: 5000, intervals: [50, 100, 250] });
}

async function touchStroke(page: Page, surface: Locator, cancel = false) {
  await surface.click({ trial: true, position: { x: 25, y: 25 } });
  const rect = (await surface.boundingBox())!;
  const client = await page.context().newCDPSession(page);
  try {
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rect.x + 25, y: rect.y + 25, id: 1 }] });
    for (const offset of [35, 45, 55]) await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: rect.x + offset, y: rect.y + offset / 2, id: 1 }] });
    await client.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
  } finally { await client.detach(); }
}

test('phone text editing, geometry, undo, orientation and PDF export form a complete workflow', async ({ page }, info) => {
  await start(page);
  await page.getByRole('button', { name: 'Blank A4 Canvas', exact: true }).tap();
  await expect(page.locator('.react-pdf__Page__canvas').first()).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expectFitted(page);
  await page.getByRole('button', { name: 'Tools', exact: true }).tap();
  await page.getByRole('button', { name: 'Text Block', exact: true }).tap();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Properties', exact: true }).tap();
  await page.getByRole('textbox', { name: 'Text content', exact: true }).fill('Mobile note');
  await page.getByRole('spinbutton', { name: 'Font size', exact: true }).fill('24');
  await page.getByRole('spinbutton', { name: 'Horizontal position', exact: true }).fill('40');
  await page.getByRole('button', { name: 'Move selection right', exact: true }).tap();
  await expect(page.getByRole('spinbutton', { name: 'Horizontal position', exact: true })).toHaveValue('50');
  await page.screenshot({ animations: 'disabled', path: info.outputPath('editor-properties-phone.png') });
  await page.getByRole('button', { name: 'Close item properties', exact: true }).tap();
  await expect(page.getByRole('button', { name: 'Properties', exact: true })).toBeFocused();
  const item = page.locator('.react-draggable').first();
  const position = await item.evaluate(element => getComputedStyle(element).transform);
  await page.getByRole('button', { name: 'Undo', exact: true }).tap();
  await expect(item).not.toHaveCSS('transform', position);
  await page.getByRole('button', { name: 'Redo', exact: true }).tap();
  await expect(item).toHaveCSS('transform', position);
  await page.setViewportSize({ width: 844, height: 390 });
  await expectFitted(page);
  await page.screenshot({ animations: 'disabled', path: info.outputPath('editor-landscape-phone.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expectFitted(page);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PDF', exact: true }).tap();
  const download = await downloading;
  const path = (await download.path())!;
  expect((await PDFDocument.load(await readFile(path))).getPageCount()).toBe(1);
  await page.getByRole('button', { name: 'Return to workspace', exact: true }).tap();
  await page.getByLabel('PDF to read', { exact: true }).setInputFiles(path);
  await expect(page.locator('.react-pdf__Page__textContent').getByText('Mobile note', { exact: true })).toBeVisible();
  await navigate(page, 'Edit');
  await page.getByRole('button', { name: 'Select text item', exact: true }).tap();
  await page.getByRole('button', { name: 'Properties', exact: true }).tap();
  await expect(page.getByRole('textbox', { name: 'Text content', exact: true })).toHaveValue('Mobile note');
});

test('source PDF text can be edited through a touch-friendly list and exported', async ({ page }) => {
  await start(page);
  await page.getByLabel('PDF to edit', { exact: true }).setInputFiles(await pdfFile());
  await expect(page.locator('.react-pdf__Page__canvas').first()).toBeVisible();
  await page.getByRole('button', { name: 'Tools', exact: true }).tap();
  await page.getByRole('button', { name: 'Edit Text', exact: true }).tap();
  await page.getByRole('button', { name: 'Source page 1', exact: true }).tap();
  await expect(page.getByRole('dialog', { name: 'Item properties', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Text content', exact: true }).fill('Updated on phone');
  await expect(page.getByLabel('Background mask color', { exact: true })).toHaveValue('#ffffff');
  await page.getByRole('button', { name: 'Bold', exact: true }).tap();
  await expect(page.getByRole('button', { name: 'Bold', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Bold', exact: true }).tap();
  await expect(page.getByRole('button', { name: 'Bold', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Close item properties', exact: true }).tap();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PDF', exact: true }).tap();
  const path = (await (await downloading).path())!;
  await page.getByRole('button', { name: 'Return to workspace', exact: true }).tap();
  await page.getByLabel('PDF to read', { exact: true }).setInputFiles(path);
  await expect(page.locator('.react-pdf__Page__textContent').getByText('Updated on phone', { exact: true })).toBeVisible();
});

test('freehand and signature strokes use real touch input and ignore secondary pointer events', async ({ page }, info) => {
  await start(page);
  await page.getByRole('button', { name: 'Blank A4 Canvas', exact: true }).tap();
  await expect(page.locator('.react-pdf__Page__canvas').first()).toBeVisible();
  await page.getByRole('button', { name: 'Tools', exact: true }).tap();
  await page.getByRole('button', { name: 'Freehand', exact: true }).tap();
  await expect(page.getByRole('dialog', { includeHidden: true })).toHaveCount(0);
  await touchStroke(page, page.getByLabel('Freehand drawing surface', { exact: true }));
  await expect(page.locator('.react-draggable svg path')).toHaveCount(1);
  await touchStroke(page, page.getByLabel('Freehand drawing surface', { exact: true }), true);
  await expect(page.locator('.react-draggable svg path')).toHaveCount(1);
  await page.getByRole('button', { name: 'Done drawing', exact: true }).tap();
  await page.getByRole('button', { name: 'Document actions', exact: true }).tap();
  await page.getByRole('menuitem', { name: 'Sign PDF', exact: true }).tap();
  const surface = page.getByLabel('Draw signature', { exact: true });
  await expect(page.getByRole('button', { name: 'Place on PDF Page', exact: true })).toBeDisabled();
  await surface.evaluate(element => element.addEventListener('pointerdown', event => { (element as HTMLElement).dataset.pointer = String((event as PointerEvent).pointerId); }, { once: true }));
  await surface.click({ trial: true, position: { x: 25, y: 25 } });
  const rect = (await surface.boundingBox())!; const client = await page.context().newCDPSession(page);
  try {
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: rect.x + 25, y: rect.y + 25 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: rect.x + 45, y: rect.y + 35 }] });
    const before = await surface.evaluate(element => (element as HTMLCanvasElement).toDataURL());
    await surface.evaluate(element => {
      const pointerId = Number((element as HTMLElement).dataset.pointer) + 1;
      for (const type of ['pointermove', 'pointerup', 'pointercancel', 'lostpointercapture']) element.dispatchEvent(new PointerEvent(type, { pointerId, isPrimary: false, bubbles: true, clientX: 999, clientY: 999 }));
    });
    expect(await surface.evaluate(element => (element as HTMLCanvasElement).toDataURL())).toBe(before);
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: rect.x + 65, y: rect.y + 45 }] });
    expect(await surface.evaluate(element => (element as HTMLCanvasElement).toDataURL())).not.toBe(before);
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally { await client.detach(); }
  await expect(page.getByRole('button', { name: 'Place on PDF Page', exact: true })).toBeEnabled();
  expect(await surface.evaluate(element => getComputedStyle(element.parentElement!).backgroundColor)).toBe('rgb(249, 250, 251)');
  await page.screenshot({ animations: 'disabled', path: info.outputPath('signature-phone.png') });
  await page.getByRole('button', { name: 'Place on PDF Page', exact: true }).tap();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Select Ink Signature item', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Document actions', exact: true }).tap();
  await page.getByRole('menuitem', { name: 'Sign PDF', exact: true }).tap();
  await page.getByRole('button', { name: 'Type', exact: true }).tap();
  await page.getByRole('textbox', { name: 'Full Name or Initials', exact: true }).fill('Test User');
  await page.getByRole('button', { name: 'Place on PDF Page', exact: true }).tap();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PDF', exact: true }).tap();
  const output = await PDFDocument.load(await readFile((await (await downloading).path())!));
  expect(output.getPageCount()).toBe(1);
  expect(output.getPage(0).node.Resources()!.lookup(PDFName.of('XObject'), PDFDict).keys().length).toBeGreaterThanOrEqual(2);
});

test('a delayed page deletion locks pointer and keyboard editing until its snapshot is installed', async ({ page }) => {
  await page.addInitScript(() => {
    const schedule = window.setTimeout.bind(window);
    const pending: (() => void)[] = [];
    window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
      if (delay === 0 && typeof handler === 'function' && document.documentElement.dataset.pauseWrites === 'true') {
        document.documentElement.dataset.waitingWrite = 'true';
        const placeholder = schedule(() => {}, 10000);
        pending.push(() => { clearTimeout(placeholder); schedule(handler, 0, ...args); });
        return placeholder;
      }
      return schedule(handler, delay, ...args);
    }) as typeof window.setTimeout;
    window.addEventListener('resume-writes', () => {
      document.documentElement.dataset.pauseWrites = 'false';
      pending.splice(0).forEach(run => run());
    });
  });
  await start(page);
  await page.getByLabel('PDF to edit', { exact: true }).setInputFiles(await pdfFile(80));
  await expect(page.locator('.react-pdf__Page__canvas').first()).toBeVisible();
  await page.getByRole('button', { name: 'Tools', exact: true }).tap();
  await page.getByRole('button', { name: 'Edit Text', exact: true }).tap();
  await expect(page.getByRole('button', { name: 'Source page 1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close editor tools', exact: true }).tap();
  const sourceText = page.locator('button[aria-label="Edit text: Source page 1"]');
  await expect(sourceText).toHaveCount(1);
  await page.getByRole('button', { name: 'Document actions', exact: true }).tap();
  await page.getByRole('menuitem', { name: 'Delete current page', exact: true }).tap();
  await expect(page.getByRole('dialog', { name: 'Delete this page?', exact: true })).toBeVisible();
  await page.evaluate(() => { document.documentElement.dataset.pauseWrites = 'true'; });
  await page.getByRole('button', { name: 'Confirm', exact: true }).tap();
  await expect(page.locator('html')).toHaveAttribute('data-waiting-write', 'true');
  const viewport = page.locator('[aria-label="Editor document viewport"]');
  await expect(viewport).toHaveAttribute('inert', '');
  await expect(page.getByRole('button', { name: 'Tools', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Export PDF', exact: true })).toBeDisabled();
  await sourceText.evaluate(element => (element as HTMLElement).focus());
  await expect(sourceText).not.toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Item properties', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.dispatchEvent(new Event('resume-writes')));
  await expect(page.getByRole('status').filter({ hasText: 'Page 1 / 79' })).toBeVisible({ timeout: 15000 });
  await expect(viewport).not.toHaveAttribute('inert', '');
  await expect(page.locator('.react-draggable')).toHaveCount(0);
});

test('mobile organizer settings preserve work, reorder pages, and export the visible order', async ({ page }) => {
  await start(page, 'Organize');
  const input = page.getByLabel('PDF for Organize', { exact: true });
  await input.setInputFiles(await pdfFile());
  await page.getByRole('button', { name: 'Move page 1 later', exact: true }).tap();
  const list = page.getByRole('list', { name: 'Page order', exact: true });
  await expect(list.getByRole('listitem').first()).toContainText('Source 2');
  await page.getByRole('button', { name: 'Rotate page 1', exact: true }).tap();
  await page.getByRole('button', { name: 'Page settings', exact: true }).tap();
  await page.getByLabel('Watermark', { exact: true }).check();
  await page.getByRole('textbox', { name: 'Watermark Text', exact: true }).fill('PHONE');
  await page.getByRole('button', { name: 'Close page settings', exact: true }).tap();
  await expect(page.getByRole('button', { name: 'Page settings', exact: true })).toBeFocused();
  await input.setInputFiles({ name: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a PDF') });
  await expect(page.getByRole('alert').filter({ hasText: 'Could not open' })).toBeVisible();
  await input.setInputFiles(await pdfFile());
  await page.getByRole('button', { name: 'Cancel', exact: true }).tap();
  await expect(list.getByRole('listitem').first()).toContainText('Source 2');
  await page.getByRole('button', { name: 'Page settings', exact: true }).tap();
  await expect(page.getByRole('textbox', { name: 'Watermark Text', exact: true })).toHaveValue('PHONE');
  await page.getByRole('button', { name: 'Close page settings', exact: true }).tap();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download organized PDF', exact: true }).tap();
  const output = await PDFDocument.load(await readFile((await (await downloading).path())!));
  expect(output.getPages().map(sheet => sheet.getWidth())).toEqual([301, 300]);
  expect(output.getPage(0).getRotation().angle).toBe(90);
});

for (const colorScheme of ['light', 'dark'] as const) {
  for (const width of [320, 1280]) {
    test(`populated editor and organizer layout at ${width}px in ${colorScheme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await start(page);
      await page.getByRole('button', { name: 'Sample Invoice', exact: true }).tap();
      await expect(page.locator('.react-pdf__Page__canvas').first()).toBeVisible();
      await expectFitted(page);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(results.violations).toEqual([]);
      await page.screenshot({ animations: 'disabled', path: info.outputPath(`editor-after-${width}-${colorScheme}.png`) });
      await page.getByRole('button', { name: 'Tools', exact: true }).tap();
      await expect(page.getByRole('dialog', { name: 'Editor tools', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Close editor tools', exact: true }).tap();
      await expect(page.getByRole('button', { name: 'Tools', exact: true })).toBeFocused();
      await page.getByRole('button', { name: 'Return to workspace', exact: true }).tap();
      await navigate(page, 'Organize');
      await page.getByRole('button', { name: 'Try a sample PDF', exact: true }).tap();
      await expect(page.locator('[data-tool="organize"] .react-pdf__Page__canvas').first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      const organized = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(organized.violations).toEqual([]);
      await page.screenshot({ animations: 'disabled', path: info.outputPath(`organizer-after-${width}-${colorScheme}.png`) });
    });
  }
}
