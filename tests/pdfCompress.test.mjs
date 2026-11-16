import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  analyzePDFSize,
  applyGrayscaleToCanvasData,
  computeSavingsSummary,
  formatByteSize,
  optimizePDFLossless,
} from '../src/utils/pdfCompress.ts';

test('formatByteSize and computeSavingsSummary format human-readable metrics and detect growth', () => {
  assert.equal(formatByteSize(512), '512 B');
  assert.equal(formatByteSize(2048), '2.0 KB');
  assert.equal(formatByteSize(2 * 1024 * 1024), '2.00 MB');

  const shrunk = computeSavingsSummary(1000, 400);
  assert.deepEqual(shrunk, {
    originalBytes: 1000,
    compressedBytes: 400,
    savedBytes: 600,
    percentSaved: 60,
    shrank: true,
  });

  const grew = computeSavingsSummary(1000, 1250);
  assert.equal(grew.shrank, false);
  assert.equal(grew.savedBytes, -250);
  assert.equal(grew.percentSaved, -25);
});

test('analyzePDFSize inspects page counts, metadata presence, and interactive form fields', async () => {
  const doc = await PDFDocument.create();
  doc.setTitle('Quarterly Archive');
  const p1 = doc.addPage([400, 600]);
  doc.addPage([400, 600]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  p1.drawText('Document text', { x: 20, y: 550, size: 12, font });
  doc.getForm().createTextField('signer').addToPage(p1, { x: 20, y: 500, width: 120, height: 24 });

  const uncompressed = await doc.save({ useObjectStreams: false });
  const analysis = await analyzePDFSize(uncompressed);

  assert.equal(analysis.pageCount, 2);
  assert.equal(analysis.originalBytes, uncompressed.byteLength);
  assert.equal(analysis.formFieldCount, 1);
  assert.equal(analysis.hasMetadata, true);
});

test('optimizePDFLossless strips metadata, flattens forms, and repacks with object streams', async () => {
  const doc = await PDFDocument.create();
  doc.setTitle('Sensitive Title');
  doc.setAuthor('Internal Author');
  const page = doc.addPage([400, 600]);
  const tf = doc.getForm().createTextField('note');
  tf.setText('Keep visually');
  tf.addToPage(page, { x: 20, y: 500, width: 140, height: 24 });

  const original = await doc.save({ useObjectStreams: false });
  const cleaned = await optimizePDFLossless(original, { stripMetadata: true, flattenForms: true });
  const after = await analyzePDFSize(cleaned);

  assert.equal(after.pageCount, 1);
  assert.equal(after.formFieldCount, 0);
  assert.equal(after.hasMetadata, false);
});

test('applyGrayscaleToCanvasData converts RGB channels to luminance while keeping alpha intact', () => {
  const buf = new Uint8ClampedArray([255, 0, 0, 200, 0, 255, 0, 255]);
  applyGrayscaleToCanvasData(buf);
  assert.equal(buf[0], buf[1]);
  assert.equal(buf[1], buf[2]);
  assert.equal(buf[3], 200);
  assert.equal(buf[4], buf[5]);
  assert.equal(buf[5], buf[6]);
  assert.equal(buf[7], 255);
});
