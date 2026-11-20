import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PDFDocument, PDFName } from 'pdf-lib';
import {
  buildBookmarkTree,
  detectHeadingsFromTextItems,
  indentBookmark,
  moveBookmark,
  normalizeBookmarkDepths,
  outdentBookmark,
  readPDFBookmarks,
  writePDFBookmarks,
} from '../src/utils/pdfBookmarks.ts';

test('normalizeBookmarkDepths, indent, outdent, and move maintain valid tree hierarchy', () => {
  const initial = [
    { id: '1', title: 'Chapter 1', pageNumber: 1, depth: 2 },
    { id: '2', title: 'Section 1.1', pageNumber: 2, depth: 3 },
    { id: '3', title: 'Chapter 2', pageNumber: 4, depth: 0 },
  ];

  const normalized = normalizeBookmarkDepths(initial);
  assert.deepEqual(normalized.map(b => b.depth), [0, 1, 0]);

  const indented = indentBookmark(normalized, 2);
  assert.deepEqual(indented.map(b => b.depth), [0, 1, 1]);

  const outdented = outdentBookmark(indented, 2);
  assert.deepEqual(outdented.map(b => b.depth), [0, 1, 0]);

  const moved = moveBookmark(outdented, 1, -1);
  assert.deepEqual(moved.map(b => b.id), ['2', '1', '3']);
  // First item can never have depth > 0
  assert.equal(moved[0].depth, 0);

  const tree = buildBookmarkTree(outdented);
  assert.equal(tree.length, 2);
  assert.equal(tree[0].title, 'Chapter 1');
  assert.equal(tree[0].children.length, 1);
  assert.equal(tree[0].children[0].title, 'Section 1.1');
});

test('detectHeadingsFromTextItems extracts multi-level headings using font-size hierarchy', () => {
  const detected = detectHeadingsFromTextItems([
    {
      pageNumber: 1,
      items: [
        { str: '1. Executive Summary', transform: [20, 0, 0, 20, 48, 760], hasEOL: true },
        { str: 'This is a regular body paragraph explaining client-side processing.', transform: [11, 0, 0, 11, 48, 720], hasEOL: true },
        { str: '1.1 Security Architecture', transform: [15, 0, 0, 15, 48, 680], hasEOL: true },
        { str: 'More body copy describing sandboxed execution inside the browser.', transform: [11, 0, 0, 11, 48, 650], hasEOL: true },
        { str: 'Page 1 / 2', transform: [14, 0, 0, 14, 450, 40], hasEOL: true },
      ],
    },
    {
      pageNumber: 2,
      items: [
        { str: '2. Operational Benchmarks', transform: [20, 0, 0, 20, 48, 760], hasEOL: true },
        { str: 'Detailed benchmark numbers appear in the section below.', transform: [11, 0, 0, 11, 48, 720], hasEOL: true },
      ],
    },
  ]);

  assert.equal(detected.length, 3);
  assert.deepEqual(
    detected.map(item => ({ title: item.title, pageNumber: item.pageNumber, depth: item.depth })),
    [
      { title: '1. Executive Summary', pageNumber: 1, depth: 0 },
      { title: '1.1 Security Architecture', pageNumber: 1, depth: 1 },
      { title: '2. Operational Benchmarks', pageNumber: 2, depth: 0 },
    ],
  );
});

test('writePDFBookmarks writes a nested /Outlines tree that round-trips cleanly and clears when empty', async () => {
  const source = await PDFDocument.create();
  for (let i = 0; i < 4; i++) source.addPage([400, 600]);
  const sourceBytes = await source.save();

  const written = await writePDFBookmarks(sourceBytes, [
    { id: '1', title: 'Introduction', pageNumber: 1, depth: 0 },
    { id: '2', title: 'Key Findings', pageNumber: 2, depth: 1 },
    { id: '3', title: 'Appendix — Unicode café', pageNumber: 4, depth: 0 },
  ]);

  const roundTripped = await readPDFBookmarks(written);
  assert.deepEqual(
    roundTripped.map(b => ({ title: b.title, pageNumber: b.pageNumber, depth: b.depth })),
    [
      { title: 'Introduction', pageNumber: 1, depth: 0 },
      { title: 'Key Findings', pageNumber: 2, depth: 1 },
      { title: 'Appendix — Unicode café', pageNumber: 4, depth: 0 },
    ],
  );

  const reloaded = await PDFDocument.load(written, { updateMetadata: false });
  assert.equal(reloaded.catalog.get(PDFName.of('PageMode'))?.toString(), '/UseOutlines');

  const cleared = await writePDFBookmarks(written, []);
  const clearedDoc = await PDFDocument.load(cleared, { updateMetadata: false });
  assert.equal(clearedDoc.catalog.has(PDFName.of('Outlines')), false);
  assert.deepEqual(await readPDFBookmarks(cleared), []);
});
