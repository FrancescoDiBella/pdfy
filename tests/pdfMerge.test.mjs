import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { mergePDFs, preparePDFs, reorderPDFs } from '../src/utils/pdfMerge.ts';

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
