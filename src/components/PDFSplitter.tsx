import { useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { Alert, Box, Button, CircularProgress, Paper, TextField, Typography } from '@mui/material';
import {
  CallSplit,
  DownloadOutlined,
  FolderZipOutlined,
  DashboardCustomizeOutlined,
  EditOutlined,
  CompressOutlined,
} from '@mui/icons-material';
import { PDFDocument } from 'pdf-lib';
import { Document, Page, pdfjs } from 'react-pdf';
import ToolIntro from './ToolIntro';
import PDFSessionControls from './PDFSessionControls';
import { usePDFSession, type PDFSession } from '../hooks/usePDFSession';
import { generateSamplePDF } from '../utils/pdfSamples';
import { pdfDocumentOptions } from '../utils/pdfRendering';
import { parsePageRange } from '../utils/pageRanges';
import { flattenOutlineItems, type FlattenedOutlineItem } from '../utils/pdfTextSearch';
import {
  buildBookmarkSplitPlan,
  buildChunkSplitPlan,
  buildSelectionSplitPlan,
  executeSplitPlan,
  stripPdfExtension,
  type SplitMode,
  type SplitPartPlan,
} from '../utils/pdfSplit';
import { createZipArchive } from '../utils/zipArchive';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

type PdfProxyLike = Parameters<NonNullable<ComponentProps<typeof Document>['onLoadSuccess']>>[0];

async function prepare(file: File) {
  const pdf = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });
  if (!pdf.getPageCount()) throw new Error('Empty PDF');
  return { pageCount: pdf.getPageCount() };
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function PDFSplitter({
  initialFile,
  active = true,
  onSessionChange,
  onOpenInOrganizer,
  onOpenInEditor,
  onOpenInCompress,
}: {
  initialFile?: File | null;
  active?: boolean;
  onSessionChange?: (active: boolean) => void;
  onOpenInOrganizer?: (file: File) => void;
  onOpenInEditor?: (file: File) => void;
  onOpenInCompress?: (file: File) => void;
}) {
  const replacement = usePDFSession(prepare, initialFile);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    onSessionChange?.(!!replacement.session);
  }, [replacement.session, onSessionChange]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      {!replacement.session && (
        <ToolIntro
          icon={<CallSplit />}
          title="Keep the pages you need"
          description="Extract selected pages, fixed chunks, or outline chapters as PDFs or a ZIP archive."
        />
      )}
      <PDFSessionControls
        tool="Split"
        active={active}
        hasSession={!!replacement.session}
        busy={replacement.isReading || isExporting}
        pendingName={replacement.pending?.file.name}
        error={replacement.error}
        onOpen={replacement.open}
        onSample={() => replacement.open(() => generateSamplePDF('multi-page-report'))}
        onCancel={replacement.cancel}
        onConfirm={replacement.confirm}
      />
      {replacement.session && (
        <Box component="fieldset" disabled={replacement.isReading || !!replacement.pending} sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}>
          <SplitWorkspace
            key={replacement.session.id}
            session={replacement.session}
            onExporting={setIsExporting}
            onOpenInOrganizer={onOpenInOrganizer}
            onOpenInEditor={onOpenInEditor}
            onOpenInCompress={onOpenInCompress}
          />
        </Box>
      )}
    </Box>
  );
}

