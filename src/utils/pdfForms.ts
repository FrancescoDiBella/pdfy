import {
  PDFDocument,
  PDFTextField,
  PDFCheckBox,
  PDFRadioGroup,
  PDFDropdown,
  PDFOptionList,
  StandardFonts,
  rgb,
} from 'pdf-lib';

export type FormFieldType = 'text' | 'checkbox' | 'radio' | 'dropdown' | 'optionList';

export interface FormFieldDescriptor {
  name: string;
  type: FormFieldType;
  value: string | boolean | string[];
  options: string[];
  readOnly: boolean;
  required: boolean;
  multiline: boolean;
  multiselect: boolean;
  maxLength?: number;
}

export type FormFieldValues = Record<string, string | boolean | string[]>;

export interface PDFFormInspection {
  pageCount: number;
  fields: FormFieldDescriptor[];
  unsupportedCount: number;
  hasXfa: boolean;
}

export interface ApplyFormOptions {
  flatten?: boolean;
}

export async function inspectPDFForm(bytes: Uint8Array | ArrayBuffer): Promise<PDFFormInspection> {
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  const pageCount = pdf.getPageCount();
  if (!pageCount) throw new Error('This PDF has no pages.');

  const form = pdf.getForm();
  const hasXfa = form.hasXFA();
  const fields: FormFieldDescriptor[] = [];
  let unsupportedCount = 0;

  for (const field of form.getFields()) {
    const name = field.getName();
    if (field instanceof PDFTextField) {
      fields.push({
        name,
        type: 'text',
        value: field.getText() ?? '',
        options: [],
        readOnly: field.isReadOnly(),
        required: field.isRequired(),
        multiline: field.isMultiline(),
        multiselect: false,
        maxLength: field.getMaxLength(),
      });
    } else if (field instanceof PDFCheckBox) {
      fields.push({
        name,
        type: 'checkbox',
        value: field.isChecked(),
        options: [],
        readOnly: field.isReadOnly(),
        required: field.isRequired(),
        multiline: false,
        multiselect: false,
      });
    } else if (field instanceof PDFRadioGroup) {
      fields.push({
        name,
        type: 'radio',
        value: field.getSelected() ?? '',
        options: field.getOptions(),
        readOnly: field.isReadOnly(),
        required: field.isRequired(),
        multiline: false,
        multiselect: false,
      });
    } else if (field instanceof PDFDropdown) {
      fields.push({
        name,
        type: 'dropdown',
        value: field.getSelected(),
        options: field.getOptions(),
        readOnly: field.isReadOnly(),
        required: field.isRequired(),
        multiline: false,
        multiselect: field.isMultiselect(),
      });
    } else if (field instanceof PDFOptionList) {
      fields.push({
        name,
        type: 'optionList',
        value: field.getSelected(),
        options: field.getOptions(),
        readOnly: field.isReadOnly(),
        required: field.isRequired(),
        multiline: false,
        multiselect: field.isMultiselect(),
      });
    } else {
      unsupportedCount += 1;
    }
  }

  return { pageCount, fields, unsupportedCount, hasXfa };
}

export async function applyPDFFormValues(
  bytes: Uint8Array | ArrayBuffer,
  values: FormFieldValues,
  options: ApplyFormOptions = {},
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes);
  const form = pdf.getForm();

  for (const field of form.getFields()) {
    const name = field.getName();
    if (!(name in values) || field.isReadOnly()) continue;
    const nextValue = values[name];

    if (field instanceof PDFTextField) {
      const text = typeof nextValue === 'string' ? nextValue : '';
      try {
        field.setText(text);
      } catch (err) {
        const message = err instanceof Error ? err.message : '';
        if (message.toLowerCase().includes('encode') || message.toLowerCase().includes('winansi')) {
          throw new Error(`Field "${name}" contains characters not supported by its PDF form font.`, { cause: err });
        }
        throw err;
      }
    } else if (field instanceof PDFCheckBox) {
      if (nextValue === true) field.check();
      else field.uncheck();
    } else if (field instanceof PDFRadioGroup) {
      const chosen = typeof nextValue === 'string' ? nextValue : '';
      if (!chosen) {
        field.clear();
      } else if (field.getOptions().includes(chosen)) {
        field.select(chosen);
      }
    } else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
      const allowed = new Set(field.getOptions());
      const rawList = Array.isArray(nextValue)
        ? nextValue
        : typeof nextValue === 'string' && nextValue
          ? [nextValue]
          : [];
      const filtered = rawList.filter(item => allowed.has(item));
      if (filtered.length === 0) {
        field.clear();
      } else if (field.isMultiselect()) {
        field.select(filtered);
      } else {
        field.select(filtered[0]);
      }
    }
  }

  try {
    form.updateFieldAppearances();
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message.toLowerCase().includes('encode') || message.toLowerCase().includes('winansi')) {
      throw new Error('One or more form fields contain characters unsupported by this PDF form font.', { cause: err });
    }
    const fallbackFont = await pdf.embedFont(StandardFonts.Helvetica);
    form.updateFieldAppearances(fallbackFont);
  }

  if (options.flatten) {
    form.flatten();
  }

  return await pdf.save();
}

