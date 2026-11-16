import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import {
  applyScanFilterToImageData,
  composeImagesToPDF,
  reorderImageItems,
  resolveTargetPageSize,
} from '../src/utils/pdfConvert.ts';

// Minimal valid 1x1 RGB PNG
const TINY_PNG = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0, 144, 119, 83, 222,
  0, 0, 0, 12, 73, 68, 65, 84, 8, 215, 99, 248, 207, 192, 0, 0,
  3, 1, 1, 0, 24, 221, 141, 176, 0, 0, 0, 0, 73, 69, 78, 68,
  174, 66, 96, 130,
]);

test('reorderImageItems moves items without mutating original array', () => {
  const initial = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const moved = reorderImageItems(initial, 'c', 'a');
  assert.deepEqual(moved.map(i => i.id), ['c', 'a', 'b']);
  assert.deepEqual(initial.map(i => i.id), ['a', 'b', 'c']);
  assert.equal(reorderImageItems(initial, 'missing', 'a'), initial);
});

test('resolveTargetPageSize respects match, paper size, and auto/explicit orientations', () => {
  const match = resolveTargetPageSize(800, 600, { pageSize: 'match', orientation: 'auto' });
  assert.deepEqual(match, { width: 600, height: 450 });

  const autoLand = resolveTargetPageSize(1200, 800, { pageSize: 'a4', orientation: 'auto' });
  assert.ok(autoLand.width > autoLand.height);

  const forcedPort = resolveTargetPageSize(1200, 800, { pageSize: 'letter', orientation: 'portrait' });
  assert.deepEqual(forcedPort, { width: 612, height: 792 });
});

test('composeImagesToPDF generates rotated pages accurately and rejects empty lists', async () => {
  await assert.rejects(
    () => composeImagesToPDF([], { pageSize: 'a4', orientation: 'auto', fit: 'contain', margin: 'narrow' }),
    /at least one image/i,
  );

  const bytes = await composeImagesToPDF(
    [
      { id: '1', name: 'one.png', mimeType: 'image/png', bytes: TINY_PNG, width: 1, height: 1, rotation: 0 },
      { id: '2', name: 'two.png', mimeType: 'image/png', bytes: TINY_PNG, width: 1, height: 1, rotation: 90 },
      { id: '3', name: 'three.png', mimeType: 'image/png', bytes: TINY_PNG, width: 1, height: 1, rotation: 270 },
    ],
    { pageSize: 'a4', orientation: 'portrait', fit: 'cover', margin: 'narrow', title: 'Field Scans' },
  );

  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 3);
  assert.equal(pdf.getTitle(), 'Field Scans');
  const { width, height } = pdf.getPage(0).getSize();
  assert.ok(height > width);
});

test('applyScanFilterToImageData enhances light backgrounds to paper white and dark ink cleanly', () => {
  const pixels = new Uint8ClampedArray([
    235, 225, 215, 255, // off-white paper -> white 255
    20, 25, 30, 255,    // dark ink -> crisp near-black 12
  ]);
  applyScanFilterToImageData(pixels);
  assert.deepEqual(Array.from(pixels), [255, 255, 255, 255, 12, 12, 12, 255]);
});
