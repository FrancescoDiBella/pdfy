import { pdfDocumentOptions } from '../utils/pdfRendering';
import { useState } from 'react';
import {
  Box,
  Button,
  Typography,
  Paper,
  CircularProgress,
  TextField,
  Snackbar,
  Alert,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  CallSplit as SplitIcon,
  FileCopyOutlined as BurstIcon,
  AutoFixHigh as SampleIcon,
} from '@mui/icons-material';
import { PDFDocument } from 'pdf-lib';
import { Document, Page, pdfjs } from 'react-pdf';
import { generateSamplePDF } from '../utils/pdfSamples';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export default function PDFSplitter() {
  const [file, setFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [rangeInput, setRangeInput] = useState('');
  const [isSplitting, setIsSplitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; severity: 'success' | 'error' | 'info' } | null>(null);

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setFile(event.target.files[0]);
      setSelectedPages(new Set());
      setNumPages(null);
      setRangeInput('');
    }
  };

  const loadSample = async () => {
    const sample = await generateSamplePDF('multi-page-report');
    setFile(sample);
    setSelectedPages(new Set([0, 1]));
    setRangeInput('1-2');
    setToast({ message: 'Loaded 4-Page Operations Dossier for page extraction.', severity: 'info' });
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

  const applyRangeString = (value: string) => {
    setRangeInput(value);
    if (!numPages) return;
    const next = new Set<number>();
    const parts = value.split(',').map(s => s.trim()).filter(Boolean);
    for (const part of parts) {
      if (part.includes('-')) {
        const [startStr, endStr] = part.split('-');
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (!isNaN(start) && !isNaN(end)) {
          for (let p = Math.min(start, end); p <= Math.max(start, end); p++) {
            if (p >= 1 && p <= numPages) next.add(p - 1);
          }
        }
      } else {
        const single = parseInt(part, 10);
        if (!isNaN(single) && single >= 1 && single <= numPages) {
          next.add(single - 1);
        }
      }
    }
    setSelectedPages(next);
  };

  const selectQuickFilter = (mode: 'all' | 'odd' | 'even' | 'invert' | 'clear') => {
    if (!numPages) return;
    const next = new Set<number>();
    for (let i = 0; i < numPages; i++) {
      if (mode === 'all') next.add(i);
      else if (mode === 'odd' && (i + 1) % 2 === 1) next.add(i);
      else if (mode === 'even' && (i + 1) % 2 === 0) next.add(i);
      else if (mode === 'invert' && !selectedPages.has(i)) next.add(i);
    }
    setSelectedPages(next);
  };

  const splitPDF = async (separateFiles = false) => {
    if (!file || selectedPages.size === 0) return;
    setIsSplitting(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await PDFDocument.load(arrayBuffer);
      const pagesToCopy = Array.from(selectedPages).sort((a, b) => a - b);

      if (separateFiles) {
        for (const pageIdx of pagesToCopy) {
          const singlePdf = await PDFDocument.create();
          const [copied] = await singlePdf.copyPages(pdf, [pageIdx]);
          singlePdf.addPage(copied);
          const bytes = await singlePdf.save();
          const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${file.name.replace(/\.pdf$/i, '')}_page_${pageIdx + 1}.pdf`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(url), 200);
        }
        setToast({ message: `Exported ${pagesToCopy.length} individual single-page PDF files.`, severity: 'success' });
      } else {
        const splitPdf = await PDFDocument.create();
        const copiedPages = await splitPdf.copyPages(pdf, pagesToCopy);
        copiedPages.forEach(page => splitPdf.addPage(page));

        const splitPdfFile = await splitPdf.save();
        const blob = new Blob([splitPdfFile as BlobPart], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `extracted_${file.name}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 200);
        setToast({ message: `Extracted ${pagesToCopy.length} pages into extracted_${file.name}.`, severity: 'success' });
      }
    } catch (error) {
      console.error('Error splitting PDF', error);
      setToast({ message: 'Failed to extract pages. Please try again.', severity: 'error' });
    } finally {
      setIsSplitting(false);
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
              bgcolor: 'rgba(6, 182, 212, 0.12)',
              border: '1px solid rgba(6, 182, 212, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#22D3EE',
            }}
          >
            <SplitIcon sx={{ fontSize: 26 }} />
          </Box>
          <Box>
            <Typography variant="h1" sx={{ fontSize: 22, mb: 0.75 }}>
              Precision PDF Splitter & Range Extractor
            </Typography>
            <Typography variant="body1" sx={{ color: 'text.secondary', maxWidth: 460 }}>
              Select pages visually, filter by odd/even sheets, or enter custom page ranges (e.g., 1-3, 5) to extract into one or multiple PDFs.
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
    <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Top Action & Range Filter Bar */}
      <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant="h2" sx={{ fontSize: 15 }}>
              {file.name}
            </Typography>
            <Typography className="mono" sx={{ fontSize: 12, color: 'text.secondary' }}>
              · {selectedPages.size} of {numPages || 0} selected
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button variant="outlined" component="label" size="small" sx={{ whiteSpace: 'nowrap' }}>
              Change File
              <input type="file" hidden accept="application/pdf" onChange={onFileChange} />
            </Button>
            <Button
              variant="outlined"
              size="small"
              startIcon={<BurstIcon />}
              disabled={selectedPages.size === 0 || isSplitting}
              onClick={() => splitPDF(true)}
              sx={{ whiteSpace: 'nowrap' }}
            >
              Save as Separate PDFs
            </Button>
            <Button
              variant="contained"
              size="small"
              startIcon={isSplitting ? <CircularProgress size={16} color="inherit" /> : <SplitIcon />}
              disabled={selectedPages.size === 0 || isSplitting}
              onClick={() => splitPDF(false)}
              sx={{ whiteSpace: 'nowrap' }}
            >
              {isSplitting ? 'Extracting…' : `Extract ${selectedPages.size} Page(s)`}
            </Button>
          </Box>
        </Box>

        {/* Range Input + Quick Selection Buttons */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <TextField
            size="small"
            placeholder="Page range (e.g. 1-2, 4)"
            value={rangeInput}
            onChange={e => applyRangeString(e.target.value)}
            sx={{ width: 220 }}
          />
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
            {[
              { label: 'Select All', mode: 'all' as const },
              { label: 'Odd Pages', mode: 'odd' as const },
              { label: 'Even Pages', mode: 'even' as const },
              { label: 'Invert', mode: 'invert' as const },
              { label: 'Clear', mode: 'clear' as const },
            ].map(btn => (
              <Button
                key={btn.mode}
                size="small"
                variant="outlined"
                onClick={() => selectQuickFilter(btn.mode)}
                sx={{ py: 0.5, px: 1.25, fontSize: 11.5, whiteSpace: 'nowrap' }}
              >
                {btn.label}
              </Button>
            ))}
          </Box>
        </Box>
      </Paper>

      {/* Thumbnail Grid */}
      <Box
        sx={{
          flexGrow: 1,
          width: '100%',
          overflow: 'auto',
          bgcolor: 'rgba(11, 15, 25, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          p: 3,
          borderRadius: 2,
        }}
      >
        <Document
          options={pdfDocumentOptions}
          file={file}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
          loading={<CircularProgress />}
          className="pdf-grid-document"
        >
          {Array.from(new Array(numPages || 0), (_, index) => {
            const isSelected = selectedPages.has(index);
            return (
              <Paper
                key={`page_${index}`}
                onClick={() => togglePage(index)}
                sx={{
                  cursor: 'pointer',
                  p: 1.25,
                  border: isSelected ? '2px solid #6366F1' : '1px solid rgba(255,255,255,0.08)',
                  bgcolor: isSelected ? 'rgba(99, 102, 241, 0.14)' : 'rgba(22, 30, 49, 0.7)',
                  position: 'relative',
                  transition: 'transform 0.15s ease, border-color 0.15s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 1,
                  '&:hover': { transform: 'translateY(-2px)', borderColor: '#818CF8' },
                }}
              >
                <Box sx={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography className="mono" sx={{ fontSize: 11, fontWeight: 600, color: isSelected ? '#F9FAFB' : '#9CA3AF' }}>
                    Page {String(index + 1).padStart(2, '0')}
                  </Typography>
                  <Typography className="mono" sx={{ fontSize: 10, color: isSelected ? '#818CF8' : 'text.disabled' }}>
                    {isSelected ? 'SELECTED' : 'CLICK'}
                  </Typography>
                </Box>
                <Box sx={{ bgcolor: '#FFFFFF', borderRadius: 0.5, overflow: 'hidden' }}>
                  <Page
                    pageNumber={index + 1}
                    width={160}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                  />
                </Box>
              </Paper>
            );
          })}
        </Document>
      </Box>

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

