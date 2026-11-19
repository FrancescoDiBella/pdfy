import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildCompareReport,
  buildPageCompareSummaries,
  computeLineDiff,
  computePixelDiff,
} from '../src/utils/pdfCompare.ts';

test('computeLineDiff identifies unchanged, removed, and added lines with accurate line numbers', () => {
  const diff = computeLineDiff(
    'Master Service Agreement\nMonthly Fee: $8,500\nPayment Terms: Net 30\nConfidentiality Clause',
    'Master Service Agreement\nMonthly Fee: $9,200\nPayment Terms: Net 15\nSLA Guarantee: 99.9%\nConfidentiality Clause',
  );

  assert.equal(diff.hasChanges, true);
  assert.equal(diff.unchangedCount, 2);
  assert.equal(diff.removedCount, 2);
  assert.equal(diff.addedCount, 3);
  assert.equal(diff.lines[0].kind, 'equal');
  assert.equal(diff.lines[0].lineNumberA, 1);
  assert.equal(diff.lines[0].lineNumberB, 1);
  assert.ok(diff.lines.some(l => l.kind === 'removed' && l.text === 'Monthly Fee: $8,500'));
  assert.ok(diff.lines.some(l => l.kind === 'added' && l.text === 'SLA Guarantee: 99.9%'));
});

test('computeLineDiff treats identical text as unchanged', () => {
  const diff = computeLineDiff('Line one\r\nLine two\n', 'Line one\nLine two');
  assert.equal(diff.hasChanges, false);
  assert.equal(diff.unchangedCount, 2);
  assert.equal(diff.addedCount, 0);
  assert.equal(diff.removedCount, 0);
});

test('computePixelDiff detects added vs removed ink pixels and handles mismatched dimensions', () => {
  // 2x2 white canvas A with pixel (0,0) dark ink (removed in B)
  const a = new Uint8ClampedArray([
    10, 10, 10, 255, 255, 255, 255, 255,
    255, 255, 255, 255, 255, 255, 255, 255,
  ]);
  // 3x2 white canvas B with pixel (1,0) dark ink (added in B) and extra white column
  const b = new Uint8ClampedArray([
    255, 255, 255, 255, 10, 10, 10, 255, 255, 255, 255, 255,
    255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
  ]);

  const result = computePixelDiff(a, 2, 2, b, 3, 2, 24);
  assert.equal(result.width, 3);
  assert.equal(result.height, 2);
  assert.equal(result.totalPixels, 6);
  assert.equal(result.changedPixels, 2);
  assert.equal(result.hasVisualChanges, true);
  assert.ok(Math.abs(result.changedPercent - 33.33) < 0.05);

  // Pixel (0,0) removed -> Crimson (214, 40, 40)
  assert.deepEqual(Array.from(result.diffData.slice(0, 4)), [214, 40, 40, 255]);
  // Pixel (1,0) added -> Deep Teal (13, 110, 168)
  assert.deepEqual(Array.from(result.diffData.slice(4, 8)), [13, 110, 168, 255]);
  // Pixel (2,0) unchanged white -> 255, 255, 255, 255
  assert.deepEqual(Array.from(result.diffData.slice(8, 12)), [255, 255, 255, 255]);
});

test('buildPageCompareSummaries and buildCompareReport summarize multi-page and uneven documents', () => {
  const summaries = buildPageCompareSummaries(
    ['Header\nOld Price', 'Same Clause'],
    ['Header\nNew Price', 'Same Clause', 'Added Appendix'],
  );

  assert.equal(summaries.length, 3);
  assert.equal(summaries[0].status, 'changed');
  assert.equal(summaries[1].status, 'unchanged');
  assert.equal(summaries[2].status, 'only-in-b');

  summaries[0].pixelChangedPercent = 4.25;
  const report = buildCompareReport('v1.pdf', 'v2.pdf', 2, 3, summaries);
  assert.ok(report.includes('# PDFy Comparison Report'));
  assert.ok(report.includes('**Changed pages:** 2 of 3'));
  assert.ok(report.includes('- Old Price'));
  assert.ok(report.includes('+ New Price'));
  assert.ok(report.includes('## Page 2 — Unchanged'));
  assert.ok(report.includes('## Page 3 — Only in Document B'));
});
