import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import {
  auditPDFPrivacy,
  DEFAULT_SANITIZE_OPTIONS,
  sanitizePDF,
} from '../src/utils/pdfSanitize.ts';

async function buildRichPrivacyFixture() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([400, 500]);
  pdf.setTitle('Confidential Strategy');
  pdf.setAuthor('Jane Doe');
  pdf.setSubject('Internal Q4');
  pdf.setKeywords(['secret', 'board']);
  pdf.setCreator('SecretApp 2.0');
  pdf.setProducer('SecretProducer');
  pdf.setCreationDate(new Date('2025-05-01T10:00:00Z'));
  pdf.setModificationDate(new Date('2025-05-02T12:00:00Z'));

  // Add a custom Info key
  const infoDict = pdf.context.lookup(pdf.context.trailerInfo.Info);
  infoDict.set(PDFName.of('CompanyInternalID'), PDFString.of('EMP-991'));

  // Add XMP metadata on catalog & page
  const xmpStream = pdf.context.register(
    pdf.context.stream('<x:xmpmeta>Hidden Author & Path</x:xmpmeta>', {
      Type: 'Metadata',
      Subtype: 'XML',
    }),
  );
  pdf.catalog.set(PDFName.of('Metadata'), xmpStream);
  const pageXmp = pdf.context.register(
    pdf.context.stream('<x:xmpmeta>Page meta</x:xmpmeta>', {
      Type: 'Metadata',
      Subtype: 'XML',
    }),
  );
  page.node.set(PDFName.of('Metadata'), pageXmp);

  // Add interactive form field (creates a /Widget annotation on page 1)
  const form = pdf.getForm();
  const textField = form.createTextField('employee_name');
  textField.setText('Jane Doe');
  textField.addToPage(page, { x: 40, y: 400, width: 160, height: 24 });

  // Add a non-widget Text comment annotation alongside the form widget
  const commentAnnot = pdf.context.register(
    pdf.context.obj({
      Type: 'Annot',
      Subtype: 'Text',
      Rect: [50, 300, 74, 324],
      Contents: PDFString.of('Internal review comment: remove before sending'),
    }),
  );
  const existingAnnots = page.node.Annots();
  if (existingAnnots) {
    existingAnnots.push(commentAnnot);
  } else {
    page.node.set(PDFName.of('Annots'), pdf.context.obj([commentAnnot]));
  }

  // Add Outlines
  const outlineRef = pdf.context.register(pdf.context.obj({ Type: 'Outlines', Count: 0 }));
  pdf.catalog.set(PDFName.of('Outlines'), outlineRef);

  // Add OpenAction, Page AA, JavaScript and EmbeddedFiles under /Names
  pdf.catalog.set(
    PDFName.of('OpenAction'),
    pdf.context.obj({ S: 'JavaScript', JS: PDFString.of('app.alert("hi")') }),
  );
  page.node.set(PDFName.of('AA'), pdf.context.obj({ O: pdf.context.obj({ S: 'JavaScript' }) }));
  const namesDict = pdf.context.register(
    pdf.context.obj({
      JavaScript: pdf.context.obj({ Names: [] }),
      EmbeddedFiles: pdf.context.obj({ Names: [] }),
    }),
  );
  pdf.catalog.set(PDFName.of('Names'), namesDict);

  return pdf.save();
}

test('auditPDFPrivacy detects Info, custom keys, dates, XMP, annotations, forms, outlines, actions, and attachments', async () => {
  const bytes = await buildRichPrivacyFixture();
  const report = await auditPDFPrivacy(bytes);

  assert.equal(report.pageCount, 1);
  assert.deepEqual(report.infoFieldsPresent, ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer']);
  assert.deepEqual(report.customInfoKeys, ['CompanyInternalID']);
  assert.equal(report.hasDates, true);
  assert.equal(report.hasXmpMetadata, true);
  assert.ok(report.xmpByteLength > 20);
  assert.equal(report.annotationCount, 1);
  assert.equal(report.hasAcroForm, true);
  assert.equal(report.formFieldCount, 1);
  assert.equal(report.hasOutlines, true);
  assert.equal(report.hasDocumentActions, true);
  assert.equal(report.hasEmbeddedFiles, true);
  assert.equal(report.totalFindings, 6);
});

test('sanitizePDF with default options strips all six privacy categories cleanly', async () => {
  const bytes = await buildRichPrivacyFixture();
  const result = await sanitizePDF(bytes, DEFAULT_SANITIZE_OPTIONS);

  assert.equal(result.before.totalFindings, 6);
  assert.equal(result.after.totalFindings, 0);
  assert.equal(result.after.pageCount, 1);
  assert.deepEqual(result.after.infoFieldsPresent, []);
  assert.deepEqual(result.after.customInfoKeys, []);
  assert.equal(result.after.hasDates, false);
  assert.equal(result.after.hasXmpMetadata, false);
  assert.equal(result.after.xmpByteLength, 0);
  assert.equal(result.after.annotationCount, 0);
  assert.equal(result.after.hasAcroForm, false);
  assert.equal(result.after.formFieldCount, 0);
  assert.equal(result.after.hasOutlines, false);
  assert.equal(result.after.hasDocumentActions, false);
  assert.equal(result.after.hasEmbeddedFiles, false);
  assert.equal(result.removedCategories.length, 6);

  const reloaded = await PDFDocument.load(result.bytes, { updateMetadata: false });
  assert.equal(reloaded.context.trailerInfo.Info, undefined);
  assert.equal(reloaded.getTitle(), undefined);
  assert.equal(reloaded.getCreationDate(), undefined);
});

test('sanitizePDF preserves form widgets when formAction is keep while still stripping comments', async () => {
  const bytes = await buildRichPrivacyFixture();
  const result = await sanitizePDF(bytes, {
    stripInfoAndDates: false,
    stripXmpMetadata: true,
    stripAnnotations: true,
    formAction: 'keep',
    stripOutlines: false,
    stripActionsAndAttachments: true,
  });

  assert.equal(result.after.annotationCount, 0);
  assert.equal(result.after.hasAcroForm, true);
  assert.equal(result.after.formFieldCount, 1);
  assert.equal(result.after.hasXmpMetadata, false);
  assert.equal(result.after.hasDocumentActions, false);
  assert.equal(result.after.hasEmbeddedFiles, false);
  assert.equal(result.after.hasOutlines, true);
  assert.ok(result.after.infoFieldsPresent.includes('Title'));

  const reloaded = await PDFDocument.load(result.bytes, { updateMetadata: false });
  assert.equal(reloaded.getForm().getTextField('employee_name').getText(), 'Jane Doe');
});

test('sanitizePDF supports removing form fields completely', async () => {
  const bytes = await buildRichPrivacyFixture();
  const result = await sanitizePDF(bytes, {
    ...DEFAULT_SANITIZE_OPTIONS,
    formAction: 'remove',
  });

  assert.equal(result.after.totalFindings, 0);
  assert.equal(result.after.hasAcroForm, false);
  assert.ok(result.removedCategories.includes('Interactive forms (removed)'));
});
