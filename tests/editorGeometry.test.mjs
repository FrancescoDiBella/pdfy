import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PDFDocument, StandardFonts, PDFArray, PDFRawStream, decodePDFRawStream, degrees } from 'pdf-lib';
import { logicalPoint, constrainBounds, transformBounds, updateGeometry, pageGeometry, editorSize, toPDFPoint, toEditorPoint, sourceTextGeometry } from '../src/utils/editorGeometry.ts';
import { drawEditorElements } from '../src/utils/exportEditorElements.ts';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
const size = { width: 794, height: 1123 };
const frame = { x: 100, y: 200, width: 120, height: 60 };

test('pointer coordinates account for rendered scale and scrolled page position', () => {
  assert.deepEqual(logicalPoint({ x: 120, y: 150 }, { x: -40, y: -50, width: 397, height: 561.5 }, size), { x: 320, y: 400 });
  assert.deepEqual(transformBounds(frame, { x: 120, y: 220 }, { x: 320, y: 400 }, size, 'move'), { ...frame, x: 300, y: 380 });
});

test('tap is a no-op even for old edge geometry; moves clamp both page boundaries', () => {
  const edge = { ...frame, x: -3 };
  assert.equal(transformBounds(edge, { x: 0, y: 0 }, { x: 0, y: 0 }, size, 'move'), edge);
  assert.deepEqual(transformBounds(frame, { x: 0, y: 0 }, { x: -1000, y: 5000 }, size, 'move'), { ...frame, x: 0, y: 1063 });
  assert.deepEqual(constrainBounds({ x: 900, y: -1, width: 900, height: 1 }, size), { x: 0, y: 0, width: 794, height: 10 });
});

test('resizing clamps extents and keeps image ratio including minimum dimensions', () => {
  assert.deepEqual(transformBounds(frame, { x: 0, y: 0 }, { x: 2000, y: -500 }, size, 'resize'), { ...frame, width: 694, height: 10 });
  const image = transformBounds(frame, { x: 0, y: 0 }, { x: 1200, y: 600 }, size, 'resize', true);
  close(image.width / image.height, 2); close(image.x + image.width, 794);
  const small = updateGeometry({ ...frame, id: 'photo', type: 'image' }, { width: 0 }, size);
  assert.ok(small.height >= 10); close(small.width / small.height, 2);
  const height = updateGeometry({ ...frame, id: 'photo', type: 'image' }, { height: 100 }, size);
  assert.equal(height.height, 100); assert.equal(height.width, 200);
});

test('freehand resize scales relative points and keeps metadata without mutating history', () => {
  const original = { ...frame, id: 'ink', type: 'draw', points: [{ x: 0, y: 10 }, { x: 120, y: 60 }], strokeWidth: 3 };
  const next = updateGeometry(original, { width: 240, height: 120 }, size);
  assert.deepEqual(next.points, [{ x: 0, y: 20 }, { x: 240, y: 120 }]);
  assert.deepEqual(original.points, [{ x: 0, y: 10 }, { x: 120, y: 60 }]);
  assert.equal(next.strokeWidth, 3);
});

const expected = { 0: [90, 560], 90: [40 + 400 / 6, 60 + 600 / 8], 180: [390, 160], 270: [40 + 400 * 5 / 6, 60 + 600 * 7 / 8] };
for (const rotation of [0, 90, 180, 270]) {
  test(`PDF crop/rotation ${rotation} uses the same visual coordinate system for edits and export`, async () => {
    const pdf = await PDFDocument.create(); const page = pdf.addPage([500, 700]);
    page.setCropBox(40, 60, 400, 600); page.setRotation(degrees(rotation));
    const geometry = pageGeometry(page); const editor = editorSize(geometry);
    const point = toPDFPoint({ x: editor.width / 8, y: editor.height / 6 }, geometry);
    close(point.x, expected[rotation][0]); close(point.y, expected[rotation][1]);
    const returned = toEditorPoint(point, geometry); close(returned.x, editor.width / 8); close(returned.y, editor.height / 6);
    const item = { transform: [18, 0, 0, 18, 100, 200], width: 90, height: 18 };
    const text = sourceTextGeometry(item, geometry); assert.ok(text);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    await drawEditorElements(pdf, [{ id: 'source', type: 'edit-text', ...text, content: 'Edited', originalPdfX: 100, originalPdfY: 200, originalPdfW: 90, originalPdfH: 18, originalPdfAngle: 0 }], async () => font);
    const output = await PDFDocument.load(await pdf.save());
    assert.deepEqual(output.getPage(0).getCropBox(), { x: 40, y: 60, width: 400, height: 600 });
    assert.equal(output.getPage(0).getRotation().angle, rotation);
    const contents = output.getPage(0).node.Contents();
    const references = contents instanceof PDFArray ? contents.asArray() : [contents];
    const operators = references.map(reference => Buffer.from(decodePDFRawStream(output.context.lookup(reference, PDFRawStream)).decode()).toString()).join('\n');
    const matrix = [...operators.matchAll(/([-\d.eE]+) ([-\d.eE]+) ([-\d.eE]+) ([-\d.eE]+) ([-\d.eE]+) ([-\d.eE]+) Tm/g)][0].slice(1).map(Number);
    [1, 0, 0, 1, 100, 200].forEach((value, index) => close(matrix[index], value));
  });
}

