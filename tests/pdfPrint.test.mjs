import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PDFDocument, PDFName, PDFString, StandardFonts, degrees } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  applyColorTransformToImageData,
  buildBookletSpreads,
  composePrintPDF,
  DEFAULT_PRINT_OPTIONS,
  PAPER_DIMENSIONS_PT,
  resolveNupGrid,
  resolveSelectedPages,
  resolveSheetDimensions,
  sanitizeWinAnsi,
} from '../src/utils/pdfPrint.ts';
import { computeAppearanceMatrix } from '../src/utils/pdfAnnotationFlatten.ts';
import { buildSampleFillableFormBytes } from '../src/utils/pdfForms.ts';
import { drawEditorElements } from '../src/utils/exportEditorElements.ts';

async function extractPdfText(bytes) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableWorker: true }).promise;
  try {
    const chunks = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const tc = await page.getTextContent();
      chunks.push(tc.items.filter(item => 'str' in item).map(item => item.str).join(' '));
    }
    return chunks.join('\n');
  } finally {
    await doc.destroy();
  }
}

async function makePDF(pages) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages.length; i++) {
    const spec = pages[i];
    const page = pdf.addPage([spec.width, spec.height]);
    if (spec.rotation) page.setRotation(degrees(spec.rotation));
    page.drawText(`Page ${i + 1}`, { x: 24, y: spec.height - 40, size: 14, font });
  }
  return await pdf.save({ addDefaultPage: false });
}

test('resolveSelectedPages handles ranges, odd/even parity, and reverse order', () => {
  assert.deepEqual(resolveSelectedPages(5, { rangeMode: 'all', pageRange: '', parity: 'all', reverseOrder: false }), [0, 1, 2, 3, 4]);
  assert.deepEqual(resolveSelectedPages(5, { rangeMode: 'all', pageRange: '', parity: 'odd', reverseOrder: false }), [0, 2, 4]);
  assert.deepEqual(resolveSelectedPages(5, { rangeMode: 'all', pageRange: '', parity: 'even', reverseOrder: false }), [1, 3]);
  assert.deepEqual(resolveSelectedPages(5, { rangeMode: 'custom', pageRange: '5, 2-3', parity: 'all', reverseOrder: true }), [4, 2, 1]);
  assert.deepEqual(resolveSelectedPages(1, { rangeMode: 'all', pageRange: '', parity: 'even', reverseOrder: false }), []);
});

test('buildBookletSpreads computes saddle-stitch signatures with multiple-of-4 padding', () => {
  assert.deepEqual(buildBookletSpreads([0]), [[null, 0], [null, null]]);
  assert.deepEqual(buildBookletSpreads([0, 1, 2]), [[null, 0], [1, 2]]);
  assert.deepEqual(buildBookletSpreads([0, 1, 2, 3]), [[3, 0], [1, 2]]);
  assert.deepEqual(buildBookletSpreads([0, 1, 2, 3, 4, 5, 6, 7]), [
    [7, 0],
    [1, 6],
    [5, 2],
    [3, 4],
  ]);
});

test('resolveNupGrid and resolveSheetDimensions choose sensible sheet grids and auto orientations', () => {
  assert.deepEqual(resolveNupGrid(2, 'landscape'), { cols: 2, rows: 1 });
  assert.deepEqual(resolveNupGrid(2, 'portrait'), { cols: 1, rows: 2 });
  assert.deepEqual(resolveNupGrid(6, 'landscape'), { cols: 3, rows: 2 });
  assert.deepEqual(resolveNupGrid(9, 'portrait'), { cols: 3, rows: 3 });

  const twoUp = resolveSheetDimensions({ width: 595, height: 842 }, { paperSize: 'a4', orientation: 'auto', layout: 'nup', nup: 2 });
  assert.equal(twoUp.orientation, 'landscape');
  assert.equal(Math.round(twoUp.width), Math.round(PAPER_DIMENSIONS_PT.a4.height));

  const booklet = resolveSheetDimensions({ width: 612, height: 792 }, { paperSize: 'letter', orientation: 'auto', layout: 'booklet', nup: 2 });
  assert.equal(booklet.orientation, 'landscape');
  assert.equal(booklet.width, 792);
  assert.equal(booklet.height, 612);
});

