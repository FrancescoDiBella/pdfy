# Forms Filler Feature Overview

## What Was Added

PDFy now includes an offline **Forms** workspace ([`src/components/PDFForms.tsx`](../src/components/PDFForms.tsx)) backed by [`src/utils/pdfForms.ts`](../src/utils/pdfForms.ts):

- **Automatic AcroForm Inspection**: Detects `PDFTextField` (single-line, multiline, max-length), `PDFCheckBox`, `PDFRadioGroup`, `PDFDropdown`, and `PDFOptionList` (single or multi-select), along with `Required` / `Read-only` states and non-fillable widget counts.
- **Live Form Preview**: Debounced appearance stream regeneration via `form.updateFieldAppearances()` displays typed values, checked boxes, and radio/dropdown selections on the PDF pages in real time.
- **Editable vs. Flattened Export**: Download with interactive form fields preserved (`filled_<name>.pdf`), or toggle **Flatten fields on download** to permanently bake field values into page content (`flattened_<name>.pdf`).
- **Direct Cross-Tool Handoffs**: Send completed forms directly to **Print** (`Print…`) or redirect flat/non-fillable PDFs straight into **Edit**.
- **Built-in Sample Form**: `Workspace_Access_Request_Form.pdf` (`application-form` template in `src/utils/pdfSamples.ts`) exercises every supported field type offline.
