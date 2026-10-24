import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reduceEditorHistory } from '../src/utils/editorHistory.ts';

test('successive text/geometry edits undo and redo without losing the current entry', () => {
  let state = { entries: [[]], index: 0 };
  state = reduceEditorHistory(state, { type: 'push', value: [{ text: 'First', x: 40 }] });
  state = reduceEditorHistory(state, { type: 'push', value: current => current.map(item => ({ ...item, text: 'Second' })) });
  state = reduceEditorHistory(state, { type: 'push', value: current => current.map(item => ({ ...item, x: 50 })) });
  const unchanged = state;
  state = reduceEditorHistory(state, { type: 'undo' });
  assert.deepEqual(state.entries[state.index], [{ text: 'Second', x: 40 }]);
  state = reduceEditorHistory(state, { type: 'redo' });
  assert.deepEqual(state.entries[state.index], [{ text: 'Second', x: 50 }]);
  assert.equal(unchanged.index, 3);
});

test('editing after undo discards redo, while structural resets cannot restore deleted-page items', () => {
  let state = { entries: [[], [{ page: 0 }], [{ page: 0 }, { page: 1 }]], index: 2 };
  state = reduceEditorHistory(state, { type: 'undo' });
  state = reduceEditorHistory(state, { type: 'push', value: [{ page: 0, text: 'New branch' }] });
  assert.equal(reduceEditorHistory(state, { type: 'redo' }), state);
  state = reduceEditorHistory(state, { type: 'reset', value: [{ page: 0, text: 'Kept page' }] });
  assert.equal(reduceEditorHistory(state, { type: 'undo' }), state);
  assert.deepEqual(state.entries[state.index], [{ page: 0, text: 'Kept page' }]);
});
