import { PDFDocument, degrees, pushGraphicsState, popGraphicsState, rectangle, clip, endPath } from 'pdf-lib';

export type ImagePageSizePreset = 'match' | 'a4' | 'letter';
export type ImageOrientationPreset = 'auto' | 'portrait' | 'landscape';
export type ImageFitMode = 'contain' | 'cover';
export type ImageMarginPreset = 'none' | 'narrow' | 'normal';
export type ImageScanFilter = 'original' | 'document-bw';

export interface QueuedImageInput {
  id: string;
  name: string;
  mimeType: 'image/png' | 'image/jpeg';
  bytes: Uint8Array;
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
}

export interface ImagesToPDFOptions {
  pageSize: ImagePageSizePreset;
  orientation: ImageOrientationPreset;
  fit: ImageFitMode;
  margin: ImageMarginPreset;
  title?: string;
}

export const CONVERT_PAPER_PT: Record<Exclude<ImagePageSizePreset, 'match'>, { width: number; height: number; label: string }> = {
  a4: { width: 595.28, height: 841.89, label: 'A4' },
  letter: { width: 612, height: 792, label: 'US Letter' },
};

export const CONVERT_MARGIN_PT: Record<ImageMarginPreset, number> = {
  none: 0,
  narrow: 18,
  normal: 36,
};

export function reorderImageItems<T extends { id: string }>(items: T[], sourceId: string, targetId: string): T[] {
  if (sourceId === targetId) return items;
  const fromIndex = items.findIndex(item => item.id === sourceId);
  const toIndex = items.findIndex(item => item.id === targetId);
  if (fromIndex === -1 || toIndex === -1) return items;
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function applyScanFilterToImageData(data: Uint8ClampedArray): Uint8ClampedArray {
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    let enhanced: number;
    if (lum >= 212) {
      enhanced = 255;
    } else if (lum <= 45) {
      enhanced = 12;
    } else {
      enhanced = Math.max(0, Math.min(255, Math.round((lum - 128) * 1.42 + 128)));
    }
    data[i] = enhanced;
    data[i + 1] = enhanced;
    data[i + 2] = enhanced;
  }
  return data;
}

export function resolveTargetPageSize(
  visualWidthPx: number,
  visualHeightPx: number,
  options: Pick<ImagesToPDFOptions, 'pageSize' | 'orientation'>,
): { width: number; height: number } {
  const safeW = Math.max(1, visualWidthPx);
  const safeH = Math.max(1, visualHeightPx);

  if (options.pageSize === 'match') {
    // Convert CSS pixels (96 DPI) into standard 72 DPI PDF points.
    const wPt = safeW * 0.75;
    const hPt = safeH * 0.75;
    if (options.orientation === 'portrait' && wPt > hPt) return { width: hPt, height: wPt };
    if (options.orientation === 'landscape' && hPt > wPt) return { width: hPt, height: wPt };
    return { width: wPt, height: hPt };
  }

  const base = CONVERT_PAPER_PT[options.pageSize];
  const resolvedOrientation = options.orientation === 'auto'
    ? (safeW > safeH ? 'landscape' : 'portrait')
    : options.orientation;

  return resolvedOrientation === 'landscape'
    ? { width: Math.max(base.width, base.height), height: Math.min(base.width, base.height) }
    : { width: Math.min(base.width, base.height), height: Math.max(base.width, base.height) };
}

export async function composeImagesToPDF(
  items: QueuedImageInput[],
  options: ImagesToPDFOptions,
): Promise<Uint8Array> {
  if (!items.length) throw new Error('Add at least one image before creating a PDF.');

  const outDoc = await PDFDocument.create();
  if (options.title?.trim()) outDoc.setTitle(options.title.trim());

  const marginPt = CONVERT_MARGIN_PT[options.margin];

  for (const item of items) {
    const embedded = item.mimeType === 'image/png'
      ? await outDoc.embedPng(item.bytes)
      : await outDoc.embedJpg(item.bytes);

    const sideways = item.rotation === 90 || item.rotation === 270;
    const visualWidth = sideways ? embedded.height : embedded.width;
    const visualHeight = sideways ? embedded.width : embedded.height;

    const { width: pageWidth, height: pageHeight } = resolveTargetPageSize(visualWidth, visualHeight, options);
    const page = outDoc.addPage([pageWidth, pageHeight]);

    const maxMargin = Math.min(marginPt, pageWidth / 4, pageHeight / 4);
    const boxX = maxMargin;
    const boxY = maxMargin;
    const boxW = Math.max(1, pageWidth - 2 * maxMargin);
    const boxH = Math.max(1, pageHeight - 2 * maxMargin);

    const scale = options.fit === 'cover'
      ? Math.max(boxW / Math.max(1, visualWidth), boxH / Math.max(1, visualHeight))
      : Math.min(boxW / Math.max(1, visualWidth), boxH / Math.max(1, visualHeight));

    const drawW = embedded.width * scale;
    const drawH = embedded.height * scale;

    const theta = (-item.rotation * Math.PI) / 180;
    const centerOffsetX = (drawW / 2) * Math.cos(theta) - (drawH / 2) * Math.sin(theta);
    const centerOffsetY = (drawW / 2) * Math.sin(theta) + (drawH / 2) * Math.cos(theta);
    const drawX = boxX + boxW / 2 - centerOffsetX;
    const drawY = boxY + boxH / 2 - centerOffsetY;

    if (options.fit === 'cover') {
      page.pushOperators(
        pushGraphicsState(),
        rectangle(boxX, boxY, boxW, boxH),
        clip(),
        endPath(),
      );
    }

    page.drawImage(embedded, {
      x: drawX,
      y: drawY,
      width: drawW,
      height: drawH,
      rotate: degrees(-item.rotation),
    });

    if (options.fit === 'cover') {
      page.pushOperators(popGraphicsState());
    }
  }

  return await outDoc.save();
}
