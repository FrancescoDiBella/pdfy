import { PDFDocument } from 'pdf-lib';
import type { EditorElement } from '../components/editor/types.ts';

export const REDACTION_BURN_IN_DPI = 216;

export interface RasterizedPageImage {
  mimeType: 'image/png' | 'image/jpeg';
  bytes: Uint8Array;
  widthPt: number;
  heightPt: number;
}

export function getRedactedPageIndices(
  elements: readonly Pick<EditorElement, 'type' | 'pageIndex'>[],
  pageCount: number,
): number[] {
  const indices = new Set<number>();
  for (const element of elements) {
    if (element.type !== 'redact') continue;
    const pageIndex = element.pageIndex ?? 0;
    if (Number.isInteger(pageIndex) && pageIndex >= 0 && pageIndex < pageCount) {
      indices.add(pageIndex);
    }
  }
  return [...indices].sort((a, b) => a - b);
}

async function yieldToMainThread(): Promise<void> {
  const globalScheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (globalScheduler && typeof globalScheduler.yield === 'function') {
    await globalScheduler.yield();
  } else {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
}

export async function assembleBurnedInRedactions(
  editedPdfBytes: Uint8Array,
  redactedPageIndices: readonly number[],
  renderPage: (pageIndex: number) => Promise<RasterizedPageImage>,
): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(editedPdfBytes, { updateMetadata: false });
  const pageCount = srcDoc.getPageCount();
  const redactedSet = new Set(
    redactedPageIndices.filter(index => Number.isInteger(index) && index >= 0 && index < pageCount),
  );
  if (redactedSet.size === 0) {
    return editedPdfBytes;
  }

  // Build into a fresh PDFDocument so original text streams, XObjects, and annotations
  // from redacted pages cannot remain as orphaned indirect objects in the exported binary.
  const outDoc = await PDFDocument.create();

  try {
    const title = srcDoc.getTitle();
    const author = srcDoc.getAuthor();
    const subject = srcDoc.getSubject();
    const creator = srcDoc.getCreator();
    const producer = srcDoc.getProducer();
    const keywords = srcDoc.getKeywords();
    if (title) outDoc.setTitle(title);
    if (author) outDoc.setAuthor(author);
    if (subject) outDoc.setSubject(subject);
    if (creator) outDoc.setCreator(creator);
    if (producer) outDoc.setProducer(producer);
    if (keywords) {
      const parsed = keywords.split(',').map(word => word.trim()).filter(Boolean);
      if (parsed.length > 0) outDoc.setKeywords(parsed);
    }
  } catch {
    // Proceed cleanly without copying document metadata if header fields fail to parse.
  }

  let deadline = performance.now() + 50;

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    if (redactedSet.has(pageIndex)) {
      const rasterized = await renderPage(pageIndex);
      const width = Math.max(1, rasterized.widthPt);
      const height = Math.max(1, rasterized.heightPt);
      const embedded = rasterized.mimeType === 'image/jpeg'
        ? await outDoc.embedJpg(rasterized.bytes)
        : await outDoc.embedPng(rasterized.bytes);
      const outPage = outDoc.addPage([width, height]);
      outPage.drawImage(embedded, {
        x: 0,
        y: 0,
        width,
        height,
      });
    } else {
      const [copiedPage] = await outDoc.copyPages(srcDoc, [pageIndex]);
      outDoc.addPage(copiedPage);
    }

    if (performance.now() >= deadline) {
      await yieldToMainThread();
      deadline = performance.now() + 50;
    }
  }

  return await outDoc.save({ useObjectStreams: true });
}
