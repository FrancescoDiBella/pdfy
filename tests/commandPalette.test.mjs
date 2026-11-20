import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterCommands,
  groupCommands,
  isCommandPaletteShortcut,
} from '../src/utils/commandPalette.ts';

const sampleCommands = [
  { id: 'tool:view', label: 'Read', subtitle: 'Open and search a PDF', category: 'Tools', keywords: ['viewer', 'find', 'search'] },
  { id: 'tool:organize', label: 'Organize', subtitle: 'Reorder, rotate, watermark, and Bates stamp pages', category: 'Tools', keywords: ['bates', 'headers', 'footers', 'watermark'] },
  { id: 'tool:convert', label: 'Convert', subtitle: 'Images to PDF and table extractor', category: 'Tools', keywords: ['csv', 'tsv', 'markdown', 'json', 'table', 'png'] },
  { id: 'tool:bookmarks', label: 'Bookmarks', subtitle: 'Edit PDF outline and table of contents', category: 'Tools', keywords: ['toc', 'outline', 'headings'] },
  { id: 'theme:dark', label: 'Switch to Dark theme', subtitle: 'Use dark colors', category: 'Appearance', keywords: ['appearance', 'night', 'dark'] },
  { id: 'action:sample', label: 'Load sample PDF', subtitle: 'Open the Executive Brief sample in Read', category: 'Quick actions', keywords: ['demo', 'example'] },
];

test('isCommandPaletteShortcut matches Ctrl+K and Cmd+K without extra modifiers', () => {
  assert.equal(isCommandPaletteShortcut({ key: 'k', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }), true);
  assert.equal(isCommandPaletteShortcut({ key: 'K', ctrlKey: false, metaKey: true, altKey: false, shiftKey: false }), true);
  assert.equal(isCommandPaletteShortcut({ key: 'k', ctrlKey: true, metaKey: false, altKey: true, shiftKey: false }), false);
  assert.equal(isCommandPaletteShortcut({ key: 'k', ctrlKey: true, metaKey: false, altKey: false, shiftKey: true }), false);
  assert.equal(isCommandPaletteShortcut({ key: 'f', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }), false);
});

test('filterCommands ranks exact labels and keyword matches ahead of subtitle matches', () => {
  assert.equal(filterCommands(sampleCommands, '').length, sampleCommands.length);

  const bates = filterCommands(sampleCommands, 'bates');
  assert.equal(bates[0]?.id, 'tool:organize');

  const csv = filterCommands(sampleCommands, 'csv');
  assert.equal(csv[0]?.id, 'tool:convert');

  const multiToken = filterCommands(sampleCommands, 'dark appearance');
  assert.deepEqual(multiToken.map(item => item.id), ['theme:dark']);

  assert.deepEqual(filterCommands(sampleCommands, 'nonexistent-xyz'), []);
});

test('groupCommands orders categories deterministically and omits empty buckets', () => {
  const groups = groupCommands(sampleCommands);
  assert.deepEqual(groups.map(group => group.category), ['Tools', 'Quick actions', 'Appearance']);
  assert.equal(groups[0].items.length, 4);

  const onlyTools = groupCommands(filterCommands(sampleCommands, 'toc'));
  assert.deepEqual(onlyTools.map(group => group.category), ['Tools']);
});
