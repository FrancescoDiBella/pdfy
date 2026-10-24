import { test, expect } from '@playwright/test';
import type { Page, Locator, CDPSession } from '@playwright/test';
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';

// Trusted CDP touch input exercises Chromium gesture routing, not just React callbacks.
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

async function start(page: Page, file?: Awaited<ReturnType<typeof source>>) {
  await page.addInitScript(() => {
    for (const type of ['pointerdown', 'pointermove', 'pointerup']) document.addEventListener(type, event => {
      const pointer = event as PointerEvent;
      if (!pointer.isTrusted || !pointer.isPrimary || pointer.pointerType !== 'touch') return;
      const data = document.documentElement.dataset;
      data[type] = `${pointer.clientX},${pointer.clientY}`; data.touchPointer = String(pointer.pointerId);
    }, true);
  });
  await page.goto('/');
  const ready = page.getByRole('alert').filter({ hasText: 'PDFy is ready for offline use.' });
  await expect(ready).toBeVisible({ timeout: 30000 });
  await ready.getByRole('button', { name: 'Close', exact: true }).tap();
  await page.getByRole('button', { name: 'Open tools menu', exact: true }).tap();
  await page.getByRole('navigation', { name: 'PDF tools', exact: true }).getByRole('button', { name: 'Edit', exact: true }).tap();
  if (file) await page.getByLabel('PDF to edit', { exact: true }).setInputFiles(file);
  else await page.getByRole('button', { name: 'New blank PDF', exact: true }).tap();
  await expect(page.locator('.react-pdf__Page__canvas').first()).toBeVisible();
}
async function source(rotation = 0, crop = false, text = false) {
  const pdf = await PDFDocument.create(); const sheet = pdf.addPage([500, 700]);
  if (crop) sheet.setCropBox(40, 60, 400, 600);
  sheet.setRotation(degrees(rotation));
  if (text) sheet.drawText('Source text', { x: 100, y: 200, size: 18, font: await pdf.embedFont(StandardFonts.Helvetica) });
  return { name: `geometry-${rotation}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) };
}
async function add(page: Page, name: string) {
  await page.getByRole('button', { name: 'Tools', exact: true }).tap();
  await page.getByRole('dialog', { name: 'Editor tools', exact: true }).getByRole('button', { name, exact: true }).tap();
  await expect(page.getByRole('dialog', { includeHidden: true })).toHaveCount(0);
}
async function pointSeen(page: Page, type: string, x: number, y: number) {
  await expect.poll(async () => {
    const value = await page.locator('html').getAttribute(`data-${type}`);
    if (!value) return Infinity;
    const [actualX, actualY] = value.split(',').map(Number);
    return Math.hypot(actualX - x, actualY - y);
  }).toBeLessThan(1);
}
async function touchStart(page: Page, target: Locator, position?: { x: number; y: number }) {
  await target.click({ trial: true, position: position ?? { x: 15, y: 15 } });
  const box = (await target.boundingBox())!;
  const x = box.x + (position?.x ?? Math.min(box.width / 2, 20));
  const y = box.y + (position?.y ?? Math.min(box.height / 2, 20));
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x, y }] });
  await pointSeen(page, 'pointerdown', x, y);
  return { client, x, y };
}
async function move(page: Page, gesture: { client: CDPSession; x: number; y: number }, dx: number, dy: number) {
  for (const fraction of [.25, .5, 1]) {
    const x = gesture.x + dx * fraction; const y = gesture.y + dy * fraction;
    await gesture.client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x, y }] });
    await pointSeen(page, 'pointermove', x, y);
  }
}
async function end(client: CDPSession, cancel = false) {
  try { await client.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] }); }
  finally { await client.detach(); }
}
async function bounds(item: Locator) { return (await item.boundingBox())!; }
async function at(item: Locator, original: { x: number; y: number }, dx = 0, dy = 0) {
  await expect(async () => { const box = await bounds(item); expect(box.x).toBeCloseTo(original.x + dx, 0); expect(box.y).toBeCloseTo(original.y + dy, 0); }).toPass({ timeout: 5000 });
}
async function exportAndRead(page: Page) {
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PDF', exact: true }).tap();
  const path = (await (await downloading).path())!;
  await page.getByRole('button', { name: 'Return to workspace', exact: true }).tap();
  await page.getByLabel('PDF to read', { exact: true }).setInputFiles(path);
  await expect(page.locator('[data-tool="view"] .react-pdf__Page__canvas').first()).toBeVisible();
  return path;
}
async function swipe(page: Page, from: { x: number; y: number }, dx: number, dy: number) {
  const client = await page.context().newCDPSession(page);
  try {
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, ...from }] });
    for (const fraction of [.2, .4, .6, .8, 1]) await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: from.x + dx * fraction, y: from.y + dy * fraction }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally { await client.detach(); }
}

test('an unselected text item moves on its first touch, with one-step undo and redo', async ({ page }, info) => {
  await start(page); await add(page, 'Text Block');
  await page.getByRole('button', { name: 'Edit', exact: true }).tap();
  await page.getByRole('textbox', { name: 'Text content', exact: true }).fill('Moved by touch');
  await page.getByRole('button', { name: 'Close item properties', exact: true }).tap();
  const target = page.getByRole('button', { name: 'Select text item', exact: true });
  const item = page.locator('.editor-item').first(); const original = await bounds(item);
  await page.getByRole('region', { name: 'PDF editing canvas', exact: true }).tap({ position: { x: 15, y: 15 } });
  await expect(target).toHaveAttribute('aria-pressed', 'false');
  const gesture = await touchStart(page, target);
  try {
    await expect(page.getByRole('button', { name: 'Export PDF', exact: true })).toBeDisabled();
    await move(page, gesture, 45, 35);
    await at(item, original, 45, 35);
  } finally { await end(gesture.client); }
  await at(item, original, 45, 35);
  await page.screenshot({ animations: 'disabled', path: info.outputPath('touch-moved-text-phone.png') });
  await page.getByRole('button', { name: 'Undo', exact: true }).tap(); await at(item, original);
  await page.getByRole('button', { name: 'Redo', exact: true }).tap(); await at(item, original, 45, 35);
  await exportAndRead(page);
  await expect(page.locator('.react-pdf__Page__textContent').getByText('Moved by touch', { exact: true })).toBeVisible();
});

test('the visible resize handle commits once and a keyboard cannot mutate an active touch gesture', async ({ page }) => {
  await start(page); await add(page, 'Rectangle');
  const target = page.getByRole('button', { name: 'Select rectangle item', exact: true });
  const item = page.locator('.editor-item').first(); const original = await bounds(item);
  const drag = await touchStart(page, target);
  try {
    await move(page, drag, 35, 20);
    await target.focus(); await page.keyboard.press('ArrowRight');
    await at(item, original, 35, 20);
  } finally { await end(drag.client); }
  await page.getByRole('button', { name: 'Undo', exact: true }).tap(); await at(item, original);
  await page.getByRole('button', { name: 'Redo', exact: true }).tap();
  await target.tap();
  await page.getByRole('button', { name: 'Resize', exact: true }).tap();
  const handle = page.getByRole('button', { name: 'Resize rectangle item', exact: true });
  const resizedFrom = await bounds(item); const resize = await touchStart(page, handle);
  try { await move(page, resize, 35, 25); } finally { await end(resize.client); }
  await expect(async () => { const box = await bounds(item); expect(box.width).toBeCloseTo(resizedFrom.width + 35, 0); expect(box.height).toBeCloseTo(resizedFrom.height + 25, 0); }).toPass({ timeout: 5000 });
  await page.getByRole('button', { name: 'Undo', exact: true }).tap();
  await expect.poll(async () => (await bounds(item)).width).toBeCloseTo(resizedFrom.width, 0);
});

test('cancel, Escape and secondary pointer events cannot leave a transform or extra history entry', async ({ page }) => {
  await start(page); await add(page, 'Rectangle');
  const target = page.getByRole('button', { name: 'Select rectangle item', exact: true });
  const item = page.locator('.editor-item').first(); const original = await bounds(item);
  for (const cancellation of ['native', 'escape']) {
    const gesture = await touchStart(page, target);
    try {
      await move(page, gesture, 35, 25);
      const before = await bounds(item);
      await target.evaluate(element => {
        const id = Number(document.documentElement.dataset.touchPointer) + 10;
        for (const type of ['pointermove', 'pointerup', 'pointercancel', 'lostpointercapture']) element.dispatchEvent(new PointerEvent(type, { pointerId: id, isPrimary: false, clientX: 999, clientY: 999, bubbles: true }));
      });
      await at(item, before);
      if (cancellation === 'escape') await page.keyboard.press('Escape');
    } finally { await end(gesture.client, cancellation === 'native'); }
    await at(item, original);
  }
  await page.getByRole('button', { name: 'Undo', exact: true }).tap();
  await expect(item).toHaveCount(0);
});

test('zoomed and scrolled dragging uses the real page coordinates, while Pan scrolls across items', async ({ page }) => {
  await start(page); await add(page, 'Rectangle');
  const viewport = page.getByRole('region', { name: 'Editor document viewport', exact: true });
  for (let index = 0; index < 5; index++) { await page.getByRole('button', { name: 'Zoom options', exact: true }).tap(); await page.getByRole('menuitem', { name: 'Zoom in', exact: true }).tap(); }
  const view = await bounds(viewport);
  await swipe(page, { x: view.x + 40, y: view.y + view.height - 80 }, 0, -150);
  await expect.poll(() => viewport.evaluate(element => element.scrollTop)).toBeGreaterThan(50);
  await viewport.evaluate(element => { element.scrollTop = 220; element.scrollLeft = 40; });
  await page.getByRole('button', { name: 'Select', exact: true }).tap();
  const target = page.getByRole('button', { name: 'Select rectangle item', exact: true });
  await target.scrollIntoViewIfNeeded();
  const item = page.locator('.editor-item').first();
  const gesture = await touchStart(page, target);
  const before = await bounds(item);
  try { await move(page, gesture, 35, 30); } finally { await end(gesture.client); }
  await at(item, before, 35, 30);
  const position = await item.getAttribute('style');
  await page.getByRole('button', { name: 'Pan', exact: true }).tap();
  const box = await bounds(item); const scrollBefore = await viewport.evaluate(element => element.scrollTop);
  await swipe(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, 0, -90);
  await expect.poll(() => viewport.evaluate(element => element.scrollTop)).toBeGreaterThan(scrollBefore + 20);
  await expect(item).toHaveAttribute('style', position!);
  await page.getByRole('region', { name: 'PDF editing canvas', exact: true }).focus();
  for (const key of ['ArrowRight', 'Delete', 'Control+d']) await page.keyboard.press(key);
  await expect(item).toHaveCount(1); await expect(item).toHaveAttribute('style', position!);
});

test('mouse Pan supports a grab gesture and Escape without adding annotation history', async ({ page }) => {
  await start(page); await add(page, 'Rectangle');
  for (let index = 0; index < 4; index++) { await page.getByRole('button', { name: 'Zoom options', exact: true }).tap(); await page.getByRole('menuitem', { name: 'Zoom in', exact: true }).tap(); }
  await page.getByRole('button', { name: 'Pan', exact: true }).tap();
  const viewport = page.getByRole('region', { name: 'Editor document viewport', exact: true }); const box = await bounds(viewport);
  for (const cancel of [true, false]) {
    await page.mouse.move(box.x + 50, box.y + box.height - 60); await page.mouse.down();
    await page.mouse.move(box.x + 50, box.y + box.height - 180, { steps: 5 });
    await expect.poll(() => viewport.evaluate(element => element.scrollTop)).toBeGreaterThan(80);
    if (cancel) await page.keyboard.press('Escape');
    await page.mouse.up();
    if (cancel) await expect.poll(() => viewport.evaluate(element => element.scrollTop)).toBe(0);
  }
  await page.getByRole('button', { name: 'Undo', exact: true }).tap(); await expect(page.locator('.editor-item')).toHaveCount(0);
});

test('a PNG image moves and resizes with its proportions preserved', async ({ page }) => {
  await start(page);
  const png = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 80; const context = canvas.getContext('2d')!; context.fillStyle = '#1256ff'; context.fillRect(0, 0, 160, 80); return canvas.toDataURL('image/png').split(',')[1]; });
  await page.getByRole('button', { name: 'Tools', exact: true }).tap();
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Upload Image', exact: true }).tap();
  await (await choosing).setFiles({ name: 'phone-image.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(page.getByRole('dialog', { includeHidden: true })).toHaveCount(0);
  const target = page.getByRole('button', { name: 'Select phone-image.png item', exact: true });
  await expect(target).toBeVisible();
  const item = page.locator('.editor-item').first(); const original = await bounds(item);
  const gesture = await touchStart(page, target);
  try { await move(page, gesture, 40, 30); } finally { await end(gesture.client); }
  await at(item, original, 40, 30);
  await page.getByRole('button', { name: 'Resize', exact: true }).tap();
  const resize = await touchStart(page, page.getByRole('button', { name: 'Resize phone-image.png item', exact: true }));
  try { await move(page, resize, 30, 35); } finally { await end(resize.client); }
  const changed = await bounds(item); expect(changed.width).toBeGreaterThan(original.width); expect(changed.width / changed.height).toBeCloseTo(2, 3);
  const canvas = await bounds(page.getByRole('region', { name: 'PDF editing canvas', exact: true }));
  const location = { x: (changed.x + changed.width / 2 - canvas.x) / canvas.width, y: (changed.y + changed.height / 2 - canvas.y) / canvas.height };
  await exportAndRead(page);
  await expect.poll(() => page.locator('[data-tool="view"] .react-pdf__Page__canvas').first().evaluate((element, point) => { const canvas = element as HTMLCanvasElement; const color = canvas.getContext('2d')!.getImageData(Math.floor(point.x * canvas.width), Math.floor(point.y * canvas.height), 1, 1).data; return color[0] < 40 && color[1] < 120 && color[2] > 240; }, location)).toBe(true);
});

test('freehand Escape rolls back, and selecting a near-edge drawing does not shift it or add history', async ({ page }) => {
  await start(page); await page.getByRole('button', { name: 'Draw', exact: true }).tap();
  const surface = page.getByLabel('Freehand drawing surface', { exact: true });
  const canceled = await touchStart(page, surface, { x: 2, y: 2 });
  try { await move(page, canceled, 25, 20); await page.keyboard.press('Escape'); } finally { await end(canceled.client); }
  await expect(page.locator('.editor-item')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  const gesture = await touchStart(page, surface, { x: 2, y: 2 });
  try { await move(page, gesture, 25, 20); } finally { await end(gesture.client); }
  await page.getByRole('button', { name: 'Select', exact: true }).tap();
  const item = page.locator('.editor-item').first(); const original = await bounds(item);
  await page.getByRole('button', { name: 'Select drawing item', exact: true }).tap({ position: { x: 2, y: 2 } });
  await at(item, original);
  await page.getByRole('button', { name: 'Undo', exact: true }).tap(); await expect(item).toHaveCount(0);
});

test('phone selection controls fit at the page edge and source-text mode exits through Select', async ({ page }, info) => {
  await start(page); await page.setViewportSize({ width: 320, height: 568 }); await add(page, 'Rectangle');
  await page.getByRole('button', { name: 'Edit', exact: true }).tap();
  for (const [name, value] of [['Width', '80'], ['Height', '80'], ['Horizontal position', '714'], ['Vertical position', '1043']]) await page.getByRole('spinbutton', { name, exact: true }).fill(value);
  await page.getByRole('button', { name: 'Close item properties', exact: true }).tap();
  await page.getByRole('button', { name: 'Resize', exact: true }).tap();
  const handle = page.getByRole('button', { name: 'Resize rectangle item', exact: true }); await handle.scrollIntoViewIfNeeded();
  const box = await bounds(handle); const canvas = await bounds(page.getByRole('region', { name: 'PDF editing canvas', exact: true }));
  expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.x + box.width).toBeLessThanOrEqual(canvas.x + canvas.width + .5); expect(box.y + box.height).toBeLessThanOrEqual(canvas.y + canvas.height + .5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.screenshot({ animations: 'disabled', path: info.outputPath('edge-selection-phone.png') });
  await page.getByRole('button', { name: 'Tools', exact: true }).tap(); await page.getByRole('button', { name: 'Edit Text', exact: true }).tap(); await page.getByRole('button', { name: 'Close editor tools', exact: true }).tap();
  await page.getByRole('button', { name: 'Select', exact: true }).tap();
  await expect(page.getByRole('button', { name: 'Select rectangle item', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('orientation change cancels an in-progress transform without a stale commit', async ({ page }) => {
  await start(page); await add(page, 'Rectangle');
  await page.getByRole('button', { name: 'Edit', exact: true }).tap();
  const x = await page.getByRole('spinbutton', { name: 'Horizontal position', exact: true }).inputValue();
  const y = await page.getByRole('spinbutton', { name: 'Vertical position', exact: true }).inputValue();
  await page.getByRole('button', { name: 'Close item properties', exact: true }).tap();
  const gesture = await touchStart(page, page.getByRole('button', { name: 'Select rectangle item', exact: true }));
  try { await move(page, gesture, 25, 20); await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.getByRole('button', { name: 'Export PDF', exact: true })).toBeEnabled();
    await expect.poll(async () => (await bounds(page.getByRole('region', { name: 'PDF editing canvas', exact: true }))).width).toBeGreaterThan(600);
  }
  finally { await end(gesture.client); }
  await page.getByRole('button', { name: 'Edit', exact: true }).tap();
  await expect(page.getByRole('spinbutton', { name: 'Horizontal position', exact: true })).toHaveValue(x);
  await expect(page.getByRole('spinbutton', { name: 'Vertical position', exact: true })).toHaveValue(y);
  await page.getByRole('button', { name: 'Close item properties', exact: true }).tap();
  await page.getByRole('button', { name: 'Undo', exact: true }).tap(); await expect(page.locator('.editor-item')).toHaveCount(0);
});

test('validated editor replacements and new-document actions preserve work until confirmed', async ({ page }) => {
  await start(page); await add(page, 'Text Block');
  const input = page.getByLabel('Replacement PDF for Edit', { exact: true });
  await input.setInputFiles({ name: 'invalid.pdf', mimeType: 'application/pdf', buffer: Buffer.from('invalid') });
  await expect(page.getByRole('alert').filter({ hasText: 'Could not open this PDF' })).toBeVisible();
  await expect(page.locator('.editor-item')).toHaveCount(1);
  await input.setInputFiles(await source(90, true));
  await expect(page.getByRole('dialog', { name: 'Replace the Edit document?', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).tap();
  await expect(page.getByRole('button', { name: 'Document actions', exact: true })).toBeFocused();
  await expect(page.locator('.editor-item')).toHaveCount(1);
  await page.getByRole('button', { name: 'Document actions', exact: true }).tap(); await page.getByRole('menuitem', { name: 'New blank document', exact: true }).tap();
  await page.getByRole('button', { name: 'Cancel', exact: true }).tap(); await expect(page.locator('.editor-item')).toHaveCount(1);
  await input.setInputFiles(await source(90, true)); await page.getByRole('button', { name: 'Replace document', exact: true }).tap();
  await expect(page.getByRole('textbox', { name: 'Document title', exact: true })).toHaveValue('geometry-90');
  await expect(page.locator('.editor-item')).toHaveCount(0);
});

test('original text on a rotated page keeps its displayed orientation after editing and export', async ({ page }) => {
  await start(page, await source(90, true, true));
  await page.getByRole('button', { name: 'Tools', exact: true }).tap();
  await page.getByRole('button', { name: 'Edit Text', exact: true }).tap();
  await page.getByRole('button', { name: 'Source text', exact: true }).tap();
  await expect(page.getByRole('combobox', { name: 'Text rotation', exact: true })).toHaveText('90°');
  await page.getByRole('textbox', { name: 'Text content', exact: true }).fill('Revised');
  await page.getByRole('button', { name: 'Close item properties', exact: true }).tap();
  const originalMask = await page.locator('.editor-source-mask').getAttribute('style');
  const gesture = await touchStart(page, page.getByRole('button', { name: 'Select PDF text item', exact: true }));
  try { await move(page, gesture, 35, 20); } finally { await end(gesture.client); }
  await expect(page.locator('.editor-source-mask')).toHaveAttribute('style', originalMask!);
  await exportAndRead(page);
  const text = page.locator('.react-pdf__Page__textContent').getByText('Revised', { exact: true });
  await expect(text).toBeVisible(); const box = await bounds(text);
  expect(box.height).toBeGreaterThan(box.width * 2);
});

for (const rotation of [0, 90, 180, 270]) {
  test(`a moved shape exports to the displayed position on a cropped ${rotation}-degree page`, async ({ page }) => {
    await start(page, await source(rotation, true)); await add(page, 'Rectangle');
    await page.getByRole('button', { name: 'Edit', exact: true }).tap();
    await page.getByLabel('Fill color', { exact: true }).fill('#ff0000');
    await page.getByRole('slider', { name: 'Item opacity', exact: true }).press('End');
    await page.getByRole('button', { name: 'Close item properties', exact: true }).tap();
    const item = page.locator('.editor-item').first(); const original = await bounds(item);
    const gesture = await touchStart(page, page.getByRole('button', { name: 'Select rectangle item', exact: true }));
    try { await move(page, gesture, 70, 25); } finally { await end(gesture.client); }
    await at(item, original, 70, 25);
    const final = await bounds(item); const canvas = await bounds(page.getByRole('region', { name: 'PDF editing canvas', exact: true }));
    const location = { x: (final.x + final.width / 2 - canvas.x) / canvas.width, y: (final.y + final.height / 2 - canvas.y) / canvas.height };
    await exportAndRead(page);
    await expect.poll(async () => page.locator('[data-tool="view"] .react-pdf__Page__canvas').first().evaluate((element, point) => {
      const canvas = element as HTMLCanvasElement; const color = canvas.getContext('2d')!.getImageData(Math.floor(point.x * canvas.width), Math.floor(point.y * canvas.height), 1, 1).data;
      return color[0] > 240 && color[1] < 20 && color[2] < 20;
    }, location)).toBe(true);
  });
}
