import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PDFDocument,
  PDFRawStream,
  StandardFonts,
  decodePDFRawStream,
  degrees,
} from 'pdf-lib';
import {
  assembleBurnedInRedactions,
  getRedactedPageIndices,
} from '../src/utils/pdfRedaction.ts';
import {
  DEFAULT_DOCUMENT_CROP,
  applyPageMarginCrop,
  computeCroppedBox,
  computePreviewClipInset,
  formatCropSummary,
  resolveCropMarginsPct,
  resolveEffectivePageCrop,
} from '../src/utils/pdfOrganize.ts';

// Minimal valid 1x1 solid black PNG for deterministic Node-only tests
const ONE_PX_BLACK_PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC',
    'base64',
  ),
);

function extractAllDecodedStreams(pdfDoc) {
  const chunks = [];
  for (const [, obj] of pdfDoc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream) {
      try {
        chunks.push(Buffer.from(decodePDFRawStream(obj).decode()).toString('latin1'));
      } catch {
        chunks.push(Buffer.from(obj.getContents()).toString('latin1'));
      }
    }
  }
  return chunks.join('\n');
}

function streamsContainText(decodedStreams, text) {
  const hex = Buffer.from(text, 'latin1').toString('hex').toLowerCase();
  return decodedStreams.includes(text) || decodedStreams.toLowerCase().includes(hex);
}

const closeRect = (actual, expected) => {
  for (const key of ['x', 'y', 'width', 'height']) {
    assert.ok(
      Math.abs(actual[key] - expected[key]) < 1e-4,
      `Expected ${key}=${expected[key]}, got ${actual[key]}`,
    );
  }
};

test('getRedactedPageIndices deduplicates, sorts, and filters to redact elements within page bounds', () => {
  const elements = [
    { type: 'text', pageIndex: 0 },
    { type: 'redact', pageIndex: 2 },
    { type: 'highlight', pageIndex: 1 },
    { type: 'redact' }, // defaults to page 0
    { type: 'redact', pageIndex: 2 },
    { type: 'redact', pageIndex: 9 }, // out of bounds
    { type: 'redact', pageIndex: -1 },
  ];
  assert.deepEqual(getRedactedPageIndices(elements, 4), [0, 2]);
  assert.deepEqual(getRedactedPageIndices([{ type: 'rect', pageIndex: 0 }], 3), []);
});

test('assembleBurnedInRedactions strips redacted-page text streams while keeping untouched pages vectorized', async () => {
  const src = await PDFDocument.create();
  src.setTitle('Redaction Audit Packet');
  src.setAuthor('Security Team');
  src.setKeywords(['confidential', 'redacted']);
  const font = await src.embedFont(StandardFonts.Helvetica);

  const p1 = src.addPage([400, 600]);
  p1.drawText('SECRET-SSN-999-88-7777', { x: 40, y: 500, size: 16, font });

  const p2 = src.addPage([420, 640]);
  p2.setCropBox(10, 20, 400, 600);
  p2.drawText('PUBLIC-VECTOR-SUMMARY-PAGE-2', { x: 40, y: 500, size: 16, font });

  const editedBytes = await src.save({ useObjectStreams: false });

  // Confirm baseline contains both text strings before burn-in
  const beforeDoc = await PDFDocument.load(editedBytes);
  const beforeStreams = extractAllDecodedStreams(beforeDoc);
  assert.ok(streamsContainText(beforeStreams, 'SECRET-SSN-999-88-7777'));
  assert.ok(streamsContainText(beforeStreams, 'PUBLIC-VECTOR-SUMMARY-PAGE-2'));

  // Empty redaction list is a fast no-op
  let renderCalls = 0;
  const untouched = await assembleBurnedInRedactions(editedBytes, [], async () => {
    renderCalls++;
    throw new Error('Should not rasterize when no pages are redacted');
  });
  assert.equal(untouched, editedBytes);
  assert.equal(renderCalls, 0);

  // Burn in page 0 only
  const renderedIndices = [];
  const burnedBytes = await assembleBurnedInRedactions(editedBytes, [0], async pageIndex => {
    renderedIndices.push(pageIndex);
    return {
      mimeType: 'image/png',
      bytes: ONE_PX_BLACK_PNG,
      widthPt: 400,
      heightPt: 600,
    };
  });

  assert.deepEqual(renderedIndices, [0]);
  const outDoc = await PDFDocument.load(burnedBytes);
  assert.equal(outDoc.getPageCount(), 2);
  assert.equal(outDoc.getTitle(), 'Redaction Audit Packet');
  assert.equal(outDoc.getAuthor(), 'Security Team');

  const afterStreams = extractAllDecodedStreams(outDoc);
  assert.equal(
    streamsContainText(afterStreams, 'SECRET-SSN-999-88-7777'),
    false,
    'Redacted page text stream must be completely absent from all indirect objects',
  );
  assert.equal(
    streamsContainText(afterStreams, 'PUBLIC-VECTOR-SUMMARY-PAGE-2'),
    true,
    'Unredacted page vector text stream must remain intact',
  );
  closeRect(outDoc.getPage(1).getCropBox(), { x: 10, y: 20, width: 400, height: 600 });
});

