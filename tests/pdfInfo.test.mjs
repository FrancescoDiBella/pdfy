import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PDFDocument, PDFName, PDFString, degrees } from 'pdf-lib';
import { readPDFInfo, writePDFInfo } from '../src/utils/pdfInfo.ts';

async function source() {
  const pdf = await PDFDocument.create();
  pdf.addPage([300, 400]).setRotation(degrees(90));
  pdf.setTitle('Original');
  pdf.setAuthor('Original author');
  pdf.setCreationDate(new Date('2020-01-02T03:04:05Z'));
  const xmp = pdf.context.register(pdf.context.stream('<metadata>Keep XMP</metadata>', { Type: 'Metadata', Subtype: 'XML' }));
  pdf.catalog.set(PDFName.of('Metadata'), xmp);
  pdf.getForm().createTextField('reference').setText('Keep form content');
  return pdf;
}

test('updates Info fields while preserving page geometry, forms, XMP, and creation date', async () => {
  const original = await source();
  const bytes = await original.save();
  const info = await readPDFInfo(bytes);
  assert.deepEqual(info.pages, [{ number: 1, width: 300, height: 400, rotation: 90 }]);
  const fields = { ...info.fields, title: 'Edited title', author: 'New author', keywords: 'one, two, , three' };
  const edited = await PDFDocument.load(await writePDFInfo(bytes, fields), { updateMetadata: false });
  assert.equal(edited.getTitle(), 'Edited title');
  assert.equal(edited.getAuthor(), 'New author');
  assert.equal(edited.getKeywords(), 'one two three');
  assert.equal(edited.getCreationDate().toISOString(), '2020-01-02T03:04:05.000Z');
  assert.equal(edited.getPage(0).getRotation().angle, 90);
  assert.equal(edited.getForm().getTextField('reference').getText(), 'Keep form content');
  assert.equal(edited.context.lookup(edited.catalog.get(PDFName.of('Metadata'))).getContentsString(), '<metadata>Keep XMP</metadata>');
});

test('clearing the displayed fields leaves input values and other metadata untouched', async () => {
  const bytes = await (await source()).save();
  const fields = (await readPDFInfo(bytes)).fields;
  const snapshot = { ...fields };
  const clearedBytes = await writePDFInfo(bytes, fields, true);
  assert.deepEqual(fields, snapshot);
  assert.ok(Object.values((await readPDFInfo(clearedBytes)).fields).every(value => value === ''));
  const cleared = await PDFDocument.load(clearedBytes, { updateMetadata: false });
  assert.equal(cleared.getCreationDate().toISOString(), '2020-01-02T03:04:05.000Z');
  assert.ok(cleared.catalog.has(PDFName.of('Metadata')));
});

test('rejects unreadable, protected, and zero-page documents before exposing a session', async () => {
  await assert.rejects(readPDFInfo(new TextEncoder().encode('not a PDF')));
  const empty = await PDFDocument.create();
  await assert.rejects(readPDFInfo(await empty.save({ addDefaultPage: false })), /Empty PDF/);
  const protectedPDF = await source();
  protectedPDF.context.trailerInfo.Encrypt = protectedPDF.context.register(protectedPDF.context.obj({ Filter: 'Standard' }));
  await assert.rejects(readPDFInfo(await protectedPDF.save()));
});

test('malformed dates do not prevent reading otherwise valid document properties', async () => {
  const pdf = await source();
  pdf.context.lookup(pdf.context.trailerInfo.Info).set(PDFName.of('CreationDate'), PDFString.of('invalid date'));
  const info = await readPDFInfo(await pdf.save());
  assert.equal(info.fields.title, 'Original');
  assert.equal(info.creationDate, 'Unavailable');
});
