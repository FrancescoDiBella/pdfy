import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PDFDocument, PDFString, StandardFonts, degrees } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  appendPDFsToFile,
  detectMixedQueuePageSizes,
  formatPageSizeLabel,
  mergePDFs,
  preparePDFs,
  reorderPDFs,
} from '../src/utils/pdfMerge.ts';
import { movePageToIndex, removePageById, reorderPageItems, restorePageAtIndex } from '../src/utils/pdfOrganize.ts';

async function pdfFile(name, widths) {
  const doc = await PDFDocument.create();
  widths.forEach(width => doc.addPage([width, 400]));
  return new File([await doc.save()], name, { type: 'application/pdf' });
}

test('rejects unreadable/encrypted files while retaining valid files in input order', async () => {
  const encrypted = await PDFDocument.create();
  encrypted.addPage();
  encrypted.context.trailerInfo.Encrypt = encrypted.context.register(encrypted.context.obj({ Filter: 'Standard' }));
  const files = [
    await pdfFile('first.pdf', [200, 210]),
    new File(['not a PDF'], 'broken.pdf'),
    new File([await encrypted.save()], 'protected.pdf'),
    await pdfFile('last.pdf', [300]),
  ];
  const { accepted, rejected } = await preparePDFs(files);
  assert.deepEqual(accepted.map(item => [item.file.name, item.pageCount]), [['first.pdf', 2], ['last.pdf', 1]]);
  assert.deepEqual(rejected, ['broken.pdf', 'protected.pdf']);
});

test('moves first, middle and last items without mutating the original queue', async () => {
  const { accepted: queue } = await preparePDFs(await Promise.all([200, 300, 400].map(width => pdfFile(`${width}.pdf`, [width]))));
  const [a, b, c] = queue;
  assert.deepEqual(reorderPDFs(queue, a.id, c.id), [b, c, a]);
  assert.deepEqual(reorderPDFs(queue, c.id, a.id), [c, a, b]);
  assert.deepEqual(reorderPDFs(queue, b.id, a.id), [b, a, c]);
  assert.deepEqual(queue, [a, b, c]);
  assert.equal(reorderPDFs(queue, a.id, a.id), queue);
  assert.equal(reorderPDFs(queue, 'stale-id', c.id), queue);
  assert.equal(reorderPDFs(queue, a.id, 'missing-target'), queue);
});

test('duplicate filenames stay independent and merged pages follow the reordered queue', async () => {
  const { accepted: queue } = await preparePDFs([await pdfFile('same.pdf', [200, 210]), await pdfFile('same.pdf', [300])]);
  assert.notEqual(queue[0].id, queue[1].id);
  const reordered = reorderPDFs(queue, queue[1].id, queue[0].id);
  const merged = await PDFDocument.load(await mergePDFs(reordered));
  assert.deepEqual(merged.getPages().map(page => page.getWidth()), [300, 200, 210]);
});

test('requires two files and reports a file read failure instead of exporting partial output', async () => {
  await assert.rejects(mergePDFs([]), /at least two/);
  const { accepted: queue } = await preparePDFs([await pdfFile('one.pdf', [200])]);
  await assert.rejects(mergePDFs(queue), /at least two/);
  await assert.rejects(mergePDFs([...queue, { ...queue[0], file: new File(['invalid'], 'broken.pdf') }]));
});

test('appendPDFsToFile merges additional valid PDFs onto a base session without dropping unreadable reports', async () => {
  const base = await pdfFile('packet.pdf', [200, 220]);
  const extra = await pdfFile('appendix.pdf', [340, 360]);
  const bad = new File(['corrupt'], 'corrupt.pdf', { type: 'application/pdf' });

  const appended = await appendPDFsToFile(base, [bad, extra]);
  assert.equal(appended.previousPageCount, 2);
  assert.equal(appended.addedCount, 2);
  assert.deepEqual(appended.acceptedNames, ['appendix.pdf']);
  assert.deepEqual(appended.rejected, ['corrupt.pdf']);
  assert.equal(appended.combinedFile.name, 'packet.pdf');

  const doc = await PDFDocument.load(await appended.combinedFile.arrayBuffer());
  assert.deepEqual(doc.getPages().map(p => p.getWidth()), [200, 220, 340, 360]);
});

test('pdfOrganize helpers reorder pages, block deleting the last page, and undo deletions cleanly', () => {
  const pages = [
    { id: 'p1', originalIndex: 0, rotation: 0 },
    { id: 'p2', originalIndex: 1, rotation: 90 },
    { id: 'p3', originalIndex: 2, rotation: 0 },
  ];

  const reordered = reorderPageItems(pages, 'p3', 'p1');
  assert.deepEqual(reordered.map(p => p.id), ['p3', 'p1', 'p2']);

  const jumped = movePageToIndex(reordered, 0, 2);
  assert.deepEqual(jumped.map(p => p.id), ['p1', 'p2', 'p3']);
  assert.equal(movePageToIndex(jumped, 1, 99), jumped);

  const removal = removePageById(reordered, 'p1');
  assert.ok(removal);
  assert.deepEqual(removal.nextPages.map(p => p.id), ['p3', 'p2']);
  assert.equal(removal.removedIndex, 1);

  const restored = restorePageAtIndex(removal.nextPages, removal.removed, removal.removedIndex);
  assert.deepEqual(restored.map(p => p.id), ['p3', 'p1', 'p2']);

  // Cannot remove the final remaining page.
  assert.equal(removePageById([{ id: 'only', originalIndex: 0, rotation: 0 }], 'only'), null);
});

