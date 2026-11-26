import { useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  MenuItem,
  Paper,
  Slider,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  AddPhotoAlternateOutlined,
  ArrowDownward,
  ArrowUpward,
  ArticleOutlined,
  DeleteOutlined,
  DownloadOutlined,
  DragIndicator,
  EditOutlined,
  ImageOutlined,
  PermMediaOutlined,
  PrintOutlined,
  RotateRight,
  TableChartOutlined,
} from '@mui/icons-material';
import { PDFDocument } from 'pdf-lib';
import { usePDFSession, type PDFSession } from '../hooks/usePDFSession';
import { parsePageRange } from '../utils/pageRanges';
import {
  composeImagesToPDF,
  reorderImageItems,
  type ImageFitMode,
  type ImageMarginPreset,
  type ImageOrientationPreset,
  type ImagePageSizePreset,
  type ImageScanFilter,
} from '../utils/pdfConvert';
import {
  encodeImageWithFilter,
  exportPDFPagesToImages,
  prepareImageFiles,
  type LoadedImageSource,
  type RenderedPDFImage,
} from '../utils/pdfImageExport';
import { generateSamplePDF } from '../utils/pdfSamples';
import PDFSessionControls from './PDFSessionControls';
import PDFTableExtractorTab from './PDFTableExtractorTab';
import ToolIntro from './ToolIntro';

const IMAGE_DRAG_TYPE = 'application/x-pdfy-image-item';

async function preparePdfForExport(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  const pageCount = pdf.getPageCount();
  if (!pageCount) throw new Error('This PDF has no pages.');
  return { bytes, pageCount };
}

async function createSampleImageFile(): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 960;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable.');

  ctx.fillStyle = '#F6F3EC';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#1A1916';
  ctx.fillRect(0, 0, canvas.width, 130);

  ctx.fillStyle = '#FFFEFA';
  ctx.font = 'bold 34px sans-serif';
  ctx.fillText('SAMPLE FIELD RECEIPT', 48, 72);
  ctx.fillStyle = '#CFC7B6';
  ctx.font = '20px sans-serif';
  ctx.fillText('Offline Camera Scan · Generated Locally', 48, 106);

  ctx.fillStyle = '#FFFEFA';
  ctx.fillRect(48, 175, canvas.width - 96, 680);
  ctx.strokeStyle = '#CFC7B6';
  ctx.lineWidth = 2;
  ctx.strokeRect(48, 175, canvas.width - 96, 680);

  ctx.fillStyle = '#1A1916';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText('Checklist Itemized Summary', 80, 232);

  const lines = [
    '01. Optical alignment & crop calibration ....... OK',
    '02. Local canvas grayscale normalization ....... OK',
    '03. Multi-page PDF packaging without uploads ... OK',
    '04. Ready for Edit, Organize, or OS Print ...... OK',
  ];
  ctx.font = '20px monospace';
  ctx.fillStyle = '#1D4E68';
  lines.forEach((line, idx) => {
    ctx.fillText(line, 80, 305 + idx * 54);
  });

  ctx.fillStyle = '#B43C18';
  ctx.fillRect(80, 560, 220, 64);
  ctx.fillStyle = '#FFFEFA';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('VERIFIED SCAN', 108, 600);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not build sample image.'))), 'image/png');
  });
  canvas.width = 0;
  canvas.height = 0;
  return new File([blob], 'Sample_Receipt_Scan.png', { type: 'image/png' });
}

