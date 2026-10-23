import { useEffect, useRef, useState } from 'react';
import { Box, Button, Typography, Paper, CircularProgress, IconButton, Tooltip, Divider, Alert } from '@mui/material';
import { FolderOpenOutlined, ZoomIn, ZoomOut, RotateRight, ViewSidebarOutlined, EditOutlined, DashboardCustomizeOutlined, DescriptionOutlined } from '@mui/icons-material';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { generateSamplePDF } from '../utils/pdfSamples';
import { preparePDFs } from '../utils/pdfMerge';
import { pdfDocumentOptions } from '../utils/pdfRendering';
import ToolIntro from './ToolIntro';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

interface Props {
  activeFile: File | null;
  onFileLoaded: (file: File) => void;
  onOpenInEditor: (file: File) => void;
  onOpenInOrganizer: (file: File) => void;
}

export default function PDFViewer({ activeFile: file, onFileLoaded, onOpenInEditor, onOpenInOrganizer }: Props) {
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [showThumbnails, setShowThumbnails] = useState(false);
  const [activePage, setActivePage] = useState(1);
  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState('');
  const [viewportWidth, setViewportWidth] = useState(600);
  const fileInput = useRef<HTMLInputElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (!viewport.current) return;
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width;
      if (width > 0) setViewportWidth(width);
    });
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, [file]);

  const openFile = async (getFile: () => Promise<File>) => {
    if (busy.current) return;
    busy.current = true;
    setIsOpening(true);
    setError('');
    try {
      const candidate = await getFile();
      const { accepted } = await preparePDFs([candidate]);
      if (!accepted.length) {
        setError(`Could not open “${candidate.name}”. Choose a readable PDF with at least one page and no password protection.`);
        return;
      }
      setNumPages(accepted[0].pageCount);
      setActivePage(1);
      setRotation(0);
      setScale(1);
      onFileLoaded(candidate);
    } catch {
      setError('Could not open the document. Please try another PDF.');
    } finally {
      busy.current = false;
      setIsOpening(false);
    }
  };

  const scrollToPage = (page: number) => {
    setActivePage(page);
    const target = document.getElementById(`viewer-page-${page}`);
    target?.scrollIntoView({ block: 'start', behavior: 'instant' });
    target?.focus({ preventScroll: true });
  };

  return (
    <Box aria-busy={isOpening} sx={{ width: '100%', flex: 1, minHeight: file ? 480 : undefined, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <input ref={fileInput} aria-label="PDF to read" type="file" hidden accept="application/pdf,.pdf" disabled={isOpening} onChange={event => {
        const selected = event.target.files?.[0];
        event.target.value = '';
        if (selected) void openFile(async () => selected);
      }} />
      {error && <Alert severity="error" onClose={() => setError('')} sx={{ overflowWrap: 'anywhere' }}>{error}</Alert>}
      {!file ? (
        <Box sx={{ width: '100%', maxWidth: 800, mx: 'auto', mt: { xs: 0, md: 2 } }}>
          <ToolIntro icon={<DescriptionOutlined fontSize="large" />} title="Open a PDF to get started" description="Read, edit, or organize a document. Everything is processed on your device, with no account needed.">
            <Button variant="contained" size="large" startIcon={isOpening ? <CircularProgress size={20} color="inherit" /> : <FolderOpenOutlined />} disabled={isOpening} onClick={() => fileInput.current?.click()}>
              {isOpening ? 'Opening PDF…' : 'Open PDF'}
            </Button>
            <Divider sx={{ width: '100%' }} />
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Just looking around?</Typography>
              <Button variant="outlined" disabled={isOpening} onClick={() => void openFile(() => generateSamplePDF('executive-brief'))}>Try a sample PDF</Button>
            </Box>
          </ToolIntro>
          <Box component="ol" aria-label="How it works" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2.5, p: 0, mt: 3, listStyle: 'none' }}>
            {[
              ['Open', 'Choose a file from your device.'],
              ['Make it yours', 'Pick a tool from the menu.'],
              ['Download', 'Save your work before you leave.'],
            ].map(([title, description], index) => (
              <Box component="li" key={title} sx={{ display: 'flex', gap: 1.5 }}>
                <Typography aria-hidden="true" sx={{ color: 'primary.main', fontWeight: 700 }}>{index + 1}.</Typography>
                <Box><Typography variant="body2" sx={{ fontWeight: 700 }}>{title}</Typography><Typography variant="body2" color="text.secondary">{description}</Typography></Box>
              </Box>
            ))}
          </Box>
        </Box>
      ) : (
        <>
          <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              <DescriptionOutlined color="primary" />
              <Box sx={{ flex: 1, minWidth: 150, overflowWrap: 'anywhere' }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{file.name}</Typography>
                <Typography variant="caption" color="text.secondary">{numPages} {numPages === 1 ? 'page' : 'pages'} · View changes do not modify the file</Typography>
              </Box>
              <Button variant="outlined" disabled={isOpening} startIcon={<FolderOpenOutlined />} onClick={() => fileInput.current?.click()}>Open another PDF</Button>
            </Box>
            <Divider />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              <Box role="group" aria-label="View controls" sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                <Tooltip title="Page thumbnails"><IconButton aria-label="Page thumbnails" aria-pressed={showThumbnails} onClick={() => setShowThumbnails(value => !value)} color={showThumbnails ? 'primary' : 'default'}><ViewSidebarOutlined /></IconButton></Tooltip>
                <IconButton aria-label="Zoom out" disabled={scale <= 0.5} onClick={() => setScale(value => Math.max(0.5, value - 0.25))}><ZoomOut /></IconButton>
                <Button aria-label={`${Math.round(scale * 100)}% zoom, fit page width`} onClick={() => setScale(1)} sx={{ minWidth: 60, px: 1 }}>{Math.round(scale * 100)}%</Button>
                <IconButton aria-label="Zoom in" disabled={scale >= 2.5} onClick={() => setScale(value => Math.min(2.5, value + 0.25))}><ZoomIn /></IconButton>
                <IconButton aria-label="Rotate view clockwise" onClick={() => setRotation(value => (value + 90) % 360)}><RotateRight /></IconButton>
              </Box>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Button variant="outlined" startIcon={<DashboardCustomizeOutlined />} onClick={() => onOpenInOrganizer(file)}>Organize pages</Button>
                <Button variant="contained" startIcon={<EditOutlined />} onClick={() => onOpenInEditor(file)}>Edit PDF</Button>
              </Box>
            </Box>
          </Paper>
          <Box sx={{ flex: 1, minHeight: 320, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}>
            {showThumbnails && (
              <Paper variant="outlined" sx={{ width: { xs: '100%', sm: 160 }, flexShrink: 0, overflow: 'auto', maxHeight: { xs: 200, sm: 600 }, p: 1.5 }}>
                <Document options={pdfDocumentOptions} file={file} loading="" error="" className="reader-thumbnails">
                  <Box sx={{ display: 'flex', flexDirection: { xs: 'row', sm: 'column' }, gap: 1.5 }}>
                    {Array.from({ length: numPages }, (_, index) => (
                      <Box component="button" key={index} aria-label={`Go to page ${index + 1}`} aria-current={activePage === index + 1 ? 'page' : undefined} onClick={() => scrollToPage(index + 1)} sx={{ p: 0.5, borderRadius: 1.5, border: '2px solid', borderColor: activePage === index + 1 ? 'primary.main' : 'divider', bgcolor: 'background.paper', color: 'text.primary', cursor: 'pointer', flexShrink: 0 }}>
                        <Page pageNumber={index + 1} width={110} rotate={rotation} renderTextLayer={false} renderAnnotationLayer={false} />
                        <Typography variant="caption" component="span">Page {index + 1}</Typography>
                      </Box>
                    ))}
                  </Box>
                </Document>
              </Paper>
            )}
            <Box ref={viewport} role="region" aria-label="PDF pages" tabIndex={0} sx={{ flex: 1, minWidth: 0, overflow: 'auto', maxHeight: '70dvh', minHeight: 320, p: 2, borderRadius: 2, bgcolor: 'action.hover', border: 1, borderColor: 'divider' }}>
              <Document key={file.name + file.lastModified} options={pdfDocumentOptions} file={file} onLoadSuccess={({ numPages: count }) => setNumPages(count)} onLoadError={() => setError('This PDF could not be displayed. Try opening another PDF.')} loading={<CircularProgress aria-label="Loading PDF pages" />} error="" >
                {Array.from({ length: numPages }, (_, index) => (
                  <Box id={`viewer-page-${index + 1}`} tabIndex={-1} aria-label={`Page ${index + 1}`} key={index} onClick={() => setActivePage(index + 1)} sx={{ mb: 3, mx: 'auto', width: 'max-content', boxShadow: '0 4px 20px rgba(0,0,0,0.14)', bgcolor: '#FFFFFF' }}>
                    <Page pageNumber={index + 1} width={Math.max(100, Math.min(900, viewportWidth)) * scale} rotate={rotation} renderTextLayer renderAnnotationLayer />
                  </Box>
                ))}
              </Document>
            </Box>
          </Box>
        </>
      )}
    </Box>
  );
}