test('detectMixedQueuePageSizes and formatPageSizeLabel identify phone-scan mismatches while ignoring orientation', async () => {
  const a4Doc = await PDFDocument.create();
  a4Doc.addPage([595.28, 841.89]);
  const a4LandscapeDoc = await PDFDocument.create();
  a4LandscapeDoc.addPage([841.89, 595.28]);
  const scanDoc = await PDFDocument.create();
  scanDoc.addPage([2480, 3508]);

  const { accepted: sameFormat } = await preparePDFs([
    new File([await a4Doc.save()], 'a4.pdf', { type: 'application/pdf' }),
    new File([await a4LandscapeDoc.save()], 'a4-land.pdf', { type: 'application/pdf' }),
  ]);
  assert.equal(detectMixedQueuePageSizes(sameFormat), false);
  assert.equal(formatPageSizeLabel(sameFormat[0].sampleSize), 'A4');

  const { accepted: mixed } = await preparePDFs([
    new File([await a4Doc.save()], 'a4.pdf', { type: 'application/pdf' }),
    new File([await scanDoc.save()], 'phone-scan.pdf', { type: 'application/pdf' }),
  ]);
  assert.equal(detectMixedQueuePageSizes(mixed), true);
  assert.equal(formatPageSizeLabel(mixed[1].sampleSize), '875 × 1238 mm');
});

test('mergePDFs normalizes phone-scanned and rotated pages to match-first, A4, or Letter while preserving annotations and forms', async () => {
  const normalDoc = await PDFDocument.create();
  const normalFont = await normalDoc.embedFont(StandardFonts.Helvetica);
  const normalPage = normalDoc.addPage([595.28, 841.89]);
  normalPage.drawText('Standard A4 Page', { x: 48, y: 780, size: 14, font: normalFont });

  const scanDoc = await PDFDocument.create();
  const scanFont = await scanDoc.embedFont(StandardFonts.Helvetica);
  const portraitScan = scanDoc.addPage([2480, 3508]);
  portraitScan.drawText('Oversized Phone Scan', { x: 100, y: 3300, size: 48, font: scanFont });
  const form = scanDoc.getForm();
  const tf = form.createTextField('ScanField');
  tf.addToPage(portraitScan, { x: 100, y: 3100, width: 600, height: 80 });
  tf.setText('Filled On Scan');
  form.updateFieldAppearances();
  portraitScan.node.addAnnot(scanDoc.context.register(scanDoc.context.obj({
    Type: 'Annot',
    Subtype: 'FreeText',
    Rect: [100, 2900, 900, 3050],
    Contents: PDFString.of('Annotation On Scan'),
    DA: PDFString.of('/Helv 36 Tf 0 0 0 rg'),
    F: 4,
  })));

  const landscapeScan = scanDoc.addPage([3508, 2480]);
  landscapeScan.drawText('Landscape Phone Scan', { x: 100, y: 2300, size: 48, font: scanFont });

  const rotatedScan = scanDoc.addPage([2480, 3508]);
  rotatedScan.setRotation(degrees(90));
  rotatedScan.drawText('Rotated Scan', { x: 100, y: 3300, size: 48, font: scanFont });

  const { accepted: queue } = await preparePDFs([
    new File([await normalDoc.save()], 'normal.pdf', { type: 'application/pdf' }),
    new File([await scanDoc.save()], 'phone-scan.pdf', { type: 'application/pdf' }),
  ]);

  const matchedBytes = await mergePDFs(queue, { pageSize: 'match-first' });
  const matchedPdf = await PDFDocument.load(matchedBytes);
  assert.equal(matchedPdf.getPageCount(), 4);
  const sizes = matchedPdf.getPages().map(p => [Math.round(p.getWidth()), Math.round(p.getHeight())]);
  assert.deepEqual(sizes, [
    [595, 842], // A4 portrait (copied untouched)
    [595, 842], // Portrait phone scan scaled to A4 portrait
    [842, 595], // Landscape phone scan scaled to A4 landscape
    [842, 595], // 90-deg rotated portrait scan -> visual landscape -> A4 landscape
  ]);

  // Verify text, filled form field, and FreeText annotation survived resizing
  const parsed = await pdfjs.getDocument({ data: new Uint8Array(matchedBytes), disableWorker: true }).promise;
  try {
    const p2 = await parsed.getPage(2);
    const tc = await p2.getTextContent();
    const p2Text = tc.items.filter(i => 'str' in i).map(i => i.str).join(' ');
    assert.match(p2Text, /Oversized Phone Scan/);
    assert.match(p2Text, /Filled On Scan/);
    assert.match(p2Text, /Annotation On Scan/);
  } finally {
    await parsed.destroy();
  }

  // Also verify Letter normalization
  const letterPdf = await PDFDocument.load(await mergePDFs(queue, { pageSize: 'letter' }));
  assert.deepEqual(
    letterPdf.getPages().map(p => [Math.round(p.getWidth()), Math.round(p.getHeight())]),
    [[612, 792], [612, 792], [792, 612], [792, 612]],
  );
});
