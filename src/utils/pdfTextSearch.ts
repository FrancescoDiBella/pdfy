export interface TextContentItemLike {
  str: string;
  hasEOL?: boolean;
  transform?: number[];
}

export interface ExtractedPageText {
  pageNumber: number;
  text: string;
}

export interface TextSearchMatch {
  id: string;
  pageNumber: number;
  matchIndexInPage: number;
  start: number;
  end: number;
  matchText: string;
  snippetPrefix: string;
  snippetMatch: string;
  snippetSuffix: string;
}

export interface RawOutlineItem {
  title?: string | null;
  dest?: unknown;
  items?: RawOutlineItem[] | null;
}

export interface FlattenedOutlineItem {
  id: string;
  title: string;
  depth: number;
  pageNumber: number | null;
}

export function normalizePageTextItems(items: TextContentItemLike[]): string {
  const lines: string[] = [];
  let currentLine = '';
  let prevY: number | null = null;

  const flushLine = () => {
    const trimmed = currentLine.trim();
    if (trimmed) lines.push(trimmed);
    currentLine = '';
  };

  for (const item of items) {
    const token = item.str ?? '';
    const y = Array.isArray(item.transform) && item.transform.length >= 6 ? item.transform[5] : null;

    if (prevY !== null && y !== null && Math.abs(y - prevY) > 4) {
      flushLine();
    }

    if (token) {
      if (currentLine && !currentLine.endsWith(' ') && !token.startsWith(' ')) {
        currentLine += ' ';
      }
      currentLine += token;
    }

    if (item.hasEOL) {
      flushLine();
      prevY = null;
    } else if (y !== null) {
      prevY = y;
    }
  }

  flushLine();
  return lines.join('\n');
}

export function buildDocumentPlainText(pages: ExtractedPageText[]): string {
  if (pages.length === 0) return '';
  return pages
    .map(page => `--- Page ${page.pageNumber} ---\n${page.text.trim()}`)
    .join('\n\n')
    .trimEnd();
}

export function searchDocumentPages(
  pages: ExtractedPageText[],
  rawQuery: string,
  snippetRadius = 28,
): TextSearchMatch[] {
  const query = rawQuery.trim();
  if (!query) return [];

  const lowerQuery = query.toLowerCase();
  const matches: TextSearchMatch[] = [];

  for (const page of pages) {
    const source = page.text;
    const lowerSource = source.toLowerCase();
    let fromIndex = 0;
    let matchIndexInPage = 0;

    while (fromIndex <= lowerSource.length - lowerQuery.length) {
      const idx = lowerSource.indexOf(lowerQuery, fromIndex);
      if (idx === -1) break;

      const end = idx + query.length;
      const prefixStart = Math.max(0, idx - snippetRadius);
      const suffixEnd = Math.min(source.length, end + snippetRadius);

      const rawPrefix = source.slice(prefixStart, idx).replace(/\s+/g, ' ');
      const rawMatch = source.slice(idx, end);
      const rawSuffix = source.slice(end, suffixEnd).replace(/\s+/g, ' ');

      matches.push({
        id: `p${page.pageNumber}-m${matchIndexInPage}`,
        pageNumber: page.pageNumber,
        matchIndexInPage,
        start: idx,
        end,
        matchText: rawMatch,
        snippetPrefix: (prefixStart > 0 ? '…' : '') + rawPrefix,
        snippetMatch: rawMatch,
        snippetSuffix: rawSuffix + (suffixEnd < source.length ? '…' : ''),
      });

      matchIndexInPage += 1;
      fromIndex = idx + Math.max(1, lowerQuery.length);
    }
  }

  return matches;
}

export async function flattenOutlineItems(
  items: RawOutlineItem[] | null | undefined,
  resolvePageNumber: (dest: unknown) => Promise<number | null>,
  depth = 0,
): Promise<FlattenedOutlineItem[]> {
  if (!items || items.length === 0) return [];
  const flattened: FlattenedOutlineItem[] = [];

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const title = (item.title ?? '').trim() || 'Untitled section';
    let pageNumber: number | null = null;
    if (item.dest != null) {
      try {
        pageNumber = await resolvePageNumber(item.dest);
      } catch {
        pageNumber = null;
      }
    }
    flattened.push({
      id: `outline-${depth}-${index}-${flattened.length}`,
      title,
      depth,
      pageNumber,
    });
    if (item.items && item.items.length > 0) {
      const nested = await flattenOutlineItems(item.items, resolvePageNumber, depth + 1);
      flattened.push(...nested);
    }
  }

  return flattened;
}
