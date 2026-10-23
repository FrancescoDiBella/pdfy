import { useRef, useState } from 'react';
import type { DragEvent } from 'react';
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
  DragIndicator as DragIcon,
} from '@mui/icons-material';
import { generateSamplePDF } from '../utils/pdfSamples';
import { mergePDFs as mergeQueue, preparePDFs, reorderPDFs } from '../utils/pdfMerge';
import type { QueuedPDF } from '../utils/pdfMerge';

const QUEUE_DRAG_TYPE = 'application/x-pdfy-queue-item';

export default function PDFMerger() {
  const [queue, setQueue] = useState<QueuedPDF[]>([]);
  const [outputName, setOutputName] = useState('Merged_Document');
  const [isMerging, setIsMerging] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const busyRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isBusy = isMerging || isAdding;
  const [toast, setToast] = useState<{ message: string; severity: 'success' | 'error' | 'info' } | null>(null);

  const appendFiles = async (incoming: File[]) => {
    const { accepted, rejected } = await preparePDFs(incoming);
    setQueue(prev => [...prev, ...accepted]);
    if (rejected.length) {
      setToast({ message: `Could not add ${rejected.join(', ')}. Use readable, unencrypted PDFs.`, severity: 'error' });
    } else if (accepted.length) {
      setToast({ message: `Added ${accepted.length} PDF files to the merge queue.`, severity: 'info' });
    }
  };

  const addFiles = async (getFiles: () => Promise<File[]>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setIsAdding(true);
    try {
      await appendFiles(await getFiles());
    } catch {
      setToast({ message: 'Could not read the selected files. Please try again.', severity: 'error' });
    } finally {
      busyRef.current = false;
      setIsAdding(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    void addFiles(async () => files);
  };

  const loadSamplePair = () => addFiles(() => Promise.all([
    generateSamplePDF('service-invoice'),
    generateSamplePDF('executive-brief'),
  ]));

  const moveItem = (sourceId: string, targetId: string) => {
    if (busyRef.current) return;
    const reordered = reorderPDFs(queue, sourceId, targetId);
    if (reordered === queue) return;
    setQueue(reordered);
    const position = reordered.findIndex(item => item.id === sourceId);
    setAnnouncement(`${reordered[position].file.name} moved to position ${position + 1} of ${queue.length}.`);
  };

  const resetDrag = () => {
    setDraggedId(null);
    setDropTargetId(null);
  };

  const handleDrop = (event: DragEvent, targetId: string) => {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData(QUEUE_DRAG_TYPE);
    if (sourceId === draggedId) moveItem(sourceId, targetId);
    resetDrag();
  };

  const removeFile = (id: string) => {
    if (busyRef.current) return;
    setQueue(prev => prev.filter(item => item.id !== id));
  };

  const totalPages = queue.reduce((acc, item) => acc + item.pageCount, 0);

  const mergePDFs = async () => {
    if (queue.length < 2 || busyRef.current) return;
    busyRef.current = true;
    resetDrag();
    setIsMerging(true);
    try {
      const mergedPdfFile = await mergeQueue(queue);
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
      busyRef.current = false;
      setIsMerging(false);
    }
  };

  return (
    <Box aria-busy={isBusy} sx={{ width: '100%', maxWidth: 720, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 3, overflow: 'auto' }}>
      <Box role="status" aria-live="polite" aria-atomic="true" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }}>
        {announcement}
      </Box>
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
          <Button variant="contained" disabled={isBusy} onClick={() => fileInputRef.current?.click()} startIcon={<UploadIcon />} sx={{ whiteSpace: 'nowrap' }}>
            {isAdding ? 'Reading PDFs…' : 'Add PDF Files'}
          </Button>
          <input ref={fileInputRef} aria-label="PDF files to merge" type="file" hidden accept="application/pdf,.pdf" multiple disabled={isBusy} onChange={handleFileChange} />
          <Button variant="outlined" disabled={isBusy} startIcon={<SampleIcon />} onClick={loadSamplePair} sx={{ whiteSpace: 'nowrap' }}>
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
            <Button size="small" variant="text" disabled={isBusy} onClick={() => { setQueue([]); resetDrag(); }} sx={{ color: '#9CA3AF' }}>
              Clear Queue
            </Button>
          </Box>

          <Typography id="merge-order-help" variant="body2" color="text.secondary">
            Drag a handle onto another document to change its position, or use the Move up and Move down buttons.
          </Typography>
          <Box component="ol" aria-label="Merge order" aria-describedby="merge-order-help" sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 280, overflow: 'auto', listStyle: 'none', m: 0, p: 0 }}>
            {queue.map((item, idx) => (
              <Box
                key={item.id}
                component="li"
                onDragOver={event => {
                  if (isBusy || !draggedId || !event.dataTransfer.types.includes(QUEUE_DRAG_TYPE)) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  setDropTargetId(item.id);
                }}
                onDragLeave={event => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTargetId(null);
                }}
                onDrop={event => handleDrop(event, item.id)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 1,
                  py: 1.25,
                  borderRadius: 1.5,
                  bgcolor: 'rgba(11, 15, 25, 0.55)',
                  border: '2px solid',
                  borderColor: dropTargetId === item.id && draggedId !== item.id ? 'primary.light' : 'transparent',
                  opacity: draggedId === item.id ? 0.55 : 1,
                }}
              >
                <Box
                  component="span"
                  draggable={!isBusy && queue.length > 1}
                  aria-hidden="true"
                  title={`Drag ${item.file.name} to reorder`}
                  onDragStart={event => {
                    if (busyRef.current) { event.preventDefault(); return; }
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData(QUEUE_DRAG_TYPE, item.id);
                    setDraggedId(item.id);
                  }}
                  onDragEnd={resetDrag}
                  sx={{ display: 'flex', cursor: isBusy ? 'default' : 'grab', p: 0.5, touchAction: 'auto' }}
                >
                  <DragIcon fontSize="small" />
                </Box>
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
                      <IconButton aria-label={`Move ${item.file.name} up`} size="small" disabled={isBusy || idx === 0} onClick={() => moveItem(item.id, queue[idx - 1].id)}>
                        <UpIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Move Down">
                    <span>
                      <IconButton aria-label={`Move ${item.file.name} down`} size="small" disabled={isBusy || idx === queue.length - 1} onClick={() => moveItem(item.id, queue[idx + 1].id)}>
                        <DownIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Remove File">
                    <IconButton aria-label={`Remove ${item.file.name}`} disabled={isBusy} size="small" onClick={() => removeFile(item.id)} sx={{ '&:hover': { color: '#EF4444' } }}>
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
              disabled={isBusy}
              onChange={e => setOutputName(e.target.value)}
              sx={{ flex: 1 }}
            />
            <Button
              variant="contained"
              size="large"
              startIcon={isMerging ? <CircularProgress size={18} color="inherit" /> : <MergeIcon />}
              disabled={queue.length < 2 || isBusy}
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

