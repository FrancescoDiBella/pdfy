export type ReaderLayoutMode = 'single' | 'spread';

export const SPREAD_MIN_VIEWPORT_WIDTH = 680;

export function buildPageSpreads(
  numPages: number,
  layoutMode: ReaderLayoutMode,
  coverSolo = true,
): number[][] {
  if (!Number.isFinite(numPages) || numPages <= 0) return [];
  const total = Math.floor(numPages);
  if (layoutMode === 'single' || total === 1) {
    return Array.from({ length: total }, (_, index) => [index + 1]);
  }

  const rows: number[][] = [];
  let cursor = 1;
  if (coverSolo) {
    rows.push([1]);
    cursor = 2;
  }
  while (cursor <= total) {
    if (cursor + 1 <= total) {
      rows.push([cursor, cursor + 1]);
      cursor += 2;
    } else {
      rows.push([cursor]);
      cursor += 1;
    }
  }
  return rows;
}

export function computePageRenderWidth(
  viewportWidth: number,
  scale: number,
  pagesInRow: number,
): number {
  const safeViewport = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 600;
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  if (pagesInRow >= 2) {
    const perPage = Math.floor((safeViewport - 56) / 2);
    return Math.max(140, Math.min(520, perPage)) * safeScale;
  }
  return Math.max(100, Math.min(900, safeViewport)) * safeScale;
}

export function computeScrollProgress(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
): number {
  const scrollable = scrollHeight - clientHeight;
  if (!Number.isFinite(scrollable) || scrollable <= 0) return 0;
  if (!Number.isFinite(scrollTop) || scrollTop <= 0) return 0;
  return Math.min(1, Math.max(0, scrollTop / scrollable));
}
