import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRef,
  PDFString,
} from 'pdf-lib';

export interface BookmarkNode {
  id: string;
  title: string;
  pageNumber: number;
  depth: number;
}

export interface BookmarkTreeNode {
  title: string;
  pageNumber: number;
  children: BookmarkTreeNode[];
}

export interface HeadingTextItemLike {
  str: string;
  hasEOL?: boolean;
  transform?: number[];
  fontName?: string;
}

export interface PageHeadingInput {
  pageNumber: number;
  items: HeadingTextItemLike[];
}

export const MAX_BOOKMARK_DEPTH = 3;

export function normalizeBookmarkDepths(
  items: BookmarkNode[],
  maxDepth = MAX_BOOKMARK_DEPTH,
): BookmarkNode[] {
  const normalized: BookmarkNode[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const prevDepth = i === 0 ? -1 : normalized[i - 1].depth;
    const clampedDepth = Math.max(0, Math.min(maxDepth, prevDepth + 1, Math.floor(item.depth)));
    normalized.push({
      ...item,
      depth: clampedDepth,
    });
  }
  return normalized;
}

export function moveBookmark(
  items: BookmarkNode[],
  index: number,
  direction: -1 | 1,
): BookmarkNode[] {
  const target = index + direction;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) {
    return items;
  }
  const copy = items.slice();
  const [moved] = copy.splice(index, 1);
  copy.splice(target, 0, moved);
  return normalizeBookmarkDepths(copy);
}

export function indentBookmark(
  items: BookmarkNode[],
  index: number,
  maxDepth = MAX_BOOKMARK_DEPTH,
): BookmarkNode[] {
  if (index <= 0 || index >= items.length) return items;
  const prevDepth = items[index - 1].depth;
  const nextDepth = Math.min(maxDepth, prevDepth + 1, items[index].depth + 1);
  if (nextDepth === items[index].depth) return items;
  const copy = items.map((item, idx) => (idx === index ? { ...item, depth: nextDepth } : item));
  return normalizeBookmarkDepths(copy, maxDepth);
}

export function outdentBookmark(items: BookmarkNode[], index: number): BookmarkNode[] {
  if (index < 0 || index >= items.length || items[index].depth <= 0) return items;
  const copy = items.map((item, idx) => (idx === index ? { ...item, depth: item.depth - 1 } : item));
  return normalizeBookmarkDepths(copy);
}

export function buildBookmarkTree(items: BookmarkNode[]): BookmarkTreeNode[] {
  const normalized = normalizeBookmarkDepths(items);
  const roots: BookmarkTreeNode[] = [];
  const stack: Array<{ depth: number; node: BookmarkTreeNode }> = [];

  for (const item of normalized) {
    const node: BookmarkTreeNode = {
      title: item.title.trim() || `Page ${item.pageNumber}`,
      pageNumber: Math.max(1, Math.floor(item.pageNumber)),
      children: [],
    };
    while (stack.length > 0 && stack[stack.length - 1].depth >= item.depth) {
      stack.pop();
    }
    if (stack.length === 0) {
      roots.push(node);
    } else {
      stack[stack.length - 1].node.children.push(node);
    }
    stack.push({ depth: item.depth, node });
  }

  return roots;
}

interface DetectedLine {
  pageNumber: number;
  text: string;
  fontSize: number;
  isBold: boolean;
}

function extractLinesWithFontMetrics(pages: PageHeadingInput[]): DetectedLine[] {
  const allLines: DetectedLine[] = [];

  for (const page of pages) {
    let text = '';
    let prevY: number | null = null;
    let maxFontSize = 0;
    let boldChars = 0;
    let totalChars = 0;

    const flush = () => {
      const cleaned = text.replace(/\s+/g, ' ').trim();
      if (cleaned && maxFontSize > 0) {
        allLines.push({
          pageNumber: page.pageNumber,
          text: cleaned,
          fontSize: Math.round(maxFontSize * 10) / 10,
          isBold: totalChars > 0 && boldChars / totalChars >= 0.5,
        });
      }
      text = '';
      maxFontSize = 0;
      boldChars = 0;
      totalChars = 0;
    };

    for (const item of page.items) {
      const token = item.str ?? '';
      const transform = Array.isArray(item.transform) && item.transform.length >= 6 ? item.transform : null;
      const y = transform ? transform[5] : null;
      const fontSize = transform
        ? Math.max(Math.hypot(transform[0], transform[1]), Math.hypot(transform[2], transform[3]))
        : 0;

      if (prevY !== null && y !== null && Math.abs(y - prevY) > 4) {
        flush();
      }

      const trimmedToken = token.trim();
      if (token) {
        if (text && !text.endsWith(' ') && !token.startsWith(' ')) {
          text += ' ';
        }
        text += token;
      }
      if (trimmedToken) {
        if (fontSize > maxFontSize) maxFontSize = fontSize;
        totalChars += trimmedToken.length;
        if (item.fontName && /bold|black|heavy|semibold|demi/i.test(item.fontName)) {
          boldChars += trimmedToken.length;
        }
      }

      if (item.hasEOL) {
        flush();
        prevY = null;
      } else if (y !== null) {
        prevY = y;
      }
    }

    flush();
  }

  return allLines;
}

