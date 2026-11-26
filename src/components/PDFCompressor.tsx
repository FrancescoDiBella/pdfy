import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  FormControlLabel,
  IconButton,
  LinearProgress,
  Paper,
  Slider,
  Switch,
  Typography,
} from '@mui/material';
import {
  ChevronLeft,
  ChevronRight,
  CompressOutlined,
  DashboardCustomizeOutlined,
  DownloadOutlined,
  PrintOutlined,
  TuneOutlined,
} from '@mui/icons-material';
import { Document, Page, pdfjs } from 'react-pdf';
import { usePDFSession, type PDFSession } from '../hooks/usePDFSession';
import {
  analyzePDFSize,
  COMPRESS_PRESETS,
  computeSavingsSummary,
  DEFAULT_COMPRESS_OPTIONS,
  formatByteSize,
  type CompressOptions,
  type PDFSizeAnalysis,
} from '../utils/pdfCompress';
import { runPDFCompression } from '../utils/pdfCompressRunner';
import { pdfDocumentOptions } from '../utils/pdfRendering';
import { generateSamplePDF } from '../utils/pdfSamples';
import PDFSessionControls from './PDFSessionControls';
import ToolIntro from './ToolIntro';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

interface PreparedCompressSession {
  bytes: Uint8Array;
  analysis: PDFSizeAnalysis;
}

async function prepare(file: File): Promise<PreparedCompressSession> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const analysis = await analyzePDFSize(bytes);
  return { bytes, analysis };
}

export default function PDFCompressor({
  initialFile,
  active = true,
  onSessionChange,
  onOpenInPrint,
  onOpenInOrganizer,
}: {
  initialFile?: File | null;
  active?: boolean;
  onSessionChange?: (active: boolean) => void;
  onOpenInPrint?: (file: File) => void;
  onOpenInOrganizer?: (file: File) => void;
}) {
  const replacement = usePDFSession(prepare, initialFile);
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    onSessionChange?.(!!replacement.session);
  }, [replacement.session, onSessionChange]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      {!replacement.session && (
        <ToolIntro
          icon={<CompressOutlined />}
          title="Shrink PDF size offline"
          description="Optimize streams losslessly or downsample scans with a live quality preview."
        />
      )}
      <PDFSessionControls
        tool="Compress"
        active={active}
        hasSession={!!replacement.session}
        busy={replacement.isReading || isWorking}
        pendingName={replacement.pending?.file.name}
        error={replacement.error}
        onOpen={replacement.open}
        onSample={() => replacement.open(() => generateSamplePDF('multi-page-report'))}
        onCancel={replacement.cancel}
        onConfirm={replacement.confirm}
      />
      {replacement.session && (
        <Box
          component="fieldset"
          disabled={replacement.isReading || !!replacement.pending}
          sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}
        >
          <CompressWorkspace
            key={replacement.session.id}
            session={replacement.session}
            onBusyChange={setIsWorking}
            onOpenInPrint={onOpenInPrint}
            onOpenInOrganizer={onOpenInOrganizer}
          />
        </Box>
      )}
    </Box>
  );
}

