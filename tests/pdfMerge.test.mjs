import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { appendPDFsToFile, mergePDFs, preparePDFs, reorderPDFs } from '../src/utils/pdfMerge.ts';
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
