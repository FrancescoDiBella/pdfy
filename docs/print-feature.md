# Print feature guide

Tracked under [#18](https://github.com/FrancescoDiBella/pdfy/issues/18).

## Browser & OS printer architecture

Web applications cannot enumerate or silently dispatch jobs to operating-system printers without user interaction; browsers expose local, network, AirPrint, Mopria, and virtual PDF printers through the native system print dialog (`window.print()`).

Printing PDFy's interactive workspace DOM directly produces unusable output (navigation sidebars, scroll containers, dark-mode surfaces, and lazy-rendered pages). To deliver crisp, predictable printing while staying 100% client-side and offline-capable:

1. **Client-side sheet composition (`src/utils/pdfPrint.ts`)**: `composePrintPDF` uses `pdf-lib` to apply page ranges, odd/even subsets, reverse order, N-up grids (2/4/6/9 pages per sheet), 2-up saddle-stitch booklet imposition, paper sizes, orientation, margins, scaling, cut borders, and footer stamps into a single print-ready PDF.
2. **Isolated OS print rendering (`src/utils/pdfPrintSheetRenderer.ts` + `@media print` in `src/index.css`)**: When the user selects **Print with OS printer…**, each composed sheet is rendered via `pdfjs-dist` (using locally precached CMaps/fonts/WASM), optionally transformed for **Grayscale** or **Invert dark slides**, mounted into `#pdfy-print-root` with an exact `@page` rule, handed to `window.print()`, and cleaned up on `afterprint`.
3. **Print-ready PDF fallback**: **Download print-ready PDF** exports the exact composed output (vector when using original colors, or filtered high-DPI sheets when using grayscale/ink-saver) for external printing or sharing.

## Entry points

- **Print** tool in the main workspace navigation (`src/App.tsx`).
- **Read** (`src/components/PDFViewer.tsx`): **Print** button sends the active document to Print.
- **Edit** (`src/components/AdvancedEditor.tsx` & `TopNavigationBar.tsx`): **Document actions → Print PDF…** compiles unsaved annotations, drawings, text edits, and signatures directly into a Print session.
- **Organize** (`src/components/PDFOrganizer.tsx`): **Print…** compiles reordered, rotated, watermarked, and numbered pages directly into a Print session.

Existing Print sessions are protected by the shared replacement confirmation dialog before overwriting.
