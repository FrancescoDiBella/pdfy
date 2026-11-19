import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { crc32, createZipArchive } from '../src/utils/zipArchive.ts';
import {
  buildBookmarkSplitPlan,
  buildChunkSplitPlan,
  buildSelectionSplitPlan,
  executeSplitPlan,
  formatPageRangeLabel,
  sanitizeFilenameSegment,
} from '../src/utils/pdfSplit.ts';

function parseStoreZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const entries = [];
  let cursor = 0;

  while (cursor + 4 <= bytes.length && view.getUint32(cursor, true) === 0x04034b50) {
    const flags = view.getUint16(cursor + 6, true);
    const method = view.getUint16(cursor + 8, true);
    const storedCrc = view.getUint32(cursor + 14, true);
    const compSize = view.getUint32(cursor + 18, true);
    const uncompSize = view.getUint32(cursor + 22, true);
    const nameLen = view.getUint16(cursor + 26, true);
    const extraLen = view.getUint16(cursor + 28, true);
    const name = decoder.decode(bytes.subarray(cursor + 30, cursor + 30 + nameLen));
    const dataStart = cursor + 30 + nameLen + extraLen;
    const data = bytes.subarray(dataStart, dataStart + compSize);

    assert.equal(method, 0);
    assert.equal(flags & 0x0800, 0x0800);
    assert.equal(compSize, uncompSize);
    assert.equal(storedCrc, crc32(data));

    entries.push({ name, data });
    cursor = dataStart + compSize;
  }

  // Verify central directory headers & EOCD record exist cleanly
  let cdEntries = 0;
  while (cursor + 4 <= bytes.length && view.getUint32(cursor, true) === 0x02014b50) {
    const nameLen = view.getUint16(cursor + 28, true);
    const extraLen = view.getUint16(cursor + 30, true);
    const commentLen = view.getUint16(cursor + 32, true);
    cdEntries += 1;
    cursor += 46 + nameLen + extraLen + commentLen;
  }

  assert.equal(cdEntries, entries.length);
  assert.equal(view.getUint32(cursor, true), 0x06054b50);
  assert.equal(view.getUint16(cursor + 10, true), entries.length);
  assert.equal(cursor + 22, bytes.length);

  return entries;
}

test('crc32 matches standard IEEE 802.3 test vector', () => {
  const bytes = new TextEncoder().encode('123456789');
  assert.equal(crc32(bytes), 0xcbf43926);
});

test('createZipArchive writes valid PKZIP records, deduplicates filenames, and rejects empty input', () => {
  assert.throws(() => createZipArchive([]), /empty ZIP/i);

  const a = new TextEncoder().encode('Hello PDFy A');
  const b = new TextEncoder().encode('Hello PDFy B');
  const zipBytes = createZipArchive([
    { name: 'chapter.pdf', data: a },
    { name: 'chapter.pdf', data: b },
  ]);

  const parsed = parseStoreZip(zipBytes);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].name, 'chapter.pdf');
  assert.equal(parsed[1].name, 'chapter_2.pdf');
  assert.deepEqual(Buffer.from(parsed[0].data), Buffer.from(a));
  assert.deepEqual(Buffer.from(parsed[1].data), Buffer.from(b));
});

test('buildChunkSplitPlan partitions pages into balanced chunks with clean filenames', () => {
  const plan = buildChunkSplitPlan('Annual Report 2026.pdf', 5, 2);
  assert.equal(plan.length, 3);
  assert.deepEqual(plan.map(p => p.pageIndices), [[0, 1], [2, 3], [4]]);
  assert.deepEqual(plan.map(p => p.pageRangeLabel), ['1–2', '3–4', '5']);
  assert.equal(plan[0].filename, 'Annual_Report_2026_part_01_p1-2.pdf');
  assert.equal(plan[2].filename, 'Annual_Report_2026_part_03_p5.pdf');
});

test('buildBookmarkSplitPlan handles front matter, top-level filtering, and same-page duplicates', () => {
  const outline = [
    { id: '1', title: 'Introduction / Overview', depth: 0, pageNumber: 2 },
    { id: '2', title: 'Nested sub-heading', depth: 1, pageNumber: 3 },
    { id: '3', title: 'Duplicate start page', depth: 0, pageNumber: 2 },
    { id: '4', title: 'Financials: Q4', depth: 0, pageNumber: 4 },
    { id: '5', title: 'Unresolved bookmark', depth: 0, pageNumber: null },
  ];

  const plan = buildBookmarkSplitPlan('dossier.pdf', 6, outline, 0);
  assert.equal(plan.length, 3);
  assert.equal(plan[0].label, 'Front matter');
  assert.deepEqual(plan[0].pageIndices, [0]);
  assert.equal(plan[1].label, 'Introduction / Overview');
  assert.deepEqual(plan[1].pageIndices, [1, 2]);
  assert.equal(plan[2].label, 'Financials: Q4');
  assert.deepEqual(plan[2].pageIndices, [3, 4, 5]);
  assert.equal(plan[2].filename, 'dossier_03_Financials_Q4.pdf');
});

test('executeSplitPlan + createZipArchive produces valid multi-part PDFs inside a single ZIP', async () => {
  const source = await PDFDocument.create();
  for (let i = 0; i < 4; i++) {
    source.addPage([200 + i * 20, 300]);
  }
  const sourceBytes = await source.save();

  const plan = buildChunkSplitPlan('deck.pdf', 4, 2);
  const parts = await executeSplitPlan(sourceBytes, plan);
  assert.equal(parts.length, 2);
  assert.equal(parts[0].pageCount, 2);
  assert.equal(parts[1].pageCount, 2);

  const zipBytes = createZipArchive(parts.map(part => ({ name: part.filename, data: part.bytes })));
  const extracted = parseStoreZip(zipBytes);
  assert.equal(extracted.length, 2);

  const part2Pdf = await PDFDocument.load(extracted[1].data);
  assert.equal(part2Pdf.getPageCount(), 2);
  assert.equal(part2Pdf.getPage(0).getWidth(), 240);
  assert.equal(part2Pdf.getPage(1).getWidth(), 260);
});

test('formatPageRangeLabel, sanitizeFilenameSegment, and buildSelectionSplitPlan handle edge cases', () => {
  assert.equal(formatPageRangeLabel([0, 1, 2, 4, 6, 7]), '1–3, 5, 7–8');
  assert.equal(sanitizeFilenameSegment('///???.pdf', 'fallback'), 'fallback');
  const combined = buildSelectionSplitPlan('report.pdf', [2, 0], false);
  assert.equal(combined.length, 1);
  assert.deepEqual(combined[0].pageIndices, [0, 2]);
  const separate = buildSelectionSplitPlan('report.pdf', [2, 0], true);
  assert.equal(separate.length, 2);
  assert.equal(separate[0].filename, 'report_page_1.pdf');
});
