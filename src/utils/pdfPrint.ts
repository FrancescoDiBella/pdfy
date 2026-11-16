import { PDFDocument, StandardFonts, degrees, pushGraphicsState, popGraphicsState, rectangle, clip, endPath, rgb } from 'pdf-lib';
import type { PDFPage } from 'pdf-lib';
import { parsePageRange } from './pageRanges.ts';
import { pageGeometry } from './editorGeometry.ts';

export type PrintRangeMode = 'all' | 'custom';
export type PrintParity = 'all' | 'odd' | 'even';
export type PrintLayoutMode = 'standard' | 'nup' | 'booklet';
export type PrintNupCount = 2 | 4 | 6 | 9;
export type PrintPaperSize = 'auto' | 'a4' | 'letter' | 'legal';
export type PrintOrientation = 'auto' | 'portrait' | 'landscape';
export type PrintMarginPreset = 'none' | 'narrow' | 'normal' | 'wide';
export type PrintScaleMode = 'fit' | 'actual' | 'custom';
export type PrintColorMode = 'color' | 'grayscale' | 'ink-saver';
export type PrintPresetId = 'standard' | 'handout-2up' | 'handout-4up' | 'booklet' | 'eco';

export interface PrintOptions {
  rangeMode: PrintRangeMode;
  pageRange: string;
  parity: PrintParity;
  reverseOrder: boolean;
  layout: PrintLayoutMode;
  nup: PrintNupCount;
  drawBorders: boolean;
  paperSize: PrintPaperSize;
  orientation: PrintOrientation;
  margin: PrintMarginPreset;
  scaleMode: PrintScaleMode;
  customScalePercent: number;
  colorMode: PrintColorMode;
  showHeaderFooter: boolean;
  headerFooterNote: string;
  documentTitle: string;
}

export interface ComposedPrintResult {
  bytes: Uint8Array;
  sheetCount: number;
  selectedPages: number[];
  sheetWidth: number;
  sheetHeight: number;
  orientation: 'portrait' | 'landscape';
}

export const PAPER_DIMENSIONS_PT: Record<Exclude<PrintPaperSize, 'auto'>, { width: number; height: number; label: string }> = {
  a4: { width: 595.28, height: 841.89, label: 'A4 (210 × 297 mm)' },
  letter: { width: 612, height: 792, label: 'US Letter (8.5 × 11 in)' },
  legal: { width: 612, height: 1008, label: 'US Legal (8.5 × 14 in)' },
};

export const MARGIN_PT: Record<PrintMarginPreset, { value: number; label: string }> = {
  none: { value: 0, label: 'None (0 mm)' },
  narrow: { value: 18, label: 'Narrow (6 mm)' },
  normal: { value: 36, label: 'Normal (13 mm)' },
  wide: { value: 54, label: 'Wide (19 mm)' },
};

export const DEFAULT_PRINT_OPTIONS: PrintOptions = {
  rangeMode: 'all',
  pageRange: '',
  parity: 'all',
  reverseOrder: false,
  layout: 'standard',
  nup: 2,
  drawBorders: false,
  paperSize: 'auto',
  orientation: 'auto',
  margin: 'narrow',
  scaleMode: 'fit',
  customScalePercent: 100,
  colorMode: 'color',
  showHeaderFooter: false,
  headerFooterNote: '',
  documentTitle: '',
};

export const PRINT_PRESETS: Array<{ id: PrintPresetId; label: string; description: string; patch: Partial<PrintOptions> }> = [
  {
    id: 'standard',
    label: 'Standard',
    description: '1 page per sheet, original colors, auto paper.',
    patch: { layout: 'standard', drawBorders: false, paperSize: 'auto', orientation: 'auto', margin: 'narrow', scaleMode: 'fit', colorMode: 'color', showHeaderFooter: false },
  },
  {
    id: 'handout-2up',
    label: '2-up Handout',
    description: '2 pages side-by-side in landscape with subtle borders.',
    patch: { layout: 'nup', nup: 2, drawBorders: true, orientation: 'auto', margin: 'narrow', scaleMode: 'fit', colorMode: 'color' },
  },
  {
    id: 'handout-4up',
    label: '4-up Slides',
    description: '4 pages per sheet in a compact 2 × 2 grid.',
    patch: { layout: 'nup', nup: 4, drawBorders: true, orientation: 'auto', margin: 'narrow', scaleMode: 'fit' },
  },
  {
    id: 'booklet',
    label: 'Booklet',
    description: 'Saddle-stitch 2-up signature order ready to fold & staple.',
    patch: { layout: 'booklet', drawBorders: true, orientation: 'auto', margin: 'narrow', scaleMode: 'fit', reverseOrder: false, parity: 'all' },
  },
  {
    id: 'eco',
    label: 'Eco Ink-Saver',
    description: '2-up grayscale with narrow margins to save paper and toner.',
    patch: { layout: 'nup', nup: 2, drawBorders: true, orientation: 'auto', margin: 'narrow', scaleMode: 'fit', colorMode: 'grayscale' },
  },
];

