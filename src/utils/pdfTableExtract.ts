export interface TableTextItemLike {
  str: string;
  transform?: number[];
  width?: number;
}

export interface PageTableTextInput {
  pageNumber: number;
  items: TableTextItemLike[];
}

export interface TableExtractOptions {
  yTolerancePt?: number;
  columnGapPt?: number;
  maxRowSpacingPt?: number;
}

export interface ExtractedPDFTable {
  id: string;
  pageNumber: number;
  tableIndexInPage: number;
  columnCount: number;
  rows: string[][];
}

interface PositionedToken {
  text: string;
  x: number;
  xEnd: number;
  y: number;
}

interface CellSpan {
  xStart: number;
  xEnd: number;
  text: string;
}

interface VisualRow {
  y: number;
  cells: CellSpan[];
}

function estimateTokenEnd(item: TableTextItemLike, x: number): number {
  if (typeof item.width === 'number' && Number.isFinite(item.width) && item.width > 0) {
    return x + item.width;
  }
  const fontSize = Array.isArray(item.transform) && item.transform.length >= 6
    ? Math.max(6, Math.hypot(item.transform[0], item.transform[1]))
    : 10;
  return x + item.str.length * fontSize * 0.55;
}

function clusterItemsIntoRows(
  items: TableTextItemLike[],
  yTolerancePt: number,
  columnGapPt: number,
): VisualRow[] {
  const tokens: PositionedToken[] = [];
  for (const item of items) {
    const text = (item.str ?? '').trim();
    if (!text) continue;
    if (!Array.isArray(item.transform) || item.transform.length < 6) continue;
    const x = item.transform[4];
    const y = item.transform[5];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    tokens.push({
      text,
      x,
      xEnd: estimateTokenEnd(item, x),
      y,
    });
  }

  if (tokens.length === 0) return [];

  // Sort top-to-bottom (higher Y first in PDF coordinates), then left-to-right
  tokens.sort((a, b) => (Math.abs(b.y - a.y) > yTolerancePt ? b.y - a.y : a.x - b.x));

  const rawRows: Array<{ ySum: number; count: number; tokens: PositionedToken[] }> = [];
  for (const token of tokens) {
    const targetRow = rawRows.find(row => Math.abs(row.ySum / row.count - token.y) <= yTolerancePt);
    if (targetRow) {
      targetRow.tokens.push(token);
      targetRow.ySum += token.y;
      targetRow.count += 1;
    } else {
      rawRows.push({ ySum: token.y, count: 1, tokens: [token] });
    }
  }

  rawRows.sort((a, b) => (b.ySum / b.count) - (a.ySum / a.count));

  return rawRows.map(row => {
    row.tokens.sort((a, b) => a.x - b.x);
    const cells: CellSpan[] = [];
    for (const token of row.tokens) {
      const prev = cells[cells.length - 1];
      if (prev && token.x - prev.xEnd <= columnGapPt) {
        prev.text = `${prev.text} ${token.text}`.replace(/\s+/g, ' ').trim();
        prev.xEnd = Math.max(prev.xEnd, token.xEnd);
      } else {
        cells.push({
          xStart: token.x,
          xEnd: token.xEnd,
          text: token.text,
        });
      }
    }
    return {
      y: row.ySum / row.count,
      cells,
    };
  });
}

function buildAlignedGrid(blockRows: VisualRow[], alignTolerancePt: number): string[][] {
  const xStarts = blockRows.flatMap(row => row.cells.map(cell => cell.xStart)).sort((a, b) => a - b);
  const anchors: Array<{ sum: number; count: number }> = [];

  for (const x of xStarts) {
    const existing = anchors.find(anchor => Math.abs(anchor.sum / anchor.count - x) <= alignTolerancePt);
    if (existing) {
      existing.sum += x;
      existing.count += 1;
    } else {
      anchors.push({ sum: x, count: 1 });
    }
  }

  const colPositions = anchors.map(a => a.sum / a.count).sort((a, b) => a - b);
  if (colPositions.length < 2) return [];

  const grid: string[][] = blockRows.map(row => {
    const cells = Array.from({ length: colPositions.length }, () => '');
    for (const span of row.cells) {
      let bestCol = 0;
      let bestDist = Infinity;
      for (let c = 0; c < colPositions.length; c++) {
        const dist = Math.abs(colPositions[c] - span.xStart);
        if (dist < bestDist) {
          bestDist = dist;
          bestCol = c;
        }
      }
      cells[bestCol] = cells[bestCol] ? `${cells[bestCol]} ${span.text}` : span.text;
    }
    return cells;
  });

  // Drop columns that are completely empty across all rows
  const nonEmptyColIndices: number[] = [];
  for (let c = 0; c < colPositions.length; c++) {
    if (grid.some(row => row[c].trim().length > 0)) {
      nonEmptyColIndices.push(c);
    }
  }
  if (nonEmptyColIndices.length < 2) return [];

  return grid.map(row => nonEmptyColIndices.map(c => row[c]));
}

