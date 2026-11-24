import { PDFDocument, degrees } from 'pdf-lib';
import type { PDFPage } from 'pdf-lib';
import { pageGeometry } from './editorGeometry.ts';
import { flattenDocumentAnnotations } from './pdfAnnotationFlatten.ts';

export type MergePageSizeMode = 'original' | 'match-first' | 'a4' | 'letter';

export interface MergeOptions {
  pageSize?: MergePageSizeMode;
}

export interface QueuedPDF {
  id: string;
  file: File;
  pageCount: number;
  /** Visual size of the first page (accounting for CropBox and rotation) in PDF points. */
  sampleSize?: { width: number; height: number };
  /** True when pages within this file have differing physical dimensions (> 12 pt). */
  hasMixedPageSizes?: boolean;
}

const TARGET_PAPER_PT: Record<'a4' | 'letter', { shortSide: number; longSide: number }> = {
  a4: { shortSide: 595.28, longSide: 841.89 },
  letter: { shortSide: 612, longSide: 792 },
};

const SIZE_MATCH_TOLERANCE_PT = 1;
const MIXED_SIZE_THRESHOLD_PT = 12;

function getVisualDimensions(page: PDFPage): { width: number; height: number; rotation: number; geo: ReturnType<typeof pageGeometry> } {
  const geo = pageGeometry(page);
  const sideways = geo.rotation === 90 || geo.rotation === 270;
  return {
    width: sideways ? geo.height : geo.width,
    height: sideways ? geo.width : geo.height,
    rotation: geo.rotation,
    geo,
  };
}

function normalizedSides(size: { width: number; height: number }): { shortSide: number; longSide: number } {
  return {
    shortSide: Math.min(size.width, size.height),
    longSide: Math.max(size.width, size.height),
  };
}

export function detectMixedQueuePageSizes(queue: readonly QueuedPDF[]): boolean {
  if (queue.length < 2) return false;
  let refShort: number | null = null;
  let refLong: number | null = null;

  for (const item of queue) {
    if (item.hasMixedPageSizes) return true;
    if (!item.sampleSize) continue;
    const { shortSide, longSide } = normalizedSides(item.sampleSize);
    if (refShort === null || refLong === null) {
      refShort = shortSide;
      refLong = longSide;
      continue;
    }
    if (
      Math.abs(shortSide - refShort) > MIXED_SIZE_THRESHOLD_PT
      || Math.abs(longSide - refLong) > MIXED_SIZE_THRESHOLD_PT
    ) {
      return true;
    }
  }
  return false;
}

export function formatPageSizeLabel(size?: { width: number; height: number }): string {
  if (!size) return '';
  const { shortSide, longSide } = normalizedSides(size);
  if (Math.abs(shortSide - 595.28) <= 4 && Math.abs(longSide - 841.89) <= 4) return 'A4';
  if (Math.abs(shortSide - 612) <= 4 && Math.abs(longSide - 792) <= 4) return 'Letter';
  if (Math.abs(shortSide - 612) <= 4 && Math.abs(longSide - 1008) <= 4) return 'Legal';
  const wMm = Math.round((size.width * 25.4) / 72);
  const hMm = Math.round((size.height * 25.4) / 72);
  return `${wMm} × ${hMm} mm`;
}

export async function preparePDFs(files: File[]) {
  const accepted: QueuedPDF[] = [];
  const rejected: string[] = [];
  for (const file of files) {
    try {
      const document = await PDFDocument.load(await file.arrayBuffer());
      const pageCount = document.getPageCount();
      if (pageCount === 0) throw new Error('Empty PDF');

      const firstVis = getVisualDimensions(document.getPage(0));
      const firstSides = normalizedSides(firstVis);
      let hasMixedPageSizes = false;
      for (let i = 1; i < pageCount; i++) {
        const pageSides = normalizedSides(getVisualDimensions(document.getPage(i)));
        if (
          Math.abs(pageSides.shortSide - firstSides.shortSide) > MIXED_SIZE_THRESHOLD_PT
          || Math.abs(pageSides.longSide - firstSides.longSide) > MIXED_SIZE_THRESHOLD_PT
        ) {
          hasMixedPageSizes = true;
          break;
        }
      }

      accepted.push({
        id: crypto.randomUUID(),
        file,
        pageCount,
        sampleSize: { width: firstVis.width, height: firstVis.height },
        hasMixedPageSizes,
      });
    } catch {
      rejected.push(file.name);
    }
  }
  return { accepted, rejected };
}

// IDs keep identical filenames independent and remain stable after reordering.
export function reorderPDFs(queue: QueuedPDF[], sourceId: string, targetId: string) {
  const from = queue.findIndex(item => item.id === sourceId);
  const to = queue.findIndex(item => item.id === targetId);
  if (from < 0 || to < 0 || from === to) return queue;
  const reordered = [...queue];
  const [item] = reordered.splice(from, 1);
  reordered.splice(to, 0, item);
  return reordered;
}

