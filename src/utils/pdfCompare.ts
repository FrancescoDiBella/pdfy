export type DiffLineKind = 'equal' | 'added' | 'removed';

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
  lineNumberA: number | null;
  lineNumberB: number | null;
}

export interface TextDiffResult {
  lines: DiffLine[];
  addedCount: number;
  removedCount: number;
  unchangedCount: number;
  hasChanges: boolean;
}

export interface PixelDiffResult {
  width: number;
  height: number;
  diffData: Uint8ClampedArray;
  totalPixels: number;
  changedPixels: number;
  changedPercent: number;
  hasVisualChanges: boolean;
}

export type PageCompareStatus = 'unchanged' | 'changed' | 'only-in-a' | 'only-in-b';

export interface PageCompareSummary {
  pageNumber: number;
  status: PageCompareStatus;
  textDiff: TextDiffResult;
  pixelChangedPercent: number | null;
}

const MAX_LCS_CELLS = 160_000;

function splitNormalizedLines(text: string): string[] {
  if (!text) return [];
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
}

/**
 * Computes a line-level diff between two page text strings using common prefix/suffix
 * trimming plus bounded LCS dynamic programming.
 */
export function computeLineDiff(textA: string, textB: string): TextDiffResult {
  const linesA = splitNormalizedLines(textA);
  const linesB = splitNormalizedLines(textB);

  let prefix = 0;
  while (prefix < linesA.length && prefix < linesB.length && linesA[prefix] === linesB[prefix]) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < linesA.length - prefix
    && suffix < linesB.length - prefix
    && linesA[linesA.length - 1 - suffix] === linesB[linesB.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const midA = linesA.slice(prefix, linesA.length - suffix);
  const midB = linesB.slice(prefix, linesB.length - suffix);

  const result: DiffLine[] = [];

  for (let i = 0; i < prefix; i++) {
    result.push({ kind: 'equal', text: linesA[i], lineNumberA: i + 1, lineNumberB: i + 1 });
  }

  if (midA.length === 0) {
    for (let j = 0; j < midB.length; j++) {
      result.push({ kind: 'added', text: midB[j], lineNumberA: null, lineNumberB: prefix + j + 1 });
    }
  } else if (midB.length === 0) {
    for (let i = 0; i < midA.length; i++) {
      result.push({ kind: 'removed', text: midA[i], lineNumberA: prefix + i + 1, lineNumberB: null });
    }
  } else if (midA.length * midB.length <= MAX_LCS_CELLS) {
    const m = midA.length;
    const n = midB.length;
    const stride = n + 1;
    const dp = new Uint32Array((m + 1) * stride);

    for (let i = m - 1; i >= 0; i--) {
      for (let j = n - 1; j >= 0; j--) {
        if (midA[i] === midB[j]) {
          dp[i * stride + j] = dp[(i + 1) * stride + (j + 1)] + 1;
        } else {
          const down = dp[(i + 1) * stride + j];
          const right = dp[i * stride + (j + 1)];
          dp[i * stride + j] = down >= right ? down : right;
        }
      }
    }

    let i = 0;
    let j = 0;
    while (i < m && j < n) {
      if (midA[i] === midB[j]) {
        result.push({
          kind: 'equal',
          text: midA[i],
          lineNumberA: prefix + i + 1,
          lineNumberB: prefix + j + 1,
        });
        i += 1;
        j += 1;
      } else if (dp[(i + 1) * stride + j] >= dp[i * stride + (j + 1)]) {
        result.push({ kind: 'removed', text: midA[i], lineNumberA: prefix + i + 1, lineNumberB: null });
        i += 1;
      } else {
        result.push({ kind: 'added', text: midB[j], lineNumberA: null, lineNumberB: prefix + j + 1 });
        j += 1;
      }
    }
    while (i < m) {
      result.push({ kind: 'removed', text: midA[i], lineNumberA: prefix + i + 1, lineNumberB: null });
      i += 1;
    }
    while (j < n) {
      result.push({ kind: 'added', text: midB[j], lineNumberA: null, lineNumberB: prefix + j + 1 });
      j += 1;
    }
  } else {
    // Bounded fallback for unusually large pages (>400x400 differing lines)
    for (let i = 0; i < midA.length; i++) {
      result.push({ kind: 'removed', text: midA[i], lineNumberA: prefix + i + 1, lineNumberB: null });
    }
    for (let j = 0; j < midB.length; j++) {
      result.push({ kind: 'added', text: midB[j], lineNumberA: null, lineNumberB: prefix + j + 1 });
    }
  }

  for (let k = 0; k < suffix; k++) {
    const idxA = linesA.length - suffix + k;
    const idxB = linesB.length - suffix + k;
    result.push({ kind: 'equal', text: linesA[idxA], lineNumberA: idxA + 1, lineNumberB: idxB + 1 });
  }

  let addedCount = 0;
  let removedCount = 0;
  let unchangedCount = 0;
  for (const line of result) {
    if (line.kind === 'added') addedCount += 1;
    else if (line.kind === 'removed') removedCount += 1;
    else unchangedCount += 1;
  }

  return {
    lines: result,
    addedCount,
    removedCount,
    unchangedCount,
    hasChanges: addedCount > 0 || removedCount > 0,
  };
}

/**
 * Compares two RGBA pixel buffers (handling different page dimensions cleanly) and returns
 * a high-contrast diff overlay buffer:
 * - Crimson (#D62828) marks ink removed or darker in Document A
 * - Deep Teal (#0D6EA8) marks ink added or darker in Document B
 * - Vermilion (#B43C18) marks equal-luminance chromatic changes
 * - Softened grayscale shows unchanged context
 */
export function computePixelDiff(
  rgbaA: Uint8ClampedArray,
  widthA: number,
  heightA: number,
  rgbaB: Uint8ClampedArray,
  widthB: number,
  heightB: number,
  threshold = 24,
): PixelDiffResult {
  const width = Math.max(widthA, widthB);
  const height = Math.max(heightA, heightB);
  const totalPixels = width * height;
  const diffData = new Uint8ClampedArray(totalPixels * 4);
  const clampedThreshold = Math.max(1, Math.min(255, Math.round(threshold)));

  let changedPixels = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const outIdx = (y * width + x) * 4;

      const inA = x < widthA && y < heightA;
      const inB = x < widthB && y < heightB;

      let rA = 255;
      let gA = 255;
      let bA = 255;
      if (inA) {
        const idxA = (y * widthA + x) * 4;
        rA = rgbaA[idxA];
        gA = rgbaA[idxA + 1];
        bA = rgbaA[idxA + 2];
      }

      let rB = 255;
      let gB = 255;
      let bB = 255;
      if (inB) {
        const idxB = (y * widthB + x) * 4;
        rB = rgbaB[idxB];
        gB = rgbaB[idxB + 1];
        bB = rgbaB[idxB + 2];
      }

      const maxDelta = Math.max(Math.abs(rA - rB), Math.abs(gA - gB), Math.abs(bA - bB));
      if (maxDelta > clampedThreshold) {
        changedPixels += 1;
        const lumA = 0.299 * rA + 0.587 * gA + 0.114 * bA;
        const lumB = 0.299 * rB + 0.587 * gB + 0.114 * bB;
        if (lumA + 10 < lumB) {
          // Darker in A -> removed content (Crimson)
          diffData[outIdx] = 214;
          diffData[outIdx + 1] = 40;
          diffData[outIdx + 2] = 40;
        } else if (lumB + 10 < lumA) {
          // Darker in B -> added content (Deep Teal)
          diffData[outIdx] = 13;
          diffData[outIdx + 1] = 110;
          diffData[outIdx + 2] = 168;
        } else {
          // Chromatic shift (Vermilion)
          diffData[outIdx] = 180;
          diffData[outIdx + 1] = 60;
          diffData[outIdx + 2] = 24;
        }
        diffData[outIdx + 3] = 255;
      } else {
        // Soft context background so unchanged layout remains legible
        const gray = Math.round(0.299 * rB + 0.587 * gB + 0.114 * bB);
        const faded = Math.round(255 - (255 - gray) * 0.28);
        diffData[outIdx] = faded;
        diffData[outIdx + 1] = faded;
        diffData[outIdx + 2] = faded;
        diffData[outIdx + 3] = 255;
      }
    }
  }

  const changedPercent = totalPixels > 0 ? Math.round((changedPixels / totalPixels) * 10000) / 100 : 0;

  return {
    width,
    height,
    diffData,
    totalPixels,
    changedPixels,
    changedPercent,
    hasVisualChanges: changedPixels > 0,
  };
}