export default function PDFConverter({
  initialFile,
  active = true,
  onOpenInPrint,
  onOpenInEditor,
}: {
  initialFile?: File | null;
  active?: boolean;
  onOpenInPrint?: (file: File) => void;
  onOpenInEditor?: (file: File) => void;
}) {
  const [tab, setTab] = useState<'images-to-pdf' | 'pdf-to-images' | 'pdf-to-tables'>(initialFile ? 'pdf-to-images' : 'images-to-pdf');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <Paper variant="outlined" sx={{ px: 1, minWidth: 0 }}>
        <Tabs
          value={tab}
          onChange={(_, next) => setTab(next)}
          aria-label="Conversion mode"
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab value="images-to-pdf" icon={<AddPhotoAlternateOutlined />} iconPosition="start" label="Images to PDF" />
          <Tab value="pdf-to-images" icon={<ImageOutlined />} iconPosition="start" label="PDF to Images" />
          <Tab value="pdf-to-tables" icon={<TableChartOutlined />} iconPosition="start" label="PDF to Tables" />
        </Tabs>
      </Paper>

      <Box hidden={tab !== 'images-to-pdf'} sx={{ minWidth: 0 }}>
        <ImagesToPDFTab onOpenInPrint={onOpenInPrint} onOpenInEditor={onOpenInEditor} />
      </Box>
      <Box hidden={tab !== 'pdf-to-images'} sx={{ minWidth: 0 }}>
        <PDFToImagesTab initialFile={initialFile} active={active && tab === 'pdf-to-images'} />
      </Box>
      <Box hidden={tab !== 'pdf-to-tables'} sx={{ minWidth: 0 }}>
        <PDFTableExtractorTab initialFile={initialFile} active={active && tab === 'pdf-to-tables'} />
      </Box>
    </Box>
  );
}

