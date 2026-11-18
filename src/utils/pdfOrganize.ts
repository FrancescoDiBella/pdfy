import type { PDFPage } from 'pdf-lib';

export type MarginCropPreset = 'original' | 'trim-4' | 'trim-8' | 'custom';

export interface CropMarginsPct {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface MarginCropConfig {
  preset: MarginCropPreset;
  margins: CropMarginsPct;
}

export interface PDFBoxRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MAX_CROP_MARGIN_PCT = 40;

export const DEFAULT_CUSTOM_MARGINS_PCT: CropMarginsPct = {
  top: 5,
  right: 5,
  bottom: 5,
  left: 5,
};

export const DEFAULT_DOCUMENT_CROP: MarginCropConfig = {
  preset: 'original',
  margins: { ...DEFAULT_CUSTOM_MARGINS_PCT },
};

export interface OrganizablePage {
  id: string;
  originalIndex: number;
  rotation: number;
  crop?: MarginCropConfig;
}

export function clampCropMarginPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const clamped = Math.max(0, Math.min(MAX_CROP_MARGIN_PCT, value));
  return Math.round(clamped * 10) / 10;
}

export function sanitizeCropMargins(margins: Partial<CropMarginsPct>): CropMarginsPct {
  return {
    top: clampCropMarginPct(margins.top ?? 0),
    right: clampCropMarginPct(margins.right ?? 0),
    bottom: clampCropMarginPct(margins.bottom ?? 0),
    left: clampCropMarginPct(margins.left ?? 0),
  };
}

export function resolveCropMarginsPct(config: MarginCropConfig): CropMarginsPct {
  if (config.preset === 'original') return { top: 0, right: 0, bottom: 0, left: 0 };
  if (config.preset === 'trim-4') return { top: 4, right: 4, bottom: 4, left: 4 };
  if (config.preset === 'trim-8') return { top: 8, right: 8, bottom: 8, left: 8 };
  return sanitizeCropMargins(config.margins);
}

export function resolveEffectivePageCrop(
  page: Pick<OrganizablePage, 'crop'>,
  documentCrop: MarginCropConfig,
): MarginCropConfig {
  return page.crop ?? documentCrop;
}

export function hasActiveCrop(config: MarginCropConfig): boolean {
  const margins = resolveCropMarginsPct(config);
  return margins.top > 0 || margins.right > 0 || margins.bottom > 0 || margins.left > 0;
}

export function formatCropSummary(config: MarginCropConfig): string {
  if (config.preset === 'original') return 'Original';
  if (config.preset === 'trim-4') return 'Trim 4%';
  if (config.preset === 'trim-8') return 'Trim 8%';
  if (!hasActiveCrop(config)) return 'Original';
  const margins = resolveCropMarginsPct(config);
  if (margins.top === margins.right && margins.top === margins.bottom && margins.top === margins.left) {
    return `Trim ${margins.top}%`;
  }
  return 'Custom crop';
}

export function computeCroppedBox(
  baseBox: PDFBoxRect,
  visualRotationDeg: number,
  marginsPct: CropMarginsPct,
): PDFBoxRect {
  const sanitized = sanitizeCropMargins(marginsPct);
  const rot = (((Math.round(visualRotationDeg / 90) * 90) % 360) + 360) % 360;
  const top = sanitized.top / 100;
  const right = sanitized.right / 100;
  const bottom = sanitized.bottom / 100;
  const left = sanitized.left / 100;

  let pdfLeft = left;
  let pdfRight = right;
  let pdfBottom = bottom;
  let pdfTop = top;

  if (rot === 90) {
    pdfLeft = top;
    pdfRight = bottom;
    pdfBottom = left;
    pdfTop = right;
  } else if (rot === 180) {
    pdfLeft = right;
    pdfRight = left;
    pdfBottom = top;
    pdfTop = bottom;
  } else if (rot === 270) {
    pdfLeft = bottom;
    pdfRight = top;
    pdfBottom = right;
    pdfTop = left;
  }

  const roundPt = (value: number) => Math.round(value * 10000) / 10000;
  return {
    x: roundPt(baseBox.x + baseBox.width * pdfLeft),
    y: roundPt(baseBox.y + baseBox.height * pdfBottom),
    width: roundPt(Math.max(1, baseBox.width * (1 - pdfLeft - pdfRight))),
    height: roundPt(Math.max(1, baseBox.height * (1 - pdfBottom - pdfTop))),
  };
}

export function visiblePageBox(page: PDFPage): PDFBoxRect {
  const media = page.getMediaBox();
  const crop = page.getCropBox();
  const x = Math.max(media.x, crop.x);
  const y = Math.max(media.y, crop.y);
  const width = Math.min(media.x + media.width, crop.x + crop.width) - x;
  const height = Math.min(media.y + media.height, crop.y + crop.height) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : media;
}

export function applyPageMarginCrop(page: PDFPage, config: MarginCropConfig): PDFBoxRect {
  const baseBox = visiblePageBox(page);
  if (!hasActiveCrop(config)) {
    return baseBox;
  }
  const rotation = (((page.getRotation().angle % 360) + 360) % 360);
  const cropped = computeCroppedBox(baseBox, rotation, resolveCropMarginsPct(config));
  page.setCropBox(cropped.x, cropped.y, cropped.width, cropped.height);
  return cropped;
}

export function computePreviewClipInset(
  extraRotationDeg: number,
  marginsPct: CropMarginsPct,
): string | undefined {
  const m = sanitizeCropMargins(marginsPct);
  if (m.top <= 0 && m.right <= 0 && m.bottom <= 0 && m.left <= 0) {
    return undefined;
  }
  const rot = (((Math.round(extraRotationDeg / 90) * 90) % 360) + 360) % 360;
  if (rot === 90) return `inset(${m.right}% ${m.bottom}% ${m.left}% ${m.top}%)`;
  if (rot === 180) return `inset(${m.bottom}% ${m.left}% ${m.top}% ${m.right}%)`;
  if (rot === 270) return `inset(${m.left}% ${m.top}% ${m.right}% ${m.bottom}%)`;
  return `inset(${m.top}% ${m.right}% ${m.bottom}% ${m.left}%)`;
}


export function movePageToIndex<T>(pages: T[], fromIndex: number, toIndex: number): T[] {
  if (
    fromIndex < 0
    || toIndex < 0
    || fromIndex >= pages.length
    || toIndex >= pages.length
    || fromIndex === toIndex
  ) {
    return pages;
  }
  const next = [...pages];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function reorderPageItems<T extends { id: string }>(
  pages: T[],
  sourceId: string,
  targetId: string,
): T[] {
  const from = pages.findIndex(page => page.id === sourceId);
  const to = pages.findIndex(page => page.id === targetId);
  if (from < 0 || to < 0 || from === to) return pages;
  return movePageToIndex(pages, from, to);
}

export function removePageById<T extends { id: string }>(
  pages: T[],
  id: string,
): { nextPages: T[]; removed: T; removedIndex: number } | null {
  if (pages.length <= 1) return null;
  const index = pages.findIndex(page => page.id === id);
  if (index < 0) return null;
  const nextPages = [...pages];
  const [removed] = nextPages.splice(index, 1);
  return { nextPages, removed, removedIndex: index };
}

export function restorePageAtIndex<T extends { id: string }>(
  pages: T[],
  removed: T,
  index: number,
): T[] {
  if (pages.some(page => page.id === removed.id)) return pages;
  const clamped = Math.max(0, Math.min(index, pages.length));
  const next = [...pages];
  next.splice(clamped, 0, removed);
  return next;
}
