import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Typography,
  Paper,
  TextField,
  CircularProgress,
  Divider,
  Snackbar,
  Alert,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  VerifiedUserOutlined as SecurityIcon,
  SaveAlt as SaveIcon,
  CleaningServicesOutlined as SanitizeIcon,
  AutoFixHigh as SampleIcon,
} from '@mui/icons-material';
import { PDFDocument } from 'pdf-lib';
import { generateSamplePDF } from '../utils/pdfSamples';

interface PageGeometry {
  pageNumber: number;
  widthPt: number;
  heightPt: number;
  rotation: number;
}

interface Props {
  initialFile?: File | null;
}

export default function PDFInspector({ initialFile }: Props) {
  const [file, setFile] = useState<File | null>(initialFile || null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Metadata fields
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [subject, setSubject] = useState('');
  const [keywords, setKeywords] = useState('');
  const [creator, setCreator] = useState('');
  const [producer, setProducer] = useState('');
  const [creationDate, setCreationDate] = useState('');
  const [modDate, setModDate] = useState('');
  const [pageGeometries, setPageGeometries] = useState<PageGeometry[]>([]);

  const [toast, setToast] = useState<{ message: string; severity: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    if (initialFile) {
      inspectFile(initialFile);
    }
  }, [initialFile]);

  const inspectFile = async (targetFile: File) => {
    setFile(targetFile);
    setIsLoading(true);
    try {
      const arrayBuffer = await targetFile.arrayBuffer();
      const doc = await PDFDocument.load(arrayBuffer, { updateMetadata: false });

      setTitle(doc.getTitle() || '');
      setAuthor(doc.getAuthor() || '');
      setSubject(doc.getSubject() || '');
      setKeywords(doc.getKeywords() || '');
      setCreator(doc.getCreator() || '');
      setProducer(doc.getProducer() || '');

      const cDate = doc.getCreationDate();
      const mDate = doc.getModificationDate();
      setCreationDate(cDate ? cDate.toISOString().slice(0, 19).replace('T', ' ') + ' UTC' : 'Not recorded');
      setModDate(mDate ? mDate.toISOString().slice(0, 19).replace('T', ' ') + ' UTC' : 'Not recorded');

      const pages = doc.getPages();
      setPageGeometries(
        pages.map((p, idx) => {
          const { width, height } = p.getSize();
          return {
            pageNumber: idx + 1,
            widthPt: Math.round(width * 10) / 10,
            heightPt: Math.round(height * 10) / 10,
            rotation: p.getRotation().angle,
          };
        })
      );
    } catch (err) {
      console.error('Failed to inspect PDF:', err);
      setToast({ message: 'Could not read PDF metadata.', severity: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      inspectFile(e.target.files[0]);
    }
  };

  const loadSample = async () => {
    const sample = await generateSamplePDF('executive-brief');
    await inspectFile(sample);
    setToast({ message: 'Loaded Executive Architecture Brief for metadata inspection.', severity: 'info' });
  };

  const saveMetadata = async (sanitizeAll = false) => {
    if (!file) return;
    setIsSaving(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const doc = await PDFDocument.load(arrayBuffer);

      if (sanitizeAll) {
        doc.setTitle('');
        doc.setAuthor('');
        doc.setSubject('');
        doc.setKeywords([]);
        doc.setCreator('');
        doc.setProducer('');
        setTitle('');
        setAuthor('');
        setSubject('');
        setKeywords('');
        setCreator('');
        setProducer('');
      } else {
        doc.setTitle(title);
        doc.setAuthor(author);
        doc.setSubject(subject);
        doc.setKeywords(
          keywords
            .split(',')
            .map(k => k.trim())
            .filter(Boolean)
        );
        doc.setCreator(creator);
        doc.setProducer(producer);
        doc.setModificationDate(new Date());
      }

      const savedBytes = await doc.save();
      const blob = new Blob([savedBytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = sanitizeAll ? `sanitized_${file.name}` : `metadata_${file.name}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 200);

      setToast({
        message: sanitizeAll
          ? 'All hidden metadata stripped and clean PDF exported.'
          : 'Updated document properties saved to PDF.',
        severity: 'success',
      });
    } catch (err) {
      console.error('Failed to save metadata:', err);
      setToast({ message: 'Failed to export updated PDF.', severity: 'error' });
    } finally {
      setIsSaving(false);
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
              bgcolor: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#10B981',
            }}
          >
            <SecurityIcon sx={{ fontSize: 26 }} />
          </Box>
          <Box>
            <Typography variant="h1" sx={{ fontSize: 22, mb: 0.75 }}>
              Metadata & Privacy Inspector
            </Typography>
            <Typography variant="body1" sx={{ color: 'text.secondary', maxWidth: 460 }}>
              Audit hidden PDF properties, author tags, producer strings, and exact page geometries—or strip all identifying metadata in one click.
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', justifyContent: 'center', mt: 1 }}>
            <Button variant="contained" component="label" startIcon={<UploadIcon />} sx={{ whiteSpace: 'nowrap' }}>
              Inspect PDF File
              <input type="file" hidden accept="application/pdf" onChange={onFileChange} />
            </Button>
            <Button variant="outlined" startIcon={<SampleIcon />} onClick={loadSample} sx={{ whiteSpace: 'nowrap' }}>
              Load Sample PDF
            </Button>
          </Box>
        </Paper>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', height: '100%', overflow: 'auto', pr: 1 }}>
      <Box sx={{ maxWidth: 1080, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* Header Bar */}
        <Paper sx={{ p: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Typography variant="h2" sx={{ fontSize: 16 }}>
              {file.name}
            </Typography>
            <Typography variant="caption" className="mono" sx={{ color: 'text.secondary' }}>
              {(file.size / 1024).toFixed(1)} KB · {pageGeometries.length} Pages · Created: {creationDate}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Button variant="outlined" size="small" component="label" sx={{ whiteSpace: 'nowrap' }}>
              Inspect Another File
              <input type="file" hidden accept="application/pdf" onChange={onFileChange} />
            </Button>
            <Button
              variant="outlined"
              size="small"
              color="error"
              startIcon={<SanitizeIcon />}
              disabled={isSaving}
              onClick={() => saveMetadata(true)}
              sx={{ whiteSpace: 'nowrap', borderColor: 'rgba(239,68,68,0.35)', color: '#F87171' }}
            >
              Strip All Metadata & Export
            </Button>
            <Button
              variant="contained"
              size="small"
              startIcon={isSaving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
              disabled={isSaving}
              onClick={() => saveMetadata(false)}
              sx={{ whiteSpace: 'nowrap' }}
            >
              Save Metadata & Export
            </Button>
          </Box>
        </Paper>

        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '7fr 5fr' }, gap: 3 }}>
            {/* Left Column: Editable Document Properties */}
            <Paper sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <Box>
                <Typography variant="h2" sx={{ fontSize: 15, mb: 0.5 }}>
                  Embedded XMP / Info Dictionary Fields
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Edit fields below to rewrite the PDF Info dictionary or clear them for privacy compliance.
                </Typography>
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                <TextField
                  label="Document Title"
                  size="small"
                  fullWidth
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Untitled"
                />
                <TextField
                  label="Author / Organization"
                  size="small"
                  fullWidth
                  value={author}
                  onChange={e => setAuthor(e.target.value)}
                  placeholder="None"
                />
              </Box>

              <TextField
                label="Subject / Description"
                size="small"
                fullWidth
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Document summary or classification"
              />

              <TextField
                label="Keywords (comma-separated)"
                size="small"
                fullWidth
                value={keywords}
                onChange={e => setKeywords(e.target.value)}
                placeholder="Contract, Legal, Q4"
              />

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                <TextField
                  label="Creator Application"
                  size="small"
                  fullWidth
                  value={creator}
                  onChange={e => setCreator(e.target.value)}
                />
                <TextField
                  label="PDF Producer Engine"
                  size="small"
                  fullWidth
                  value={producer}
                  onChange={e => setProducer(e.target.value)}
                />
              </Box>

              <Divider />

              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                    Creation Timestamp
                  </Typography>
                  <Typography className="mono" sx={{ fontSize: 12, mt: 0.5 }}>
                    {creationDate}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                    Last Modified Timestamp
                  </Typography>
                  <Typography className="mono" sx={{ fontSize: 12, mt: 0.5 }}>
                    {modDate}
                  </Typography>
                </Box>
              </Box>
            </Paper>

            {/* Right Column: Page Geometry & Physical Dimensions Table */}
            <Paper sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box>
                <Typography variant="h2" sx={{ fontSize: 15, mb: 0.5 }}>
                  Page Geometry & Print Telemetry
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Exact PostScript points (72 pt = 1 inch) and ISO millimeter dimensions per sheet.
                </Typography>
              </Box>

              <Box
                sx={{
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 1.5,
                  overflow: 'hidden',
                }}
              >
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: '0.8fr 1.4fr 1.4fr 0.8fr',
                    px: 2,
                    py: 1,
                    bgcolor: 'rgba(255, 255, 255, 0.04)',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                  }}
                >
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>PAGE</Typography>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>POINTS (PT)</Typography>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>MILLIMETERS</Typography>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', textAlign: 'right' }}>ROTATION</Typography>
                </Box>

                <Box sx={{ maxHeight: 280, overflow: 'auto' }}>
                  {pageGeometries.map(pg => {
                    const wMm = Math.round(pg.widthPt * 0.352778);
                    const hMm = Math.round(pg.heightPt * 0.352778);
                    return (
                      <Box
                        key={pg.pageNumber}
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: '0.8fr 1.4fr 1.4fr 0.8fr',
                          px: 2,
                          py: 1.1,
                          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                          '&:last-child': { borderBottom: 'none' },
                        }}
                      >
                        <Typography className="mono" sx={{ fontSize: 12, color: '#F9FAFB' }}>
                          #{String(pg.pageNumber).padStart(2, '0')}
                        </Typography>
                        <Typography className="mono" sx={{ fontSize: 12, color: '#9CA3AF' }}>
                          {pg.widthPt} × {pg.heightPt}
                        </Typography>
                        <Typography className="mono" sx={{ fontSize: 12, color: '#9CA3AF' }}>
                          {wMm} × {hMm} mm
                        </Typography>
                        <Typography className="mono" sx={{ fontSize: 12, color: '#9CA3AF', textAlign: 'right' }}>
                          {pg.rotation}°
                        </Typography>
                      </Box>
                    );
                  })}
                </Box>
              </Box>
            </Paper>
          </Box>
        )}
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