export function extractInitialFormValues(fields: FormFieldDescriptor[]): FormFieldValues {
  const initial: FormFieldValues = {};
  for (const field of fields) {
    initial[field.name] = Array.isArray(field.value) ? [...field.value] : field.value;
  }
  return initial;
}

export async function buildSampleFillableFormBytes(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle('Workspace Membership & Request Form');
  doc.setAuthor('PDFy');
  doc.setSubject('Interactive Fillable AcroForm Sample');

  const page = doc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);

  page.drawRectangle({ x: 0, y: height - 96, width, height: 96, color: rgb(0.102, 0.098, 0.086) });
  page.drawText('WORKSPACE ACCESS REQUEST FORM', {
    x: 48,
    y: height - 52,
    size: 16,
    font: fontBold,
    color: rgb(0.965, 0.953, 0.925),
  });
  page.drawText('Interactive offline AcroForm sample · Fill fields directly or flatten for distribution', {
    x: 48,
    y: height - 74,
    size: 10,
    font: fontRegular,
    color: rgb(0.749, 0.718, 0.659),
  });

  const form = doc.getForm();

  const drawLabel = (label: string, y: number) => {
    page.drawText(label, { x: 48, y, size: 10, font: fontBold, color: rgb(0.2, 0.24, 0.34) });
  };

  drawLabel('Full Name', height - 135);
  const fullName = form.createTextField('Full Name');
  fullName.addToPage(page, { x: 48, y: height - 168, width: 240, height: 26 });
  fullName.setText('Ada Lovelace');

  page.drawText('Work Email', { x: 312, y: height - 135, size: 10, font: fontBold, color: rgb(0.2, 0.24, 0.34) });
  const email = form.createTextField('Work Email');
  email.addToPage(page, { x: 312, y: height - 168, width: 235, height: 26 });
  email.setText('ada@analytical-engine.org');

  drawLabel('Department', height - 205);
  const department = form.createDropdown('Department');
  department.addOptions(['Engineering', 'Design', 'Operations', 'Security']);
  department.addToPage(page, { x: 48, y: height - 238, width: 240, height: 26 });
  department.select('Engineering');

  page.drawText('Access Tier', { x: 312, y: height - 205, size: 10, font: fontBold, color: rgb(0.2, 0.24, 0.34) });
  const tier = form.createRadioGroup('Access Tier');
  tier.addOptionToPage('Standard', page, { x: 312, y: height - 235, width: 16, height: 16 });
  page.drawText('Standard', { x: 334, y: height - 231, size: 10, font: fontRegular, color: rgb(0.15, 0.18, 0.26) });
  tier.addOptionToPage('Admin', page, { x: 410, y: height - 235, width: 16, height: 16 });
  page.drawText('Admin', { x: 432, y: height - 231, size: 10, font: fontRegular, color: rgb(0.15, 0.18, 0.26) });
  tier.select('Standard');

  drawLabel('Project Notes', height - 275);
  const notes = form.createTextField('Project Notes');
  notes.enableMultiline();
  notes.addToPage(page, { x: 48, y: height - 372, width: 499, height: 88 });
  notes.setText('Local-first offline PDF review workspace access requested for Q4.');

  const nda = form.createCheckBox('Accept Security Policy');
  nda.addToPage(page, { x: 48, y: height - 416, width: 18, height: 18 });
  nda.check();
  page.drawText('I acknowledge the offline document handling policy.', {
    x: 74,
    y: height - 412,
    size: 10,
    font: fontRegular,
    color: rgb(0.15, 0.18, 0.26),
  });

  form.updateFieldAppearances();
  return await doc.save();
}
