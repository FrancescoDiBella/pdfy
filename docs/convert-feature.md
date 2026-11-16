# Images ↔ PDF Converter Overview

## What Was Added

PDFy now provides an offline **Convert** workspace ([`src/components/PDFConverter.tsx`](../src/components/PDFConverter.tsx)) backed by [`src/utils/pdfConvert.ts`](../src/utils/pdfConvert.ts) and [`src/utils/pdfImageExport.ts`](../src/utils/pdfImageExport.ts):

- **Images to PDF**: Combine PNG, JPEG, or WebP files locally; reorder via keyboard arrows or drag-and-drop with screen-reader announcements; rotate each image `0°/90°/180°/270°`; select page size (`Match image size`, `A4`, `US Letter`), orientation, margins, fit (`Contain`/`Cover`), and a high-contrast **Document scan (B&W)** filter; download or send directly to **Print…** or **Edit…**.
- **PDF to Images**: Render all pages or a validated custom page range to lossless **PNG** or configurable-quality **JPEG** at `96`, `150`, or `250 DPI`, preview rendered dimensions/file sizes, and download individual pages or all at once.
