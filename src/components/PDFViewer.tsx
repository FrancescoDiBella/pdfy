import { useState } from 'react';
import { Box, Button, Typography, Paper, CircularProgress, IconButton } from '@mui/material';
import { CloudUpload as UploadIcon, ZoomIn, ZoomOut } from '@mui/icons-material';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export default function PDFViewer() {
  const [file, setFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [scale, setScale] = useState(1.0);

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setFile(event.target.files[0]);
    }
  };

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  if (!file) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <Typography variant="h5" color="text.secondary">Open a PDF file to begin</Typography>
        <Button
          variant="contained"
          component="label"
          startIcon={<UploadIcon />}
          size="large"
        >
          Select PDF
          <input type="file" hidden accept="application/pdf" onChange={onFileChange} />
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Paper sx={{ p: 1, mb: 2, display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'center' }}>
        <Button variant="outlined" component="label" size="small">
          Open Different File
          <input type="file" hidden accept="application/pdf" onChange={onFileChange} />
        </Button>
        <IconButton onClick={() => setScale(s => Math.max(0.5, s - 0.2))}><ZoomOut /></IconButton>
        <Typography variant="body2">{Math.round(scale * 100)}%</Typography>
        <IconButton onClick={() => setScale(s => Math.min(3, s + 0.2))}><ZoomIn /></IconButton>
      </Paper>

      <Box sx={{ 
        flexGrow: 1, 
        overflow: 'auto', 
        bgcolor: 'background.default', 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center',
        p: 2,
        gap: 2
      }}>
        <Document
          file={file}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={<CircularProgress />}
        >
          {Array.from(new Array(numPages || 0), (_, index) => (
            <Paper key={`page_${index + 1}`} elevation={3} sx={{ mb: 2, overflow: 'hidden' }}>
              <Page
                pageNumber={index + 1}
                scale={scale}
                renderTextLayer={true}
                renderAnnotationLayer={true}
              />
            </Paper>
          ))}
        </Document>
      </Box>
    </Box>
  );
}
