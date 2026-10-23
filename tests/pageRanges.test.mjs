import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePageRange } from '../src/utils/pageRanges.ts';

test('normalizes duplicate and reversed ranges into document order', () => {
  assert.deepEqual(parsePageRange('5, 3-1, 2, 4-5', 5), [0, 1, 2, 3, 4]);
  assert.deepEqual(parsePageRange('  ', 5), []);
});

test('rejects malformed and out-of-bounds ranges before iterating', () => {
  for (const range of ['1abc', '1.5', '-1', '0', '1-', '1,', '1-2-3', '1,,3', '1-999999999999999999', '1-6']) {
    assert.throws(() => parsePageRange(range, 5), Error, range);
  }
});
