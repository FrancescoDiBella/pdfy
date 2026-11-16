import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';
import {
  applyColorTransformToImageData,
  buildBookletSpreads,
  composePrintPDF,
  DEFAULT_PRINT_OPTIONS,
  PAPER_DIMENSIONS_PT,
  resolveNupGrid,
  resolveSelectedPages,
  resolveSheetDimensions,
  sanitizeWinAnsi,
} from '../src/utils/pdfPrint.ts';

async function makePDF(pages) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages.length; i++) {
    const spec = pages[i];
    const page = pdf.addPage([spec.width, spec.height]);
    if (spec.rotation) page.setRotation(degrees(spec.rotation));
    page.drawText(`Page ${i + 1}`, { x: 24, y: spec.height - 40, size: 14, font });
  }
  return await pdf.save({ addDefaultPage: false });
}

test('resolveSelectedPages handles ranges, odd/even parity, and reverse order', () => {
  assert.deepEqual(resolveSelectedPages(5, { rangeMode: 'all', pageRange: '', parity: 'all', reverseOrder: false }), [0, 1, 2, 3, 4]);
  assert.deepEqual(resolveSelectedPages(5, { rangeMode: 'all', pageRange: '', parity: 'odd', reverseOrder: false }), [0, 2, 4]);
  assert.deepEqual(resolveSelectedPages(5, { rangeMode: 'all', pageRange: '', parity: 'even', reverseOrder: false }), [1, 3]);
  assert.deepEqual(resolveSelectedPages(5, { rangeMode: 'custom', pageRange: '5, 2-3', parity: 'all', reverseOrder: true }), [4, 2, 1]);
  assert.deepEqual(resolveSelectedPages(1, { rangeMode: 'all', pageRange: '', parity: 'even', reverseOrder: false }), []);
});

test('buildBookletSpreads computes saddle-stitch signatures with multiple-of-4 padding', () => {
  assert.deepEqual(buildBookletSpreads([0]), [[null, 0], [null, null]]);
  assert.deepEqual(buildBookletSpreads([0, 1, 2]), [[null, 0], [1, 2]]);
  assert.deepEqual(buildBookletSpreads([0, 1, 2, 3]), [[3, 0], [1, 2]]);
  assert.deepEqual(buildBookletSpreads([0, 1, 2, 3, 4, 5, 6, 7]), [
    [7, 0],
    [1, 6],
    [5, 2],
    [3, 4],
  ]);
});

test('resolveNupGrid and resolveSheetDimensions choose sensible sheet grids and auto orientations', () => {
  assert.deepEqual(resolveNupGrid(2, 'landscape'), { cols: 2, rows: 1 });
  assert.deepEqual(resolveNupGrid(2, 'portrait'), { cols: 1, rows: 2 });
  assert.deepEqual(resolveNupGrid(6, 'landscape'), { cols: 3, rows: 2 });
  assert.deepEqual(resolveNupGrid(9, 'portrait'), { cols: 3, rows: 3 });

  const twoUp = resolveSheetDimensions({ width: 595, height: 842 }, { paperSize: 'a4', orientation: 'auto', layout: 'nup', nup: 2 });
  assert.equal(twoUp.orientation, 'landscape');
  assert.equal(Math.round(twoUp.width), Math.round(PAPER_DIMENSIONS_PT.a4.height));

  const booklet = resolveSheetDimensions({ width: 612, height: 792 }, { paperSize: 'letter', orientation: 'auto', layout: 'booklet', nup: 2 });
  assert.equal(booklet.orientation, 'landscape');
  assert.equal(booklet.width, 792);
  assert.equal(booklet.height, 612);
});