test('margin crop presets, per-page overrides, and rotation-aware CropBox adjustments compute exact PDF rects', async () => {
  assert.deepEqual(resolveCropMarginsPct(DEFAULT_DOCUMENT_CROP), { top: 0, right: 0, bottom: 0, left: 0 });
  assert.deepEqual(resolveCropMarginsPct({ preset: 'trim-4', margins: { top: 0, right: 0, bottom: 0, left: 0 } }), {
    top: 4,
    right: 4,
    bottom: 4,
    left: 4,
  });
  assert.deepEqual(resolveCropMarginsPct({ preset: 'trim-8', margins: { top: 0, right: 0, bottom: 0, left: 0 } }), {
    top: 8,
    right: 8,
    bottom: 8,
    left: 8,
  });
  assert.deepEqual(
    resolveCropMarginsPct({ preset: 'custom', margins: { top: 12, right: 95, bottom: -5, left: 6.5 } }),
    { top: 12, right: 40, bottom: 0, left: 6.5 },
  );

  const docDefault = { preset: 'trim-4', margins: { top: 5, right: 5, bottom: 5, left: 5 } };
  const override = { preset: 'custom', margins: { top: 10, right: 15, bottom: 20, left: 5 } };
  assert.equal(resolveEffectivePageCrop({ crop: undefined }, docDefault), docDefault);
  assert.equal(resolveEffectivePageCrop({ crop: override }, docDefault), override);
  assert.equal(formatCropSummary(docDefault), 'Trim 4%');
  assert.equal(formatCropSummary(override), 'Custom crop');

  // Rotation-aware CropBox mapping on an already-offset base box
  const base = { x: 40, y: 60, width: 400, height: 600 };
  const asym = { top: 10, right: 20, bottom: 30, left: 5 };

  // 0 deg: left->+x (5%*400=20), right->-w (20%), bottom->+y (30%*600=180), top->-h (10%)
  closeRect(computeCroppedBox(base, 0, asym), { x: 60, y: 240, width: 300, height: 360 });
  // 90 deg CW: visual top->pdfLeft (10%*400=40), visual bottom->pdfRight (30%), visual left->pdfBottom (5%*600=30), visual right->pdfTop (20%)
  closeRect(computeCroppedBox(base, 90, asym), { x: 80, y: 90, width: 240, height: 450 });
  // 180 deg: visual right->pdfLeft (20%*400=80), visual left->pdfRight (5%), visual top->pdfBottom (10%*600=60), visual bottom->pdfTop (30%)
  closeRect(computeCroppedBox(base, 180, asym), { x: 120, y: 120, width: 300, height: 360 });
  // 270 deg CW: visual bottom->pdfLeft (30%*400=120), visual top->pdfRight (10%), visual right->pdfBottom (20%*600=120), visual left->pdfTop (5%)
  closeRect(computeCroppedBox(base, 270, asym), { x: 160, y: 180, width: 240, height: 450 });

  // End-to-end pdf-lib PDFPage CropBox application
  const pdf = await PDFDocument.create();
  const page1 = pdf.addPage([500, 800]);
  const page2 = pdf.addPage([500, 800]);
  page2.setCropBox(50, 100, 400, 600);
  page2.setRotation(degrees(90));

  // Original leaves existing CropBox untouched
  applyPageMarginCrop(page2, DEFAULT_DOCUMENT_CROP);
  closeRect(page2.getCropBox(), { x: 50, y: 100, width: 400, height: 600 });

  // Trim 8% on page1 (500x800)
  applyPageMarginCrop(page1, { preset: 'trim-8', margins: { top: 0, right: 0, bottom: 0, left: 0 } });
  closeRect(page1.getCropBox(), { x: 40, y: 64, width: 420, height: 672 });

  // Preview clip-path insets account for extra Organizer rotation
  assert.equal(computePreviewClipInset(0, { top: 0, right: 0, bottom: 0, left: 0 }), undefined);
  assert.equal(computePreviewClipInset(0, asym), 'inset(10% 20% 30% 5%)');
  assert.equal(computePreviewClipInset(90, asym), 'inset(20% 30% 5% 10%)');
});
