import { useState } from 'react';
import { Box, Button, Typography, Paper, CircularProgress, Chip } from '@mui/material';
import { CloudUpload as UploadIcon, CallSplit as SplitIcon } from '@mui/icons-material';
import { PDFDocument } from 'pdf-lib';
import { Document, Page, pdfjs } from 'react-pdf';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export default function PDFSplitter() {
  const [file, setFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [isSplitting, setIsSplitting] = useState(false);

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setFile(event.target.files[0]);
      setSelectedPages(new Set());
      setNumPages(null);
    }
  };

  const togglePage = (pageIndex: number) => {
    setSelectedPages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(pageIndex)) {
        newSet.delete(pageIndex);
      } else {
        newSet.add(pageIndex);
      }
      return newSet;
    });
  };

  const splitPDF = async () => {
    if (!file || selectedPages.size === 0) return;
    setIsSplitting(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await PDFDocument.load(arrayBuffer);
      const splitPdf = await PDFDocument.create();

      const pagesToCopy = Array.from(selectedPages).sort((a, b) => a - b);
      const copiedPages = await splitPdf.copyPages(pdf, pagesToCopy);
      
      copiedPages.forEach((page) => splitPdf.addPage(page));

      const splitPdfFile = await splitPdf.save();
      const blob = new Blob([splitPdfFile as any], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `split_${file.name}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error splitting PDF", error);
      alert("Failed to split PDF. Please try again.");
    } finally {
      setIsSplitting(false);
    }
  };

  if (!file) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <Typography variant="h5" gutterBottom>Split PDF</Typography>
        <Typography variant="body2" color="text.secondary">Extract specific pages from a PDF</Typography>
        <Button
          variant="contained"
          component="label"
          startIcon={<UploadIcon />}
          size="large"
          sx={{ mt: 2 }}
        >
          Select PDF
          <input type="file" hidden accept="application/pdf" onChange={onFileChange} />
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <Box sx={{ mb: 3, textAlign: 'center' }}>
        <Typography variant="h5" gutterBottom>Select Pages to Extract</Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Click on the pages you want to keep. 
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', mt: 2 }}>
          <Button variant="outlined" component="label" size="small">
            Change File
            <input type="file" hidden accept="application/pdf" onChange={onFileChange} />
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={isSplitting ? <CircularProgress size={20} color="inherit" /> : <SplitIcon />}
            disabled={selectedPages.size === 0 || isSplitting}
            onClick={splitPDF}
          >
            {isSplitting ? 'Extracting...' : `Extract ${selectedPages.size} Page(s)`}
          </Button>
        </Box>
      </Box>

      <Box sx={{ 
        flexGrow: 1, 
        width: '100%',
        overflow: 'auto', 
        bgcolor: 'background.paper', 
        p: 2,
        borderRadius: 1,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 2,
        justifyContent: 'center',
        alignContent: 'flex-start'
      }}>
        <Document
          file={file}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
          loading={<CircularProgress />}
          className="pdf-grid-document"
        >
          {Array.from(new Array(numPages || 0), (_, index) => (
            <Paper 
              key={`page_${index}`} 
              elevation={selectedPages.has(index) ? 8 : 2}
              onClick={() => togglePage(index)}
              sx={{ 
                cursor: 'pointer',
                p: 1,
                border: selectedPages.has(index) ? '3px solid' : '3px solid transparent',
                borderColor: selectedPages.has(index) ? 'primary.main' : 'transparent',
                position: 'relative',
                transition: 'all 0.2s',
                '&:hover': { transform: 'scale(1.02)' }
              }}
            >
              <Chip 
                label={index + 1} 
                color={selectedPages.has(index) ? "primary" : "default"}
                size="small"
                sx={{ position: 'absolute', top: 12, left: 12, zIndex: 10 }}
              />
              <Page
                pageNumber={index + 1}
                width={150}
                renderTextLayer={false}
                renderAnnotationLayer={false}
              />
            </Paper>
          ))}
        </Document>
      </Box>
    </Box>
  );
}