function isLikelyHeadingText(text: string): boolean {
  if (text.length < 3 || text.length > 110) return false;
  // Skip purely numeric page numbers / dividers / punctuation
  if (/^[\d\s./\-–—|:]+$/.test(text)) return false;
  if (/^page\s+\d+(\s*(\/|of)\s*\d+)?$/i.test(text)) return false;
  return true;
}

/**
 * Automatically detects likely section & subsection headings from pdfjs text metrics
 * by comparing each line's font size against the document's median body text size.
 */
export function detectHeadingsFromTextItems(pages: PageHeadingInput[]): BookmarkNode[] {
  const lines = extractLinesWithFontMetrics(pages);
  if (lines.length === 0) return [];

  // Estimate body font size using the character-weighted mode (rounded to 0.5pt buckets)
  // so headings never skew the baseline body size on short documents.
  const charCountBySize = new Map<number, number>();
  for (const line of lines) {
    const bucket = Math.round(line.fontSize * 2) / 2;
    charCountBySize.set(bucket, (charCountBySize.get(bucket) ?? 0) + line.text.length);
  }
  let bodySize = 11;
  let bestCharCount = -1;
  for (const [size, count] of charCountBySize.entries()) {
    if (count > bestCharCount || (count === bestCharCount && size < bodySize)) {
      bestCharCount = count;
      bodySize = size;
    }
  }
  const primaryThreshold = bodySize * 1.18;

  let candidates = lines.filter(
    line => isLikelyHeadingText(line.text) && line.fontSize >= primaryThreshold,
  );

  // Fallback for uniform-size PDFs: bold numbered/uppercase headings slightly larger than body
  if (candidates.length === 0) {
    candidates = lines.filter(
      line =>
        isLikelyHeadingText(line.text)
        && line.isBold
        && line.fontSize >= bodySize * 1.02
        && line.text.length <= 72,
    );
  }

  if (candidates.length === 0) return [];

  // Cluster distinct heading sizes (within 1.2pt) to assign depth 0 vs depth 1
  const distinctSizes: number[] = [];
  for (const size of [...candidates.map(c => c.fontSize)].sort((a, b) => b - a)) {
    if (!distinctSizes.some(existing => Math.abs(existing - size) <= 1.2)) {
      distinctSizes.push(size);
    }
  }
  const topSize = distinctSizes[0];

  const seenPerPage = new Set<string>();
  const detected: BookmarkNode[] = [];

  for (const candidate of candidates) {
    const dedupeKey = `${candidate.pageNumber}:${candidate.text.toLowerCase()}`;
    if (seenPerPage.has(dedupeKey)) continue;
    seenPerPage.add(dedupeKey);

    const depth = distinctSizes.length > 1 && topSize - candidate.fontSize > 1.5 ? 1 : 0;
    detected.push({
      id: `detected-${candidate.pageNumber}-${detected.length + 1}`,
      title: candidate.text,
      pageNumber: candidate.pageNumber,
      depth,
    });
  }

  return normalizeBookmarkDepths(detected, 2);
}

function countVisibleDescendants(node: BookmarkTreeNode): number {
  let count = 0;
  for (const child of node.children) {
    count += 1 + countVisibleDescendants(child);
  }
  return count;
}

function writeOutlineSiblings(
  pdf: PDFDocument,
  nodes: BookmarkTreeNode[],
  parentRef: PDFRef,
  pageRefs: PDFRef[],
): { first: PDFRef; last: PDFRef; totalCount: number } {
  const refs = nodes.map(() => pdf.context.nextRef());
  let totalCount = 0;

  nodes.forEach((node, idx) => {
    const pageIndex = Math.max(0, Math.min(pageRefs.length - 1, node.pageNumber - 1));
    const dict = pdf.context.obj({
      Title: PDFHexString.fromText(node.title),
      Parent: parentRef,
      Dest: pdf.context.obj([pageRefs[pageIndex], PDFName.of('Fit')]),
    });

    if (idx > 0) dict.set(PDFName.of('Prev'), refs[idx - 1]);
    if (idx + 1 < refs.length) dict.set(PDFName.of('Next'), refs[idx + 1]);

    totalCount += 1;
    if (node.children.length > 0) {
      const childSummary = writeOutlineSiblings(pdf, node.children, refs[idx], pageRefs);
      dict.set(PDFName.of('First'), childSummary.first);
      dict.set(PDFName.of('Last'), childSummary.last);
      dict.set(PDFName.of('Count'), pdf.context.obj(countVisibleDescendants(node)));
      totalCount += childSummary.totalCount;
    }

    pdf.context.assign(refs[idx], dict);
  });

  return {
    first: refs[0],
    last: refs[refs.length - 1],
    totalCount,
  };
}