test('skewed or unsupported diagonal source text is rejected without changing the document', () => {
  const geometry = { x: 0, y: 0, width: 300, height: 400, rotation: 0 };
  assert.equal(sourceTextGeometry({ transform: [18, 0, 5, 18, 50, 100], width: 90, height: 18 }, geometry), null);
  assert.equal(sourceTextGeometry({ transform: [12, 12, -12, 12, 50, 100], width: 90, height: 18 }, geometry), null);
});


test('source masks stay at the original location and are drawn before every edited overlay', async () => {
  const pdf = await PDFDocument.create(); const page = pdf.addPage([500, 700]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const edit = { id: 'one', type: 'edit-text', x: 200, y: 200, width: 150, height: 30, fontSize: 18, content: 'Moved', originalPdfX: 100, originalPdfY: 200, originalPdfW: 90, originalPdfH: 18, originalPdfAngle: 0 };
  await drawEditorElements(pdf, [edit, { ...edit, id: 'two', x: 300, y: 300, content: 'Copy' }], async () => font);
  const operators = Buffer.from(page.getContentStream().getUnencodedContents()).toString();
  const firstText = operators.indexOf(' Tm');
  assert.ok(firstText > 0);
  const masks = [...operators.matchAll(/100 195\.5 cm/g)].map(match => match.index);
  assert.equal(masks.length, 2);
  assert.ok(masks.every(index => index < firstText), 'every source mask must be painted before the first text overlay');
  assert.equal(operators.slice(firstText).includes('100 195.5 cm'), false);
});

test('small original text keeps its native baseline at every page rotation', async () => {
  for (const rotation of [0, 90, 180, 270]) {
    const pdf = await PDFDocument.create(); const page = pdf.addPage([500, 700]); page.setRotation(degrees(rotation));
    const geometry = pageGeometry(page); const font = await pdf.embedFont(StandardFonts.Helvetica);
    const text = sourceTextGeometry({ transform: [4, 0, 0, 4, 100, 200], width: 20, height: 4 }, geometry);
    assert.ok(text);
    await drawEditorElements(pdf, [{ id: 'tiny', type: 'edit-text', ...text, content: 'A' }], async () => font);
    const operators = Buffer.from(page.getContentStream().getUnencodedContents()).toString();
    const matrix = [...operators.matchAll(/([-\d.eE]+) ([-\d.eE]+) ([-\d.eE]+) ([-\d.eE]+) ([-\d.eE]+) ([-\d.eE]+) Tm/g)][0].slice(1).map(Number);
    [1, 0, 0, 1, 100, 200].forEach((value, index) => close(matrix[index], value));
  }
});


test('long unbroken text wraps inside a tall frame without truncating its suffix', async () => {
  const pdf = await PDFDocument.create(); pdf.addPage([595, 842]); const font = await pdf.embedFont(StandardFonts.Helvetica);
  const content = 'https://example.com/averylongunbrokenidentifier012345678901234567890123456789012345678901234567890123456789';
  await drawEditorElements(pdf, [{ id: 'url', type: 'text', x: 20, y: 20, width: 220, height: 200, fontSize: 16, content }], async () => font);
  const operators = Buffer.from(pdf.getPage(0).getContentStream().getUnencodedContents()).toString();
  const lines = [...operators.matchAll(/<([0-9A-F]+)> Tj/gi)].map(match => Buffer.from(match[1], 'hex').toString('latin1'));
  assert.ok(lines.length > 1);
  assert.equal(lines.join(''), content);
  assert.ok(4 + 16 + (lines.length - 1) * 16 * 1.2 <= 200, 'the frame must be tall enough for every exported line');
});

test('unsupported annotation characters reject export instead of silently replacing content', async () => {
  const pdf = await PDFDocument.create(); pdf.addPage([595, 842]); const font = await pdf.embedFont(StandardFonts.Helvetica);
  await assert.rejects(drawEditorElements(pdf, [{ id: 'unicode', type: 'text', x: 20, y: 20, width: 220, height: 200, content: 'Unencoded 🧪' }], async () => font), /cannot encode/);
});