function SplitWorkspace({
  session: { file, data },
  onExporting,
  onOpenInOrganizer,
  onOpenInEditor,
  onOpenInCompress,
}: {
  session: PDFSession<{ pageCount: number }>;
  onExporting: (busy: boolean) => void;
  onOpenInOrganizer?: (file: File) => void;
  onOpenInEditor?: (file: File) => void;
  onOpenInCompress?: (file: File) => void;
}) {
  const { pageCount } = data;
  const [splitMode, setSplitMode] = useState<SplitMode>('select');
  const [selected, setSelected] = useState<number[]>([]);
  const [range, setRange] = useState('');
  const [rangeError, setRangeError] = useState('');
  const [pagesPerChunkInput, setPagesPerChunkInput] = useState(() => String(Math.min(2, pageCount)));
  const [outlineItems, setOutlineItems] = useState<FlattenedOutlineItem[]>([]);
  const [outlineLoaded, setOutlineLoaded] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [feedback, setFeedback] = useState<{ severity: 'success' | 'error'; message: string } | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const parsedChunkSize = useMemo(() => {
    const num = Number.parseInt(pagesPerChunkInput, 10);
    if (!Number.isFinite(num) || num < 1) return null;
    return Math.min(pageCount, num);
  }, [pagesPerChunkInput, pageCount]);

  const chunkPlan = useMemo(
    () => (parsedChunkSize ? buildChunkSplitPlan(file.name, pageCount, parsedChunkSize) : []),
    [file.name, pageCount, parsedChunkSize],
  );

  const bookmarkPlan = useMemo(
    () => buildBookmarkSplitPlan(file.name, pageCount, outlineItems, 0),
    [file.name, pageCount, outlineItems],
  );

  const activeAutoPlan = useMemo<SplitPartPlan[]>(
    () => (splitMode === 'chunks' ? chunkPlan : splitMode === 'bookmarks' ? bookmarkPlan : []),
    [splitMode, chunkPlan, bookmarkPlan],
  );

  const pageToPartLabel = useMemo(() => {
    const map = new Map<number, string>();
    for (const part of activeAutoPlan) {
      for (const pageIndex of part.pageIndices) {
        map.set(pageIndex, part.label);
      }
    }
    return map;
  }, [activeAutoPlan]);

  const handleDocumentLoadSuccess = (pdf: PdfProxyLike) => {
    void (async () => {
      try {
        const rawOutline = await pdf.getOutline().catch(() => null);
        const flat = await flattenOutlineItems(rawOutline, async dest => {
          const resolved = typeof dest === 'string' ? await pdf.getDestination(dest) : dest;
          if (!Array.isArray(resolved) || !resolved[0]) return null;
          const pageIndex = await pdf.getPageIndex(resolved[0]);
          return pageIndex + 1;
        });
        if (!mountedRef.current) return;
        setOutlineItems(flat);
      } catch {
        if (!mountedRef.current) return;
        setOutlineItems([]);
      } finally {
        if (mountedRef.current) setOutlineLoaded(true);
      }
    })();
  };

  const select = (pages: number[]) => {
    const next = pages.toSorted((a, b) => a - b);
    setSelected(next);
    setRange(next.map(index => index + 1).join(', '));
    setRangeError('');
    setFeedback(null);
  };

  const changeRange = (value: string) => {
    setRange(value);
    setFeedback(null);
    try {
      setSelected(parsePageRange(value, pageCount));
      setRangeError('');
    } catch (error) {
      setRangeError((error as Error).message);
    }
  };

  const runPlanExport = async (plan: SplitPartPlan[], asZip: boolean) => {
    if (isExporting || plan.length === 0) return;
    setIsExporting(true);
    onExporting(true);
    setFeedback(null);
    try {
      const parts = await executeSplitPlan(await file.arrayBuffer(), plan);
      if (asZip) {
        const zipBytes = createZipArchive(parts.map(part => ({ name: part.filename, data: part.bytes })));
        const zipFilename = `${stripPdfExtension(file.name)}_split.zip`;
        triggerDownload(new Blob([zipBytes as BlobPart], { type: 'application/zip' }), zipFilename);
        setFeedback({
          severity: 'success',
          message: `ZIP archive downloaded with ${parts.length} PDF ${parts.length === 1 ? 'file' : 'files'}.`,
        });
      } else {
        for (const part of parts) {
          triggerDownload(new Blob([part.bytes as BlobPart], { type: 'application/pdf' }), part.filename);
        }
        setFeedback({
          severity: 'success',
          message: parts.length > 1
            ? `Started ${parts.length} downloads. Your browser may ask to allow multiple files.`
            : `Download started with ${parts[0].pageCount} selected ${parts[0].pageCount === 1 ? 'page' : 'pages'}.`,
        });
      }
    } catch {
      setFeedback({ severity: 'error', message: 'Could not download the split PDFs. Your file and settings have been kept. Try again.' });
    } finally {
      setIsExporting(false);
      onExporting(false);
    }
  };

  const downloadManual = async (separate: boolean, asZip = false) => {
    if (rangeError || !selected.length) return;
    if (!separate && !asZip) {
      const plan = [
        {
          id: 'manual-combined',
          label: 'Selected pages',
          filename: `extracted_${file.name}`,
          pageIndices: selected,
          pageRangeLabel: range,
        },
      ];
      await runPlanExport(plan, false);
      return;
    }
    const plan = buildSelectionSplitPlan(file.name, selected, true);
    await runPlanExport(plan, asZip);
  };

  const handoffSelected = async (target: (extractedFile: File) => void) => {
    if (isExporting || rangeError || !selected.length) return;
    setIsExporting(true);
    onExporting(true);
    setFeedback(null);
    try {
      const [part] = await executeSplitPlan(await file.arrayBuffer(), [
        {
          id: 'handoff',
          label: 'Extracted',
          filename: `extracted_${file.name}`,
          pageIndices: selected,
          pageRangeLabel: range,
        },
      ]);
      target(new File([part.bytes as BlobPart], part.filename, { type: 'application/pdf' }));
    } catch {
      setFeedback({ severity: 'error', message: 'Could not prepare the extracted PDF for handoff. Try again.' });
    } finally {
      setIsExporting(false);
      onExporting(false);
    }
  };

  return (
    <>
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h2" sx={{ overflowWrap: 'anywhere' }}>{file.name}</Typography>
            {splitMode === 'select' ? (
              <Typography role="status" color="text.secondary" className="tabular-nums">
                {selected.length} of {pageCount} pages selected
              </Typography>
            ) : (
              <Typography color="text.secondary" className="tabular-nums">
                {pageCount} {pageCount === 1 ? 'page' : 'pages'} · {activeAutoPlan.length} output {activeAutoPlan.length === 1 ? 'file' : 'files'}
              </Typography>
            )}
          </Box>
          <Box role="group" aria-label="Split mode" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {([
              { id: 'select', label: 'Extract pages' },
              { id: 'chunks', label: 'Equal chunks' },
              { id: 'bookmarks', label: 'By bookmarks' },
            ] as const).map(option => {
              const activeMode = splitMode === option.id;
              return (
                <Button
                  key={option.id}
                  size="small"
                  variant={activeMode ? 'contained' : 'outlined'}
                  aria-pressed={activeMode}
                  disabled={isExporting}
                  onClick={() => {
                    setSplitMode(option.id);
                    setFeedback(null);
                  }}
                >
                  {option.label}
                </Button>
              );
            })}
          </Box>
        </Box>

        {splitMode === 'select' && (
          <>
            <TextField
              label="Page range"
              placeholder="1-3, 5"
              value={range}
              onChange={event => changeRange(event.target.value)}
              error={!!rangeError}
              helperText={rangeError || 'Use page numbers or ranges, such as 1-3, 5.'}
              fullWidth
              disabled={isExporting}
            />
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {(['All', 'Odd', 'Even', 'Invert', 'Clear'] as const).map(mode => (
                <Button
                  key={mode}
                  variant="outlined"
                  disabled={isExporting}
                  onClick={() => select(Array.from({ length: pageCount }, (_, index) => index).filter(index => mode === 'All' || (mode === 'Odd' && index % 2 === 0) || (mode === 'Even' && index % 2 === 1) || (mode === 'Invert' && !selected.includes(index))))}
                >
                  {mode === 'Clear' ? 'Clear selection' : `${mode} pages`}
                </Button>
              ))}
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              <Button
                variant="contained"
                startIcon={isExporting ? <CircularProgress size={18} color="inherit" /> : <DownloadOutlined />}
                disabled={isExporting || !selected.length || !!rangeError}
                onClick={() => downloadManual(false)}
              >
                Download selected pages
              </Button>
              <Button
                variant="outlined"
                startIcon={<FolderZipOutlined />}
                disabled={isExporting || !selected.length || !!rangeError}
                onClick={() => downloadManual(true, true)}
              >
                Download as ZIP
              </Button>
              <Button
                variant="outlined"
                disabled={isExporting || !selected.length || !!rangeError}
                onClick={() => downloadManual(true, false)}
              >
                Download separate PDFs
              </Button>
            </Box>
            {(onOpenInOrganizer || onOpenInEditor || onOpenInCompress) && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, pt: 1, borderTop: 1, borderColor: 'divider' }}>
                {onOpenInOrganizer && (
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<DashboardCustomizeOutlined />}
                    disabled={isExporting || !selected.length || !!rangeError}
                    onClick={() => handoffSelected(onOpenInOrganizer)}
                  >
                    Open extracted in Organize
                  </Button>
                )}
                {onOpenInEditor && (
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<EditOutlined />}
                    disabled={isExporting || !selected.length || !!rangeError}
                    onClick={() => handoffSelected(onOpenInEditor)}
                  >
                    Open extracted in Edit
                  </Button>
                )}
                {onOpenInCompress && (
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<CompressOutlined />}
                    disabled={isExporting || !selected.length || !!rangeError}
                    onClick={() => handoffSelected(onOpenInCompress)}
                  >
                    Compress extracted
                  </Button>
                )}
              </Box>
            )}
          </>
        )}

        {splitMode === 'chunks' && (
          <>
            <TextField
              label="Pages per file"
              type="number"
              value={pagesPerChunkInput}
              onChange={event => {
                setPagesPerChunkInput(event.target.value);
                setFeedback(null);
              }}
              error={parsedChunkSize === null}
              helperText={
                parsedChunkSize === null
                  ? `Enter a whole number between 1 and ${pageCount}.`
                  : `Splits ${pageCount} pages into ${chunkPlan.length} PDF ${chunkPlan.length === 1 ? 'file' : 'files'}.`
              }
              slotProps={{ htmlInput: { min: 1, max: pageCount, step: 1 } }}
              sx={{ maxWidth: 260 }}
              disabled={isExporting}
            />
            <SplitPlanPreview parts={chunkPlan} />
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              <Button
                variant="contained"
                startIcon={isExporting ? <CircularProgress size={18} color="inherit" /> : <FolderZipOutlined />}
                disabled={isExporting || chunkPlan.length === 0}
                onClick={() => runPlanExport(chunkPlan, true)}
              >
                Download all as ZIP
              </Button>
              <Button
                variant="outlined"
                startIcon={<DownloadOutlined />}
                disabled={isExporting || chunkPlan.length === 0}
                onClick={() => runPlanExport(chunkPlan, false)}
              >
                Download separate PDFs
              </Button>
            </Box>
          </>
        )}

        {splitMode === 'bookmarks' && (
          <>
            {!outlineLoaded ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <CircularProgress size={18} />
                <Typography variant="body2" color="text.secondary">Reading document bookmarks…</Typography>
              </Box>
            ) : bookmarkPlan.length === 0 ? (
              <Alert severity="info">
                No top-level bookmarks were found in this PDF. Switch to <strong>Equal chunks</strong> or <strong>Extract pages</strong> to split this document.
              </Alert>
            ) : (
              <>
                <Typography variant="body2" color="text.secondary">
                  Detected {bookmarkPlan.length} top-level {bookmarkPlan.length === 1 ? 'section' : 'sections'} from embedded PDF bookmarks.
                </Typography>
                <SplitPlanPreview parts={bookmarkPlan} />
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  <Button
                    variant="contained"
                    startIcon={isExporting ? <CircularProgress size={18} color="inherit" /> : <FolderZipOutlined />}
                    disabled={isExporting}
                    onClick={() => runPlanExport(bookmarkPlan, true)}
                  >
                    Download all as ZIP
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<DownloadOutlined />}
                    disabled={isExporting}
                    onClick={() => runPlanExport(bookmarkPlan, false)}
                  >
                    Download separate PDFs
                  </Button>
                </Box>
              </>
            )}
          </>
        )}
      </Paper>

      {feedback && <Alert severity={feedback.severity}>{feedback.message}</Alert>}

      <Box className="pdfy-workbench-mat pdfy-scroll-region" sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: 2, '& .split-pages': { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: 2 } }}>
        <Document
          file={file}
          options={pdfDocumentOptions}
          onLoadSuccess={handleDocumentLoadSuccess}
          onLoadError={() => setOutlineLoaded(true)}
          className="split-pages"
          loading={<CircularProgress aria-label="Loading page previews" />}
          error={<Alert severity="warning">Previews could not be displayed. You can still select pages by number and download them.</Alert>}
        >
          {Array.from({ length: pageCount }, (_, index) => {
            const isSelected = selected.includes(index);
            const assignedPart = pageToPartLabel.get(index);
            const isInteractive = splitMode === 'select';
            return (
              <Box
                key={index}
                component={isInteractive ? 'button' : 'div'}
                type={isInteractive ? 'button' : undefined}
                aria-label={isInteractive ? `Page ${index + 1}` : undefined}
                aria-pressed={isInteractive ? isSelected : undefined}
                disabled={isInteractive ? isExporting : undefined}
                onClick={isInteractive ? () => select(isSelected ? selected.filter(page => page !== index) : [...selected, index]) : undefined}
                className={isInteractive ? 'pdfy-page-tile pdfy-card-interactive' : 'pdfy-page-tile'}
                sx={{
                  minWidth: 0,
                  p: 1.5,
                  border: 2,
                  borderColor: isInteractive && isSelected ? 'primary.main' : 'divider',
                  borderRadius: 2,
                  bgcolor: 'background.paper',
                  boxShadow: isInteractive && isSelected ? theme => `0 0 0 1px ${theme.palette.primary.main}` : 'none',
                  color: 'text.primary',
                  cursor: isInteractive ? 'pointer' : 'default',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <Typography
                  component="span"
                  className="tabular-nums"
                  sx={{
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    color: isInteractive && isSelected ? 'primary.main' : 'text.primary',
                    textAlign: 'center',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {isInteractive
                    ? `Page ${index + 1} · ${isSelected ? 'Selected' : 'Not selected'}`
                    : `Page ${index + 1}${assignedPart ? ` · ${assignedPart}` : ''}`}
                </Typography>
                <Box
                  component="span"
                  aria-hidden="true"
                  sx={{
                    bgcolor: '#FFFFFF',
                    maxWidth: '100%',
                    overflow: 'hidden',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.14)',
                    '& .react-pdf__Page__canvas': { display: 'block', maxWidth: '100%', height: 'auto !important' },
                  }}
                >
                  <Page pageNumber={index + 1} width={160} renderTextLayer={false} renderAnnotationLayer={false} />
                </Box>
              </Box>
            );
          })}
        </Document>
      </Box>
    </>
  );
}

function SplitPlanPreview({ parts }: { parts: SplitPartPlan[] }) {
  if (parts.length === 0) return null;
  return (
    <Box
      component="ul"
      aria-label="Split output parts"
      sx={{
        listStyle: 'none',
        m: 0,
        p: 0,
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' },
        gap: 1,
      }}
    >
      {parts.map(part => (
        <Box
          component="li"
          key={part.id}
          sx={{
            p: 1.25,
            borderRadius: 1.5,
            border: 1,
            borderColor: 'divider',
            display: 'flex',
            flexDirection: 'column',
            gap: 0.25,
            minWidth: 0,
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{part.label}</Typography>
            <Typography variant="caption" color="text.secondary" className="tabular-nums" sx={{ flexShrink: 0 }}>
              Pages {part.pageRangeLabel}
            </Typography>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', overflowWrap: 'anywhere' }}>
            {part.filename}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