test('composePrintPDF produces accurate sheet counts for standard, N-up, booklet, and rotated sources', async () => {
  const bytes = await makePDF([
    { width: 595, height: 842 },
    { width: 595, height: 842 },
    { width: 595, height: 842 },
    { width: 595, height: 842 },
    { width: 595, height: 842 },
  ]);

  const standard = await composePrintPDF(bytes, { ...DEFAULT_PRINT_OPTIONS });
  assert.equal(standard.sheetCount, 5);
  assert.equal((await PDFDocument.load(standard.bytes)).getPageCount(), 5);

  const twoUp = await composePrintPDF(bytes, { ...DEFAULT_PRINT_OPTIONS, layout: 'nup', nup: 2, drawBorders: true });
  assert.equal(twoUp.sheetCount, 3);
  assert.equal(twoUp.orientation, 'landscape');
  assert.equal((await PDFDocument.load(twoUp.bytes)).getPageCount(), 3);

  const fourUp = await composePrintPDF(bytes, { ...DEFAULT_PRINT_OPTIONS, layout: 'nup', nup: 4 });
  assert.equal(fourUp.sheetCount, 2);

  const booklet = await composePrintPDF(bytes, { ...DEFAULT_PRINT_OPTIONS, layout: 'booklet', drawBorders: true });
  assert.equal(booklet.sheetCount, 4);
  assert.equal((await PDFDocument.load(booklet.bytes)).getPageCount(), 4);

  const rotatedBytes = await makePDF([{ width: 400, height: 600, rotation: 90 }]);
  const rotatedPrint = await composePrintPDF(rotatedBytes, { ...DEFAULT_PRINT_OPTIONS });
  assert.equal(rotatedPrint.orientation, 'landscape');
  assert.equal(Math.round(rotatedPrint.sheetWidth), 600);
  assert.equal(Math.round(rotatedPrint.sheetHeight), 400);

  const blankPdf = await PDFDocument.create();
  blankPdf.addPage([595, 842]);
  const blankBytes = await blankPdf.save({ addDefaultPage: false });
  const blankStandard = await composePrintPDF(blankBytes, { ...DEFAULT_PRINT_OPTIONS });
  assert.equal(blankStandard.sheetCount, 1);
  const blankBooklet = await composePrintPDF(blankBytes, { ...DEFAULT_PRINT_OPTIONS, layout: 'booklet', drawBorders: true });
  assert.equal(blankBooklet.sheetCount, 2);
});

test('composePrintPDF handles unicode document titles in footer stamps and rejects empty filters', async () => {
  const bytes = await makePDF([{ width: 595, height: 842 }]);
  const stamped = await composePrintPDF(bytes, {
    ...DEFAULT_PRINT_OPTIONS,
    showHeaderFooter: true,
    documentTitle: 'Report 📄 — 2026',
    headerFooterNote: 'Confidential ✓',
  });
  assert.equal(stamped.sheetCount, 1);
  assert.equal(sanitizeWinAnsi('Report 📄'), 'Report ?');

  await assert.rejects(
    () => composePrintPDF(bytes, { ...DEFAULT_PRINT_OPTIONS, parity: 'even' }),
    /No pages match/,
  );
  await assert.rejects(
    () => composePrintPDF(bytes, { ...DEFAULT_PRINT_OPTIONS, rangeMode: 'custom', pageRange: '1-99' }),
    /Choose pages between/,
  );
});

test('applyColorTransformToImageData applies grayscale and dark-slide ink-saver cleanly', () => {
  const sample = new Uint8ClampedArray([10, 20, 30, 255, 250, 100, 50, 255]);
  const gray = new Uint8ClampedArray(sample);
  applyColorTransformToImageData(gray, 'grayscale');
  assert.equal(gray[0], gray[1]);
  assert.equal(gray[1], gray[2]);
  assert.equal(gray[3], 255);

  const inverted = new Uint8ClampedArray(sample);
  applyColorTransformToImageData(inverted, 'ink-saver');
  assert.equal(inverted[0], 255); // 255 - 10 = 245 > 238 -> snapped to pure white paper
  assert.equal(inverted[1], 235); // 255 - 20 = 235
  assert.equal(inverted[2], 225);
  assert.equal(inverted[4], 5);
});

