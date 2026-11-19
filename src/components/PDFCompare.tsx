import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Typography,
} from '@mui/material';
import {
  CompareArrowsOutlined,
  ContentCopy,
  DownloadOutlined,
  FolderOpenOutlined,
  NavigateBefore,
  NavigateNext,
  SwapHoriz,
} from '@mui/icons-material';
import { pdfjs } from 'react-pdf';
import type { PDFDocumentProxy, TextItem } from 'pdfjs-dist/types/src/display/api';
import ToolIntro from './ToolIntro';
import { preparePDFs } from '../utils/pdfMerge';
import { pdfDocumentOptions } from '../utils/pdfRendering';
import { generateSampleComparisonPair } from '../utils/pdfSamples';
import { normalizePageTextItems } from '../utils/pdfTextSearch';
import {
  buildCompareReport,
  buildPageCompareSummaries,
  computePixelDiff,
  type PageCompareSummary,
} from '../utils/pdfCompare';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

type CompareViewMode = 'side-by-side' | 'visual-diff' | 'text-diff';
type DiffSensitivity = 'strict' | 'standard' | 'relaxed';

const SENSITIVITY_THRESHOLDS: Record<DiffSensitivity, number> = {
  strict: 10,
  standard: 24,
  relaxed: 48,
};

let nextCompareDocId = 1;

interface LoadedCompareDoc {
  id: number;
  file: File;
  pageCount: number;
  pageTexts: string[];
  proxy: PDFDocumentProxy;
}

interface RenderedPageComparison {
  renderKey: string;
  pageNumber: number;
  imageUrlA: string | null;
  imageUrlB: string | null;
  diffImageUrl: string | null;
  pixelChangedPercent: number | null;
}