/**
 * Writes a spec-compliant nested PDF /Outlines bookmark tree directly into a PDF document.
 * Passing an empty array removes any existing outline tree cleanly.
 */
export async function writePDFBookmarks(
  bytes: ArrayBuffer | Uint8Array,
  bookmarks: BookmarkNode[],
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  const pages = pdf.getPages();
  if (pages.length === 0) throw new Error('Empty PDF');

  const existingOutline = pdf.catalog.get(PDFName.of('Outlines'));
  if (existingOutline) {
    pdf.catalog.delete(PDFName.of('Outlines'));
    if (existingOutline instanceof PDFRef) {
      pdf.context.delete(existingOutline);
    }
  }

  const cleaned = bookmarks
    .map(item => ({
      ...item,
      title: item.title.trim(),
      pageNumber: Math.max(1, Math.min(pages.length, Math.floor(item.pageNumber || 1))),
    }))
    .filter(item => item.title.length > 0);

  if (cleaned.length === 0) {
    pdf.catalog.delete(PDFName.of('PageMode'));
    return pdf.save({ useObjectStreams: true, updateFieldAppearances: false });
  }

  const tree = buildBookmarkTree(cleaned);
  const pageRefs = pages.map(page => page.ref);
  const outlinesRef = pdf.context.nextRef();
  const rootSummary = writeOutlineSiblings(pdf, tree, outlinesRef, pageRefs);

  pdf.context.assign(
    outlinesRef,
    pdf.context.obj({
      Type: 'Outlines',
      First: rootSummary.first,
      Last: rootSummary.last,
      Count: rootSummary.totalCount,
    }),
  );
  pdf.catalog.set(PDFName.of('Outlines'), outlinesRef);
  pdf.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));

  return pdf.save({ useObjectStreams: true, updateFieldAppearances: false });
}

function decodeTitleObject(raw: unknown): string {
  if (raw instanceof PDFHexString) return raw.decodeText();
  if (raw instanceof PDFString) return raw.decodeText();
  return '';
}

/**
 * Reads back a PDF's /Outlines tree using pdf-lib (resolving direct /Dest page refs).
 * Useful both for unit-test round-trip verification and as a lightweight fallback reader.
 */
export async function readPDFBookmarks(bytes: ArrayBuffer | Uint8Array): Promise<BookmarkNode[]> {
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  const pageRefToNumber = new Map<string, number>();
  pdf.getPages().forEach((page, idx) => {
    pageRefToNumber.set(page.ref.toString(), idx + 1);
  });

  const outlinesRaw = pdf.catalog.get(PDFName.of('Outlines'));
  const outlinesDict = outlinesRaw ? pdf.context.lookup(outlinesRaw) : undefined;
  if (!(outlinesDict instanceof PDFDict)) return [];

  const result: BookmarkNode[] = [];
  const visited = new Set<string>();

  const walk = (firstRef: unknown, depth: number) => {
    let cursor = firstRef;
    while (cursor) {
      const key = cursor instanceof PDFRef ? cursor.toString() : '';
      if (key) {
        if (visited.has(key)) break;
        visited.add(key);
      }
      const dict = pdf.context.lookup(cursor as PDFRef);
      if (!(dict instanceof PDFDict)) break;

      const title = decodeTitleObject(pdf.context.lookup(dict.get(PDFName.of('Title')))) || 'Untitled';
      let pageNumber = 1;
      const destRaw = dict.get(PDFName.of('Dest'));
      const dest = destRaw ? pdf.context.lookup(destRaw) : undefined;
      if (dest instanceof PDFArray && dest.size() > 0) {
        const firstEntry = dest.get(0);
        if (firstEntry instanceof PDFRef) {
          pageNumber = pageRefToNumber.get(firstEntry.toString()) ?? 1;
        }
      }

      result.push({
        id: `bm-${result.length + 1}`,
        title,
        pageNumber,
        depth,
      });

      const firstChild = dict.get(PDFName.of('First'));
      if (firstChild && depth < MAX_BOOKMARK_DEPTH) {
        walk(firstChild, depth + 1);
      }
      cursor = dict.get(PDFName.of('Next'));
    }
  };

  walk(outlinesDict.get(PDFName.of('First')), 0);
  return result;
}
