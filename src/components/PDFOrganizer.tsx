import { pdfDocumentOptions } from '../utils/pdfRendering';
import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Typography,
  Paper,
  CircularProgress,
  IconButton,
  TextField,
  Slider,
  Switch,
  FormControlLabel,
  Select,
  MenuItem,
  Divider,
  Tooltip,
  Snackbar,
  Alert,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  RotateRight as RotateRightIcon,
  RotateLeft as RotateLeftIcon,
  DeleteOutlined as DeleteIcon,
  ArrowBack as MoveLeftIcon,
  ArrowForward as MoveRightIcon,
  ContentCopy as DuplicateIcon,
  AddBoxOutlined as AddBlankIcon,
  SaveAlt as ExportIcon,
  AutoFixHigh as SampleIcon,
  BrandingWatermark as WatermarkIcon,
  FormatListNumbered as PageNumIcon,
  RestartAlt as ResetIcon,
} from '@mui/icons-material';
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { Document, Page, pdfjs } from 'react-pdf';
import { generateSamplePDF } from '../utils/pdfSamples';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface PageConfig {
  id: string;
  originalIndex: number; // -1 means newly inserted blank page
  rotation: number; // 0, 90, 180, 270
}

interface Props {
  initialFile?: File | null;
}

export default function PDFOrganizer({ initialFile }: Props) {
  const [file, setFile] = useState<File | null>(initialFile || null);
  const [pageConfigs, setPageConfigs] = useState<PageConfig[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  // Watermark settings
  const [enableWatermark, setEnableWatermark] = useState(false);
  const [watermarkText, setWatermarkText] = useState('CONFIDENTIAL');
  const [watermarkColor, setWatermarkColor] = useState('#EF4444');
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.22);
  const [watermarkSize, setWatermarkSize] = useState(48);
  const [watermarkDiagonal, setWatermarkDiagonal] = useState(true);

  // Page numbering settings
  const [enablePageNumbers, setEnablePageNumbers] = useState(true);
  const [pageNumberFormat, setPageNumberFormat] = useState<'page-of' | 'simple' | 'bates'>('page-of');
  const [pageNumberPosition, setPageNumberPosition] = useState<'bottom-center' | 'bottom-right' | 'top-right'>('bottom-center');
  const [batesPrefix, setBatesPrefix] = useState('DOC-2026-');

  const [toast, setToast] = useState<{ message: string; severity: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    if (initialFile) {
      setFile(initialFile);
    }
  }, [initialFile]);

  const handleFileLoad = (newFile: File) => {
    setFile(newFile);
    setPageConfigs([]);
  };

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      handleFileLoad(event.target.files[0]);
    }
  };

  const loadSample = async () => {
    const sample = await generateSamplePDF('multi-page-report');
    handleFileLoad(sample);
    setToast({ message: 'Loaded 4-page Operations Dossier for organization & watermarking', severity: 'info' });
  };

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setPageConfigs(
      Array.from({ length: numPages }, (_, idx) => ({
        id: crypto.randomUUID(),
        originalIndex: idx,
        rotation: 0,
      }))
    );
  };

  const rotatePage = (idx: number, delta: number) => {
    setPageConfigs(prev =>
      prev.map((p, i) => (i === idx ? { ...p, rotation: (p.rotation + delta + 360) % 360 } : p))
    );
  };

  const rotateAll = (delta: number) => {
    setPageConfigs(prev =>
      prev.map(p => ({ ...p, rotation: (p.rotation + delta + 360) % 360 }))
    );
  };

  const movePage = (idx: number, direction: -1 | 1) => {
    const target = idx + direction;
    if (target < 0 || target >= pageConfigs.length) return;
    setPageConfigs(prev => {
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(target, 0, item);
      return copy;
    });
  };

  const duplicatePage = (idx: number) => {
    setPageConfigs(prev => {
      const copy = [...prev];
      const source = copy[idx];
      copy.splice(idx + 1, 0, {
        ...source,
        id: crypto.randomUUID(),
      });
      return copy;
    });
  };

  const insertBlankPageAfter = (idx: number) => {
    setPageConfigs(prev => {
      const copy = [...prev];
      copy.splice(idx + 1, 0, {
        id: crypto.randomUUID(),
        originalIndex: -1,
        rotation: 0,
      });
      return copy;
    });
  };

  const deletePage = (idx: number) => {
    if (pageConfigs.length <= 1) {
      setToast({ message: 'Document must contain at least one page.', severity: 'error' });
      return;
    }
    setPageConfigs(prev => prev.filter((_, i) => i !== idx));
  };

  const exportOrganizedPDF = async () => {
    if (!file || pageConfigs.length === 0) return;
    setIsExporting(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const srcDoc = await PDFDocument.load(arrayBuffer);
      const outDoc = await PDFDocument.create();
      const fontBold = await outDoc.embedFont(StandardFonts.HelveticaBold);
      const fontMono = await outDoc.embedFont(StandardFonts.Courier);

      const hexToRgb = (hex: string) => {
        const clean = hex.replace('#', '');
        const r = parseInt(clean.slice(0, 2), 16) / 255 || 0;
        const g = parseInt(clean.slice(2, 4), 16) / 255 || 0;
        const b = parseInt(clean.slice(4, 6), 16) / 255 || 0;
        return rgb(r, g, b);
      };

      const wmColor = hexToRgb(watermarkColor);

      for (let i = 0; i < pageConfigs.length; i++) {
        const cfg = pageConfigs[i];
        let page;
        if (cfg.originalIndex === -1) {
          page = outDoc.addPage([595.28, 841.89]);
        } else {
          const [copied] = await outDoc.copyPages(srcDoc, [cfg.originalIndex]);
          page = outDoc.addPage(copied);
        }

        const currentRot = page.getRotation().angle;
        page.setRotation(degrees((currentRot + cfg.rotation) % 360));

        const { width, height } = page.getSize();

        // Apply Watermark if enabled
        if (enableWatermark && watermarkText.trim()) {
          const textWidth = fontBold.widthOfTextAtSize(watermarkText, watermarkSize);
          if (watermarkDiagonal) {
            page.drawText(watermarkText, {
              x: width / 2 - (textWidth * Math.cos(Math.PI / 4)) / 2,
              y: height / 2 - (textWidth * Math.sin(Math.PI / 4)) / 2,
              size: watermarkSize,
              font: fontBold,
              color: wmColor,
              opacity: watermarkOpacity,
              rotate: degrees(45),
            });
          } else {
            page.drawText(watermarkText, {
              x: (width - textWidth) / 2,
              y: height / 2,
              size: watermarkSize,
              font: fontBold,
              color: wmColor,
              opacity: watermarkOpacity,
            });
          }
        }

        // Apply Page Numbering if enabled
        if (enablePageNumbers) {
          let label = '';
          if (pageNumberFormat === 'page-of') {
            label = `Page ${i + 1} of ${pageConfigs.length}`;
          } else if (pageNumberFormat === 'simple') {
            label = `${i + 1}`;
          } else {
            label = `${batesPrefix}${String(i + 1).padStart(4, '0')}`;
          }

          const fontSize = 9.5;
          const labelWidth = fontMono.widthOfTextAtSize(label, fontSize);
          let x = (width - labelWidth) / 2;
          let y = 28;

          if (pageNumberPosition === 'bottom-right') {
            x = width - labelWidth - 40;
            y = 28;
          } else if (pageNumberPosition === 'top-right') {
            x = width - labelWidth - 40;
            y = height - 32;
          }

          page.drawText(label, {
            x,
            y,
            size: fontSize,
            font: fontMono,
            color: rgb(0.35, 0.39, 0.45),
          });
        }
      }

      const savedBytes = await outDoc.save();
      const blob = new Blob([savedBytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `organized_${file.name}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 200);
      setToast({ message: `Exported ${pageConfigs.length} pages with applied layout & stamps.`, severity: 'success' });
    } catch (err) {
      console.error('Error exporting organized PDF:', err);
      setToast({ message: 'Failed to export organized PDF.', severity: 'error' });
    } finally {
      setIsExporting(false);
    }
  };

  if (!file) {
    return (
      <Box sx={{ width: '100%', maxWidth: 680, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Paper
          sx={{
            p: 5,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: 2.5,
            border: '1px dashed rgba(255, 255, 255, 0.14)',
            bgcolor: 'rgba(17, 24, 39, 0.7)',
          }}
        >
          <Box
            sx={{
              width: 52,
              height: 52,
              borderRadius: '12px',
              bgcolor: 'rgba(99, 102, 241, 0.12)',
              border: '1px solid rgba(99, 102, 241, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#818CF8',
            }}
          >
            <WatermarkIcon sx={{ fontSize: 26 }} />
          </Box>
          <Box>
            <Typography variant="h1" sx={{ fontSize: 22, mb: 0.75 }}>
              Page Organizer & Watermark Studio
            </Typography>
            <Typography variant="body1" sx={{ color: 'text.secondary', maxWidth: 460 }}>
              Reorder pages, rotate individual sheets, insert blank dividers, or stamp diagonal watermarks and Bates page numbers.
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', justifyContent: 'center', mt: 1 }}>
            <Button variant="contained" component="label" startIcon={<UploadIcon />} sx={{ whiteSpace: 'nowrap' }}>
              Select PDF Document
              <input type="file" hidden accept="application/pdf" onChange={onFileChange} />
            </Button>
            <Button variant="outlined" startIcon={<SampleIcon />} onClick={loadSample} sx={{ whiteSpace: 'nowrap' }}>
              Load 4-Page Sample Dossier
            </Button>
          </Box>
        </Paper>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', height: '100%', display: 'flex', gap: 3, overflow: 'hidden' }}>
      {/* Left Main Grid: Page Thumbnails & Reordering */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', gap: 2 }}>
        {/* Toolbar */}
        <Paper
          sx={{
            px: 2.5,
            py: 1.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
            flexWrap: 'wrap',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant="h2" sx={{ fontSize: 15, fontWeight: 600 }}>
              {file.name}
            </Typography>
            <Typography variant="caption" className="mono" sx={{ color: 'text.secondary' }}>
              · {pageConfigs.length} Pages
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<RotateLeftIcon />}
              onClick={() => rotateAll(-90)}
              sx={{ whiteSpace: 'nowrap' }}
            >
              Rotate All CCW
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<RotateRightIcon />}
              onClick={() => rotateAll(90)}
              sx={{ whiteSpace: 'nowrap' }}
            >
              Rotate All CW
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<ResetIcon />}
              onClick={() => onDocumentLoadSuccess({ numPages: pageConfigs.filter(p => p.originalIndex !== -1).length || 1 })}
              sx={{ whiteSpace: 'nowrap' }}
            >
              Reset Order
            </Button>
            <Button size="small" variant="outlined" component="label" sx={{ whiteSpace: 'nowrap' }}>
              Switch PDF
              <input type="file" hidden accept="application/pdf" onChange={onFileChange} />
            </Button>
          </Box>
        </Paper>

        {/* Page Grid */}
        <Box
          sx={{
            flex: 1,
            overflow: 'auto',
            p: 3,
            bgcolor: 'rgba(11, 15, 25, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 2,
          }}
        >
          <Document
            options={pdfDocumentOptions}
            file={file}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                <CircularProgress size={32} />
              </Box>
            }
          >
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
                gap: 2.5,
              }}
            >
              {pageConfigs.map((cfg, idx) => (
                <Paper
                  key={cfg.id}
                  sx={{
                    p: 1.5,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 1.25,
                    position: 'relative',
                    bgcolor: 'rgba(22, 30, 49, 0.75)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    transition: 'transform 0.15s ease, border-color 0.15s ease',
                    '&:hover': {
                      borderColor: 'rgba(99, 102, 241, 0.45)',
                    },
                  }}
                >
                  {/* Page Header Metadata */}
                  <Box sx={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography className="mono" sx={{ fontSize: 11, fontWeight: 600, color: '#F9FAFB' }}>
                      Page {String(idx + 1).padStart(2, '0')}
                    </Typography>
                    <Typography className="mono" sx={{ fontSize: 10, color: '#9CA3AF' }}>
                      {cfg.originalIndex === -1 ? 'Blank Sheet' : `Src #${cfg.originalIndex + 1}`}
                      {cfg.rotation > 0 ? ` · ${cfg.rotation}°` : ''}
                    </Typography>
                  </Box>

                  {/* Page Visual Preview with Live Watermark & Rotation */}
                  <Box
                    sx={{
                      width: 170,
                      height: 235,
                      bgcolor: '#FFFFFF',
                      borderRadius: 1,
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative',
                      boxShadow: '0 6px 20px rgba(0, 0, 0, 0.45)',
                    }}
                  >
                    <Box
                      sx={{
                        transform: `rotate(${cfg.rotation}deg)`,
                        transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                      }}
                    >
                      {cfg.originalIndex === -1 ? (
                        <Box sx={{ width: 170, height: 235, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Typography variant="caption" sx={{ color: '#9CA3AF' }}>
                            Blank A4 Page
                          </Typography>
                        </Box>
                      ) : (
                        <Page
                          pageNumber={cfg.originalIndex + 1}
                          width={170}
                          renderTextLayer={false}
                          renderAnnotationLayer={false}
                        />
                      )}
                    </Box>

                    {/* Live Watermark Overlay Preview */}
                    {enableWatermark && watermarkText.trim() && (
                      <Box
                        sx={{
                          position: 'absolute',
                          inset: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          pointerEvents: 'none',
                        }}
                      >
                        <Typography
                          sx={{
                            color: watermarkColor,
                            opacity: watermarkOpacity,
                            fontWeight: 700,
                            fontSize: Math.max(10, Math.round(watermarkSize * 0.28)),
                            transform: watermarkDiagonal ? 'rotate(-45deg)' : 'none',
                            whiteSpace: 'nowrap',
                            letterSpacing: '0.06em',
                            userSelect: 'none',
                          }}
                        >
                          {watermarkText}
                        </Typography>
                      </Box>
                    )}

                    {/* Live Page Number Preview */}
                    {enablePageNumbers && (
                      <Typography
                        className="mono"
                        sx={{
                          position: 'absolute',
                          bottom: pageNumberPosition.startsWith('bottom') ? 6 : 'auto',
                          top: pageNumberPosition.startsWith('top') ? 6 : 'auto',
                          right: pageNumberPosition.endsWith('right') ? 8 : 'auto',
                          left: pageNumberPosition === 'bottom-center' ? '50%' : 'auto',
                          transform: pageNumberPosition === 'bottom-center' ? 'translateX(-50%)' : 'none',
                          fontSize: 8,
                          color: '#4B5563',
                          bgcolor: 'rgba(255,255,255,0.85)',
                          px: 0.5,
                          borderRadius: 0.5,
                          pointerEvents: 'none',
                        }}
                      >
                        {pageNumberFormat === 'page-of'
                          ? `Page ${idx + 1} of ${pageConfigs.length}`
                          : pageNumberFormat === 'simple'
                            ? `${idx + 1}`
                            : `${batesPrefix}${String(idx + 1).padStart(4, '0')}`}
                      </Typography>
                    )}
                  </Box>

                  {/* Page Controls Bar */}
                  <Box
                    sx={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      pt: 0.5,
                      borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                    }}
                  >
                    <Tooltip title="Move Earlier">
                      <span>
                        <IconButton size="small" disabled={idx === 0} onClick={() => movePage(idx, -1)}>
                          <MoveLeftIcon sx={{ fontSize: 15 }} />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Rotate 90° CW">
                      <IconButton size="small" onClick={() => rotatePage(idx, 90)}>
                        <RotateRightIcon sx={{ fontSize: 15 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Duplicate Page">
                      <IconButton size="small" onClick={() => duplicatePage(idx)}>
                        <DuplicateIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Insert Blank Page After">
                      <IconButton size="small" onClick={() => insertBlankPageAfter(idx)}>
                        <AddBlankIcon sx={{ fontSize: 15 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete Page">
                      <span>
                        <IconButton
                          size="small"
                          disabled={pageConfigs.length <= 1}
                          onClick={() => deletePage(idx)}
                          sx={{ '&:hover': { color: '#EF4444' } }}
                        >
                          <DeleteIcon sx={{ fontSize: 15 }} />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Move Later">
                      <span>
                        <IconButton size="small" disabled={idx === pageConfigs.length - 1} onClick={() => movePage(idx, 1)}>
                          <MoveRightIcon sx={{ fontSize: 15 }} />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Box>
                </Paper>
              ))}
            </Box>
          </Document>
        </Box>
      </Box>

      {/* Right Configuration Sidebar: Watermark & Bates Numbering */}
      <Paper
        sx={{
          width: 330,
          flexShrink: 0,
          p: 2.5,
          display: 'flex',
          flexDirection: 'column',
          gap: 2.5,
          overflow: 'auto',
        }}
      >
        {/* Watermark Configuration */}
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <WatermarkIcon sx={{ fontSize: 18, color: '#6366F1' }} />
              <Typography variant="h2" sx={{ fontSize: 14 }}>
                Watermark Stamp
              </Typography>
            </Box>
            <Switch
              size="small"
              checked={enableWatermark}
              onChange={e => setEnableWatermark(e.target.checked)}
            />
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, opacity: enableWatermark ? 1 : 0.45, pointerEvents: enableWatermark ? 'auto' : 'none' }}>
            <TextField
              label="Watermark Text"
              size="small"
              fullWidth
              value={watermarkText}
              onChange={e => setWatermarkText(e.target.value)}
            />

            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {['CONFIDENTIAL', 'DRAFT', 'APPROVED', 'DO NOT COPY'].map(preset => (
                <Button
                  key={preset}
                  size="small"
                  variant="outlined"
                  onClick={() => setWatermarkText(preset)}
                  sx={{ fontSize: 10, py: 0.4, px: 1, minWidth: 0, whiteSpace: 'nowrap' }}
                >
                  {preset}
                </Button>
              ))}
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.5 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Stamp Color
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <input
                  type="color"
                  value={watermarkColor}
                  onChange={e => setWatermarkColor(e.target.value)}
                  style={{ width: 26, height: 26, border: 'none', background: 'transparent', cursor: 'pointer' }}
                />
                <Typography className="mono" sx={{ fontSize: 11, color: 'text.secondary' }}>
                  {watermarkColor.toUpperCase()}
                </Typography>
              </Box>
            </Box>

            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>Opacity</Typography>
                <Typography className="mono" sx={{ fontSize: 11 }}>{Math.round(watermarkOpacity * 100)}%</Typography>
              </Box>
              <Slider
                size="small"
                min={0.05}
                max={0.8}
                step={0.05}
                value={watermarkOpacity}
                onChange={(_, v) => setWatermarkOpacity(v as number)}
              />
            </Box>

            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>Font Size</Typography>
                <Typography className="mono" sx={{ fontSize: 11 }}>{watermarkSize} pt</Typography>
              </Box>
              <Slider
                size="small"
                min={20}
                max={84}
                step={2}
                value={watermarkSize}
                onChange={(_, v) => setWatermarkSize(v as number)}
              />
            </Box>

            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={watermarkDiagonal}
                  onChange={e => setWatermarkDiagonal(e.target.checked)}
                />
              }
              label={<Typography variant="body2" sx={{ fontSize: 12 }}>45° Diagonal Orientation</Typography>}
            />
          </Box>
        </Box>

        <Divider />

        {/* Page Numbering & Bates Stamping */}
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <PageNumIcon sx={{ fontSize: 18, color: '#6366F1' }} />
              <Typography variant="h2" sx={{ fontSize: 14 }}>
                Page & Bates Numbering
              </Typography>
            </Box>
            <Switch
              size="small"
              checked={enablePageNumbers}
              onChange={e => setEnablePageNumbers(e.target.checked)}
            />
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, opacity: enablePageNumbers ? 1 : 0.45, pointerEvents: enablePageNumbers ? 'auto' : 'none' }}>
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', mb: 0.5, display: 'block' }}>
                Numbering Style
              </Typography>
              <Select
                size="small"
                fullWidth
                value={pageNumberFormat}
                onChange={e => setPageNumberFormat(e.target.value as any)}
              >
                <MenuItem value="page-of">Page 1 of N</MenuItem>
                <MenuItem value="simple">Simple Numeric (1, 2, 3)</MenuItem>
                <MenuItem value="bates">Legal Bates Stamp (DOC-2026-0001)</MenuItem>
              </Select>
            </Box>

            {pageNumberFormat === 'bates' && (
              <TextField
                label="Bates Prefix"
                size="small"
                fullWidth
                value={batesPrefix}
                onChange={e => setBatesPrefix(e.target.value)}
              />
            )}

            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', mb: 0.5, display: 'block' }}>
                Placement
              </Typography>
              <Select
                size="small"
                fullWidth
                value={pageNumberPosition}
                onChange={e => setPageNumberPosition(e.target.value as any)}
              >
                <MenuItem value="bottom-center">Bottom Center</MenuItem>
                <MenuItem value="bottom-right">Bottom Right</MenuItem>
                <MenuItem value="top-right">Top Right Header</MenuItem>
              </Select>
            </Box>
          </Box>
        </Box>

        <Box sx={{ mt: 'auto', pt: 2 }}>
          <Button
            variant="contained"
            fullWidth
            size="large"
            startIcon={isExporting ? <CircularProgress size={18} color="inherit" /> : <ExportIcon />}
            disabled={isExporting || pageConfigs.length === 0}
            onClick={exportOrganizedPDF}
            sx={{ py: 1.4, whiteSpace: 'nowrap' }}
          >
            {isExporting ? 'Generating PDF…' : `Export ${pageConfigs.length} Pages`}
          </Button>
        </Box>
      </Paper>

      <Snackbar
        open={!!toast}
        autoHideDuration={3500}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {toast ? (
          <Alert severity={toast.severity} onClose={() => setToast(null)} sx={{ borderRadius: 2 }}>
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}

