import { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Paper, TextField, Typography } from '@mui/material';
import { CallSplit, DownloadOutlined } from '@mui/icons-material';
import { PDFDocument } from 'pdf-lib';
import { Document, Page, pdfjs } from 'react-pdf';
import ToolIntro from './ToolIntro';
import PDFSessionControls from './PDFSessionControls';
import { usePDFSession, type PDFSession } from '../hooks/usePDFSession';
import { generateSamplePDF } from '../utils/pdfSamples';
import { pdfDocumentOptions } from '../utils/pdfRendering';
import { parsePageRange } from '../utils/pageRanges';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

async function prepare(file: File) {
  const pdf = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });
  if (!pdf.getPageCount()) throw new Error('Empty PDF');
  return { pageCount: pdf.getPageCount() };
}

export default function PDFSplitter({
  initialFile,
  active = true,
  onSessionChange,
}: {
  initialFile?: File | null;
  active?: boolean;
  onSessionChange?: (active: boolean) => void;
}) {
  const replacement = usePDFSession(prepare, initialFile);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    onSessionChange?.(!!replacement.session);
  }, [replacement.session, onSessionChange]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      {!replacement.session && <ToolIntro icon={<CallSplit />} title="Keep the pages you need" description="Open a PDF, choose pages, and download them together or as separate files."><Typography color="text.secondary">Your original file stays unchanged.</Typography></ToolIntro>}
      <PDFSessionControls tool="Split" active={active} hasSession={!!replacement.session} busy={replacement.isReading || isExporting} pendingName={replacement.pending?.file.name} error={replacement.error}
        onOpen={replacement.open} onSample={() => replacement.open(() => generateSamplePDF('multi-page-report'))} onCancel={replacement.cancel} onConfirm={replacement.confirm} />
      {replacement.session && <Box component="fieldset" disabled={replacement.isReading || !!replacement.pending} sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}><SplitWorkspace key={replacement.session.id} session={replacement.session} onExporting={setIsExporting} /></Box>}
    </Box>
  );
}

function SplitWorkspace({ session: { file, data }, onExporting }: { session: PDFSession<{ pageCount: number }>; onExporting: (busy: boolean) => void }) {
  const [selected, setSelected] = useState<number[]>([]);
  const [range, setRange] = useState('');
  const [rangeError, setRangeError] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [feedback, setFeedback] = useState<{ severity: 'success' | 'error'; message: string } | null>(null);
  const { pageCount } = data;

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

  const download = async (separate: boolean) => {
    if (isExporting || rangeError || !selected.length) return;
    setIsExporting(true);
    onExporting(true);
    setFeedback(null);
    try {
      const pdf = await PDFDocument.load(await file.arrayBuffer());
      const groups = separate ? selected.map(index => [index]) : [selected];
      for (const indices of groups) {
        const output = await PDFDocument.create();
        const pages = await output.copyPages(pdf, indices);
        pages.forEach(page => output.addPage(page));
        const bytes = await output.save();
        const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = separate ? `${file.name.replace(/\.pdf$/i, '')}_page_${indices[0] + 1}.pdf` : `extracted_${file.name}`;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setFeedback({ severity: 'success', message: separate ? `Started ${selected.length} downloads. Your browser may ask to allow multiple files.` : `Download started with ${selected.length} selected pages.` });
    } catch {
      setFeedback({ severity: 'error', message: 'Could not download the selected pages. Your file and selection have been kept. Try again.' });
    } finally {
      setIsExporting(false);
      onExporting(false);
    }
  };

  return (
    <>
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <Box>
          <Typography variant="h2" sx={{ overflowWrap: 'anywhere' }}>{file.name}</Typography>
          <Typography role="status" color="text.secondary" className="tabular-nums">{selected.length} of {pageCount} pages selected</Typography>
        </Box>
        <TextField label="Page range" placeholder="1-3, 5" value={range} onChange={event => changeRange(event.target.value)} error={!!rangeError} helperText={rangeError || 'Use page numbers or ranges, such as 1-3, 5.'} fullWidth disabled={isExporting} />
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {(['All', 'Odd', 'Even', 'Invert', 'Clear'] as const).map(mode => (
            <Button key={mode} variant="outlined" disabled={isExporting} onClick={() => select(Array.from({ length: pageCount }, (_, index) => index).filter(index => mode === 'All' || (mode === 'Odd' && index % 2 === 0) || (mode === 'Even' && index % 2 === 1) || (mode === 'Invert' && !selected.includes(index))))}>{mode === 'Clear' ? 'Clear selection' : `${mode} pages`}</Button>
          ))}
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          <Button variant="contained" startIcon={isExporting ? <CircularProgress size={18} color="inherit" /> : <DownloadOutlined />} disabled={isExporting || !selected.length || !!rangeError} onClick={() => download(false)}>Download selected pages</Button>
          <Button variant="outlined" disabled={isExporting || !selected.length || !!rangeError} onClick={() => download(true)}>Download separate PDFs</Button>
        </Box>
      </Paper>
      {feedback && <Alert severity={feedback.severity}>{feedback.message}</Alert>}
      <Box className="pdfy-workbench-mat pdfy-scroll-region" sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: 2, '& .split-pages': { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: 2 } }}>
        <Document file={file} options={pdfDocumentOptions} className="split-pages" loading={<CircularProgress aria-label="Loading page previews" />} error={<Alert severity="warning">Previews could not be displayed. You can still select pages by number and download them.</Alert>}>
          {Array.from({ length: pageCount }, (_, index) => {
            const isSelected = selected.includes(index);
            return (
              <Box
                key={index}
                component="button"
                type="button"
                aria-label={`Page ${index + 1}`}
                aria-pressed={isSelected}
                disabled={isExporting}
                onClick={() => select(isSelected ? selected.filter(page => page !== index) : [...selected, index])}
                className="pdfy-page-tile pdfy-card-interactive"
                sx={{
                  minWidth: 0,
                  p: 1.5,
                  border: 2,
                  borderColor: isSelected ? 'primary.main' : 'divider',
                  borderRadius: 2,
                  bgcolor: 'background.paper',
                  boxShadow: isSelected ? theme => `0 0 0 1px ${theme.palette.primary.main}` : 'none',
                  color: 'text.primary',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <Typography component="span" className="tabular-nums" sx={{ fontWeight: 600, fontSize: '0.875rem', color: isSelected ? 'primary.main' : 'text.primary' }}>
                  Page {index + 1} · {isSelected ? 'Selected' : 'Not selected'}
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
