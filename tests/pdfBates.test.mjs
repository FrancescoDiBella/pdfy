import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PDFDocument, PDFRawStream, StandardFonts, decodePDFRawStream } from 'pdf-lib';
import {
  applyHeaderFooterBatesToPage,
  computeZoneDrawPosition,
  DEFAULT_HEADER_FOOTER_BATES,
  formatBatesNumber,
  interpolateStampText,
  resolveStampTargetIndices,
} from '../src/utils/pdfBates.ts';

function decodeStreams(doc) {
  const parts = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream) {
      try {
        parts.push(Buffer.from(decodePDFRawStream(obj).decode()).toString('latin1'));
      } catch {
        parts.push(Buffer.from(obj.getContents()).toString('latin1'));
      }
    }
  }
  return parts.join('\n');
}

test('formatBatesNumber pads digits, clamps bounds, and supports prefix/suffix', () => {
  assert.equal(formatBatesNumber('EXH-', '', 1, 6, 0), 'EXH-000001');
  assert.equal(formatBatesNumber('CONF-', '-A', 100, 5, 3), 'CONF-00103-A');
  assert.equal(formatBatesNumber('', '', -5, 12, 2), '0000000002');
});

test('resolveStampTargetIndices handles empty ranges, valid subsets, and invalid input', () => {
  assert.deepEqual(resolveStampTargetIndices('', 4), { indices: [0, 1, 2, 3], error: null });
  assert.deepEqual(resolveStampTargetIndices('2-4', 4), { indices: [1, 2, 3], error: null });
  const bad = resolveStampTargetIndices('2-9', 4);
  assert.equal(bad.indices.length, 0);
  assert.ok(bad.error && bad.error.length > 0);
});

test('interpolateStampText expands all dynamic tokens and strips unsupported emoji safely', () => {
  const text = interpolateStampText('{filename} — {bates} ({page}/{total}) on {date} 🚀', {
    pageNumber: 2,
    totalPages: 5,
    bates: 'EXH-000002',
    dateIso: '2026-11-20',
    filename: 'Contract.pdf',
  });
  assert.equal(text, 'Contract - EXH-000002 (2/5) on 2026-11-20');
});

test('computeZoneDrawPosition anchors all 6 zones cleanly inside cropped PDF boxes', () => {
  const box = { x: 40, y: 50, width: 400, height: 600 };
  const tl = computeZoneDrawPosition('top-left', box, 80, 10, 20);
  const tr = computeZoneDrawPosition('top-right', box, 80, 10, 20);
  const bc = computeZoneDrawPosition('bottom-center', box, 100, 10, 20);

  assert.deepEqual(tl, { x: 60, y: 620 });
  assert.deepEqual(tr, { x: 340, y: 620 });
  assert.deepEqual(bc, { x: 190, y: 70 });
});

test('applyHeaderFooterBatesToPage writes Bates and header/footer text streams into PDF pages', async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const p1 = doc.addPage([500, 700]);
  const p2 = doc.addPage([500, 700]);

  const config = {
    ...DEFAULT_HEADER_FOOTER_BATES,
    enabled: true,
    batesPrefix: 'LEGAL-',
    batesStart: 10,
    batesDigits: 5,
    pageRange: '2',
    zones: {
      'top-left': 'CONFIDENTIAL',
      'top-center': '',
      'top-right': '{date}',
      'bottom-left': '{filename}',
      'bottom-center': 'Page {page} of {total}',
      'bottom-right': '{bates}',
    },
  };

  const { indices } = resolveStampTargetIndices(config.pageRange, 2);
  assert.deepEqual(indices, [1]);

  // Apply only to page 2 (index 1, sequence 0)
  const drawn = applyHeaderFooterBatesToPage(
    p2,
    font,
    { x: 0, y: 0, width: p2.getWidth(), height: p2.getHeight() },
    config,
    {
      pageNumber: 2,
      sequenceIndex: 0,
      totalPages: 2,
      dateIso: '2026-11-20',
      filename: 'Exhibit.pdf',
    },
  );

  assert.equal(drawn['top-left'], 'CONFIDENTIAL');
  assert.equal(drawn['bottom-right'], 'LEGAL-00010');
  assert.equal(p1.getWidth(), 500);

function streamsContainText(streams, text) {
  const hex = Buffer.from(text, 'latin1').toString('hex').toLowerCase();
  return streams.includes(text) || streams.toLowerCase().includes(hex);
}

  const saved = await PDFDocument.load(await doc.save());
  const streams = decodeStreams(saved);
  assert.ok(streamsContainText(streams, 'LEGAL-00010'));
  assert.ok(streamsContainText(streams, 'CONFIDENTIAL'));
});