export async function mergePDFs(queue: QueuedPDF[], options: MergeOptions = {}) {
  if (queue.length < 2) throw new Error('Select at least two PDF files.');
  const pageSizeMode: MergePageSizeMode = options.pageSize ?? 'original';
  const merged = await PDFDocument.create();

  if (pageSizeMode === 'original') {
    for (const { file } of queue) {
      const source = await PDFDocument.load(await file.arrayBuffer());
      const pages = await merged.copyPages(source, source.getPageIndices());
      pages.forEach(page => merged.addPage(page));
    }
    return merged.save();
  }

  let targetSides: { shortSide: number; longSide: number } | null =
    pageSizeMode === 'a4' || pageSizeMode === 'letter' ? TARGET_PAPER_PT[pageSizeMode] : null;

  for (const { file } of queue) {
    const source = await PDFDocument.load(await file.arrayBuffer());
    const pageIndices = source.getPageIndices();
    if (!pageIndices.length) continue;

    if (!targetSides) {
      targetSides = normalizedSides(getVisualDimensions(source.getPage(0)));
    }

    const pageMetrics = pageIndices.map(index => {
      const srcPage = source.getPage(index);
      const vis = getVisualDimensions(srcPage);
      const isLandscape = vis.width > vis.height;
      const targetW = isLandscape ? targetSides!.longSide : targetSides!.shortSide;
      const targetH = isLandscape ? targetSides!.shortSide : targetSides!.longSide;
      const alreadyMatches =
        Math.abs(vis.width - targetW) <= SIZE_MATCH_TOLERANCE_PT
        && Math.abs(vis.height - targetH) <= SIZE_MATCH_TOLERANCE_PT;
      return { index, srcPage, vis, targetW, targetH, alreadyMatches };
    });

    const indicesToFlatten = pageMetrics
      .filter(metric => !metric.alreadyMatches)
      .map(metric => metric.index);

    if (indicesToFlatten.length > 0) {
      // Flatten annotations & form fields before embedPage() so resized pages keep all edits/forms.
      await flattenDocumentAnnotations(source, indicesToFlatten);
    }

    for (const metric of pageMetrics) {
      if (metric.alreadyMatches) {
        const [copied] = await merged.copyPages(source, [metric.index]);
        merged.addPage(copied);
        continue;
      }

      const outPage = merged.addPage([metric.targetW, metric.targetH]);
      if (!metric.srcPage.node.Contents()) continue;

      const { geo, width: visualW, height: visualH, rotation } = metric.vis;
      let embedded: Awaited<ReturnType<typeof merged.embedPage>>;
      try {
        embedded = await merged.embedPage(metric.srcPage, {
          left: geo.x,
          bottom: geo.y,
          right: geo.x + geo.width,
          top: geo.y + geo.height,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes('missing Contents')) {
          continue;
        }
        throw error;
      }

      const scale = Math.min(metric.targetW / visualW, metric.targetH / visualH);
      const drawnVisualW = visualW * scale;
      const drawnVisualH = visualH * scale;
      const drawnRawW = geo.width * scale;
      const drawnRawH = geo.height * scale;
      const cx = metric.targetW / 2;
      const cy = metric.targetH / 2;

      let drawX = cx - drawnVisualW / 2;
      let drawY = cy - drawnVisualH / 2;
      let pdfRotate = 0;

      if (rotation === 90) {
        drawX = cx - drawnVisualW / 2;
        drawY = cy + drawnVisualH / 2;
        pdfRotate = -90;
      } else if (rotation === 180) {
        drawX = cx + drawnVisualW / 2;
        drawY = cy + drawnVisualH / 2;
        pdfRotate = 180;
      } else if (rotation === 270) {
        drawX = cx + drawnVisualW / 2;
        drawY = cy - drawnVisualH / 2;
        pdfRotate = 90;
      }

      outPage.drawPage(embedded, {
        x: drawX,
        y: drawY,
        width: drawnRawW,
        height: drawnRawH,
        rotate: degrees(pdfRotate),
      });
    }
  }

  return merged.save();
}

export async function appendPDFsToFile(baseFile: File, incomingFiles: File[]) {
  const { accepted, rejected } = await preparePDFs(incomingFiles);
  if (accepted.length === 0) {
    return {
      combinedFile: baseFile,
      previousPageCount: 0,
      addedCount: 0,
      acceptedNames: [] as string[],
      rejected,
    };
  }
  const combined = await PDFDocument.load(await baseFile.arrayBuffer());
  const previousPageCount = combined.getPageCount();
  let addedCount = 0;
  for (const item of accepted) {
    const source = await PDFDocument.load(await item.file.arrayBuffer());
    const pages = await combined.copyPages(source, source.getPageIndices());
    pages.forEach(page => combined.addPage(page));
    addedCount += pages.length;
  }
  const combinedBytes = await combined.save();
  return {
    combinedFile: new File([combinedBytes as BlobPart], baseFile.name, { type: 'application/pdf' }),
    previousPageCount,
    addedCount,
    acceptedNames: accepted.map(item => item.file.name),
    rejected,
  };
}
