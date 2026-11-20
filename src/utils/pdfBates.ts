import { rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { parsePageRange } from './pageRanges.ts';

export type StampZone =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export const STAMP_ZONES: Array<{ id: StampZone; label: string }> = [
  { id: 'top-left', label: 'Top left' },
  { id: 'top-center', label: 'Top center' },
  { id: 'top-right', label: 'Top right' },
  { id: 'bottom-left', label: 'Bottom left' },
  { id: 'bottom-center', label: 'Bottom center' },
  { id: 'bottom-right', label: 'Bottom right' },
];

export interface HeaderFooterBatesConfig {
  enabled: boolean;
  zones: Record<StampZone, string>;
  batesPrefix: string;
  batesSuffix: string;
  batesStart: number;
  batesDigits: number;
  pageRange: string;
  fontSize: number;
  marginPt: number;
  opacity: number;
  colorHex: string;
}

export interface StampContext {
  pageNumber: number;
  totalPages: number;
  bates: string;
  dateIso: string;
  filename: string;
}

export const DEFAULT_HEADER_FOOTER_BATES: HeaderFooterBatesConfig = {
  enabled: false,
  zones: {
    'top-left': '',
    'top-center': '',
    'top-right': '',
    'bottom-left': '{filename}',
    'bottom-center': 'Page {page} of {total}',
    'bottom-right': '{bates}',
  },
  batesPrefix: 'EXH-',
  batesSuffix: '',
  batesStart: 1,
  batesDigits: 6,
  pageRange: '',
  fontSize: 9.5,
  marginPt: 24,
  opacity: 0.9,
  colorHex: '#334155',
};

export function clampBatesDigits(digits: number): number {
  if (!Number.isFinite(digits)) return 6;
  return Math.max(1, Math.min(10, Math.floor(digits)));
}

export function clampBatesStart(start: number): number {
  if (!Number.isFinite(start)) return 1;
  return Math.max(0, Math.min(9_999_999, Math.floor(start)));
}

export function formatBatesNumber(
  prefix: string,
  suffix: string,
  start: number,
  digits: number,
  sequenceIndex: number,
): string {
  const safeStart = clampBatesStart(start);
  const safeDigits = clampBatesDigits(digits);
  const num = safeStart + Math.max(0, Math.floor(sequenceIndex));
  return `${prefix}${String(num).padStart(safeDigits, '0')}${suffix}`;
}

export function resolveStampTargetIndices(
  pageRange: string,
  totalPages: number,
): { indices: number[]; error: string | null } {
  if (totalPages <= 0) return { indices: [], error: null };
  const trimmed = pageRange.trim();
  if (!trimmed) {
    return {
      indices: Array.from({ length: totalPages }, (_, idx) => idx),
      error: null,
    };
  }
  try {
    return {
      indices: parsePageRange(trimmed, totalPages),
      error: null,
    };
  } catch (err) {
    return {
      indices: [],
      error: err instanceof Error ? err.message : 'Enter a valid page range, such as 2-4 or 1, 3.',
    };
  }
}

export function sanitizeWinAnsiText(input: string): string {
  // Replace non-WinAnsi characters safely so StandardFonts never crash during export.
  return Array.from(input)
    .map(ch => {
      const code = ch.codePointAt(0) ?? 32;
      if (code >= 0x20 && code <= 0x7e) return ch;
      if (code >= 0xa0 && code <= 0xff) return ch;
      if (code === 0x2013 || code === 0x2014) return '-';
      if (code === 0x2018 || code === 0x2019) return "'";
      if (code === 0x201c || code === 0x201d) return '"';
      if (code === 0x2022) return '*';
      return '';
    })
    .join('');
}

export function interpolateStampText(template: string, ctx: StampContext): string {
  if (!template.trim()) return '';
  const cleanName = ctx.filename.replace(/\.pdf$/i, '');
  const replaced = template
    .replace(/\{page\}/gi, String(ctx.pageNumber))
    .replace(/\{total\}/gi, String(ctx.totalPages))
    .replace(/\{bates\}/gi, ctx.bates)
    .replace(/\{date\}/gi, ctx.dateIso)
    .replace(/\{filename\}/gi, cleanName);
  return sanitizeWinAnsiText(replaced).trim();
}

export function hexToRgbComponents(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.replace('#', '').trim();
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return {
      r: parseInt(cleaned.slice(0, 2), 16) / 255,
      g: parseInt(cleaned.slice(2, 4), 16) / 255,
      b: parseInt(cleaned.slice(4, 6), 16) / 255,
    };
  }
  return { r: 0.2, g: 0.25, b: 0.33 };
}

export function computeZoneDrawPosition(
  zone: StampZone,
  box: { x: number; y: number; width: number; height: number },
  textWidth: number,
  fontSize: number,
  marginPt: number,
): { x: number; y: number } {
  const safeMargin = Math.max(8, Math.min(Math.min(box.width, box.height) * 0.25, marginPt));
  const isTop = zone.startsWith('top-');
  const y = isTop
    ? box.y + box.height - safeMargin - fontSize
    : box.y + safeMargin;

  let x: number;
  if (zone.endsWith('-left')) {
    x = box.x + safeMargin;
  } else if (zone.endsWith('-right')) {
    x = box.x + box.width - safeMargin - textWidth;
  } else {
    x = box.x + (box.width - textWidth) / 2;
  }

  return {
    x: Math.max(box.x + 4, x),
    y: Math.max(box.y + 4, y),
  };
}

export function applyHeaderFooterBatesToPage(
  page: PDFPage,
  font: PDFFont,
  box: { x: number; y: number; width: number; height: number },
  config: HeaderFooterBatesConfig,
  params: {
    pageNumber: number;
    sequenceIndex: number;
    totalPages: number;
    dateIso: string;
    filename: string;
  },
): Partial<Record<StampZone, string>> {
  const drawn: Partial<Record<StampZone, string>> = {};
  if (!config.enabled) return drawn;

  const bates = formatBatesNumber(
    config.batesPrefix,
    config.batesSuffix,
    config.batesStart,
    config.batesDigits,
    params.sequenceIndex,
  );
  const ctx: StampContext = {
    pageNumber: params.pageNumber,
    totalPages: params.totalPages,
    bates,
    dateIso: params.dateIso,
    filename: params.filename,
  };

  const fontSize = Math.max(7, Math.min(18, config.fontSize));
  const opacity = Math.max(0.15, Math.min(1, config.opacity));
  const { r, g, b } = hexToRgbComponents(config.colorHex);

  for (const { id: zone } of STAMP_ZONES) {
    const rawTemplate = config.zones[zone];
    if (!rawTemplate || !rawTemplate.trim()) continue;
    const text = interpolateStampText(rawTemplate, ctx);
    if (!text) continue;
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    const { x, y } = computeZoneDrawPosition(zone, box, textWidth, fontSize, config.marginPt);
    page.drawText(text, {
      x,
      y,
      size: fontSize,
      font,
      color: rgb(r, g, b),
      opacity,
    });
    drawn[zone] = text;
  }

  return drawn;
}
