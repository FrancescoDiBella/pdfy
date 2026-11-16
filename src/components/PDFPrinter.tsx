import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Divider, FormControlLabel, IconButton,
  MenuItem, Paper, Slider, Switch, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import {
  PrintOutlined, DownloadOutlined, ChevronLeft, ChevronRight, AutoAwesomeOutlined,
} from '@mui/icons-material';
import { PDFDocument } from 'pdf-lib';
import { Document, Page, pdfjs } from 'react-pdf';
import ToolIntro from './ToolIntro';
import PDFSessionControls from './PDFSessionControls';
import { usePDFSession, type PDFSession } from '../hooks/usePDFSession';
import { generateSamplePDF } from '../utils/pdfSamples';
import { pdfDocumentOptions } from '../utils/pdfRendering';
import { parsePageRange } from '../utils/pageRanges';
import {
  composePrintPDF, DEFAULT_PRINT_OPTIONS, MARGIN_PT, PAPER_DIMENSIONS_PT,
  PRINT_PRESETS, resolveSelectedPages,
  type ComposedPrintResult, type PrintColorMode, type PrintLayoutMode,
  type PrintMarginPreset, type PrintNupCount, type PrintOptions,
  type PrintOrientation, type PrintPaperSize, type PrintParity,
  type PrintPresetId, type PrintScaleMode,
} from '../utils/pdfPrint';
import {
  buildColorTransformedPDF, prepareAndInvokeOSPrint,
} from '../utils/pdfPrintSheetRenderer';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

async function prepare(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  if (!pdf.getPageCount()) throw new Error('Empty PDF');
  return { pageCount: pdf.getPageCount(), bytes };
}

export default function PDFPrinter({ initialFile, active = true }: { initialFile?: File | null; active?: boolean }) {
  const replacement = usePDFSession(prepare, initialFile);
  const [isPrinting, setIsPrinting] = useState(false);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      {!replacement.session && (
        <ToolIntro
          icon={<PrintOutlined fontSize="large" />}
          title="Print with any OS printer"
          description="Customize page ranges, N-up handouts, booklets, margins, and ink-saver modes locally before sending to your device’s print dialog."
        >
          <Typography color="text.secondary">Your PDF stays on your device. No files are uploaded.</Typography>
        </ToolIntro>
      )}
      <PDFSessionControls
        tool="Print"
        active={active}
        hasSession={!!replacement.session}
        busy={replacement.isReading || isPrinting}
        pendingName={replacement.pending?.file.name}
        error={replacement.error}
        onOpen={replacement.open}
        onSample={() => replacement.open(() => generateSamplePDF('multi-page-report'))}
        onCancel={replacement.cancel}
        onConfirm={replacement.confirm}
      />
      {replacement.session && (
        <Box component="fieldset" disabled={replacement.isReading || !!replacement.pending} sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}>
          <PrintWorkspace key={replacement.session.id} session={replacement.session} onBusyChange={setIsPrinting} />
        </Box>
      )}
    </Box>
  );
}

function previewFilterForColor(colorMode: PrintColorMode): string {
  if (colorMode === 'grayscale') return 'grayscale(100%) contrast(1.05)';
  if (colorMode === 'ink-saver') return 'invert(1) contrast(1.05)';
  return 'none';
}

