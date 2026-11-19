import { PDFDocument } from 'pdf-lib';
import type { FlattenedOutlineItem } from './pdfTextSearch.ts';

export type SplitMode = 'select' | 'chunks' | 'bookmarks';

export interface SplitPartPlan {
  id: string;
  label: string;
  filename: string;
  pageIndices: number[];
  pageRangeLabel: string;
}

export interface GeneratedSplitPart {
  filename: string;
  bytes: Uint8Array;
  pageCount: number;
}

export function stripPdfExtension(name: string): string {
  return name.replace(/\.pdf$/i, '').trim() || 'document';
}

export function sanitizeFilenameSegment(raw: string, fallback = 'section'): string {
  const cleaned = raw
    .replace(/\.pdf$/i, '')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.-]+|[_.-]+$/g, '')
    .slice(0, 56);
  return cleaned || fallback;
}

export function formatPageRangeLabel(pageIndices: number[]): string {
  if (pageIndices.length === 0) return '';
  const sorted = [...new Set(pageIndices)].sort((a, b) => a - b);
  const runs: string[] = [];
  let start = sorted[0];
  let end = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      runs.push(start === end ? `${start + 1}` : `${start + 1}–${end + 1}`);
      start = sorted[i];
      end = sorted[i];
    }
  }
  runs.push(start === end ? `${start + 1}` : `${start + 1}–${end + 1}`);
  return runs.join(', ');
}

export function buildSelectionSplitPlan(
  baseFilename: string,
  selectedIndices: number[],
  separate: boolean,
): SplitPartPlan[] {
  if (selectedIndices.length === 0) return [];
  const base = sanitizeFilenameSegment(stripPdfExtension(baseFilename), 'document');
  const sorted = [...new Set(selectedIndices)].sort((a, b) => a - b);

  if (!separate) {
    return [
      {
        id: 'selected-combined',
        label: `Extracted (${sorted.length} page${sorted.length === 1 ? '' : 's'})`,
        filename: `extracted_${base}.pdf`,
        pageIndices: sorted,
        pageRangeLabel: formatPageRangeLabel(sorted),
      },
    ];
  }

  return sorted.map(index => ({
    id: `selected-page-${index + 1}`,
    label: `Page ${index + 1}`,
    filename: `${base}_page_${index + 1}.pdf`,
    pageIndices: [index],
    pageRangeLabel: `${index + 1}`,
  }));
}

export function buildChunkSplitPlan(
  baseFilename: string,
  pageCount: number,
  pagesPerChunk: number,
): SplitPartPlan[] {
  if (pageCount <= 0) return [];
  const chunkSize = Math.max(1, Math.min(pageCount, Math.floor(Number.isFinite(pagesPerChunk) ? pagesPerChunk : 1)));
  const base = sanitizeFilenameSegment(stripPdfExtension(baseFilename), 'document');
  const totalParts = Math.ceil(pageCount / chunkSize);
  const padWidth = Math.max(2, String(totalParts).length);

  const plans: SplitPartPlan[] = [];
  for (let start = 0; start < pageCount; start += chunkSize) {
    const endExclusive = Math.min(pageCount, start + chunkSize);
    const pageIndices = Array.from({ length: endExclusive - start }, (_, offset) => start + offset);
    const partNumber = plans.length + 1;
    const padded = String(partNumber).padStart(padWidth, '0');
    const rangeToken = start + 1 === endExclusive ? `p${start + 1}` : `p${start + 1}-${endExclusive}`;
    plans.push({
      id: `chunk-${partNumber}`,
      label: `Part ${partNumber}`,
      filename: `${base}_part_${padded}_${rangeToken}.pdf`,
      pageIndices,
      pageRangeLabel: formatPageRangeLabel(pageIndices),
    });
  }

  return plans;
}

export function buildBookmarkSplitPlan(
  baseFilename: string,
  pageCount: number,
  outline: FlattenedOutlineItem[],
  maxDepth = 0,
): SplitPartPlan[] {
  if (pageCount <= 0 || outline.length === 0) return [];

  const base = sanitizeFilenameSegment(stripPdfExtension(baseFilename), 'document');
  const validBookmarks = outline
    .filter(item => item.depth <= maxDepth && item.pageNumber !== null && item.pageNumber >= 1 && item.pageNumber <= pageCount)
    .sort((a, b) => (a.pageNumber! - b.pageNumber!));

  // Deduplicate bookmarks starting on the same page (keep the first heading at that page).
  const uniqueStarts: Array<{ pageNumber: number; title: string }> = [];
  for (const item of validBookmarks) {
    const pageNumber = item.pageNumber!;
    if (uniqueStarts.length === 0 || uniqueStarts[uniqueStarts.length - 1].pageNumber !== pageNumber) {
      uniqueStarts.push({ pageNumber, title: item.title });
    }
  }

  if (uniqueStarts.length === 0) return [];

  const sections: Array<{ title: string; startPage: number; endPage: number }> = [];
  if (uniqueStarts[0].pageNumber > 1) {
    sections.push({
      title: 'Front matter',
      startPage: 1,
      endPage: uniqueStarts[0].pageNumber - 1,
    });
  }

  for (let i = 0; i < uniqueStarts.length; i++) {
    const startPage = uniqueStarts[i].pageNumber;
    const nextStart = i + 1 < uniqueStarts.length ? uniqueStarts[i + 1].pageNumber : pageCount + 1;
    const endPage = Math.max(startPage, nextStart - 1);
    sections.push({
      title: uniqueStarts[i].title,
      startPage,
      endPage,
    });
  }

  const padWidth = Math.max(2, String(sections.length).length);
  return sections.map((section, idx) => {
    const pageIndices = Array.from(
      { length: section.endPage - section.startPage + 1 },
      (_, offset) => section.startPage - 1 + offset,
    );
    const padded = String(idx + 1).padStart(padWidth, '0');
    const titleSlug = sanitizeFilenameSegment(section.title, `chapter_${padded}`);
    return {
      id: `bookmark-${idx + 1}-${section.startPage}`,
      label: section.title,
      filename: `${base}_${padded}_${titleSlug}.pdf`,
      pageIndices,
      pageRangeLabel: formatPageRangeLabel(pageIndices),
    };
  });
}

export async function executeSplitPlan(
  sourceBytes: ArrayBuffer | Uint8Array,
  plan: SplitPartPlan[],
): Promise<GeneratedSplitPart[]> {
  if (plan.length === 0) {
    throw new Error('Select at least one page or split part before exporting.');
  }

  const sourcePdf = await PDFDocument.load(sourceBytes, { updateMetadata: false });
  const results: GeneratedSplitPart[] = [];

  for (const part of plan) {
    const output = await PDFDocument.create();
    const copiedPages = await output.copyPages(sourcePdf, part.pageIndices);
    copiedPages.forEach(page => output.addPage(page));
    const bytes = await output.save();
    results.push({
      filename: part.filename,
      bytes,
      pageCount: part.pageIndices.length,
    });
  }

  return results;
}
