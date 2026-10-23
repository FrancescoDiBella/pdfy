import { useState } from 'react';
import { Alert, Box, Button, CircularProgress, Divider, Paper, TextField, Typography } from '@mui/material';
import { InfoOutlined, DownloadOutlined } from '@mui/icons-material';
import ToolIntro from './ToolIntro';
import PDFSessionControls from './PDFSessionControls';
import { usePDFSession, type PDFSession } from '../hooks/usePDFSession';
import { generateSamplePDF } from '../utils/pdfSamples';
import { readPDFInfo, writePDFInfo, type MetadataFields } from '../utils/pdfInfo';

async function prepare(file: File) { return readPDFInfo(await file.arrayBuffer()); }
type Info = Awaited<ReturnType<typeof prepare>>;

export default function PDFInspector({ initialFile, active = true }: { initialFile?: File | null; active?: boolean }) {
  const replacement = usePDFSession(prepare, initialFile);
  const [isExporting, setIsExporting] = useState(false);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      {!replacement.session && <ToolIntro icon={<InfoOutlined />} title="Understand your document" description="Review page sizes and the document’s title, author, and other basic properties."><Typography color="text.secondary">Edit these fields and download a copy. Your original file stays unchanged.</Typography></ToolIntro>}
      <PDFSessionControls tool="Info" active={active} hasSession={!!replacement.session} busy={replacement.isReading || isExporting} pendingName={replacement.pending?.file.name} error={replacement.error}
        onOpen={replacement.open} onSample={() => replacement.open(() => generateSamplePDF('executive-brief'))} onCancel={replacement.cancel} onConfirm={replacement.confirm} />
      {replacement.session && <Box component="fieldset" disabled={replacement.isReading || !!replacement.pending} sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}><InfoWorkspace key={replacement.session.id} session={replacement.session} onExporting={setIsExporting} /></Box>}
    </Box>
  );
}

const fieldLabels: Record<keyof MetadataFields, string> = {
  title: 'Document title', author: 'Author', subject: 'Subject', keywords: 'Keywords (comma-separated)', creator: 'Creator application', producer: 'PDF producer',
};

function InfoWorkspace({ session: { file, data }, onExporting }: { session: PDFSession<Info>; onExporting: (busy: boolean) => void }) {
  const [fields, setFields] = useState(data.fields);
  const [isExporting, setIsExporting] = useState(false);
  const [feedback, setFeedback] = useState<{ severity: 'success' | 'error'; message: string } | null>(null);

  const download = async (clear: boolean) => {
    if (isExporting) return;
    setIsExporting(true);
    onExporting(true);
    setFeedback(null);
    try {
      const bytes = await writePDFInfo(await file.arrayBuffer(), fields, clear);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${clear ? 'metadata-cleared' : 'metadata'}_${file.name}`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setFeedback({ severity: 'success', message: clear ? 'Download started with the six displayed fields cleared. Your working values have been kept.' : 'Download started with your updated document properties.' });
    } catch {
      setFeedback({ severity: 'error', message: 'Could not download the PDF. Your file and edits have been kept. Try again.' });
    } finally {
      setIsExporting(false);
      onExporting(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, minWidth: 0 }}>
        <Typography variant="h2" sx={{ overflowWrap: 'anywhere' }}>{file.name}</Typography>
        <Typography color="text.secondary">{(file.size / 1024).toFixed(1)} KB · {data.pages.length} pages</Typography>
      </Paper>
      {feedback && <Alert severity={feedback.severity}>{feedback.message}</Alert>}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 3fr) minmax(0, 2fr)' }, gap: 2, minWidth: 0 }}>
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <Typography variant="h2">Document properties</Typography>
          <Typography color="text.secondary">These six fields come from the PDF Info dictionary. Clearing them does not remove XMP metadata, dates, annotations, or identifying content inside the document.</Typography>
          {(Object.keys(fieldLabels) as (keyof MetadataFields)[]).map(key => (
            <TextField key={key} label={fieldLabels[key]} value={fields[key]} fullWidth disabled={isExporting} onChange={event => { setFields(previous => ({ ...previous, [key]: event.target.value })); setFeedback(null); }} />
          ))}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <Button variant="contained" startIcon={isExporting ? <CircularProgress size={18} color="inherit" /> : <DownloadOutlined />} disabled={isExporting} onClick={() => download(false)}>Download updated PDF</Button>
            <Button variant="outlined" disabled={isExporting} onClick={() => download(true)}>Download without these fields</Button>
          </Box>
          <Divider />
          <Box component="dl" sx={{ m: 0, overflowWrap: 'anywhere' }}>
            <Typography component="dt" color="text.secondary">Created</Typography><Typography component="dd" sx={{ m: 0, mb: 1 }}>{data.creationDate}</Typography>
            <Typography component="dt" color="text.secondary">Last modified in the source file</Typography><Typography component="dd" sx={{ m: 0 }}>{data.modificationDate}</Typography>
          </Box>
        </Paper>
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, minWidth: 0, alignSelf: 'start' }}>
          <Typography variant="h2" sx={{ mb: 1 }}>Page dimensions</Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>72 points equal one inch. Sizes describe the source pages before rotation.</Typography>
          <Box role="region" aria-label="Page dimensions" tabIndex={0} sx={{ maxHeight: 500, overflow: 'auto', pr: 1 }}>
            {data.pages.map(page => (
              <Box key={page.number} sx={{ py: 1.5, borderBottom: 1, borderColor: 'divider', '&:last-child': { borderBottom: 0 } }}>
                <Typography component="h3" sx={{ fontWeight: 600 }}>Page {page.number}</Typography>
                <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)', gap: 0.5, overflowWrap: 'anywhere' }}>
                  <Typography component="dt" color="text.secondary">Points</Typography><Typography component="dd" sx={{ m: 0 }}>{page.width.toFixed(1)} × {page.height.toFixed(1)}</Typography>
                  <Typography component="dt" color="text.secondary">Millimeters</Typography><Typography component="dd" sx={{ m: 0 }}>{(page.width * 25.4 / 72).toFixed(1)} × {(page.height * 25.4 / 72).toFixed(1)}</Typography>
                  <Typography component="dt" color="text.secondary">Rotation</Typography><Typography component="dd" sx={{ m: 0 }}>{page.rotation}°</Typography>
                </Box>
              </Box>
            ))}
          </Box>
        </Paper>
      </Box>
    </Box>
  );
}