async function loadDocumentForCompare(file: File): Promise<LoadedCompareDoc> {
  const { accepted } = await preparePDFs([file]);
  if (!accepted.length) {
    throw new Error(`Could not open “${file.name}”. Choose a readable PDF with at least one page and no password protection.`);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({
    data: bytes,
    ...pdfDocumentOptions,
  });
  const proxy = await loadingTask.promise;
  const pageTexts: string[] = [];
  for (let p = 1; p <= proxy.numPages; p++) {
    const page = await proxy.getPage(p);
    const content = await page.getTextContent();
    const items = content.items.filter((item): item is TextItem => 'str' in item);
    pageTexts.push(normalizePageTextItems(items));
  }
  return {
    id: nextCompareDocId++,
    file,
    pageCount: proxy.numPages,
    pageTexts,
    proxy,
  };
}

async function renderPdfPageToCanvas(
  proxy: PDFDocumentProxy,
  pageNumber: number,
  targetWidth = 540,
): Promise<HTMLCanvasElement> {
  const page = await proxy.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(2, Math.max(0.5, targetWidth / Math.max(1, baseViewport.width)));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  return canvas;
}

export default function PDFCompare({
  initialFile,
  onSessionChange,
}: {
  initialFile?: File | null;
  active?: boolean;
  onSessionChange?: (active: boolean) => void;
}) {
  const [docA, setDocA] = useState<LoadedCompareDoc | null>(null);
  const [docB, setDocB] = useState<LoadedCompareDoc | null>(null);
  const [loadingSlot, setLoadingSlot] = useState<'a' | 'b' | 'sample' | null>(null);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState<CompareViewMode>('side-by-side');
  const [sensitivity, setSensitivity] = useState<DiffSensitivity>('standard');
  const [rendered, setRendered] = useState<RenderedPageComparison | null>(null);
  const [pixelMetrics, setPixelMetrics] = useState<Record<number, number>>({});

  const inputARef = useRef<HTMLInputElement>(null);
  const inputBRef = useRef<HTMLInputElement>(null);
  const docARef = useRef<LoadedCompareDoc | null>(null);
  const docBRef = useRef<LoadedCompareDoc | null>(null);
  const renderSeqRef = useRef(0);

  useEffect(() => {
    docARef.current = docA;
  }, [docA]);

  useEffect(() => {
    docBRef.current = docB;
  }, [docB]);

  useEffect(() => {
    onSessionChange?.(Boolean(docA || docB));
  }, [docA, docB, onSessionChange]);

  useEffect(() => () => {
    void docARef.current?.proxy.destroy();
    void docBRef.current?.proxy.destroy();
  }, []);

  const loadIntoSlot = useCallback(async (slot: 'a' | 'b', file: File) => {
    setLoadingSlot(slot);
    setError('');
    setStatusMessage('');
    try {
      const loaded = await loadDocumentForCompare(file);
      if (slot === 'a') {
        setDocA(prev => {
          if (prev && prev !== docBRef.current) void prev.proxy.destroy();
          return loaded;
        });
      } else {
        setDocB(prev => {
          if (prev && prev !== docARef.current) void prev.proxy.destroy();
          return loaded;
        });
      }
      setCurrentPage(1);
      setPixelMetrics({});
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not open “${file.name}”.`);
    } finally {
      setLoadingSlot(null);
    }
  }, []);

  // Load initialFile into Document A when handed off from Read or global drop.
  useEffect(() => {
    if (!initialFile) return;
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await loadDocumentForCompare(initialFile);
        if (cancelled) {
          void loaded.proxy.destroy();
          return;
        }
        setError('');
        setStatusMessage('');
        setDocA(prev => {
          if (prev && prev !== docBRef.current) void prev.proxy.destroy();
          return loaded;
        });
        setCurrentPage(1);
        setPixelMetrics({});
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : `Could not open “${initialFile.name}”.`);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialFile]);

  const loadSamplePair = async () => {
    setLoadingSlot('sample');
    setError('');
    setStatusMessage('');
    try {
      const { baseline, revised } = await generateSampleComparisonPair();
      const [loadedA, loadedB] = await Promise.all([
        loadDocumentForCompare(baseline),
        loadDocumentForCompare(revised),
      ]);
      setDocA(prev => {
        if (prev) void prev.proxy.destroy();
        return loadedA;
      });
      setDocB(prev => {
        if (prev) void prev.proxy.destroy();
        return loadedB;
      });
      setCurrentPage(1);
      setPixelMetrics({});
    } catch {
      setError('Could not generate the sample comparison documents. Try again.');
    } finally {
      setLoadingSlot(null);
    }
  };

  const swapDocuments = () => {
    setDocA(docB);
    setDocB(docA);
    setCurrentPage(1);
    setPixelMetrics({});
    setStatusMessage('Swapped Document A and Document B.');
  };

  const baseSummaries = useMemo<PageCompareSummary[]>(() => {
    if (!docA || !docB) return [];
    return buildPageCompareSummaries(docA.pageTexts, docB.pageTexts);
  }, [docA, docB]);

  const summaries = useMemo<PageCompareSummary[]>(
    () =>
      baseSummaries.map(item => ({
        ...item,
        pixelChangedPercent: pixelMetrics[item.pageNumber] ?? null,
      })),
    [baseSummaries, pixelMetrics],
  );

  const totalPages = summaries.length;
  const safePage = totalPages > 0 ? Math.min(currentPage, totalPages) : 1;
  const activeSummary = summaries[safePage - 1] ?? null;

  const changedPageNumbers = useMemo(
    () =>
      summaries
        .filter(item => item.status !== 'unchanged' || (item.pixelChangedPercent !== null && item.pixelChangedPercent > 0))
        .map(item => item.pageNumber),
    [summaries],
  );

  const totalAddedLines = useMemo(
    () => summaries.reduce((sum, item) => sum + item.textDiff.addedCount, 0),
    [summaries],
  );

  const totalRemovedLines = useMemo(
    () => summaries.reduce((sum, item) => sum + item.textDiff.removedCount, 0),
    [summaries],
  );

  const currentRenderKey = docA && docB
    ? `${docA.id}:${docB.id}:${safePage}:${sensitivity}`
    : '';

  const activeRendered = currentRenderKey && rendered?.renderKey === currentRenderKey ? rendered : null;
  const isRenderingPage = Boolean(docA && docB && totalPages > 0 && activeRendered === null);

  useEffect(() => {
    if (!docA || !docB || totalPages === 0 || !currentRenderKey) return;

    const seq = ++renderSeqRef.current;

    void (async () => {
      try {
        const hasA = safePage <= docA.pageCount;
        const hasB = safePage <= docB.pageCount;
        const [canvasA, canvasB] = await Promise.all([
          hasA ? renderPdfPageToCanvas(docA.proxy, safePage) : Promise.resolve(null),
          hasB ? renderPdfPageToCanvas(docB.proxy, safePage) : Promise.resolve(null),
        ]);
        if (seq !== renderSeqRef.current) return;

        const imageUrlA = canvasA ? canvasA.toDataURL('image/png') : null;
        const imageUrlB = canvasB ? canvasB.toDataURL('image/png') : null;
        let diffImageUrl: string | null = null;
        let pixelChangedPercent: number | null = null;

        if (canvasA || canvasB) {
          const ctxA = canvasA?.getContext('2d', { willReadFrequently: true });
          const ctxB = canvasB?.getContext('2d', { willReadFrequently: true });
          const dataA = ctxA && canvasA
            ? ctxA.getImageData(0, 0, canvasA.width, canvasA.height).data
            : new Uint8ClampedArray(0);
          const dataB = ctxB && canvasB
            ? ctxB.getImageData(0, 0, canvasB.width, canvasB.height).data
            : new Uint8ClampedArray(0);

          const diff = computePixelDiff(
            dataA,
            canvasA?.width ?? 0,
            canvasA?.height ?? 0,
            dataB,
            canvasB?.width ?? 0,
            canvasB?.height ?? 0,
            SENSITIVITY_THRESHOLDS[sensitivity],
          );

          const diffCanvas = document.createElement('canvas');
          diffCanvas.width = diff.width;
          diffCanvas.height = diff.height;
          const diffCtx = diffCanvas.getContext('2d');
          if (diffCtx) {
            const imgData = diffCtx.createImageData(diff.width, diff.height);
            imgData.data.set(diff.diffData);
            diffCtx.putImageData(imgData, 0, 0);
            diffImageUrl = diffCanvas.toDataURL('image/png');
          }
          pixelChangedPercent = diff.changedPercent;
        }

        if (seq !== renderSeqRef.current) return;
        setRendered({
          renderKey: currentRenderKey,
          pageNumber: safePage,
          imageUrlA,
          imageUrlB,
          diffImageUrl,
          pixelChangedPercent,
        });
        if (pixelChangedPercent !== null) {
          setPixelMetrics(prev => (prev[safePage] === pixelChangedPercent ? prev : { ...prev, [safePage]: pixelChangedPercent }));
        }
      } catch {
        if (seq === renderSeqRef.current) {
          setRendered({
            renderKey: currentRenderKey,
            pageNumber: safePage,
            imageUrlA: null,
            imageUrlB: null,
            diffImageUrl: null,
            pixelChangedPercent: null,
          });
        }
      }
    })();
  }, [docA, docB, safePage, totalPages, sensitivity, currentRenderKey]);

  const jumpChangedPage = (direction: -1 | 1) => {
    if (changedPageNumbers.length === 0) return;
    if (direction === 1) {
      const next = changedPageNumbers.find(p => p > safePage) ?? changedPageNumbers[0];
      setCurrentPage(next);
    } else {
      const prev = [...changedPageNumbers].reverse().find(p => p < safePage) ?? changedPageNumbers[changedPageNumbers.length - 1];
      setCurrentPage(prev);
    }
  };

  const reportMarkdown = useMemo(() => {
    if (!docA || !docB) return '';
    return buildCompareReport(docA.file.name, docB.file.name, docA.pageCount, docB.pageCount, summaries);
  }, [docA, docB, summaries]);

  const handleCopyReport = async () => {
    if (!reportMarkdown) return;
    try {
      await navigator.clipboard.writeText(reportMarkdown);
      setStatusMessage('Copied Markdown comparison report to clipboard.');
    } catch {
      setStatusMessage('Could not copy report to clipboard.');
    }
  };

  const handleDownloadReport = () => {
    if (!docA || !docB || !reportMarkdown) return;
    const blob = new Blob([reportMarkdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const stemA = docA.file.name.replace(/\.pdf$/i, '') || 'docA';
    const stemB = docB.file.name.replace(/\.pdf$/i, '') || 'docB';
    link.download = `compare_${stemA}_vs_${stemB}.md`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatusMessage('Downloaded Markdown comparison report.');
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <input
        ref={inputARef}
        type="file"
        accept="application/pdf,.pdf"
        aria-label="Baseline PDF (Document A)"
        hidden
        onChange={event => {
          const picked = event.target.files?.[0];
          event.target.value = '';
          if (picked) void loadIntoSlot('a', picked);
        }}
      />
      <input
        ref={inputBRef}
        type="file"
        accept="application/pdf,.pdf"
        aria-label="Revised PDF (Document B)"
        hidden
        onChange={event => {
          const picked = event.target.files?.[0];
          event.target.value = '';
          if (picked) void loadIntoSlot('b', picked);
        }}
      />

      {!docA && !docB && (
        <ToolIntro
          icon={<CompareArrowsOutlined />}
          title="Spot every visual and text change offline"
          description="Load a baseline PDF and a revised PDF to inspect side-by-side pages, pixel-level visual difference heatmaps, and line-by-line text diffs — 100% locally."
        >
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <Button
              variant="contained"
              disabled={loadingSlot !== null}
              startIcon={loadingSlot === 'sample' ? <CircularProgress size={18} color="inherit" /> : <CompareArrowsOutlined />}
              onClick={() => void loadSamplePair()}
            >
              Try sample comparison
            </Button>
          </Box>
        </ToolIntro>
      )}

      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) auto minmax(0, 1fr)' }, gap: 1.5, alignItems: 'stretch' }}>
          <Box sx={{ p: 1.5, borderRadius: 1.5, border: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.04em' }}>
              DOCUMENT A · BASELINE
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
              {docA ? docA.file.name : 'No baseline PDF selected'}
            </Typography>
            {docA && (
              <Typography variant="caption" color="text.secondary" className="tabular-nums">
                {docA.pageCount} {docA.pageCount === 1 ? 'page' : 'pages'} · {(docA.file.size / 1024).toFixed(1)} KB
              </Typography>
            )}
            <Box sx={{ mt: 'auto', pt: 0.5 }}>
              <Button
                size="small"
                variant={docA ? 'outlined' : 'contained'}
                startIcon={loadingSlot === 'a' ? <CircularProgress size={16} color="inherit" /> : <FolderOpenOutlined />}
                disabled={loadingSlot !== null}
                onClick={() => inputARef.current?.click()}
              >
                {docA ? 'Change Document A' : 'Choose Document A'}
              </Button>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<SwapHoriz />}
              disabled={(!docA && !docB) || loadingSlot !== null}
              onClick={swapDocuments}
            >
              Swap A / B
            </Button>
          </Box>

          <Box sx={{ p: 1.5, borderRadius: 1.5, border: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.04em' }}>
              DOCUMENT B · REVISED
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
              {docB ? docB.file.name : 'No revised PDF selected'}
            </Typography>
            {docB && (
              <Typography variant="caption" color="text.secondary" className="tabular-nums">
                {docB.pageCount} {docB.pageCount === 1 ? 'page' : 'pages'} · {(docB.file.size / 1024).toFixed(1)} KB
              </Typography>
            )}
            <Box sx={{ mt: 'auto', pt: 0.5 }}>
              <Button
                size="small"
                variant={docB ? 'outlined' : 'contained'}
                startIcon={loadingSlot === 'b' ? <CircularProgress size={16} color="inherit" /> : <FolderOpenOutlined />}
                disabled={loadingSlot !== null}
                onClick={() => inputBRef.current?.click()}
              >
                {docB ? 'Change Document B' : 'Choose Document B'}
              </Button>
            </Box>
          </Box>
        </Box>

        {(docA || docB) && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
            <Button size="small" variant="outlined" disabled={loadingSlot !== null} onClick={() => void loadSamplePair()}>
              Load sample comparison
            </Button>
            {docA && docB && (
              <>
                <Button size="small" variant="outlined" startIcon={<ContentCopy />} onClick={() => void handleCopyReport()}>
                  Copy report
                </Button>
                <Button size="small" variant="outlined" startIcon={<DownloadOutlined />} onClick={handleDownloadReport}>
                  Download .md report
                </Button>
              </>
            )}
          </Box>
        )}
      </Paper>

      {statusMessage && <Alert severity="info" onClose={() => setStatusMessage('')}>{statusMessage}</Alert>}

      {docA && docB && activeSummary && (
        <>
          <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
              <Box>
                <Typography variant="h2" className="tabular-nums" data-testid="compare-summary-heading">
                  {changedPageNumbers.length} of {totalPages} {totalPages === 1 ? 'page' : 'pages'} changed
                </Typography>
                <Typography variant="body2" color="text.secondary" className="tabular-nums">
                  +{totalAddedLines} added · -{totalRemovedLines} removed lines across document
                  {activeRendered?.pixelChangedPercent !== null && activeRendered?.pixelChangedPercent !== undefined
                    ? ` · Page ${safePage}: ${activeRendered.pixelChangedPercent.toFixed(2)}% pixels changed`
                    : ''}
                </Typography>
              </Box>
              <Box role="group" aria-label="Comparison view" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                {([
                  { id: 'side-by-side', label: 'Side by side' },
                  { id: 'visual-diff', label: 'Visual diff' },
                  { id: 'text-diff', label: 'Text diff' },
                ] as const).map(option => {
                  const isActive = viewMode === option.id;
                  return (
                    <Button
                      key={option.id}
                      size="small"
                      variant={isActive ? 'contained' : 'outlined'}
                      aria-pressed={isActive}
                      onClick={() => setViewMode(option.id)}
                    >
                      {option.label}
                    </Button>
                  );
                })}
              </Box>
            </Box>

            <Divider />

            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<NavigateBefore />}
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                >
                  Previous page
                </Button>
                <Typography variant="body2" className="tabular-nums" sx={{ fontWeight: 600 }} data-testid="compare-page-indicator">
                  Page {safePage} of {totalPages}
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  endIcon={<NavigateNext />}
                  disabled={safePage >= totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                >
                  Next page
                </Button>
              </Box>

              <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={changedPageNumbers.length === 0}
                  onClick={() => jumpChangedPage(-1)}
                >
                  Previous change
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={changedPageNumbers.length === 0}
                  onClick={() => jumpChangedPage(1)}
                >
                  Next change
                </Button>
                {viewMode === 'visual-diff' && (
                  <FormControl size="small" sx={{ minWidth: 148 }}>
                    <InputLabel id="compare-sensitivity-label">Pixel sensitivity</InputLabel>
                    <Select
                      labelId="compare-sensitivity-label"
                      label="Pixel sensitivity"
                      value={sensitivity}
                      onChange={event => setSensitivity(event.target.value as DiffSensitivity)}
                    >
                      <MenuItem value="strict">Strict (fine)</MenuItem>
                      <MenuItem value="standard">Standard</MenuItem>
                      <MenuItem value="relaxed">Relaxed (major)</MenuItem>
                    </Select>
                  </FormControl>
                )}
              </Box>
            </Box>
          </Paper>

          {viewMode === 'side-by-side' && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2, minWidth: 0 }}>
              <Paper variant="outlined" sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.25, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
                  Document A · Page {safePage}
                </Typography>
                <Box className="pdfy-workbench-mat" sx={{ p: 1.5, borderRadius: 1.5, display: 'grid', placeItems: 'center', minHeight: 240 }}>
                  {isRenderingPage ? (
                    <CircularProgress aria-label="Rendering baseline page" />
                  ) : activeRendered?.imageUrlA ? (
                    <Box
                      component="img"
                      src={activeRendered.imageUrlA}
                      alt={`Document A, page ${safePage}`}
                      sx={{ display: 'block', maxWidth: '100%', height: 'auto', bgcolor: '#FFFFFF', boxShadow: '0 2px 8px rgba(0,0,0,0.14)' }}
                    />
                  ) : (
                    <Typography variant="body2" color="text.secondary">Page {safePage} does not exist in Document A.</Typography>
                  )}
                </Box>
              </Paper>

              <Paper variant="outlined" sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.25, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
                  Document B · Page {safePage}
                </Typography>
                <Box className="pdfy-workbench-mat" sx={{ p: 1.5, borderRadius: 1.5, display: 'grid', placeItems: 'center', minHeight: 240 }}>
                  {isRenderingPage ? (
                    <CircularProgress aria-label="Rendering revised page" />
                  ) : activeRendered?.imageUrlB ? (
                    <Box
                      component="img"
                      src={activeRendered.imageUrlB}
                      alt={`Document B, page ${safePage}`}
                      sx={{ display: 'block', maxWidth: '100%', height: 'auto', bgcolor: '#FFFFFF', boxShadow: '0 2px 8px rgba(0,0,0,0.14)' }}
                    />
                  ) : (
                    <Typography variant="body2" color="text.secondary">Page {safePage} does not exist in Document B.</Typography>
                  )}
                </Box>
              </Paper>
            </Box>
          )}

          {viewMode === 'visual-diff' && (
            <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                <Typography variant="h3">Visual pixel diff · Page {safePage}</Typography>
                <Typography variant="caption" color="text.secondary">
                  Crimson = removed from A · Teal = added in B · Dimmed = unchanged context
                </Typography>
              </Box>
              <Box className="pdfy-workbench-mat" sx={{ p: 2, borderRadius: 1.5, display: 'grid', placeItems: 'center', minHeight: 280 }}>
                {isRenderingPage ? (
                  <CircularProgress aria-label="Computing visual pixel diff" />
                ) : activeRendered?.diffImageUrl ? (
                  <Box
                    component="img"
                    data-testid="visual-diff-image"
                    src={activeRendered.diffImageUrl}
                    alt={`Visual pixel difference overlay for page ${safePage}`}
                    sx={{ display: 'block', maxWidth: '100%', maxHeight: 720, height: 'auto', bgcolor: '#FFFFFF', boxShadow: '0 2px 8px rgba(0,0,0,0.16)' }}
                  />
                ) : (
                  <Typography variant="body2" color="text.secondary">Visual comparison unavailable for this page.</Typography>
                )}
              </Box>
            </Paper>
          )}

          {viewMode === 'text-diff' && (
            <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 1 }}>
                <Typography variant="h3">Text diff · Page {safePage}</Typography>
                <Typography variant="caption" color="text.secondary" className="tabular-nums">
                  +{activeSummary.textDiff.addedCount} added · -{activeSummary.textDiff.removedCount} removed · {activeSummary.textDiff.unchangedCount} unchanged
                </Typography>
              </Box>
              {activeSummary.textDiff.lines.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No selectable text detected on page {safePage}.</Typography>
              ) : !activeSummary.textDiff.hasChanges ? (
                <Alert severity="success">Page {safePage} text is identical in both documents.</Alert>
              ) : (
                <Box
                  component="ul"
                  aria-label={`Text diff lines for page ${safePage}`}
                  sx={{
                    listStyle: 'none',
                    m: 0,
                    p: 0,
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1.5,
                    overflow: 'hidden',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontSize: '0.8125rem',
                  }}
                >
                  {activeSummary.textDiff.lines.map((line, index) => (
                    <Box
                      component="li"
                      key={`${line.kind}-${index}`}
                      sx={theme => {
                        const isDark = theme.palette.mode === 'dark';
                        const bg = line.kind === 'removed'
                          ? (isDark ? '#3B1A1A' : '#FDECEC')
                          : line.kind === 'added'
                            ? (isDark ? '#123042' : '#E7F4FA')
                            : 'transparent';
                        const fg = line.kind === 'removed'
                          ? (isDark ? '#FECACA' : '#7F1D1D')
                          : line.kind === 'added'
                            ? (isDark ? '#BAE6FD' : '#0C4A6E')
                            : theme.palette.text.primary;
                        return {
                          position: 'relative',
                          px: 1.5,
                          py: 0.625,
                          bgcolor: bg,
                          color: fg,
                          borderBottom: index < activeSummary.textDiff.lines.length - 1 ? 1 : 0,
                          borderColor: 'divider',
                          display: 'grid',
                          gridTemplateColumns: '20px minmax(0, 1fr)',
                          gap: 1,
                          overflowWrap: 'anywhere',
                        };
                      }}
                    >
                      <Box component="span" aria-hidden="true" sx={{ fontWeight: 700, userSelect: 'none' }}>
                        {line.kind === 'removed' ? '−' : line.kind === 'added' ? '+' : ' '}
                      </Box>
                      <Box component="span" sx={{ minWidth: 0 }}>
                        <Box component="span" sx={{ position: 'absolute', left: 0, top: 0, width: '1px', height: '1px', overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap' }}>
                          {line.kind === 'removed' ? 'Removed: ' : line.kind === 'added' ? 'Added: ' : 'Unchanged: '}
                        </Box>
                        {line.text}
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}
            </Paper>
          )}
        </>
      )}
    </Box>
  );
}
