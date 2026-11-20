import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPageSpreads,
  computePageRenderWidth,
  computeScrollProgress,
} from '../src/utils/pdfReaderLayout.ts';

test('buildPageSpreads pairs facing pages with solo cover and handles single-page and edge counts', () => {
  assert.deepEqual(buildPageSpreads(0, 'spread'), []);
  assert.deepEqual(buildPageSpreads(1, 'spread'), [[1]]);
  assert.deepEqual(buildPageSpreads(4, 'single'), [[1], [2], [3], [4]]);
  assert.deepEqual(buildPageSpreads(4, 'spread', true), [[1], [2, 3], [4]]);
  assert.deepEqual(buildPageSpreads(5, 'spread', true), [[1], [2, 3], [4, 5]]);
  assert.deepEqual(buildPageSpreads(4, 'spread', false), [[1, 2], [3, 4]]);
});

test('computePageRenderWidth sizes single and facing pages safely within bounds', () => {
  assert.equal(computePageRenderWidth(800, 1, 1), 800);
  assert.equal(computePageRenderWidth(1400, 1, 1), 900);
  assert.equal(computePageRenderWidth(800, 1, 2), 372);
  assert.equal(computePageRenderWidth(1400, 1.25, 2), 650);
  assert.equal(computePageRenderWidth(260, 1, 2), 140);
});

test('computeScrollProgress clamps scroll ratios between 0 and 1 safely', () => {
  assert.equal(computeScrollProgress(0, 500, 500), 0);
  assert.equal(computeScrollProgress(0, 1500, 500), 0);
  assert.equal(computeScrollProgress(500, 1500, 500), 0.5);
  assert.equal(computeScrollProgress(1000, 1500, 500), 1);
  assert.equal(computeScrollProgress(1400, 1500, 500), 1);
  assert.equal(computeScrollProgress(-40, 1500, 500), 0);
});
