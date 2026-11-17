import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildDocumentPlainText,
  flattenOutlineItems,
  normalizePageTextItems,
  searchDocumentPages,
} from '../src/utils/pdfTextSearch.ts';

test('normalizePageTextItems groups lines across Y shifts and EOL markers', () => {
  const text = normalizePageTextItems([
    { str: 'Executive', transform: [1, 0, 0, 1, 50, 760] },
    { str: 'Summary', transform: [1, 0, 0, 1, 110, 760], hasEOL: true },
    { str: 'Quarterly', transform: [1, 0, 0, 1, 50, 730] },
    { str: 'Revenue', transform: [1, 0, 0, 1, 105, 730] },
  ]);
  assert.equal(text, 'Executive Summary\nQuarterly Revenue');
});

test('buildDocumentPlainText formats multi-page sections cleanly', () => {
  const output = buildDocumentPlainText([
    { pageNumber: 1, text: 'First page body' },
    { pageNumber: 2, text: 'Second page body' },
  ]);
  assert.equal(output, '--- Page 1 ---\nFirst page body\n\n--- Page 2 ---\nSecond page body');
  assert.equal(buildDocumentPlainText([]), '');
});

test('searchDocumentPages finds case-insensitive matches across pages with snippets', () => {
  const pages = [
    { pageNumber: 1, text: 'PDFy runs locally. Every PDF stays offline on your device.' },
    { pageNumber: 2, text: 'Second page also mentions pdf tooling without uploads.' },
  ];
  assert.deepEqual(searchDocumentPages(pages, '   '), []);

  const matches = searchDocumentPages(pages, 'pdf');
  assert.equal(matches.length, 3);
  assert.equal(matches[0].pageNumber, 1);
  assert.equal(matches[0].matchIndexInPage, 0);
  assert.equal(matches[0].matchText, 'PDF');
  assert.equal(matches[1].pageNumber, 1);
  assert.equal(matches[1].matchIndexInPage, 1);
  assert.equal(matches[2].pageNumber, 2);
  assert.equal(matches[2].matchIndexInPage, 0);
  assert.equal(matches[2].matchText, 'pdf');
  assert.ok(matches[2].snippetSuffix.includes('tooling'));
});

test('flattenOutlineItems resolves nested bookmarks and tolerates failing destinations', async () => {
  const tree = [
    {
      title: 'Chapter 1',
      dest: 'chap-1',
      items: [
        { title: 'Section 1.1', dest: 'sec-1-1', items: [] },
        { title: 'Broken link', dest: 'bad', items: [] },
      ],
    },
    { title: '', dest: null, items: [] },
  ];

  const entries = await flattenOutlineItems(tree, async dest => {
    if (dest === 'chap-1') return 1;
    if (dest === 'sec-1-1') return 3;
    throw new Error('Unknown destination');
  });

  assert.equal(entries.length, 4);
  assert.deepEqual(
    entries.map(({ title, depth, pageNumber }) => ({ title, depth, pageNumber })),
    [
      { title: 'Chapter 1', depth: 0, pageNumber: 1 },
      { title: 'Section 1.1', depth: 1, pageNumber: 3 },
      { title: 'Broken link', depth: 1, pageNumber: null },
      { title: 'Untitled section', depth: 0, pageNumber: null },
    ],
  );
});