/**
 * Extracts structured multi-column tables from pdfjs text items across one or more pages.
 */
export function extractTablesFromPages(
  pages: PageTableTextInput[],
  options: TableExtractOptions = {},
): ExtractedPDFTable[] {
  const yTolerancePt = options.yTolerancePt ?? 5;
  const columnGapPt = options.columnGapPt ?? 14;
  const maxRowSpacingPt = options.maxRowSpacingPt ?? 40;
  const alignTolerancePt = Math.max(16, columnGapPt * 1.4);

  const tables: ExtractedPDFTable[] = [];

  for (const page of pages) {
    const rows = clusterItemsIntoRows(page.items, yTolerancePt, columnGapPt);
    const blocks: VisualRow[][] = [];
    let currentBlock: VisualRow[] = [];

    const flushBlock = () => {
      if (currentBlock.length >= 2) {
        blocks.push(currentBlock);
      }
      currentBlock = [];
    };

    for (const row of rows) {
      const isTabular = row.cells.length >= 2;
      if (!isTabular) {
        flushBlock();
        continue;
      }
      if (currentBlock.length > 0) {
        const prevRow = currentBlock[currentBlock.length - 1];
        const verticalGap = Math.abs(prevRow.y - row.y);
        const colDelta = Math.abs(prevRow.cells.length - row.cells.length);
        const blockLeftEdge = Math.min(...currentBlock.map(r => r.cells[0].xStart));
        const indentedSummaryFooter =
          currentBlock.length >= 2
          && colDelta >= 2
          && row.cells[0].xStart - blockLeftEdge > alignTolerancePt * 2;
        if (verticalGap > maxRowSpacingPt || (colDelta >= 2 && verticalGap > 28) || indentedSummaryFooter) {
          flushBlock();
        }
      }
      currentBlock.push(row);
    }
    flushBlock();

    let tableIndexInPage = 0;
    for (const block of blocks) {
      const grid = buildAlignedGrid(block, alignTolerancePt);
      if (grid.length >= 2 && grid[0].length >= 2) {
        tableIndexInPage += 1;
        tables.push({
          id: `p${page.pageNumber}-t${tableIndexInPage}`,
          pageNumber: page.pageNumber,
          tableIndexInPage,
          columnCount: grid[0].length,
          rows: grid,
        });
      }
    }
  }

  return tables;
}

export function splitTableHeaderAndBody(
  table: ExtractedPDFTable,
  firstRowIsHeader: boolean,
): { headers: string[]; bodyRows: string[][] } {
  if (firstRowIsHeader && table.rows.length > 1) {
    const headers = table.rows[0].map((cell, idx) => cell.trim() || `Column ${idx + 1}`);
    return {
      headers,
      bodyRows: table.rows.slice(1),
    };
  }
  const headers = Array.from({ length: table.columnCount }, (_, idx) => `Column ${idx + 1}`);
  return {
    headers,
    bodyRows: table.rows,
  };
}

function escapeCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function serializeTableToCSV(table: ExtractedPDFTable, firstRowIsHeader = true): string {
  const { headers, bodyRows } = splitTableHeaderAndBody(table, firstRowIsHeader);
  const allRows = [headers, ...bodyRows];
  return allRows.map(row => row.map(escapeCsvCell).join(',')).join('\r\n') + '\r\n';
}

export function serializeTableToTSV(table: ExtractedPDFTable, firstRowIsHeader = true): string {
  const { headers, bodyRows } = splitTableHeaderAndBody(table, firstRowIsHeader);
  const allRows = [headers, ...bodyRows];
  return allRows
    .map(row => row.map(cell => cell.replace(/[\t\r\n]+/g, ' ').trim()).join('\t'))
    .join('\n');
}

export function serializeTableToMarkdown(table: ExtractedPDFTable, firstRowIsHeader = true): string {
  const { headers, bodyRows } = splitTableHeaderAndBody(table, firstRowIsHeader);
  const escapeMd = (cell: string) => cell.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  const headerLine = `| ${headers.map(escapeMd).join(' | ')} |`;
  const sepLine = `| ${headers.map(() => '---').join(' | ')} |`;
  const bodyLines = bodyRows.map(row => `| ${row.map(escapeMd).join(' | ')} |`);
  return [headerLine, sepLine, ...bodyLines].join('\n') + '\n';
}

export function serializeTableToJSON(table: ExtractedPDFTable, firstRowIsHeader = true): string {
  const { headers, bodyRows } = splitTableHeaderAndBody(table, firstRowIsHeader);
  const used = new Map<string, number>();
  const uniqueKeys = headers.map(raw => {
    const count = (used.get(raw) ?? 0) + 1;
    used.set(raw, count);
    return count === 1 ? raw : `${raw}_${count}`;
  });

  const records = bodyRows.map(row => {
    const record: Record<string, string> = {};
    uniqueKeys.forEach((key, idx) => {
      record[key] = row[idx] ?? '';
    });
    return record;
  });

  return JSON.stringify(records, null, 2) + '\n';
}