// Sanitize text for WinAnsi StandardFonts so non-Latin characters in filenames never crash export.
export function sanitizeWinAnsi(text: string): string {
  return text.replace(/[^\x20-\x7E\xA0-\xFF]/gu, '?').trim();
}

export function resolveSelectedPages(
  pageCount: number,
  options: Pick<PrintOptions, 'rangeMode' | 'pageRange' | 'parity' | 'reverseOrder'>,
): number[] {
  if (pageCount <= 0) return [];
  let pages: number[];
  if (options.rangeMode === 'custom') {
    pages = parsePageRange(options.pageRange, pageCount);
  } else {
    pages = Array.from({ length: pageCount }, (_, index) => index);
  }

  if (options.parity === 'odd') {
    pages = pages.filter(index => (index + 1) % 2 === 1);
  } else if (options.parity === 'even') {
    pages = pages.filter(index => (index + 1) % 2 === 0);
  }

  if (options.reverseOrder) {
    pages = pages.toReversed();
  }
  return pages;
}

/**
 * Computes 2-up saddle-stitch booklet spreads (front, back, front, back...).
 * Pads to a multiple of 4 with `null` blank slots so folding the stack aligns page numbers.
 */
export function buildBookletSpreads(indices: number[]): Array<[number | null, number | null]> {
  if (!indices.length) return [];
  const targetCount = Math.max(4, Math.ceil(indices.length / 4) * 4);
  const padded: Array<number | null> = [...indices];
  while (padded.length < targetCount) padded.push(null);

  const spreads: Array<[number | null, number | null]> = [];
  const sheetPairs = targetCount / 4;
  for (let s = 0; s < sheetPairs; s++) {
    // Front of sheet: [last-pair-left, first-pair-right]
    spreads.push([padded[targetCount - 1 - 2 * s], padded[2 * s]]);
    // Back of sheet: [second-pair-left, second-last-pair-right]
    spreads.push([padded[2 * s + 1], padded[targetCount - 2 - 2 * s]]);
  }
  return spreads;
}

export function resolveNupGrid(count: PrintNupCount, orientation: 'portrait' | 'landscape'): { cols: number; rows: number } {
  if (count === 2) return orientation === 'landscape' ? { cols: 2, rows: 1 } : { cols: 1, rows: 2 };
  if (count === 4) return { cols: 2, rows: 2 };
  if (count === 6) return orientation === 'landscape' ? { cols: 3, rows: 2 } : { cols: 2, rows: 3 };
  return { cols: 3, rows: 3 };
}

export function getVisualPageSize(page: PDFPage): { width: number; height: number; rotation: number } {
  const geo = pageGeometry(page);
  const sideways = geo.rotation === 90 || geo.rotation === 270;
  return {
    width: sideways ? geo.height : geo.width,
    height: sideways ? geo.width : geo.height,
    rotation: geo.rotation,
  };
}

