import { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Divider, Paper, TextField, Typography } from '@mui/material';
import { InfoOutlined, DownloadOutlined } from '@mui/icons-material';
import ToolIntro from './ToolIntro';
import PDFSessionControls from './PDFSessionControls';
import { usePDFSession, type PDFSession } from '../hooks/usePDFSession';
import { generateSamplePDF } from '../utils/pdfSamples';
import { readPDFInfo, writePDFInfo, type MetadataFields } from '../utils/pdfInfo';

async function prepare(file: File) { return readPDFInfo(await file.arrayBuffer()); }
type Info = Awaited<ReturnType<typeof prepare>>;

export default function PDFInspector({
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
        <Typography color="text.secondary" className="tabular-nums">{(file.size / 1024).toFixed(1)} KB · {data.pages.length} pages</Typography>
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
          <Box
            component="dl"
            sx={{
              m: 0,
              display: 'grid',
              gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(160px, auto) minmax(0, 1fr)' },
              rowGap: 1.25,
              columnGap: 2.5,
              alignItems: 'baseline',
              overflowWrap: 'anywhere',
            }}
          >
            <Typography component="dt" variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>Created</Typography>
            <Typography component="dd" variant="body2" className="tabular-nums" sx={{ m: 0 }}>{data.creationDate}</Typography>
            <Typography component="dt" variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>Last modified in the source file</Typography>
            <Typography component="dd" variant="body2" className="tabular-nums" sx={{ m: 0 }}>{data.modificationDate}</Typography>
          </Box>
        </Paper>
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, minWidth: 0, alignSelf: 'start' }}>
          <Typography variant="h2" sx={{ mb: 1 }}>Page dimensions</Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>72 points equal one inch. Sizes describe the source pages before rotation.</Typography>
          <Box
            role="region"
            aria-label="Page dimensions"
            tabIndex={0}
            className="pdfy-scroll-region"
            sx={{
              maxHeight: 500,
              maxWidth: '100%',
              overflow: 'auto',
              containerType: 'inline-size',
            }}
          >
            <Box
              component="table"
              sx={{
                width: '100%',
                borderCollapse: 'separate',
                borderSpacing: 0,
                fontVariantNumeric: 'tabular-nums',
                fontSize: '0.875rem',
                '& thead th': {
                  position: 'sticky',
                  top: 0,
                  zIndex: 1,
                  bgcolor: 'background.paper',
                  color: 'text.secondary',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  textAlign: 'left',
                  py: 1,
                  px: 1,
                  borderBottom: '2px solid',
                  borderColor: 'divider',
                  whiteSpace: 'nowrap',
                },
                '& thead th:not(:first-of-type), & tbody td': {
                  textAlign: 'right',
                },
                '& tbody th': {
                  textAlign: 'left',
                  fontWeight: 650,
                  color: 'text.primary',
                  py: 1.25,
                  px: 1,
                  borderBottom: 1,
                  borderColor: 'divider',
                  whiteSpace: 'nowrap',
                },
                '& tbody td': {
                  color: 'text.primary',
                  py: 1.25,
                  px: 1,
                  borderBottom: 1,
                  borderColor: 'divider',
                  whiteSpace: 'nowrap',
                },
                '& tbody tr:last-child th, & tbody tr:last-child td': {
                  borderBottom: 0,
                },
                '& tbody tr:hover': {
                  bgcolor: 'action.hover',
                },
                '@container (width < 340px)': {
                  '&, & thead, & tbody, & tr, & th, & td': {
                    display: 'block',
                  },
                  '& thead': {
                    display: 'none',
                  },
                  '& tbody tr': {
                    py: 1.25,
                    borderBottom: 1,
                    borderColor: 'divider',
                  },
                  '& tbody tr:last-child': {
                    borderBottom: 0,
                  },
                  '& tbody th': {
                    borderBottom: 0,
                    py: 0,
                    px: 0,
                    pb: 0.75,
                    fontSize: '0.9375rem',
                  },
                  '& tbody td': {
                    borderBottom: 0,
                    py: 0.25,
                    px: 0,
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 1.5,
                    textAlign: 'right',
                  },
                  '& tbody td::before': {
                    color: 'text.secondary',
                    fontWeight: 500,
                    textAlign: 'left',
                  },
                  '& tbody td:nth-of-type(1)::before': {
                    content: '"Points"',
                  },
                  '& tbody td:nth-of-type(2)::before': {
                    content: '"Millimeters"',
                  },
                  '& tbody td:nth-of-type(3)::before': {
                    content: '"Rotation"',
                  },
                },
              }}
            >
              <thead>
                <tr>
                  <th scope="col">Page</th>
                  <th scope="col">Points</th>
                  <th scope="col">Millimeters</th>
                  <th scope="col">Rotation</th>
                </tr>
              </thead>
              <tbody>
                {data.pages.map(page => (
                  <tr key={page.number}>
                    <th scope="row">Page {page.number}</th>
                    <td>{page.width.toFixed(1)} × {page.height.toFixed(1)}</td>
                    <td>{(page.width * 25.4 / 72).toFixed(1)} × {(page.height * 25.4 / 72).toFixed(1)}</td>
                    <td>{page.rotation}°</td>
                  </tr>
                ))}
              </tbody>
            </Box>
          </Box>
        </Paper>
      </Box>
    </Box>
  );
}