function PrintWorkspace({
  session: { file, data },
  onBusyChange,
}: {
  session: PDFSession<{ pageCount: number; bytes: Uint8Array }>;
  onBusyChange: (busy: boolean) => void;
}) {
  const [options, setOptions] = useState<PrintOptions>(() => ({
    ...DEFAULT_PRINT_OPTIONS,
    documentTitle: file.name.replace(/\.pdf$/i, ''),
  }));
  const [activePreset, setActivePreset] = useState<PrintPresetId | null>('standard');
  const [composedState, setComposedState] = useState<{ key: string; result: ComposedPrintResult; blob: Blob } | null>(null);
  const [composeError, setComposeError] = useState<{ key: string; message: string } | null>(null);
  const [previewSheet, setPreviewSheet] = useState(1);
  const [previewWidth, setPreviewWidth] = useState(() => (typeof window !== 'undefined' ? Math.max(180, Math.min(420, window.innerWidth - 72)) : 320));
  const [actionProgress, setActionProgress] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ severity: 'success' | 'error' | 'info'; message: string } | null>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const composeSequence = useRef(0);
  const activePrintCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => {
    activePrintCleanupRef.current?.();
    activePrintCleanupRef.current = null;
  }, []);

  useEffect(() => {
    const el = previewContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width;
      if (width > 0) setPreviewWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const rangeValidation = useMemo(() => {
    if (options.rangeMode === 'custom') {
      try {
        parsePageRange(options.pageRange, data.pageCount);
      } catch (error) {
        return { error: (error as Error).message, pages: [] as number[] };
      }
    }
    const pages = resolveSelectedPages(data.pageCount, options);
    if (!pages.length) {
      return {
        error: options.rangeMode === 'custom' && !options.pageRange.trim()
          ? 'Enter at least one page number or range, such as 1-3, 5.'
          : 'No pages match your current page range and odd/even filter.',
        pages: [] as number[],
      };
    }
    return { error: '', pages };
  }, [data.pageCount, options]);

  // Re-compose PDF geometry only when layout/page options change (colorMode previews instantly).
  const geometryOptions = useMemo<PrintOptions>(() => ({
    rangeMode: options.rangeMode,
    pageRange: options.pageRange,
    parity: options.layout === 'booklet' ? 'all' : options.parity,
    reverseOrder: options.layout === 'booklet' ? false : options.reverseOrder,
    layout: options.layout,
    nup: options.nup,
    drawBorders: options.drawBorders,
    paperSize: options.paperSize,
    orientation: options.orientation,
    margin: options.margin,
    scaleMode: options.scaleMode,
    customScalePercent: options.customScalePercent,
    colorMode: 'color',
    showHeaderFooter: options.showHeaderFooter,
    headerFooterNote: options.headerFooterNote,
    documentTitle: options.documentTitle,
  }), [
    options.rangeMode, options.pageRange, options.parity, options.reverseOrder,
    options.layout, options.nup, options.drawBorders, options.paperSize,
    options.orientation, options.margin, options.scaleMode, options.customScalePercent,
    options.showHeaderFooter, options.headerFooterNote, options.documentTitle,
  ]);
  const geometryKey = useMemo(() => JSON.stringify(geometryOptions), [geometryOptions]);

  const activeError = composeError?.key === geometryKey ? composeError.message : null;
  const composed = !rangeValidation.error && !activeError && composedState?.key === geometryKey ? composedState.result : null;
  const previewBlob = !rangeValidation.error && !activeError && composedState?.key === geometryKey ? composedState.blob : null;
  const isComposing = !rangeValidation.error && !activeError && composedState?.key !== geometryKey;

  useEffect(() => {
    if (rangeValidation.error) return;

    const seq = ++composeSequence.current;
    const timer = window.setTimeout(async () => {
      try {
        const next = await composePrintPDF(data.bytes, geometryOptions);
        if (seq !== composeSequence.current) return;
        setComposeError(null);
        setComposedState({
          key: geometryKey,
          result: next,
          blob: new Blob([next.bytes as BlobPart], { type: 'application/pdf' }),
        });
        setPreviewSheet(prev => Math.min(Math.max(1, prev), next.sheetCount));
      } catch (error) {
        if (seq !== composeSequence.current) return;
        const message = error instanceof Error ? error.message : 'Could not prepare print sheets.';
        setComposedState(null);
        setComposeError({ key: geometryKey, message });
        setFeedback({ severity: 'error', message });
      }
    }, 90);

    return () => window.clearTimeout(timer);
  }, [data.bytes, geometryKey, geometryOptions, rangeValidation.error]);

  const updateOptions = (patch: Partial<PrintOptions>, clearPreset = true) => {
    setFeedback(null);
    if (clearPreset) setActivePreset(null);
    setOptions(prev => ({ ...prev, ...patch }));
  };

  const applyPreset = (presetId: PrintPresetId) => {
    const preset = PRINT_PRESETS.find(item => item.id === presetId);
    if (!preset) return;
    setFeedback(null);
    setActivePreset(presetId);
    setOptions(prev => ({ ...prev, ...preset.patch }));
  };

  const isActionBusy = actionProgress !== null;

  const ensureComposed = async (): Promise<ComposedPrintResult> => {
    if (composed) return composed;
    const fresh = await composePrintPDF(data.bytes, geometryOptions);
    setComposeError(null);
    setComposedState({
      key: geometryKey,
      result: fresh,
      blob: new Blob([fresh.bytes as BlobPart], { type: 'application/pdf' }),
    });
    return fresh;
  };

  const handlePrintWithOS = async () => {
    if (isActionBusy || rangeValidation.error) return;
    setFeedback(null);
    setActionProgress('Preparing print sheets…');
    onBusyChange(true);
    try {
      const current = await ensureComposed();
      activePrintCleanupRef.current = await prepareAndInvokeOSPrint(current, options.colorMode, (done, total) => {
        setActionProgress(`Rendering sheet ${Math.min(done + 1, total)} of ${total} for your printer…`);
      });
      setFeedback({
        severity: 'success',
        message: `Sent ${current.sheetCount} ${current.sheetCount === 1 ? 'sheet' : 'sheets'} to your OS print dialog.`,
      });
    } catch (error) {
      setFeedback({
        severity: 'error',
        message: error instanceof Error ? error.message : 'Could not open the print dialog. Try downloading the print-ready PDF instead.',
      });
    } finally {
      setActionProgress(null);
      onBusyChange(false);
    }
  };

  const handleDownloadPrintPDF = async () => {
    if (isActionBusy || rangeValidation.error) return;
    setFeedback(null);
    setActionProgress('Building print-ready PDF…');
    onBusyChange(true);
    try {
      const current = await ensureComposed();
      const outputBytes = await buildColorTransformedPDF(current, options.colorMode, (done, total) => {
        setActionProgress(`Applying ink settings (${Math.min(done + 1, total)} of ${total})…`);
      });
      const url = URL.createObjectURL(new Blob([outputBytes as BlobPart], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `print_${file.name}`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setFeedback({
        severity: 'success',
        message: `Download started for print_${file.name} (${current.sheetCount} ${current.sheetCount === 1 ? 'sheet' : 'sheets'}).`,
      });
    } catch (error) {
      setFeedback({
        severity: 'error',
        message: error instanceof Error ? error.message : 'Could not build the print-ready PDF. Try again.',
      });
    } finally {
      setActionProgress(null);
      onBusyChange(false);
    }
  };

  const safeSheet = composed ? Math.min(Math.max(1, previewSheet), composed.sheetCount) : 1;
  const pageDisplayWidth = Math.max(140, Math.min(540, previewWidth - 32));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h2" sx={{ overflowWrap: 'anywhere' }}>{file.name}</Typography>
            <Typography role="status" color="text.secondary">
              {data.pageCount} source {data.pageCount === 1 ? 'page' : 'pages'}
              {composed ? ` · ${composed.sheetCount} output ${composed.sheetCount === 1 ? 'sheet' : 'sheets'} (${composed.orientation})` : ''}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <Button
              variant="contained"
              size="large"
              startIcon={isActionBusy ? <CircularProgress size={18} color="inherit" /> : <PrintOutlined />}
              disabled={isActionBusy || !!rangeValidation.error}
              onClick={handlePrintWithOS}
            >
              {isActionBusy ? actionProgress : 'Print with OS printer…'}
            </Button>
            <Button
              variant="outlined"
              startIcon={<DownloadOutlined />}
              disabled={isActionBusy || !!rangeValidation.error}
              onClick={handleDownloadPrintPDF}
            >
              Download print-ready PDF
            </Button>
          </Box>
        </Box>
        <Typography variant="caption" color="text.secondary">
          Uses your system print dialog so you can choose any OS-known printer (local, network, AirPrint/Mopria), copies, trays, or hardware duplex.
        </Typography>
      </Paper>

      {feedback && <Alert severity={feedback.severity} onClose={() => setFeedback(null)}>{feedback.message}</Alert>}
      {options.layout === 'booklet' && composed && (
        <Alert severity="info">
          Booklet mode creates {composed.sheetCount} {composed.sheetCount === 1 ? 'side' : 'sides'} ({composed.sheetCount / 2} folded {composed.sheetCount / 2 === 1 ? 'sheet' : 'sheets'}). In your OS print dialog, enable <strong>Two-sided (Flip on short edge)</strong>, then fold the printed stack in half.
        </Alert>
      )}
      {options.parity !== 'all' && (
        <Alert severity="info">
          Manual two-sided helper: print <strong>Odd</strong> pages first, re-insert the stack into your printer tray, then switch to <strong>Even</strong> pages.
        </Alert>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 420px) minmax(0, 1fr)' }, gap: 2, alignItems: 'start', minWidth: 0 }}>
        {/* Customization Controls */}
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, display: 'flex', flexDirection: 'column', gap: 2.5, minWidth: 0 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <AutoAwesomeOutlined fontSize="small" color="primary" />
              <Typography variant="h3">Smart presets</Typography>
            </Box>
            <Box role="group" aria-label="Print presets" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {PRINT_PRESETS.map(preset => (
                <Button
                  key={preset.id}
                  size="small"
                  variant={activePreset === preset.id ? 'contained' : 'outlined'}
                  aria-pressed={activePreset === preset.id}
                  disabled={isActionBusy}
                  onClick={() => applyPreset(preset.id)}
                >
                  {preset.label}
                </Button>
              ))}
            </Box>
            {activePreset && (
              <Typography variant="caption" color="text.secondary">
                {PRINT_PRESETS.find(item => item.id === activePreset)?.description}
              </Typography>
            )}
          </Box>

          <Divider />

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Typography variant="h3">Pages &amp; ordering</Typography>
            <ToggleButtonGroup
              exclusive
              fullWidth
              size="small"
              aria-label="Page selection mode"
              value={options.rangeMode}
              disabled={isActionBusy}
              onChange={(_, value) => { if (value) updateOptions({ rangeMode: value }); }}
            >
              <ToggleButton value="all">All pages ({data.pageCount})</ToggleButton>
              <ToggleButton value="custom">Custom range</ToggleButton>
            </ToggleButtonGroup>

            {options.rangeMode === 'custom' && (
              <TextField
                label="Page range"
                placeholder="1-3, 5"
                value={options.pageRange}
                onChange={event => updateOptions({ pageRange: event.target.value })}
                error={!!rangeValidation.error}
                helperText={rangeValidation.error || 'Use page numbers or ranges, such as 1-3, 5.'}
                fullWidth
                disabled={isActionBusy}
              />
            )}

            <TextField
              select
              label="Page subset (duplex helper)"
              value={options.layout === 'booklet' ? 'all' : options.parity}
              onChange={event => updateOptions({ parity: event.target.value as PrintParity })}
              disabled={isActionBusy || options.layout === 'booklet'}
              helperText={options.layout === 'booklet' ? 'Disabled in booklet mode so signature pages stay paired.' : undefined}
              fullWidth
            >
              <MenuItem value="all">All pages in selection</MenuItem>
              <MenuItem value="odd">Odd pages only (1, 3, 5…)</MenuItem>
              <MenuItem value="even">Even pages only (2, 4, 6…)</MenuItem>
            </TextField>

            {options.rangeMode === 'all' && rangeValidation.error && (
              <Alert severity="warning">{rangeValidation.error}</Alert>
            )}

            <FormControlLabel
              control={
                <Switch
                  checked={options.reverseOrder}
                  disabled={isActionBusy || options.layout === 'booklet'}
                  onChange={event => updateOptions({ reverseOrder: event.target.checked })}
                />
              }
              label="Reverse page order (face-up stacking)"
            />
          </Box>

          <Divider />

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Typography variant="h3">Layout &amp; paper</Typography>
            <TextField
              select
              label="Sheet layout"
              value={options.layout}
              onChange={event => updateOptions({ layout: event.target.value as PrintLayoutMode })}
              disabled={isActionBusy}
              fullWidth
            >
              <MenuItem value="standard">Standard (1 page per sheet)</MenuItem>
              <MenuItem value="nup">Multiple pages per sheet (N-up)</MenuItem>
              <MenuItem value="booklet">Booklet (2-up fold &amp; staple)</MenuItem>
            </TextField>

            {options.layout === 'nup' && (
              <TextField
                select
                label="Pages per sheet"
                value={options.nup}
                onChange={event => updateOptions({ nup: Number(event.target.value) as PrintNupCount })}
                disabled={isActionBusy}
                fullWidth
              >
                <MenuItem value={2}>2 pages per sheet</MenuItem>
                <MenuItem value={4}>4 pages per sheet (2 × 2)</MenuItem>
                <MenuItem value={6}>6 pages per sheet</MenuItem>
                <MenuItem value={9}>9 pages per sheet (3 × 3)</MenuItem>
              </TextField>
            )}

            {(options.layout === 'nup' || options.layout === 'booklet') && (
              <FormControlLabel
                control={
                  <Switch
                    checked={options.drawBorders}
                    disabled={isActionBusy}
                    onChange={event => updateOptions({ drawBorders: event.target.checked })}
                  />
                }
                label={options.layout === 'booklet' ? 'Show page borders & center fold line' : 'Draw subtle page borders / cut guides'}
              />
            )}

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
              <TextField
                select
                label="Paper size"
                value={options.paperSize}
                onChange={event => updateOptions({ paperSize: event.target.value as PrintPaperSize })}
                disabled={isActionBusy}
                fullWidth
              >
                <MenuItem value="auto">Auto (match / A4)</MenuItem>
                {Object.entries(PAPER_DIMENSIONS_PT).map(([value, info]) => (
                  <MenuItem key={value} value={value}>{info.label}</MenuItem>
                ))}
              </TextField>

              <TextField
                select
                label="Orientation"
                value={options.orientation}
                onChange={event => updateOptions({ orientation: event.target.value as PrintOrientation })}
                disabled={isActionBusy}
                fullWidth
              >
                <MenuItem value="auto">Auto (best fit)</MenuItem>
                <MenuItem value="portrait">Portrait</MenuItem>
                <MenuItem value="landscape">Landscape</MenuItem>
              </TextField>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
              <TextField
                select
                label="Margins"
                value={options.margin}
                onChange={event => updateOptions({ margin: event.target.value as PrintMarginPreset })}
                disabled={isActionBusy}
                fullWidth
              >
                {Object.entries(MARGIN_PT).map(([value, info]) => (
                  <MenuItem key={value} value={value}>{info.label}</MenuItem>
                ))}
              </TextField>

              <TextField
                select
                label="Scale"
                value={options.scaleMode}
                onChange={event => updateOptions({ scaleMode: event.target.value as PrintScaleMode })}
                disabled={isActionBusy}
                fullWidth
              >
                <MenuItem value="fit">Fit to printable area</MenuItem>
                <MenuItem value="actual">Actual size (100%)</MenuItem>
                <MenuItem value="custom">Custom scale (%)</MenuItem>
              </TextField>
            </Box>

            {options.scaleMode === 'custom' && (
              <Box sx={{ px: 1 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Custom scale: {options.customScalePercent}%
                </Typography>
                <Slider
                  aria-label="Custom scale percentage"
                  min={50}
                  max={150}
                  step={5}
                  value={options.customScalePercent}
                  disabled={isActionBusy}
                  onChange={(_, value) => updateOptions({ customScalePercent: value as number })}
                />
              </Box>
            )}
          </Box>

          <Divider />

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Typography variant="h3">Ink &amp; footer stamp</Typography>
            <TextField
              select
              label="Color &amp; ink mode"
              value={options.colorMode}
              onChange={event => updateOptions({ colorMode: event.target.value as PrintColorMode })}
              disabled={isActionBusy}
              fullWidth
            >
              <MenuItem value="color">Original colors</MenuItem>
              <MenuItem value="grayscale">Grayscale (save color ink)</MenuItem>
              <MenuItem value="ink-saver">Invert dark slides (high-contrast toner saver)</MenuItem>
            </TextField>

            <FormControlLabel
              control={
                <Switch
                  checked={options.showHeaderFooter}
                  disabled={isActionBusy}
                  onChange={event => updateOptions({ showHeaderFooter: event.target.checked })}
                />
              }
              label="Add footer stamp (title, date, sheet count)"
            />

            {options.showHeaderFooter && (
              <TextField
                label="Optional footer note"
                placeholder="e.g. Draft copy or Meeting handout"
                value={options.headerFooterNote}
                onChange={event => updateOptions({ headerFooterNote: event.target.value })}
                disabled={isActionBusy}
                fullWidth
              />
            )}
          </Box>
        </Paper>

        {/* Live Print Sheet Preview */}
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
            <Typography variant="h3">Live print preview</Typography>
            {composed && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <IconButton
                  aria-label="Previous sheet"
                  disabled={safeSheet <= 1 || isComposing}
                  onClick={() => setPreviewSheet(prev => Math.max(1, prev - 1))}
                >
                  <ChevronLeft />
                </IconButton>
                <Typography role="status" variant="body2" sx={{ minWidth: 92, textAlign: 'center', fontWeight: 600 }}>
                  Sheet {safeSheet} of {composed.sheetCount}
                </Typography>
                <IconButton
                  aria-label="Next sheet"
                  disabled={safeSheet >= composed.sheetCount || isComposing}
                  onClick={() => setPreviewSheet(prev => Math.min(composed.sheetCount, prev + 1))}
                >
                  <ChevronRight />
                </IconButton>
              </Box>
            )}
          </Box>

          <Box
            ref={previewContainerRef}
            role="region"
            aria-label="Print sheet preview"
            tabIndex={0}
            sx={{
              minHeight: 340,
              p: 2,
              borderRadius: 2,
              bgcolor: 'action.hover',
              border: 1,
              borderColor: 'divider',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'auto',
            }}
          >
            {rangeValidation.error ? (
              <Typography color="text.secondary" sx={{ textAlign: 'center', maxWidth: 320 }}>
                Adjust the page range or odd/even filter to preview output sheets.
              </Typography>
            ) : activeError ? (
              <Alert severity="error">{activeError}</Alert>
            ) : isComposing || !previewBlob ? (
              <CircularProgress aria-label="Composing print preview" />
            ) : (
              <Box
                data-testid="print-preview-sheet"
                sx={{
                  bgcolor: '#FFFFFF',
                  boxShadow: '0 6px 24px rgba(0,0,0,0.16)',
                  lineHeight: 0,
                  maxWidth: '100%',
                  overflow: 'hidden',
                  '& .react-pdf__Page__canvas': { maxWidth: '100% !important', height: 'auto !important' },
                  filter: previewFilterForColor(options.colorMode),
                }}
              >
                <Document file={previewBlob} options={pdfDocumentOptions} loading={<CircularProgress aria-label="Rendering print preview" />} error={<Alert severity="warning">Preview unavailable, but printing and download still work.</Alert>}>
                  <Page pageNumber={safeSheet} width={pageDisplayWidth} renderTextLayer={false} renderAnnotationLayer={false} />
                </Document>
              </Box>
            )}
          </Box>

          {composed && (
            <Typography variant="caption" color="text.secondary">
              Sheet size: {Math.round(composed.sheetWidth)} × {Math.round(composed.sheetHeight)} pt ({Math.round(composed.sheetWidth * 25.4 / 72)} × {Math.round(composed.sheetHeight * 25.4 / 72)} mm) · Color: {options.colorMode === 'color' ? 'Original' : options.colorMode === 'grayscale' ? 'Grayscale' : 'Invert dark slides'}
            </Typography>
          )}
        </Paper>
      </Box>
    </Box>
  );
}
