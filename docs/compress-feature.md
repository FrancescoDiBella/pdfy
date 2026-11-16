# PDF Compress & Optimize Overview

## What Was Added

PDFy now includes an offline **Compress** workspace ([`src/components/PDFCompressor.tsx`](../src/components/PDFCompressor.tsx)) backed by [`src/utils/pdfCompress.ts`](../src/utils/pdfCompress.ts) and [`src/utils/pdfCompressRunner.ts`](../src/utils/pdfCompressRunner.ts):

- **Size Analysis**: Computes total file size, page count, average KB/page, embedded form field counts, and metadata presence.
- **Optimization Presets**:
  - **Lossless Cleanup**: Repacks object streams with optional Info metadata stripping and AcroForm flattening while keeping vector crispness.
  - **Balanced (144 DPI)** & **Maximum Shrink (108 DPI)**: Configurable target DPI (`72–240`), JPEG quality (`35%–95%`), grayscale conversion, and memory-capped canvas re-encoding.
- **Honest Before/After Comparison**: Displays original vs. output size, percentage reduction, progress bar ratio, and explicit warnings if a file is already compact and grew under a raster preset.
- **Live Page Preview & Print Handoff**: Inspect compressed pages before downloading or hand the optimized PDF straight to **Print**.