export function resolveSheetDimensions(
  sampleVisualSize: { width: number; height: number },
  options: Pick<PrintOptions, 'paperSize' | 'orientation' | 'layout' | 'nup'>,
): { width: number; height: number; orientation: 'portrait' | 'landscape' } {
  const base = options.paperSize === 'auto'
    ? (options.layout === 'standard'
      ? {
          width: Math.min(sampleVisualSize.width, sampleVisualSize.height),
          height: Math.max(sampleVisualSize.width, sampleVisualSize.height),
        }
      : PAPER_DIMENSIONS_PT.a4)
    : PAPER_DIMENSIONS_PT[options.paperSize];

  let resolvedOrientation: 'portrait' | 'landscape';
  if (options.orientation !== 'auto') {
    resolvedOrientation = options.orientation;
  } else if (options.layout === 'booklet') {
    resolvedOrientation = sampleVisualSize.height >= sampleVisualSize.width ? 'landscape' : 'portrait';
  } else if (options.layout === 'nup' && (options.nup === 2 || options.nup === 6)) {
    resolvedOrientation = sampleVisualSize.height >= sampleVisualSize.width ? 'landscape' : 'portrait';
  } else {
    resolvedOrientation = sampleVisualSize.width > sampleVisualSize.height ? 'landscape' : 'portrait';
  }

  return resolvedOrientation === 'landscape'
    ? { width: Math.max(base.width, base.height), height: Math.min(base.width, base.height), orientation: 'landscape' }
    : { width: Math.min(base.width, base.height), height: Math.max(base.width, base.height), orientation: 'portrait' };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function composePrintPDF(
  sourceBytes: Uint8Array | ArrayBuffer,
  options: PrintOptions,
): Promise<ComposedPrintResult> {
  const srcDoc = await PDFDocument.load(sourceBytes);
  const totalSourcePages = srcDoc.getPageCount();
  if (!totalSourcePages) throw new Error('This PDF has no pages.');

  const selectedPages = resolveSelectedPages(totalSourcePages, options);
  if (!selectedPages.length) {
    throw new Error('No pages match your current page range and odd/even filter.');
  }

  const firstSrcPage = srcDoc.getPage(selectedPages[0]);
  const sampleVisualSize = getVisualPageSize(firstSrcPage);
  const sheetDims = resolveSheetDimensions(sampleVisualSize, options);

  const outDoc = await PDFDocument.create();
  if (options.documentTitle.trim()) outDoc.setTitle(options.documentTitle.trim());
  const footerFont = options.showHeaderFooter ? await outDoc.embedFont(StandardFonts.Helvetica) : null;

  // Build ordered sheet slots
  const sheetSlots: Array<Array<number | null>> = options.layout === 'booklet'
    ? buildBookletSpreads(selectedPages)
    : options.layout === 'nup'
      ? chunk(selectedPages, options.nup)
      : selectedPages.map(index => [index]);

  const uniqueIndices = Array.from(new Set(selectedPages));
  const embeddedByIndex = new Map<number, { embedded: Awaited<ReturnType<typeof outDoc.embedPage>>; rawWidth: number; rawHeight: number; visualWidth: number; visualHeight: number; rotation: number } | null>();

  for (const index of uniqueIndices) {
    const srcPage = srcDoc.getPage(index);
    if (!srcPage.node.Contents()) {
      embeddedByIndex.set(index, null);
      continue;
    }
    const geo = pageGeometry(srcPage);
    try {
      const embedded = await outDoc.embedPage(srcPage, {
        left: geo.x,
        bottom: geo.y,
        right: geo.x + geo.width,
        top: geo.y + geo.height,
      });
      const sideways = geo.rotation === 90 || geo.rotation === 270;
      embeddedByIndex.set(index, {
        embedded,
        rawWidth: geo.width,
        rawHeight: geo.height,
        visualWidth: sideways ? geo.height : geo.width,
        visualHeight: sideways ? geo.width : geo.height,
        rotation: geo.rotation,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('missing Contents')) {
        embeddedByIndex.set(index, null);
      } else {
        throw error;
      }
    }
  }

  const margin = MARGIN_PT[options.margin].value;
  const footerReserve = options.showHeaderFooter ? 18 : 0;
  const grid = options.layout === 'booklet'
    ? { cols: 2, rows: 1 }
    : options.layout === 'nup'
      ? resolveNupGrid(options.nup, sheetDims.orientation)
      : { cols: 1, rows: 1 };
  const cellGap = options.layout === 'standard' ? 0 : options.layout === 'booklet' ? 12 : 10;

  const printableX = margin;
  const printableY = margin + footerReserve;
  const printableWidth = Math.max(36, sheetDims.width - margin * 2);
  const printableHeight = Math.max(36, sheetDims.height - margin * 2 - footerReserve);

  const cellWidth = (printableWidth - cellGap * (grid.cols - 1)) / grid.cols;
  const cellHeight = (printableHeight - cellGap * (grid.rows - 1)) / grid.rows;
  const dateLabel = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const titleLabel = sanitizeWinAnsi(options.documentTitle || 'PDFy Print');
  const noteLabel = sanitizeWinAnsi(options.headerFooterNote || '');

  for (let sheetIndex = 0; sheetIndex < sheetSlots.length; sheetIndex++) {
    const slots = sheetSlots[sheetIndex];
    const sheetPage = outDoc.addPage([sheetDims.width, sheetDims.height]);

    for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
      const pageIndex = slots[slotIndex];
      const col = slotIndex % grid.cols;
      const rowFromTop = Math.floor(slotIndex / grid.cols);
      const cellX = printableX + col * (cellWidth + cellGap);
      const cellY = printableY + printableHeight - (rowFromTop + 1) * cellHeight - rowFromTop * cellGap;

      if (options.drawBorders && (options.layout !== 'standard' || pageIndex !== null)) {
        sheetPage.drawRectangle({
          x: cellX,
          y: cellY,
          width: cellWidth,
          height: cellHeight,
          borderColor: rgb(0.78, 0.82, 0.88),
          borderWidth: 0.6,
        });
      }

      if (pageIndex === null) continue;
      const item = embeddedByIndex.get(pageIndex);
      if (!item) continue;

      const fitScale = Math.min(cellWidth / item.visualWidth, cellHeight / item.visualHeight);
      const scale = options.scaleMode === 'fit'
        ? fitScale
        : options.scaleMode === 'actual'
          ? 1
          : Math.max(0.1, Math.min(3, options.customScalePercent / 100));

      const drawnVisualW = item.visualWidth * scale;
      const drawnVisualH = item.visualHeight * scale;
      const drawnRawW = item.rawWidth * scale;
      const drawnRawH = item.rawHeight * scale;
      const cx = cellX + cellWidth / 2;
      const cy = cellY + cellHeight / 2;

      // Clip to cell bounds so 'actual' or zoomed custom scale cannot bleed into adjacent N-up slots.
      sheetPage.pushOperators(
        pushGraphicsState(),
        rectangle(cellX, cellY, cellWidth, cellHeight),
        clip(),
        endPath(),
      );

      let drawX = cx - drawnVisualW / 2;
      let drawY = cy - drawnVisualH / 2;
      let pdfRotate = 0;

      if (item.rotation === 90) {
        drawX = cx - drawnVisualW / 2;
        drawY = cy + drawnVisualH / 2;
        pdfRotate = -90;
      } else if (item.rotation === 180) {
        drawX = cx + drawnVisualW / 2;
        drawY = cy + drawnVisualH / 2;
        pdfRotate = 180;
      } else if (item.rotation === 270) {
        drawX = cx + drawnVisualW / 2;
        drawY = cy - drawnVisualH / 2;
        pdfRotate = 90;
      }

      sheetPage.drawPage(item.embedded, {
        x: drawX,
        y: drawY,
        width: drawnRawW,
        height: drawnRawH,
        rotate: degrees(pdfRotate),
      });

      sheetPage.pushOperators(popGraphicsState());
    }

    if (options.layout === 'booklet' && options.drawBorders) {
      sheetPage.drawLine({
        start: { x: sheetDims.width / 2, y: printableY },
        end: { x: sheetDims.width / 2, y: printableY + printableHeight },
        thickness: 0.6,
        color: rgb(0.68, 0.72, 0.78),
        dashArray: [3, 3],
      });
    }

    if (options.showHeaderFooter && footerFont) {
      const fontSize = 8;
      const leftRaw = noteLabel ? `${titleLabel} — ${noteLabel}` : titleLabel;
      const maxLeftWidth = printableWidth * 0.62;
      let leftText = leftRaw;
      while (leftText.length > 4 && footerFont.widthOfTextAtSize(leftText, fontSize) > maxLeftWidth) {
        leftText = `${leftText.slice(0, -4)}...`;
      }
      const rightText = `${dateLabel} · Sheet ${sheetIndex + 1} of ${sheetSlots.length}`;
      const rightWidth = footerFont.widthOfTextAtSize(rightText, fontSize);
      const footerY = Math.max(8, margin + 4);
      const footerColor = rgb(0.36, 0.4, 0.46);

      if (leftText) {
        sheetPage.drawText(leftText, {
          x: printableX,
          y: footerY,
          size: fontSize,
          font: footerFont,
          color: footerColor,
        });
      }
      sheetPage.drawText(rightText, {
        x: Math.max(printableX, printableX + printableWidth - rightWidth),
        y: footerY,
        size: fontSize,
        font: footerFont,
        color: footerColor,
      });
    }
  }

  return {
    bytes: await outDoc.save(),
    sheetCount: sheetSlots.length,
    selectedPages,
    sheetWidth: sheetDims.width,
    sheetHeight: sheetDims.height,
    orientation: sheetDims.orientation,
  };
}

export function applyColorTransformToImageData(data: Uint8ClampedArray, colorMode: PrintColorMode): void {
  if (colorMode === 'color') return;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (colorMode === 'grayscale') {
      const luma = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      data[i] = luma;
      data[i + 1] = luma;
      data[i + 2] = luma;
    } else if (colorMode === 'ink-saver') {
      // Invert dark backgrounds onto clean white paper while boosting contrast for readability.
      const invR = 255 - r;
      const invG = 255 - g;
      const invB = 255 - b;
      data[i] = invR > 238 ? 255 : invR;
      data[i + 1] = invG > 238 ? 255 : invG;
      data[i + 2] = invB > 238 ? 255 : invB;
    }
  }
}
