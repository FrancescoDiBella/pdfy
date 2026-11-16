import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import {
  applyPDFFormValues,
  buildSampleFillableFormBytes,
  extractInitialFormValues,
  inspectPDFForm,
} from '../src/utils/pdfForms.ts';

test('inspectPDFForm reads text, dropdown, radio, checkbox, optionList, and read-only metadata', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 800]);
  const form = doc.getForm();

  const text = form.createTextField('applicant');
  text.addToPage(page, { x: 40, y: 700, width: 200, height: 24 });
  text.setText('Grace Hopper');
  text.enableReadOnly();

  const list = form.createOptionList('labels');
  list.addOptions(['Beta', 'Urgent', 'Private']);
  list.enableMultiselect();
  list.addToPage(page, { x: 40, y: 600, width: 160, height: 60 });
  list.select(['Beta', 'Private']);

  const btn = form.createButton('submitBtn');
  btn.addToPage('Submit', page, { x: 40, y: 540, width: 80, height: 24 });

  const bytes = await doc.save();
  const result = await inspectPDFForm(bytes);

  assert.equal(result.pageCount, 1);
  assert.equal(result.hasXfa, false);
  assert.equal(result.unsupportedCount, 1);
  assert.equal(result.fields.length, 2);

  assert.deepEqual(result.fields[0], {
    name: 'applicant',
    type: 'text',
    value: 'Grace Hopper',
    options: [],
    readOnly: true,
    required: false,
    multiline: false,
    multiselect: false,
    maxLength: undefined,
  });
  assert.deepEqual(result.fields[1].value, ['Beta', 'Private']);
  assert.equal(result.fields[1].type, 'optionList');
  assert.equal(result.fields[1].multiselect, true);
});

test('applyPDFFormValues updates sample form fields cleanly while preserving editable AcroForm', async () => {
  const sampleBytes = await buildSampleFillableFormBytes();
  const inspected = await inspectPDFForm(sampleBytes);
  assert.equal(inspected.fields.length, 6);

  const initial = extractInitialFormValues(inspected.fields);
  const updatedBytes = await applyPDFFormValues(sampleBytes, {
    ...initial,
    'Full Name': 'Katherine Johnson',
    'Work Email': 'katherine@nasa.gov',
    Department: ['Security'],
    'Access Tier': 'Admin',
    'Project Notes': 'Verified flight trajectories.',
    'Accept Security Policy': false,
  });

  const reInspected = await inspectPDFForm(updatedBytes);
  const byName = Object.fromEntries(reInspected.fields.map(field => [field.name, field.value]));

  assert.equal(byName['Full Name'], 'Katherine Johnson');
  assert.equal(byName['Work Email'], 'katherine@nasa.gov');
  assert.deepEqual(byName.Department, ['Security']);
  assert.equal(byName['Access Tier'], 'Admin');
  assert.equal(byName['Project Notes'], 'Verified flight trajectories.');
  assert.equal(byName['Accept Security Policy'], false);
});

test('applyPDFFormValues with flatten removes interactive fields permanently', async () => {
  const sampleBytes = await buildSampleFillableFormBytes();
  const inspected = await inspectPDFForm(sampleBytes);
  const initial = extractInitialFormValues(inspected.fields);

  const flattened = await applyPDFFormValues(
    sampleBytes,
    { ...initial, 'Full Name': 'Margaret Hamilton' },
    { flatten: true },
  );

  const afterFlatten = await inspectPDFForm(flattened);
  assert.equal(afterFlatten.pageCount, 1);
  assert.equal(afterFlatten.fields.length, 0);
});

test('applyPDFFormValues respects read-only fields and surfaces clear WinAnsi encoding errors', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 400]);
  const form = doc.getForm();
  const locked = form.createTextField('locked');
  locked.setText('Original');
  locked.enableReadOnly();
  locked.addToPage(page, { x: 20, y: 300, width: 150, height: 24 });

  const editable = form.createTextField('notes');
  editable.addToPage(page, { x: 20, y: 240, width: 150, height: 24 });

  const bytes = await doc.save();

  const saved = await applyPDFFormValues(bytes, { locked: 'Tampered', notes: 'Safe ASCII' });
  const reloaded = await inspectPDFForm(saved);
  assert.equal(reloaded.fields.find(f => f.name === 'locked')?.value, 'Original');
  assert.equal(reloaded.fields.find(f => f.name === 'notes')?.value, 'Safe ASCII');

  await assert.rejects(
    () => applyPDFFormValues(bytes, { notes: 'Hello 🚀' }),
    /unsupported|not supported/i,
  );
});