function ImagesToPDFTab({
  onOpenInPrint,
  onOpenInEditor,
}: {
  onOpenInPrint?: (file: File) => void;
  onOpenInEditor?: (file: File) => void;
}) {
  const [items, setItems] = useState<LoadedImageSource[]>([]);
  const [outputName, setOutputName] = useState('Converted_Images');
  const [pageSize, setPageSize] = useState<ImagePageSizePreset>('a4');
  const [orientation, setOrientation] = useState<ImageOrientationPreset>('auto');
  const [margin, setMargin] = useState<ImageMarginPreset>('narrow');
  const [fit, setFit] = useState<ImageFitMode>('contain');
  const [scanFilter, setScanFilter] = useState<ImageScanFilter>('original');
  const [isAdding, setIsAdding] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [feedback, setFeedback] = useState<{ severity: 'success' | 'error' | 'info'; message: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const printButtonRef = useRef<HTMLButtonElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const pendingHandoffRef = useRef<{ target: 'print' | 'edit'; file: File } | null>(null);
  const urlsRef = useRef<Set<string>>(new Set());

  const isBusy = isAdding || isBuilding;

  useEffect(() => {
    const trackedUrls = urlsRef.current;
    return () => {
      trackedUrls.forEach(url => URL.revokeObjectURL(url));
      trackedUrls.clear();
    };
  }, []);

  useEffect(() => {
    if (isBuilding || !pendingHandoffRef.current) return;
    const next = pendingHandoffRef.current;
    pendingHandoffRef.current = null;
    if (next.target === 'print') {
      printButtonRef.current?.focus();
      onOpenInPrint?.(next.file);
    } else {
      editButtonRef.current?.focus();
      onOpenInEditor?.(next.file);
    }
  }, [isBuilding, onOpenInPrint, onOpenInEditor]);

  const addImages = async (loader: () => Promise<File[]>) => {
    if (isBusy) return;
    setIsAdding(true);
    setFeedback(null);
    try {
      const files = await loader();
      if (!files.length) return;
      const { accepted, rejected } = await prepareImageFiles(files);
      accepted.forEach(item => urlsRef.current.add(item.previewUrl));
      setItems(prev => [...prev, ...accepted]);

      if (rejected.length) {
        setFeedback({
          severity: 'error',
          message: `Skipped unsupported or unreadable image(s): ${rejected.join(', ')}. Use PNG, JPEG, or WebP images.`,
        });
      } else if (accepted.length) {
        setFeedback({
          severity: 'info',
          message: `Added ${accepted.length} ${accepted.length === 1 ? 'image' : 'images'} to the PDF builder.`,
        });
      }
    } catch {
      setFeedback({ severity: 'error', message: 'Could not read the selected image files. Try again.' });
    } finally {
      setIsAdding(false);
    }
  };

  const moveItem = (sourceId: string, targetId: string) => {
    if (isBusy) return;
    const reordered = reorderImageItems(items, sourceId, targetId);
    if (reordered === items) return;
    setItems(reordered);
    const pos = reordered.findIndex(item => item.id === sourceId);
    setAnnouncement(`${reordered[pos].name} moved to position ${pos + 1} of ${reordered.length}.`);
  };

  const rotateItem = (id: string) => {
    setItems(prev => prev.map(item => (
      item.id === id ? { ...item, rotation: ((item.rotation + 90) % 360) as LoadedImageSource['rotation'] } : item
    )));
  };

  const removeItem = (id: string) => {
    const target = items.find(item => item.id === id);
    if (target) {
      URL.revokeObjectURL(target.previewUrl);
      urlsRef.current.delete(target.previewUrl);
    }
    setItems(prev => prev.filter(item => item.id !== id));
    setAnnouncement(target ? `Removed ${target.name}.` : 'Removed image.');
  };

  const buildPDFFile = async (): Promise<File> => {
    const prepared = await Promise.all(
      items.map(async item => {
        const encoded = await encodeImageWithFilter(item, scanFilter);
        return {
          id: item.id,
          name: item.name,
          mimeType: encoded.mimeType,
          bytes: encoded.bytes,
          width: item.width,
          height: item.height,
          rotation: item.rotation,
        };
      }),
    );
    const cleanName = `${(outputName.trim() || 'Converted_Images').replace(/\.pdf$/i, '')}.pdf`;
    const pdfBytes = await composeImagesToPDF(prepared, {
      pageSize,
      orientation,
      fit,
      margin,
      title: cleanName.replace(/\.pdf$/i, ''),
    });
    return new File([pdfBytes as BlobPart], cleanName, { type: 'application/pdf' });
  };

  const handleDownloadPDF = async () => {
    if (!items.length || isBusy) return;
    setIsBuilding(true);
    setFeedback(null);
    try {
      const file = await buildPDFFile();
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setFeedback({ severity: 'success', message: `Downloaded ${file.name} (${items.length} ${items.length === 1 ? 'page' : 'pages'}).` });
    } catch (err) {
      setFeedback({ severity: 'error', message: err instanceof Error ? err.message : 'Could not build the PDF. Try again.' });
    } finally {
      setIsBuilding(false);
    }
  };

  const handleHandoff = async (target: 'print' | 'edit') => {
    if (!items.length || isBusy) return;
    setIsBuilding(true);
    setFeedback(null);
    try {
      const file = await buildPDFFile();
      pendingHandoffRef.current = { target, file };
    } catch (err) {
      pendingHandoffRef.current = null;
      setFeedback({ severity: 'error', message: err instanceof Error ? err.message : 'Could not prepare PDF for handoff.' });
    } finally {
      setIsBuilding(false);
    }
  };

  const handleDragStart = (event: DragEvent<HTMLElement>, id: string) => {
    if (isBusy) return;
    setDraggedId(id);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(IMAGE_DRAG_TYPE, id);
  };

  const handleDrop = (event: DragEvent<HTMLElement>, targetId: string) => {
    event.preventDefault();
    const sourceId = draggedId || event.dataTransfer.getData(IMAGE_DRAG_TYPE);
    setDraggedId(null);
    setDropTargetId(null);
    if (sourceId) moveItem(sourceId, targetId);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      {!items.length && (
        <ToolIntro
          icon={<PermMediaOutlined />}
          title="Turn images into a clean PDF"
          description="Combine PNG, JPEG, or WebP scans into a PDF with custom paper size and scan filter."
        />
      )}

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        <Button
          variant="contained"
          startIcon={isAdding ? <CircularProgress size={18} color="inherit" /> : <AddPhotoAlternateOutlined />}
          disabled={isBusy}
          onClick={() => fileInputRef.current?.click()}
        >
          {isAdding ? 'Adding images…' : items.length ? 'Add more images' : 'Add images'}
        </Button>
        <input
          ref={fileInputRef}
          hidden
          multiple
          type="file"
          accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
          aria-label="Images to convert to PDF"
          disabled={isBusy}
          onChange={event => {
            const files = Array.from(event.target.files || []);
            event.target.value = '';
            void addImages(async () => files);
          }}
        />
        <Button
          variant="outlined"
          startIcon={<ArticleOutlined />}
          disabled={isBusy}
          onClick={() => void addImages(async () => [await createSampleImageFile()])}
        >
          Add sample scan
        </Button>
      </Box>

      {feedback && (
        <Alert severity={feedback.severity} onClose={() => setFeedback(null)} sx={{ overflowWrap: 'anywhere' }}>
          {feedback.message}
        </Alert>
      )}
      <Typography role="status" className="sr-only">{announcement}</Typography>

      {items.length > 0 && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1.15fr) minmax(0, 0.85fr)' },
            gap: 2,
            alignItems: 'start',
            minWidth: 0,
          }}
        >
          <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
              <Typography variant="h2" className="tabular-nums">Image queue ({items.length})</Typography>
              <Typography variant="body2" color="text.secondary">Drag or use arrows to reorder pages</Typography>
            </Box>

            <Box component="ol" aria-label="Image order" sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 1.25 }}>
              {items.map((item, index) => (
                <Paper
                  key={item.id}
                  component="li"
                  variant="outlined"
                  className="pdfy-page-tile pdfy-card-interactive"
                  draggable={!isBusy}
                  onDragStart={event => handleDragStart(event, item.id)}
                  onDragOver={event => {
                    event.preventDefault();
                    setDropTargetId(item.id);
                  }}
                  onDragLeave={() => setDropTargetId(curr => (curr === item.id ? null : curr))}
                  onDrop={event => handleDrop(event, item.id)}
                  onDragEnd={() => { setDraggedId(null); setDropTargetId(null); }}
                  sx={{
                    p: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 1.5,
                    minWidth: 0,
                    borderColor: dropTargetId === item.id ? 'primary.main' : undefined,
                    bgcolor: draggedId === item.id ? 'action.selected' : 'background.paper',
                  }}
                >
                  <DragIndicator sx={{ color: 'text.secondary', display: { xs: 'none', sm: 'block' } }} />
                  <Box
                    className="pdfy-workbench-mat"
                    sx={{
                      width: 64,
                      height: 64,
                      borderRadius: 1,
                      p: 0.5,
                      display: 'grid',
                      placeItems: 'center',
                      overflow: 'hidden',
                      flexShrink: 0,
                    }}
                  >
                    <Box
                      component="img"
                      src={item.previewUrl}
                      alt={`Preview of ${item.name}`}
                      sx={{
                        display: 'block',
                        maxWidth: '100%',
                        maxHeight: '100%',
                        objectFit: 'contain',
                        bgcolor: '#FFFFFF',
                        transform: `rotate(${item.rotation}deg)`,
                        filter: scanFilter === 'document-bw' ? 'grayscale(100%) contrast(140%)' : 'none',
                      }}
                    />
                  </Box>
                  <Box sx={{ flex: '1 1 140px', minWidth: 0 }}>
                    <Typography className="tabular-nums" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
                      {index + 1}. {item.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" className="tabular-nums">
                      {item.width} × {item.height} px · {item.rotation}°
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    <Tooltip title="Move up">
                      <span>
                        <IconButton aria-label={`Move ${item.name} up`} disabled={index === 0 || isBusy} onClick={() => moveItem(item.id, items[index - 1].id)}>
                          <ArrowUpward />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Move down">
                      <span>
                        <IconButton aria-label={`Move ${item.name} down`} disabled={index === items.length - 1 || isBusy} onClick={() => moveItem(item.id, items[index + 1].id)}>
                          <ArrowDownward />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Rotate 90 degrees right">
                      <IconButton aria-label={`Rotate ${item.name} right`} disabled={isBusy} onClick={() => rotateItem(item.id)}>
                        <RotateRight />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Remove image">
                      <IconButton aria-label={`Remove ${item.name}`} disabled={isBusy} color="error" onClick={() => removeItem(item.id)}>
                        <DeleteOutlined />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Paper>
              ))}
            </Box>
          </Paper>

          <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <Typography variant="h2">PDF layout options</Typography>

            <TextField
              size="small"
              label="Output PDF filename"
              value={outputName}
              onChange={event => setOutputName(event.target.value)}
              disabled={isBusy}
              fullWidth
            />

            <TextField
              select
              size="small"
              label="Page size"
              value={pageSize}
              onChange={event => setPageSize(event.target.value as ImagePageSizePreset)}
              disabled={isBusy}
              fullWidth
            >
              <MenuItem value="a4">A4 (210 × 297 mm)</MenuItem>
              <MenuItem value="letter">US Letter (8.5 × 11 in)</MenuItem>
              <MenuItem value="match">Match image size</MenuItem>
            </TextField>

            <TextField
              select
              size="small"
              label="Orientation"
              value={orientation}
              onChange={event => setOrientation(event.target.value as ImageOrientationPreset)}
              disabled={isBusy}
              fullWidth
            >
              <MenuItem value="auto">Auto (match each image)</MenuItem>
              <MenuItem value="portrait">Portrait</MenuItem>
              <MenuItem value="landscape">Landscape</MenuItem>
            </TextField>

            <TextField
              select
              size="small"
              label="Margins"
              value={margin}
              onChange={event => setMargin(event.target.value as ImageMarginPreset)}
              disabled={isBusy}
              fullWidth
            >
              <MenuItem value="none">None (edge-to-edge)</MenuItem>
              <MenuItem value="narrow">Narrow (6 mm)</MenuItem>
              <MenuItem value="normal">Normal (13 mm)</MenuItem>
            </TextField>

            <TextField
              select
              size="small"
              label="Image fit"
              value={fit}
              onChange={event => setFit(event.target.value as ImageFitMode)}
              disabled={isBusy}
              fullWidth
            >
              <MenuItem value="contain">Contain (show full image)</MenuItem>
              <MenuItem value="cover">Cover (fill printable area)</MenuItem>
            </TextField>

            <TextField
              select
              size="small"
              label="Scan enhancement"
              value={scanFilter}
              onChange={event => setScanFilter(event.target.value as ImageScanFilter)}
              disabled={isBusy}
              fullWidth
            >
              <MenuItem value="original">Original colors</MenuItem>
              <MenuItem value="document-bw">Document scan (high-contrast B&W)</MenuItem>
            </TextField>

            <Divider />

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Button
                variant="contained"
                size="large"
                startIcon={isBuilding ? <CircularProgress size={18} color="inherit" /> : <DownloadOutlined />}
                disabled={isBusy}
                onClick={handleDownloadPDF}
              >
                {isBuilding ? 'Building PDF…' : 'Download PDF'}
              </Button>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {onOpenInPrint && (
                  <Button
                    ref={printButtonRef}
                    variant="outlined"
                    startIcon={<PrintOutlined />}
                    disabled={isBusy}
                    onClick={() => void handleHandoff('print')}
                    sx={{ flex: '1 1 120px' }}
                  >
                    Print…
                  </Button>
                )}
                {onOpenInEditor && (
                  <Button
                    ref={editButtonRef}
                    variant="outlined"
                    startIcon={<EditOutlined />}
                    disabled={isBusy}
                    onClick={() => void handleHandoff('edit')}
                    sx={{ flex: '1 1 120px' }}
                  >
                    Edit…
                  </Button>
                )}
              </Box>
            </Box>
          </Paper>
        </Box>
      )}
    </Box>
  );
}

