import { useState } from 'react';
import {
  Box,
  Button,
  Typography,
  Paper,
  IconButton,
  CircularProgress,
  TextField,
  Tooltip,
  Snackbar,
  Alert,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  DeleteOutlined as DeleteIcon,
  MergeType as MergeIcon,
  ArrowUpward as UpIcon,
  ArrowDownward as DownIcon,
  AutoFixHigh as SampleIcon,
} from '@mui/icons-material';
import { PDFDocument } from 'pdf-lib';
import { generateSamplePDF } from '../utils/pdfSamples';

interface QueuedPDF {
  id: string;
  file: File;
  pageCount: number;
}

export default function PDFMerger() {
  const [queue, setQueue] = useState<QueuedPDF[]>([]);
  const [outputName, setOutputName] = useState('Merged_Document');
  const [isMerging, setIsMerging] = useState(false);
  const [toast, setToast] = useState<{ message: string; severity: 'success' | 'error' | 'info' } | null>(null);

  const appendFiles = async (incoming: File[]) => {
    const newItems: QueuedPDF[] = [];
    for (const f of incoming) {
      try {
        const buf = await f.arrayBuffer();
        const doc = await PDFDocument.load(buf);
        newItems.push({
          id: crypto.randomUUID(),
          file: f,
          pageCount: doc.getPageCount(),
        });
      } catch {
        newItems.push({
          id: crypto.randomUUID(),
          file: f,
          pageCount: 1,
        });
      }
    }
    setQueue(prev => [...prev, ...newItems]);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      appendFiles(Array.from(event.target.files));
    }
  };

  const loadSamplePair = async () => {
    const f1 = await generateSamplePDF('service-invoice');
    const f2 = await generateSamplePDF('executive-brief');
    await appendFiles([f1, f2]);
    setToast({ message: 'Added Sample Invoice (1p) + Architecture Brief (3p) to merge queue.', severity: 'info' });
  };

  const moveItem = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= queue.length) return;
    setQueue(prev => {
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(target, 0, item);
      return copy;
    });
  };

  const removeFile = (id: string) => {
    setQueue(prev => prev.filter(item => item.id !== id));
  };

  const totalPages = queue.reduce((acc, item) => acc + item.pageCount, 0);

  const mergePDFs = async () => {
    if (queue.length < 2) return;
    setIsMerging(true);
    try {
      const mergedPdf = await PDFDocument.create();

      for (const item of queue) {
        const arrayBuffer = await item.file.arrayBuffer();
        const pdf = await PDFDocument.load(arrayBuffer);
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach(page => mergedPdf.addPage(page));
      }

      const mergedPdfFile = await mergedPdf.save();
      const blob = new Blob([mergedPdfFile as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      const cleanName = (outputName.trim() || 'merged').replace(/\.pdf$/i, '');
      const link = document.createElement('a');
      link.href = url;
      link.download = `${cleanName}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 150);
      setToast({ message: `Merged ${queue.length} files (${totalPages} total pages) into ${cleanName}.pdf`, severity: 'success' });
    } catch (error) {
      console.error('Error merging PDFs', error);
      setToast({ message: 'Failed to merge PDFs. Ensure none of the files are password-encrypted.', severity: 'error' });
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <Box sx={{ width: '100%', maxWidth: 720, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Paper
        sx={{
          p: 4,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: 2,
          border: '1px dashed rgba(255, 255, 255, 0.14)',
          bgcolor: 'rgba(17, 24, 39, 0.7)',
        }}
      >
        <Typography variant="h1" sx={{ fontSize: 22 }}>
          Multi-Document PDF Merger
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 460 }}>
          Combine multiple PDF files in your exact desired sequence. Reorder documents before exporting into a single unified file.
        </Typography>

        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', justifyContent: 'center', mt: 1 }}>
          <Button variant="contained" component="label" startIcon={<UploadIcon />} sx={{ whiteSpace: 'nowrap' }}>
            Add PDF Files
            <input type="file" hidden accept="application/pdf" multiple onChange={handleFileChange} />
          </Button>
          <Button variant="outlined" startIcon={<SampleIcon />} onClick={loadSamplePair} sx={{ whiteSpace: 'nowrap' }}>
            Load 2 Sample PDFs to Test
          </Button>
        </Box>
      </Paper>

      {queue.length > 0 && (
        <Paper sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5 }}>
            <Typography variant="h2" sx={{ fontSize: 15 }}>
              Merge Queue ({queue.length} files · <span className="mono">{totalPages}</span> pages total)
            </Typography>
            <Button size="small" variant="text" onClick={() => setQueue([])} sx={{ color: '#9CA3AF' }}>
              Clear Queue
            </Button>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 280, overflow: 'auto' }}>
            {queue.map((item, idx) => (
              <Box
                key={item.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  px: 2,
                  py: 1.25,
                  borderRadius: 1.5,
                  bgcolor: 'rgba(11, 15, 25, 0.55)',
                  border: '1px solid rgba(255, 255, 255, 0.07)',
                }}
              >
                <Typography className="mono" sx={{ fontSize: 12, color: '#818CF8', fontWeight: 600, minWidth: 24 }}>
                  {String(idx + 1).padStart(2, '0')}
                </Typography>

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.file.name}
                  </Typography>
                  <Typography className="mono" sx={{ fontSize: 11, color: 'text.secondary' }}>
                    {item.pageCount} {item.pageCount === 1 ? 'page' : 'pages'} · {(item.file.size / 1024).toFixed(1)} KB
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Tooltip title="Move Up">
                    <span>
                      <IconButton size="small" disabled={idx === 0} onClick={() => moveItem(idx, -1)}>
                        <UpIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Move Down">
                    <span>
                      <IconButton size="small" disabled={idx === queue.length - 1} onClick={() => moveItem(idx, 1)}>
                        <DownIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Remove File">
                    <IconButton size="small" onClick={() => removeFile(item.id)} sx={{ '&:hover': { color: '#EF4444' } }}>
                      <DeleteIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
            ))}
          </Box>

          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', pt: 1 }}>
            <TextField
              label="Output Filename"
              size="small"
              value={outputName}
              onChange={e => setOutputName(e.target.value)}
              sx={{ flex: 1 }}
            />
            <Button
              variant="contained"
              size="large"
              startIcon={isMerging ? <CircularProgress size={18} color="inherit" /> : <MergeIcon />}
              disabled={queue.length < 2 || isMerging}
              onClick={mergePDFs}
              sx={{ py: 1.1, px: 3, whiteSpace: 'nowrap' }}
            >
              {isMerging ? 'Merging…' : `Merge ${queue.length} PDFs`}
            </Button>
          </Box>
        </Paper>
      )}

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