function CompressWorkspace({
  session: { file, data },
  onBusyChange,
  onOpenInPrint,
  onOpenInOrganizer,
}: {
  session: PDFSession<PreparedCompressSession>;
  onBusyChange: (busy: boolean) => void;
  onOpenInPrint?: (file: File) => void;
  onOpenInOrganizer?: (file: File) => void;
}) {
  const { bytes, analysis } = data;
  const [options, setOptions] = useState<CompressOptions>(DEFAULT_COMPRESS_OPTIONS);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [compressedResult, setCompressedResult] = useState<{ bytes: Uint8Array; blob: Blob; optionsLabel: string } | null>(null);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewWidth, setPreviewWidth] = useState(440);
  const [feedback, setFeedback] = useState<{ severity: 'success' | 'error' | 'info' | 'warning'; message: string } | null>(null);

  const previewRef = useRef<HTMLDivElement>(null);
  const printButtonRef = useRef<HTMLButtonElement>(null);
  const organizeButtonRef = useRef<HTMLButtonElement>(null);

  const isCompressing = progressText !== null;

  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width;
      if (width > 0) setPreviewWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const savings = useMemo(() => {
    if (!compressedResult) return null;
    return computeSavingsSummary(analysis.originalBytes, compressedResult.bytes.byteLength);
  }, [analysis.originalBytes, compressedResult]);

  const applyPreset = (presetId: Exclude<CompressOptions['preset'], 'custom'>) => {
    const preset = COMPRESS_PRESETS.find(item => item.id === presetId);
    if (!preset) return;
    setFeedback(null);
    setOptions(prev => ({ ...prev, ...preset.patch }));
  };

  const updateCustom = (patch: Partial<CompressOptions>) => {
    setFeedback(null);
    setOptions(prev => ({
      ...prev,
      ...patch,
      preset: prev.preset === 'lossless' && ('dpi' in patch || 'jpegQuality' in patch || 'grayscale' in patch)
        ? 'custom'
        : patch.preset ?? (prev.preset === 'lossless' ? 'lossless' : 'custom'),
    }));
  };

  const handleCompress = async () => {
    if (isCompressing) return;
    setFeedback(null);
    setProgressText('Analyzing and optimizing PDF…');
    onBusyChange(true);
    try {
      const output = await runPDFCompression(bytes, options, (done, total) => {
        setProgressText(options.preset === 'lossless'
          ? 'Repacking object streams…'
          : `Optimizing page ${Math.min(done + 1, total)} of ${total}…`);
      });
      const label = options.preset === 'lossless'
        ? 'Lossless object-stream cleanup'
        : `${options.dpi} DPI · ${Math.round(options.jpegQuality * 100)}% JPEG${options.grayscale ? ' · Grayscale' : ''}`;
      setCompressedResult({
        bytes: output,
        blob: new Blob([output as BlobPart], { type: 'application/pdf' }),
        optionsLabel: label,
      });
      setPreviewPage(1);

      const summary = computeSavingsSummary(analysis.originalBytes, output.byteLength);
      if (summary.shrank) {
        setFeedback({
          severity: 'success',
          message: `Reduced from ${formatByteSize(summary.originalBytes)} to ${formatByteSize(summary.compressedBytes)} (${summary.percentSaved}% smaller).`,
        });
      } else {
        setFeedback({
          severity: 'warning',
          message: `Output is ${formatByteSize(summary.compressedBytes)} (${Math.abs(summary.percentSaved)}% larger than the already-compact source). Try Lossless Cleanup, lower DPI, or keep the original file.`,
        });
      }
    } catch (err) {
      setFeedback({
        severity: 'error',
        message: err instanceof Error ? err.message : 'Could not optimize this PDF. Try another preset.',
      });
    } finally {
      setProgressText(null);
      onBusyChange(false);
    }
  };

  const handleDownload = () => {
    if (!compressedResult) return;
    const url = URL.createObjectURL(compressedResult.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `compressed_${file.name}`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handlePrint = () => {
    if (!compressedResult || !onOpenInPrint || isCompressing) return;
    printButtonRef.current?.focus();
    onOpenInPrint(new File([compressedResult.bytes as BlobPart], `compressed_${file.name}`, { type: 'application/pdf' }));
  };

  const handleOrganize = () => {
    if (!compressedResult || !onOpenInOrganizer || isCompressing) return;
    organizeButtonRef.current?.focus();
    onOpenInOrganizer(new File([compressedResult.bytes as BlobPart], `compressed_${file.name}`, { type: 'application/pdf' }));
  };

  const pageDisplayWidth = Math.max(140, Math.min(520, previewWidth - 32));
  const safePage = Math.min(Math.max(1, previewPage), analysis.pageCount);
  const ratioPercent = savings
    ? Math.max(2, Math.min(100, Math.round((savings.compressedBytes / Math.max(1, savings.originalBytes)) * 100)))
    : 100;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h2" sx={{ overflowWrap: 'anywhere' }}>{file.name}</Typography>
            <Typography role="status" color="text.secondary" className="tabular-nums">
              {formatByteSize(analysis.originalBytes)} · {analysis.pageCount} {analysis.pageCount === 1 ? 'page' : 'pages'} ({formatByteSize(analysis.averageBytesPerPage)}/page)
              {analysis.formFieldCount > 0 ? ` · ${analysis.formFieldCount} form field(s)` : ''}
            </Typography>
          </Box>
          <Button
            variant="contained"
            size="large"
            startIcon={isCompressing ? <CircularProgress size={18} color="inherit" /> : <CompressOutlined />}
            disabled={isCompressing}
            onClick={handleCompress}
            sx={{ minWidth: { sm: 250 } }}
          >
            {isCompressing ? progressText : compressedResult ? 'Re-optimize PDF' : 'Compress PDF'}
          </Button>
        </Box>
      </Paper>

      {feedback && (
        <Alert severity={feedback.severity} onClose={() => setFeedback(null)} sx={{ overflowWrap: 'anywhere' }}>
          {feedback.message}
        </Alert>
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) minmax(0, 1fr)' },
          gap: 2,
          alignItems: 'start',
          minWidth: 0,
        }}
      >
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TuneOutlined color="primary" fontSize="small" />
            <Typography variant="h3">Optimization presets</Typography>
          </Box>

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {COMPRESS_PRESETS.map(preset => (
              <Button
                key={preset.id}
                variant={options.preset === preset.id ? 'contained' : 'outlined'}
                size="small"
                disabled={isCompressing}
                onClick={() => applyPreset(preset.id)}
              >
                {preset.label}
              </Button>
            ))}
          </Box>

          <Typography variant="caption" color="text.secondary">
            {COMPRESS_PRESETS.find(item => item.id === options.preset)?.description ?? 'Custom raster DPI, JPEG quality, grayscale, and cleanup settings.'}
          </Typography>

          {options.preset !== 'lossless' && (
            <>
              <Divider />
              <Box>
                <Typography variant="body2" className="tabular-nums">Resolution: {options.dpi} DPI</Typography>
                <Slider
                  aria-label="Target resolution DPI"
                  min={72}
                  max={240}
                  step={12}
                  disabled={isCompressing}
                  value={options.dpi}
                  onChange={(_, value) => updateCustom({ dpi: value as number })}
                />
              </Box>
              <Box>
                <Typography variant="body2" className="tabular-nums">JPEG quality: {Math.round(options.jpegQuality * 100)}%</Typography>
                <Slider
                  aria-label="Compression JPEG quality"
                  min={35}
                  max={95}
                  disabled={isCompressing}
                  value={Math.round(options.jpegQuality * 100)}
                  onChange={(_, value) => updateCustom({ jpegQuality: (value as number) / 100 })}
                />
              </Box>
              <FormControlLabel
                control={
                  <Switch
                    checked={options.grayscale}
                    disabled={isCompressing}
                    onChange={event => updateCustom({ grayscale: event.target.checked })}
                  />
                }
                label="Convert pages to grayscale for extra savings"
              />
            </>
          )}

          <Divider />

          <FormControlLabel
            control={
              <Switch
                checked={options.stripMetadata}
                disabled={isCompressing}
                onChange={event => updateCustom({ stripMetadata: event.target.checked, preset: options.preset })}
              />
            }
            label="Strip Info metadata (Title, Author, Producer)"
          />
          {options.preset === 'lossless' && analysis.formFieldCount > 0 && (
            <FormControlLabel
              control={
                <Switch
                  checked={options.flattenForms}
                  disabled={isCompressing}
                  onChange={event => updateCustom({ flattenForms: event.target.checked, preset: 'lossless' })}
                />
              }
              label="Flatten interactive form fields"
            />
          )}
        </Paper>

        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, position: { lg: 'sticky' }, top: { lg: 16 } }}>
          <Typography variant="h3">Size comparison & output preview</Typography>

          {!compressedResult ? (
            <Box
              className="pdfy-workbench-mat"
              sx={{
                minHeight: 260,
                p: 3,
                borderRadius: 2,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                gap: 1.5,
              }}
            >
              <Typography color="text.secondary">
                Choose a preset and press <strong>Compress PDF</strong> to see exact byte savings and inspect every page before downloading.
              </Typography>
            </Box>
          ) : (
            <>
              {savings && (
                <Paper variant="outlined" sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                    <Typography variant="body2" className="tabular-nums">
                      Original: <strong>{formatByteSize(savings.originalBytes)}</strong>
                    </Typography>
                    <Typography variant="body2" className="tabular-nums">
                      Output: <strong>{formatByteSize(savings.compressedBytes)}</strong> ({savings.shrank ? `${savings.percentSaved}% saved` : `+${Math.abs(savings.percentSaved)}%`})
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={ratioPercent}
                    color={savings.shrank ? 'primary' : 'warning'}
                    aria-label={`Compressed output is ${ratioPercent}% of original file size`}
                  />
                  <Typography variant="caption" color="text.secondary" className="tabular-nums">
                    Profile: {compressedResult.optionsLabel}
                  </Typography>
                </Paper>
              )}

              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                <Button variant="contained" startIcon={<DownloadOutlined />} disabled={isCompressing} onClick={handleDownload} sx={{ minWidth: { sm: 225 } }}>
                  Download compressed PDF
                </Button>
                {onOpenInPrint && (
                  <Button ref={printButtonRef} variant="outlined" startIcon={<PrintOutlined />} disabled={isCompressing} onClick={handlePrint}>
                    Print…
                  </Button>
                )}
                {onOpenInOrganizer && (
                  <Button ref={organizeButtonRef} variant="outlined" startIcon={<DashboardCustomizeOutlined />} disabled={isCompressing} onClick={handleOrganize}>
                    Organize…
                  </Button>
                )}
              </Box>

              {analysis.pageCount > 1 && (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>Output preview</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <IconButton aria-label="Previous compressed page" disabled={safePage <= 1} onClick={() => setPreviewPage(p => Math.max(1, p - 1))}>
                      <ChevronLeft />
                    </IconButton>
                    <Typography role="status" variant="body2" className="tabular-nums" sx={{ minWidth: 84, textAlign: 'center', fontWeight: 600 }}>
                      Page {safePage} of {analysis.pageCount}
                    </Typography>
                    <IconButton aria-label="Next compressed page" disabled={safePage >= analysis.pageCount} onClick={() => setPreviewPage(p => Math.min(analysis.pageCount, p + 1))}>
                      <ChevronRight />
                    </IconButton>
                  </Box>
                </Box>
              )}

              <Box
                ref={previewRef}
                role="region"
                aria-label="Compressed PDF preview"
                tabIndex={0}
                className="pdfy-workbench-mat pdfy-scroll-region"
                sx={{
                  minHeight: 300,
                  p: 2,
                  borderRadius: 2,
                  display: 'flex',
                  alignItems: 'safe center',
                  justifyContent: 'safe center',
                  overflow: 'auto',
                }}
              >
                <Box
                  data-testid="compress-preview-sheet"
                  sx={{
                    bgcolor: '#FFFFFF',
                    boxShadow: '0 6px 24px rgba(0,0,0,0.16)',
                    lineHeight: 0,
                    maxWidth: '100%',
                    overflow: 'hidden',
                    '& .react-pdf__Page__canvas': { display: 'block', maxWidth: '100% !important', height: 'auto !important' },
                  }}
                >
                  <Document
                    file={compressedResult.blob}
                    options={pdfDocumentOptions}
                    loading={<CircularProgress aria-label="Rendering compressed preview" />}
                    error={<Alert severity="warning">Preview unavailable, but download still works.</Alert>}
                  >
                    <Page pageNumber={safePage} width={pageDisplayWidth} renderTextLayer={false} renderAnnotationLayer={false} />
                  </Document>
                </Box>
              </Box>
            </>
          )}
        </Paper>
      </Box>
    </Box>
  );
}
