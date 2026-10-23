import { pdfDocumentOptions } from '../utils/pdfRendering';
import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Typography,
  Paper,
  CircularProgress,
  IconButton,
  Tooltip,
  Divider,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  ZoomIn,
  ZoomOut,
  RotateRight as RotateIcon,
  ViewSidebarOutlined as SidebarIcon,
  EditOutlined as EditIcon,
  BrandingWatermark as OrganizeIcon,
  DescriptionOutlined as DocIcon,
  ReceiptLong as InvoiceIcon,
  AssessmentOutlined as ReportIcon,
} from '@mui/icons-material';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { generateSamplePDF, type SampleTemplateId } from '../utils/pdfSamples';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface Props {
  activeFile?: File | null;
  onFileLoaded?: (file: File) => void;
  onOpenInEditor?: (file: File) => void;
  onOpenInOrganizer?: (file: File) => void;
}

export default function PDFViewer({
  activeFile,
  onFileLoaded,
  onOpenInEditor,
  onOpenInOrganizer,
}: Props) {
  const [file, setFile] = useState<File | null>(activeFile || null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [scale, setScale] = useState(1.0);
  const [rotation, setRotation] = useState(0);
  const [showThumbnails, setShowThumbnails] = useState(true);
  const [activePage, setActivePage] = useState(1);

  useEffect(() => {
    if (activeFile) {
      setFile(activeFile);
    }
  }, [activeFile]);

  const handleSetFile = (f: File) => {
    setFile(f);
    setActivePage(1);
    setRotation(0);
    onFileLoaded?.(f);
  };

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      handleSetFile(event.target.files[0]);
    }
  };

  const handleLoadSample = async (id: SampleTemplateId) => {
    const sample = await generateSamplePDF(id);
    handleSetFile(sample);
  };

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  const scrollToPage = (pageNumber: number) => {
    setActivePage(pageNumber);
    const el = document.getElementById(`viewer-page-${pageNumber}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  if (!file) {
    return (
      <Box sx={{ width: '100%', maxWidth: 780, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
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
            <DocIcon sx={{ fontSize: 26 }} />
          </Box>

          <Box>
            <Typography variant="h1" sx={{ fontSize: 24, mb: 0.75 }}>
              High-Precision PDF Reader & Inspector
            </Typography>
            <Typography variant="body1" sx={{ color: 'text.secondary', maxWidth: 480 }}>
              Open any local PDF with selectable text layers, thumbnail navigation, and instant handoff to the Advanced Vector Editor.
            </Typography>
          </Box>

          <Button
            variant="contained"
            component="label"
            startIcon={<UploadIcon />}
            size="large"
            sx={{ px: 3.5, py: 1.4, whiteSpace: 'nowrap' }}
          >
            Open Local PDF File
            <input type="file" hidden accept="application/pdf" onChange={onFileChange} />
          </Button>

          <Divider sx={{ width: '100%', my: 1 }} />

          <Box sx={{ width: '100%' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.5 }}>
              Or explore immediately with a generated sample document:
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 1.5 }}>
              <Button
                variant="outlined"
                startIcon={<DocIcon />}
                onClick={() => handleLoadSample('executive-brief')}
                sx={{ py: 1.1, whiteSpace: 'nowrap' }}
              >
                Architecture Brief
              </Button>
              <Button
                variant="outlined"
                startIcon={<InvoiceIcon />}
                onClick={() => handleLoadSample('service-invoice')}
                sx={{ py: 1.1, whiteSpace: 'nowrap' }}
              >
                Commercial Invoice
              </Button>
              <Button
                variant="outlined"
                startIcon={<ReportIcon />}
                onClick={() => handleLoadSample('multi-page-report')}
                sx={{ py: 1.1, whiteSpace: 'nowrap' }}
              >
                4-Page Dossier
              </Button>
            </Box>
          </Box>
        </Paper>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Viewer Control Bar */}
      <Paper
        sx={{
          px: 2,
          py: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
          flexWrap: 'wrap',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Tooltip title={showThumbnails ? 'Hide Page Thumbnails' : 'Show Page Thumbnails'}>
            <IconButton
              size="small"
              onClick={() => setShowThumbnails(s => !s)}
              sx={{ color: showThumbnails ? '#818CF8' : '#9CA3AF' }}
            >
              <SidebarIcon sx={{ fontSize: 19 }} />
            </IconButton>
          </Tooltip>
          <Typography variant="body2" sx={{ fontWeight: 600, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {file.name}
          </Typography>
          <Typography className="mono" sx={{ color: 'text.secondary', fontSize: 11, whiteSpace: 'nowrap' }}>
            · {numPages || 1} Pages
          </Typography>
        </Box>

        {/* Zoom & Rotate */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <IconButton size="small" onClick={() => setScale(s => Math.max(0.5, s - 0.15))}>
            <ZoomOut sx={{ fontSize: 18 }} />
          </IconButton>
          <Typography className="mono" sx={{ minWidth: 46, textAlign: 'center', fontSize: 12 }}>
            {Math.round(scale * 100)}%
          </Typography>
          <IconButton size="small" onClick={() => setScale(s => Math.min(2.5, s + 0.15))}>
            <ZoomIn sx={{ fontSize: 18 }} />
          </IconButton>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          <Tooltip title="Rotate 90° CW">
            <IconButton size="small" onClick={() => setRotation(r => (r + 90) % 360)}>
              <RotateIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Cross-Tool Workflow Actions */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Button variant="outlined" component="label" size="small" sx={{ whiteSpace: 'nowrap' }}>
            Switch File
            <input type="file" hidden accept="application/pdf" onChange={onFileChange} />
          </Button>
          {onOpenInOrganizer && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<OrganizeIcon sx={{ fontSize: 15 }} />}
              onClick={() => onOpenInOrganizer(file)}
              sx={{ whiteSpace: 'nowrap' }}
            >
              Watermark / Organize
            </Button>
          )}
          {onOpenInEditor && (
            <Button
              variant="contained"
              size="small"
              startIcon={<EditIcon sx={{ fontSize: 15 }} />}
              onClick={() => onOpenInEditor(file)}
              sx={{ whiteSpace: 'nowrap' }}
            >
              Edit in Studio
            </Button>
          )}
        </Box>
      </Paper>

      {/* Main Split Reader Viewport */}
      <Box sx={{ flex: 1, display: 'flex', gap: 2, overflow: 'hidden' }}>
        {/* Left Thumbnail Rail */}
        {showThumbnails && (
          <Paper
            sx={{
              width: 175,
              flexShrink: 0,
              overflow: 'auto',
              p: 1.5,
              display: 'flex',
              flexDirection: 'column',
              gap: 1.5,
              alignItems: 'center',
            }}
          >
            <Document options={pdfDocumentOptions} file={file} loading={<span />}>
              {Array.from(new Array(numPages || 0), (_, idx) => {
                const pageNum = idx + 1;
                const isSelected = activePage === pageNum;
                return (
                  <Box
                    key={`thumb_${pageNum}`}
                    onClick={() => scrollToPage(pageNum)}
                    sx={{
                      cursor: 'pointer',
                      mb: 1.5,
                      p: 0.75,
                      borderRadius: 1.5,
                      border: isSelected ? '2px solid #6366F1' : '1px solid rgba(255,255,255,0.08)',
                      bgcolor: isSelected ? 'rgba(99, 102, 241, 0.14)' : 'transparent',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 0.5,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <Box sx={{ bgcolor: '#FFFFFF', borderRadius: 0.5, overflow: 'hidden' }}>
                      <Page
                        pageNumber={pageNum}
                        width={120}
                        rotate={rotation}
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                      />
                    </Box>
                    <Typography className="mono" sx={{ fontSize: 10, color: isSelected ? '#F9FAFB' : '#9CA3AF' }}>
                      Page {pageNum}
                    </Typography>
                  </Box>
                );
              })}
            </Document>
          </Paper>
        )}

        {/* Primary Document Canvas */}
        <Box
          sx={{
            flex: 1,
            overflow: 'auto',
            bgcolor: 'rgba(11, 15, 25, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 2,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            p: 3,
            gap: 3,
          }}
        >
          <Document options={pdfDocumentOptions} file={file} onLoadSuccess={onDocumentLoadSuccess} loading={<CircularProgress />}>
            {Array.from(new Array(numPages || 0), (_, index) => (
              <Box
                id={`viewer-page-${index + 1}`}
                key={`page_${index + 1}`}
                onClick={() => setActivePage(index + 1)}
                sx={{
                  mb: 3,
                  boxShadow: '0 12px 36px rgba(0, 0, 0, 0.55)',
                  borderRadius: 1,
                  overflow: 'hidden',
                  bgcolor: '#FFFFFF',
                }}
              >
                <Page
                  pageNumber={index + 1}
                  scale={scale}
                  rotate={rotation}
                  renderTextLayer={true}
                  renderAnnotationLayer={true}
                />
              </Box>
            ))}
          </Document>
        </Box>
      </Box>
    </Box>
  );
}