test('computeAppearanceMatrix aligns local, page-coordinate, and rotated BBox streams to Rect', () => {
  // Local [0, 0, w, h] BBox -> translates directly to Rect origin
  const local = computeAppearanceMatrix([48, 674, 288, 700], [0, 0, 240, 26]);
  assert.deepEqual(local, [1, 0, 0, 1, 48, 674]);

  // Page-coordinate [rx1, ry1, rx2, ry2] BBox (macOS Preview / Acrobat) -> identity (no double offset)
  const pageCoords = computeAppearanceMatrix([100, 500, 250, 550], [100, 500, 250, 550]);
  assert.deepEqual(pageCoords, [1, 0, 0, 1, 0, 0]);

  // 90-degree rotated appearance Matrix -> maps rotated BBox cleanly into Rect
  const rotated = computeAppearanceMatrix([50, 100, 90, 200], [0, 0, 100, 40], [0, 1, -1, 0, 40, 0]);
  assert.deepEqual(rotated, [1, 0, 0, 1, 50, 100]);
});

test('composePrintPDF preserves unflattened AcroForm text fields, NeedAppearances fields, and PDF annotations', async () => {
  // 1. Built-in sample fillable form (unflattened)
  const sampleFormBytes = await buildSampleFillableFormBytes();
  const printedSample = await composePrintPDF(sampleFormBytes, { ...DEFAULT_PRINT_OPTIONS });
  const sampleText = await extractPdfText(printedSample.bytes);
  assert.match(sampleText, /Ada Lovelace/);
  assert.match(sampleText, /ada@analytical-engine\.org/);
  assert.match(sampleText, /Engineering/);
  assert.match(sampleText, /Local-first offline PDF review workspace/);

  // 2. Form field WITHOUT /AP (+ NeedAppearances true) + FreeText with & without /AP + Highlight + Ink + Hidden annot
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('Base Contract', { x: 50, y: 780, size: 16, font });

  const form = doc.getForm();
  const field = form.createTextField('ClientName');
  field.addToPage(page, { x: 50, y: 720, width: 220, height: 24 });
  field.setText('Mario Rossi');
  field.acroField.getWidgets()[0].dict.delete(PDFName.of('AP'));
  form.acroForm.dict.set(PDFName.of('NeedAppearances'), doc.context.obj(true));

  // FreeText annotation WITH page-coordinate BBox /AP stream
  const ftApStream = doc.context.stream('BT /F1 12 Tf 50 660 Td (Annotazione Con AP) Tj ET', {
    Type: 'XObject',
    Subtype: 'Form',
    FormType: 1,
    BBox: [50, 640, 260, 680],
    Resources: { Font: { F1: font.ref } },
  });
  const ftWithAp = doc.context.register(doc.context.obj({
    Type: 'Annot',
    Subtype: 'FreeText',
    Rect: [50, 640, 260, 680],
    AP: { N: doc.context.register(ftApStream) },
    F: 4,
  }));
  page.node.addAnnot(ftWithAp);

  // FreeText annotation WITHOUT /AP stream
  const ftNoAp = doc.context.register(doc.context.obj({
    Type: 'Annot',
    Subtype: 'FreeText',
    Rect: [50, 580, 280, 620],
    Contents: PDFString.of('Nota Senza AP'),
    DA: PDFString.of('/Helv 12 Tf 0 0 1 rg'),
    F: 4,
  }));
  page.node.addAnnot(ftNoAp);

  // Hidden FreeText annotation (F = 2) -> MUST NOT be printed
  const hiddenAnnot = doc.context.register(doc.context.obj({
    Type: 'Annot',
    Subtype: 'FreeText',
    Rect: [50, 520, 280, 560],
    Contents: PDFString.of('Hidden Secret Note'),
    DA: PDFString.of('/Helv 12 Tf 0 0 0 rg'),
    F: 2,
  }));
  page.node.addAnnot(hiddenAnnot);

  // Highlight + Ink without /AP
  page.node.addAnnot(doc.context.register(doc.context.obj({
    Type: 'Annot',
    Subtype: 'Highlight',
    Rect: [50, 775, 180, 798],
    QuadPoints: [50, 798, 180, 798, 50, 775, 180, 775],
    C: [1, 1, 0],
    CA: 0.4,
    F: 4,
  })));
  page.node.addAnnot(doc.context.register(doc.context.obj({
    Type: 'Annot',
    Subtype: 'Ink',
    Rect: [300, 500, 420, 560],
    InkList: [[305, 510, 360, 550, 415, 520]],
    C: [0.1, 0.2, 0.8],
    F: 4,
  })));

  // Second page with NO /Contents stream — ONLY a FreeText annotation
  const annotOnlyPage = doc.addPage([595, 842]);
  annotOnlyPage.node.addAnnot(doc.context.register(doc.context.obj({
    Type: 'Annot',
    Subtype: 'FreeText',
    Rect: [60, 700, 320, 740],
    Contents: PDFString.of('Only Annotation On Blank Page'),
    DA: PDFString.of('/Helv 14 Tf 0 0 0 rg'),
    F: 4,
  })));

  const rawBytes = await doc.save({ updateFieldAppearances: false });
  let fallbackCalls = 0;
  const printed = await composePrintPDF(rawBytes, { ...DEFAULT_PRINT_OPTIONS, layout: 'nup', nup: 2 }, {
    renderFallbackPage: async () => {
      fallbackCalls += 1;
      return null;
    },
  });

  // All annotations & NeedAppearances ASCII field flattened cleanly in vector -> zero raster fallback calls!
  assert.equal(fallbackCalls, 0);
  assert.equal(printed.sheetCount, 1);

  const printedText = await extractPdfText(printed.bytes);
  assert.match(printedText, /Base Contract/);
  assert.match(printedText, /Mario Rossi/);
  assert.match(printedText, /Annotazione Con AP/);
  assert.match(printedText, /Nota Senza AP/);
  assert.match(printedText, /Only Annotation On Blank Page/);
  assert.doesNotMatch(printedText, /Hidden Secret Note/);
});

