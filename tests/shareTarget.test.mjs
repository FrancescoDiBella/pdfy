import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractSharedTokenFromSearch } from '../src/utils/shareTarget.ts';

test('extractSharedTokenFromSearch extracts token and preserves unrelated query parameters', () => {
  assert.deepEqual(extractSharedTokenFromSearch(''), { token: null, cleanSearch: '' });
  assert.deepEqual(extractSharedTokenFromSearch('?foo=bar'), { token: null, cleanSearch: '?foo=bar' });
  assert.deepEqual(extractSharedTokenFromSearch('?shared=abc-123'), { token: 'abc-123', cleanSearch: '' });
  assert.deepEqual(extractSharedTokenFromSearch('?shared=abc-123&mode=read'), { token: 'abc-123', cleanSearch: '?mode=read' });
  assert.deepEqual(extractSharedTokenFromSearch('?shared=   '), { token: null, cleanSearch: '?shared=   ' });
});