export function buildPageCompareSummaries(
  pagesA: string[],
  pagesB: string[],
): PageCompareSummary[] {
  const totalPages = Math.max(pagesA.length, pagesB.length);
  const summaries: PageCompareSummary[] = [];

  for (let i = 0; i < totalPages; i++) {
    const hasA = i < pagesA.length;
    const hasB = i < pagesB.length;
    const textA = hasA ? pagesA[i] : '';
    const textB = hasB ? pagesB[i] : '';
    const textDiff = computeLineDiff(textA, textB);

    let status: PageCompareStatus = 'unchanged';
    if (!hasA && hasB) status = 'only-in-b';
    else if (hasA && !hasB) status = 'only-in-a';
    else if (textDiff.hasChanges) status = 'changed';

    summaries.push({
      pageNumber: i + 1,
      status,
      textDiff,
      pixelChangedPercent: null,
    });
  }

  return summaries;
}

export function buildCompareReport(
  docAName: string,
  docBName: string,
  pageCountA: number,
  pageCountB: number,
  pages: PageCompareSummary[],
): string {
  const changedPages = pages.filter(p => p.status !== 'unchanged' || (p.pixelChangedPercent !== null && p.pixelChangedPercent > 0));
  const totalAdded = pages.reduce((sum, p) => sum + p.textDiff.addedCount, 0);
  const totalRemoved = pages.reduce((sum, p) => sum + p.textDiff.removedCount, 0);

  const lines: string[] = [
    '# PDFy Comparison Report',
    '',
    `- **Document A (Baseline):** ${docAName} (${pageCountA} ${pageCountA === 1 ? 'page' : 'pages'})`,
    `- **Document B (Revised):** ${docBName} (${pageCountB} ${pageCountB === 1 ? 'page' : 'pages'})`,
    `- **Changed pages:** ${changedPages.length} of ${pages.length}`,
    `- **Text diff totals:** +${totalAdded} added / -${totalRemoved} removed lines`,
    '',
  ];

  for (const page of pages) {
    const isVisualChanged = page.pixelChangedPercent !== null && page.pixelChangedPercent > 0;
    const statusLabel = page.status === 'only-in-a'
      ? 'Only in Document A'
      : page.status === 'only-in-b'
        ? 'Only in Document B'
        : page.status === 'changed' || isVisualChanged
          ? 'Changed'
          : 'Unchanged';
    const pixelNote = page.pixelChangedPercent !== null ? ` · ${page.pixelChangedPercent.toFixed(2)}% pixels changed` : '';
    lines.push(`## Page ${page.pageNumber} — ${statusLabel}${pixelNote}`);

    if (!page.textDiff.hasChanges) {
      lines.push('No text line changes detected.');
      lines.push('');
      continue;
    }

    lines.push('```diff');
    for (const entry of page.textDiff.lines) {
      if (entry.kind === 'added') lines.push(`+ ${entry.text}`);
      else if (entry.kind === 'removed') lines.push(`- ${entry.text}`);
      else lines.push(`  ${entry.text}`);
    }
    lines.push('```');
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}