test('composePrintPDF preserves combined editor text edits, annotations, and pre-existing filled forms', async () => {
  const baseBytes = await buildSampleFillableFormBytes();
  const doc = await PDFDocument.load(baseBytes);
  await drawEditorElements(
    doc,
    [
      {
        id: 'text-1',
        type: 'text',
        x: 60,
        y: 620,
        width: 260,
        height: 44,
        pageIndex: 0,
        content: 'Editor Added Annotation',
        fontSize: 16,
        fontFamily: 'Helvetica',
        strokeColor: '#111111',
      },
      {
        id: 'edit-1',
        type: 'edit-text',
        x: 64,
        y: 44,
        width: 340,
        height: 30,
        pageIndex: 0,
        content: 'UPDATED REQUEST HEADER',
        originalText: 'WORKSPACE ACCESS REQUEST FORM',
        originalPdfX: 48,
        originalPdfY: 790,
        originalPdfW: 240,
        originalPdfH: 16,
        fontSize: 16,
        fontFamily: 'Helvetica',
        fillColor: '#FFFFFF',
        strokeColor: '#111111',
      },
    ],
    async d => d.embedFont(StandardFonts.Helvetica),
  );
  const editedBytes = await doc.save();
  const printed = await composePrintPDF(editedBytes, { ...DEFAULT_PRINT_OPTIONS });
  const text = await extractPdfText(printed.bytes);
  assert.match(text, /Ada Lovelace/);
  assert.match(text, /Editor Added Annotation/);
  assert.match(text, /UPDATED REQUEST HEADER/);
});

test('composePrintPDF invokes renderFallbackPage only for pages with non-vectorizable annotations', async () => {
  const doc = await PDFDocument.create();
  const page1 = doc.addPage([400, 500]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page1.drawText('Clean Page 1', { x: 40, y: 440, size: 14, font });

  const page2 = doc.addPage([400, 500]);
  page2.drawText('Page 2 With AP-less Stamp', { x: 40, y: 440, size: 14, font });
  page2.node.addAnnot(doc.context.register(doc.context.obj({
    Type: 'Annot',
    Subtype: 'Stamp',
    Rect: [40, 300, 200, 360],
    Name: 'Approved',
    F: 4,
  })));

  const bytes = await doc.save();
  const calledFor = [];
  // Minimal valid 1x1 white PNG
  const tinyPng = Uint8Array.from(Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ));
  const printed = await composePrintPDF(bytes, { ...DEFAULT_PRINT_OPTIONS }, {
    renderFallbackPage: async pageIndex => {
      calledFor.push(pageIndex);
      return { bytes: tinyPng, mimeType: 'image/png', widthPt: 400, heightPt: 500 };
    },
  });

  assert.deepEqual(calledFor, [1]);
  assert.equal(printed.sheetCount, 2);
  const text = await extractPdfText(printed.bytes);
  assert.match(text, /Clean Page 1/);
});