function PDFToImagesTab({ initialFile, active }: { initialFile?: File | null; active: boolean }) {
  const replacement = usePDFSession(preparePdfForExport, initialFile);
  const [isExporting, setIsExporting] = useState(false);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      {!replacement.session && (
        <ToolIntro
          icon={<ImageOutlined />}
          title="Export PDF pages as images"
          description="Render any page range as PNG or JPEG at your chosen DPI."
        />
      )}
      <PDFSessionControls
        tool="Convert"
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
          <PDFToImagesWorkspace key={replacement.session.id} session={replacement.session} onExporting={setIsExporting} />
        </Box>
      )}
    </Box>
  );
}

function PDFToImagesWorkspace({
  session: { file, data },
  onExporting,
}: {
  session: PDFSession<{ bytes: Uint8Array; pageCount: number }>;
  onExporting: (busy: boolean) => void;
}) {
  const [rangeMode, setRangeMode] = useState<'all' | 'custom'>('all');
  const [pageRange, setPageRange] = useState('1');
  const [format, setFormat] = useState<'image/png' | 'image/jpeg'>('image/png');
  const [dpi, setDpi] = useState<96 | 150 | 250>(150);
  const [jpegQuality, setJpegQuality] = useState(88);
  const [isRendering, setIsRendering] = useState(false);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [rendered, setRendered] = useState<RenderedPDFImage[]>([]);
  const [feedback, setFeedback] = useState<{ severity: 'success' | 'error' | 'info'; message: string } | null>(null);

  const urlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const urls = urlsRef.current;
    return () => {
      urls.forEach(url => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const rangeValidation = useMemo(() => {
    if (rangeMode === 'all') return { count: data.pageCount, error: null as string | null };
    try {
      const selected = parsePageRange(pageRange, data.pageCount);
      return { count: selected.length, error: null as string | null };
    } catch (err) {
      return { count: 0, error: err instanceof Error ? err.message : 'Enter valid page numbers.' };
    }
  }, [rangeMode, pageRange, data.pageCount]);

  const handleRender = async () => {
    if (isRendering || rangeValidation.error) return;
    setIsRendering(true);
    onExporting(true);
    setFeedback(null);
    setProgressText('Preparing PDF pages…');

    rendered.forEach(item => {
      URL.revokeObjectURL(item.previewUrl);
      urlsRef.current.delete(item.previewUrl);
    });
    setRendered([]);

    try {
      const next = await exportPDFPagesToImages(
        data.bytes,
        file.name,
        {
          rangeMode,
          pageRange,
          format,
          dpi,
          jpegQuality: jpegQuality / 100,
        },
        (done, total) => setProgressText(`Rendering page ${Math.min(done + 1, total)} of ${total}…`),
      );
      next.forEach(item => urlsRef.current.add(item.previewUrl));
      setRendered(next);
      setFeedback({ severity: 'success', message: `Rendered ${next.length} ${next.length === 1 ? 'image' : 'images'} ready to download.` });
    } catch (err) {
      setFeedback({ severity: 'error', message: err instanceof Error ? err.message : 'Could not render PDF pages.' });
    } finally {
      setProgressText(null);
      setIsRendering(false);
      onExporting(false);
    }
  };

  const downloadImage = (item: RenderedPDFImage) => {
    const link = document.createElement('a');
    link.href = item.previewUrl;
    link.download = item.filename;
    document.body.append(link);
    link.click();
    link.remove();
  };

  const downloadAll = () => {
    rendered.forEach((item, index) => {
      window.setTimeout(() => downloadImage(item), index * 120);
    });
    setFeedback({
      severity: 'info',
      message: `Started ${rendered.length} downloads. Your browser may ask permission for multiple files.`,
    });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h2" sx={{ overflowWrap: 'anywhere' }}>{file.name}</Typography>
            <Typography role="status" color="text.secondary" className="tabular-nums">
              {data.pageCount} source {data.pageCount === 1 ? 'page' : 'pages'} · {rangeValidation.count} selected to render
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={isRendering ? <CircularProgress size={18} color="inherit" /> : <ImageOutlined />}
            disabled={isRendering || !!rangeValidation.error}
            onClick={handleRender}
            sx={{ minWidth: { sm: 215 } }}
          >
            {isRendering ? progressText : 'Render page images'}
          </Button>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(3, minmax(0, 1fr))' }, gap: 2, minWidth: 0 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
            <ToggleButtonGroup
              exclusive
              fullWidth
              size="small"
              aria-label="Export page range mode"
              value={rangeMode}
              onChange={(_, val) => { if (val) setRangeMode(val); }}
            >
              <ToggleButton value="all" className="tabular-nums">All pages ({data.pageCount})</ToggleButton>
              <ToggleButton value="custom">Custom range</ToggleButton>
            </ToggleButtonGroup>
            {rangeMode === 'custom' && (
              <TextField
                size="small"
                label="Page range"
                placeholder="1-3, 5"
                value={pageRange}
                onChange={event => setPageRange(event.target.value)}
                error={!!rangeValidation.error}
                helperText={rangeValidation.error || 'Example: 1-2, 4'}
                fullWidth
              />
            )}
          </Box>

          <TextField
            select
            size="small"
            label="Image format"
            value={format}
            onChange={event => setFormat(event.target.value as 'image/png' | 'image/jpeg')}
            fullWidth
          >
            <MenuItem value="image/png">PNG (lossless crisp text)</MenuItem>
            <MenuItem value="image/jpeg">JPEG (smaller file size)</MenuItem>
          </TextField>

          <TextField
            select
            size="small"
            label="Resolution"
            value={dpi}
            onChange={event => setDpi(Number(event.target.value) as 96 | 150 | 250)}
            fullWidth
          >
            <MenuItem value={96}>Screen (96 DPI)</MenuItem>
            <MenuItem value={150}>Standard (150 DPI)</MenuItem>
            <MenuItem value={250}>High detail (250 DPI)</MenuItem>
          </TextField>
        </Box>

        {format === 'image/jpeg' && (
          <Box sx={{ maxWidth: 340 }}>
            <Typography variant="body2" className="tabular-nums">JPEG quality: {jpegQuality}%</Typography>
            <Slider
              aria-label="JPEG quality"
              min={50}
              max={100}
              value={jpegQuality}
              onChange={(_, value) => setJpegQuality(value as number)}
            />
          </Box>
        )}
      </Paper>

      {feedback && (
        <Alert severity={feedback.severity} onClose={() => setFeedback(null)} sx={{ overflowWrap: 'anywhere' }}>
          {feedback.message}
        </Alert>
      )}

      {rendered.length > 0 && (
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
            <Typography variant="h3" className="tabular-nums">Rendered images ({rendered.length})</Typography>
            {rendered.length > 1 && (
              <Button variant="outlined" startIcon={<DownloadOutlined />} onClick={downloadAll} className="tabular-nums">
                Download all ({rendered.length})
              </Button>
            )}
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))', gap: 2 }}>
            {rendered.map(item => (
              <Paper key={item.filename} variant="outlined" className="pdfy-page-tile pdfy-card-interactive" sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                <Box className="pdfy-workbench-mat" sx={{ borderRadius: 1, overflow: 'hidden', display: 'grid', placeItems: 'center', height: 180, p: 1 }}>
                  <Box
                    component="img"
                    src={item.previewUrl}
                    alt={`Page ${item.pageNumber}`}
                    sx={{
                      display: 'block',
                      maxWidth: '100%',
                      maxHeight: '100%',
                      objectFit: 'contain',
                      bgcolor: '#FFFFFF',
                      boxShadow: '0 2px 8px rgba(26, 25, 22, 0.14)',
                    }}
                  />
                </Box>
                <Typography className="tabular-nums" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>Page {item.pageNumber}</Typography>
                <Typography variant="caption" color="text.secondary" className="tabular-nums">
                  {item.width} × {item.height} px · {(item.blob.size / 1024).toFixed(1)} KB
                </Typography>
                <Button variant="outlined" size="small" startIcon={<DownloadOutlined />} onClick={() => downloadImage(item)}>
                  Download {format === 'image/png' ? 'PNG' : 'JPEG'}
                </Button>
              </Paper>
            ))}
          </Box>
        </Paper>
      )}
    </Box>
  );
}