test('composePrintPDF produces accurate sheet counts for standard, N-up, booklet, and rotated sources', async () => {
  const bytes = await makePDF([
    { width: 595, height: 842 },
    { width: 595, height: 842 },
    { width: 595, height: 842 },
    { width: 595, height: 842 },
    { width: 595, height: 842 },
  ]);

  const standard = await composePrintPDF(bytes, { ...DEFAULT_PRINT_OPTIONS });
  assert.equal(standard.sheetCount, 5);
  assert.equal((await PDFDocument.load(standard.bytes)).getPageCount(), 5);

  const twoUp = await composePrintPDF(bytes, { ...DEFAULT_PRINT_OPTIONS, layout: 'nup', nup: 2, drawBorders: true });
  assert.equal(twoUp.sheetCount, 3);
  assert.equal(twoUp.orientation, 'landscape');
  assert.equal((await PDFDocument.load(twoUp.bytes)).getPageCount(), 3);

  const fourUp = await composePrintPDF(bytes, { ...DEFAULT_PRINT_OPTIONS, layout: 'nup', nup: 4 });
  assert.equal(fourUp.sheetCount, 2);

  const booklet = await composePrintPDF(bytes, { ...DEFAULT_PRINT_OPTIONS, layout: 'booklet', drawBorders: true });
  assert.equal(booklet.sheetCount, 4);
  assert.equal((await PDFDocument.load(booklet.bytes)).getPageCount(), 4);

  const rotatedBytes = await makePDF([{ width: 400, height: 600, rotation: 90 }]);
  const rotatedPrint = await composePrintPDF(rotatedBytes, { ...DEFAULT_PRINT_OPTIONS });
  assert.equal(rotatedPrint.orientation, 'landscape');
  assert.equal(Math.round(rotatedPrint.sheetWidth), 600);
  assert.equal(Math.round(rotatedPrint.sheetHeight), 400);

  const blankPdf = await PDFDocument.create();
  blankPdf.addPage([595, 842]);
  const blankBytes = await blankPdf.save({ addDefaultPage: false });
  const blankStandard = await composePrintPDF(blankBytes, { ...DEFAULT_PRINT_OPTIONS });
  assert.equal(blankStandard.sheetCount, 1);
  const blankBooklet = await composePrintPDF(blankBytes, { ...DEFAULT_PRINT_OPTIONS, layout: 'booklet', drawBorders: true });
  assert.equal(blankBooklet.sheetCount, 2);
});

test('composePrintPDF handles unicode document titles in footer stamps and rejects empty filters', async () => {
  const bytes = await makePDF([{ width: 595, height: 842 }]);
  const stamped = await composePrintPDF(bytes, {
    ...DEFAULT_PRINT_OPTIONS,
    showHeaderFooter: true,
    documentTitle: 'Report 📄 — 2026',
    headerFooterNote: 'Confidential ✓',
  });
  assert.equal(stamped.sheetCount, 1);
  assert.equal(sanitizeWinAnsi('Report 📄'), 'Report ?');

  await assert.rejects(
    () => composePrintPDF(bytes, { ...DEFAULT_PRINT_OPTIONS, parity: 'even' }),
    /No pages match/,
  );
  await assert.rejects(
    () => composePrintPDF(bytes, { ...DEFAULT_PRINT_OPTIONS, rangeMode: 'custom', pageRange: '1-99' }),
    /Choose pages between/,
  );
});

test('applyColorTransformToImageData applies grayscale and dark-slide ink-saver cleanly', () => {
  const sample = new Uint8ClampedArray([10, 20, 30, 255, 250, 100, 50, 255]);
  const gray = new Uint8ClampedArray(sample);
  applyColorTransformToImageData(gray, 'grayscale');
  assert.equal(gray[0], gray[1]);
  assert.equal(gray[1], gray[2]);
  assert.equal(gray[3], 255);

  const inverted = new Uint8ClampedArray(sample);
  applyColorTransformToImageData(inverted, 'ink-saver');
  assert.equal(inverted[0], 255); // 255 - 10 = 245 > 238 -> snapped to pure white paper
  assert.equal(inverted[1], 235); // 255 - 20 = 235
  assert.equal(inverted[2], 225);
  assert.equal(inverted[4], 5);
});
