import { useEffect, useRef, useState } from 'react';
import type { DragEvent, PointerEvent } from 'react';
import {
  Box,
  Button,
  Typography,
  Paper,
  IconButton,
  CircularProgress,
  MenuItem,
  TextField,
  Tooltip,
  Snackbar,
  Alert,
} from '@mui/material';
import {
  FolderOpenOutlined as UploadIcon,
  DeleteOutlined as DeleteIcon,
  MergeType as MergeIcon,
  ArrowUpward as UpIcon,
  ArrowDownward as DownIcon,
  ArticleOutlined as SampleIcon,
  DragIndicator as DragIcon,
  DashboardCustomizeOutlined as OrganizeIcon,
} from '@mui/icons-material';
import ToolIntro from './ToolIntro';
import { generateSamplePDF } from '../utils/pdfSamples';
import {
  detectMixedQueuePageSizes,
  formatPageSizeLabel,
  mergePDFs as mergeQueue,
  preparePDFs,
  reorderPDFs,
} from '../utils/pdfMerge';
import type { MergePageSizeMode, QueuedPDF } from '../utils/pdfMerge';

const QUEUE_DRAG_TYPE = 'application/x-pdfy-queue-item';

export default function PDFMerger({
  onOpenInOrganizer,
  onRegisterDropHandler,
}: {
  onOpenInOrganizer?: (file: File) => void;
  onRegisterDropHandler?: (handler: ((files: File[]) => void) | null) => void;
}) {
  const [queue, setQueue] = useState<QueuedPDF[]>([]);
  const [outputName, setOutputName] = useState('Merged_Document');
  const [pageSizeMode, setPageSizeMode] = useState<MergePageSizeMode>('original');
  const [isMerging, setIsMerging] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const announcementTimer = useRef<number | undefined>(undefined);
  const busyRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const organizeButtonRef = useRef<HTMLButtonElement>(null);
  const pendingOrganizeFileRef = useRef<File | null>(null);
  const touchDragRef = useRef<{ pointerId: number; sourceId: string; targetId: string | null } | null>(null);
  const addFilesRef = useRef<(getFiles: () => Promise<File[]>) => Promise<void>>(async () => {});
  const isBusy = isMerging || isAdding;
  const [toast, setToast] = useState<{ message: string; severity: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => () => window.clearTimeout(announcementTimer.current), []);

  useEffect(() => {
    if (!onRegisterDropHandler) return;
    onRegisterDropHandler((files: File[]) => {
      void addFilesRef.current(async () => files);
    });
    return () => onRegisterDropHandler(null);
  }, [onRegisterDropHandler]);

  useEffect(() => {
    if (isMerging || !pendingOrganizeFileRef.current) return;
    const nextFile = pendingOrganizeFileRef.current;
    pendingOrganizeFileRef.current = null;
    organizeButtonRef.current?.focus();
    onOpenInOrganizer?.(nextFile);
  }, [isMerging, onOpenInOrganizer]);

  const clearAnnouncement = () => {
    window.clearTimeout(announcementTimer.current);
    setAnnouncement('');
  };

  const announce = (message: string) => {
    clearAnnouncement();
    // Keep the region mounted and commit an empty state before repeating a message.
    announcementTimer.current = window.setTimeout(() => setAnnouncement(message), 100);
  };

  const appendFiles = async (incoming: File[]) => {
    const { accepted, rejected } = await preparePDFs(incoming);
    setQueue(prev => [...prev, ...accepted]);
    if (rejected.length) {
      setToast({ message: `Could not add ${rejected.join(', ')}. Use readable, unencrypted PDFs.`, severity: 'error' });
    } else if (accepted.length) {
      setToast({ message: `Added ${accepted.length} ${accepted.length === 1 ? 'PDF file' : 'PDF files'} to the merge queue.`, severity: 'info' });
    }
  };

  const addFiles = async (getFiles: () => Promise<File[]>) => {
    if (busyRef.current) return;
    clearAnnouncement();
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

  useEffect(() => {
    addFilesRef.current = addFiles;
  });

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
    announce(`${reordered[position].file.name} moved to position ${position + 1} of ${queue.length}.`);
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

  const handleTouchPointerDown = (event: PointerEvent<HTMLElement>, id: string) => {
    if (event.pointerType === 'mouse' || busyRef.current || queue.length <= 1) return;
    event.preventDefault();
    touchDragRef.current = { pointerId: event.pointerId, sourceId: id, targetId: null };
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Ignore synthetic pointer events without an active OS pointer capture.
    }
    setDraggedId(id);
  };

  const handleTouchPointerMove = (event: PointerEvent<HTMLElement>) => {
    const activeTouch = touchDragRef.current;
    if (!activeTouch || activeTouch.pointerId !== event.pointerId) return;
    const hitRow = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-merge-queue-id]');
    const hitId = hitRow?.dataset.mergeQueueId ?? null;
    activeTouch.targetId = hitId;
    setDropTargetId(hitId && hitId !== activeTouch.sourceId ? hitId : null);
  };

  const handleTouchPointerEnd = (event: PointerEvent<HTMLElement>, commit: boolean) => {
    const activeTouch = touchDragRef.current;
    if (!activeTouch || activeTouch.pointerId !== event.pointerId) return;
    touchDragRef.current = null;
    if (commit && activeTouch.targetId && activeTouch.targetId !== activeTouch.sourceId) {
      moveItem(activeTouch.sourceId, activeTouch.targetId);
    }
    resetDrag();
  };

  const removeFile = (id: string) => {
    if (busyRef.current) return;
    clearAnnouncement();
    setQueue(prev => prev.filter(item => item.id !== id));
  };

  const totalPages = queue.reduce((acc, item) => acc + item.pageCount, 0);
  const hasMixedSizes = detectMixedQueuePageSizes(queue);

  const buildMergedDocument = async () => {
    const mergedBytes = await mergeQueue(queue, { pageSize: pageSizeMode });
    const cleanName = (outputName.trim() || 'merged').replace(/\.pdf$/i, '');
    return { mergedBytes, cleanName };
  };

  const mergePDFs = async () => {
    if (queue.length < 2 || busyRef.current) return;
    busyRef.current = true;
    resetDrag();
    setIsMerging(true);
    try {
      const { mergedBytes, cleanName } = await buildMergedDocument();
      const blob = new Blob([mergedBytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `${cleanName}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 150);
      setToast({ message: `Download started: ${cleanName}.pdf (${totalPages} pages). Your files remain here if you need to try again.`, severity: 'success' });
    } catch (error) {
      console.error('Error merging PDFs', error);
      setToast({ message: 'Failed to merge PDFs. Ensure none of the files are password-encrypted.', severity: 'error' });
    } finally {
      busyRef.current = false;
      setIsMerging(false);
    }
  };

  const mergeAndOrganize = async () => {
    if (queue.length < 2 || busyRef.current || !onOpenInOrganizer) return;
    busyRef.current = true;
    resetDrag();
    setIsMerging(true);
    try {
      const { mergedBytes, cleanName } = await buildMergedDocument();
      pendingOrganizeFileRef.current = new File([mergedBytes as BlobPart], `${cleanName}.pdf`, { type: 'application/pdf' });
    } catch (error) {
      pendingOrganizeFileRef.current = null;
      console.error('Error merging PDFs for organize', error);
      setToast({ message: 'Failed to merge PDFs. Ensure none of the files are password-encrypted.', severity: 'error' });
    } finally {
      busyRef.current = false;
      setIsMerging(false);
    }
  };

  const fileActions = (
    <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', justifyContent: queue.length ? 'flex-start' : 'center' }}>
          <Button variant="contained" disabled={isBusy} onClick={() => fileInputRef.current?.click()} startIcon={<UploadIcon />} sx={{ whiteSpace: 'nowrap' }}>
            {isAdding ? 'Reading PDFs…' : 'Add PDF files'}
          </Button>
          <input ref={fileInputRef} aria-label="PDF files to merge" type="file" hidden accept="application/pdf,.pdf" multiple disabled={isBusy} onChange={handleFileChange} />
          <Button variant="outlined" disabled={isBusy} startIcon={<SampleIcon />} onClick={loadSamplePair} sx={{ whiteSpace: 'nowrap' }}>
            Try two sample PDFs
          </Button>
        </Box>
  );

  return (
    <Box aria-busy={isBusy} sx={{ width: '100%', maxWidth: 880, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box role="status" aria-live="polite" aria-atomic="true" sx={{ position: 'absolute', width: '1px', height: '1px', m: '-1px', overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap' }}>
        {announcement}
      </Box>
      {queue.length === 0 ? (
        <ToolIntro icon={<MergeIcon fontSize="large" />} title="Start with two or more PDFs" description="Add your files, arrange them in order, and download or immediately organize every page.">
          {fileActions}
        </ToolIntro>
      ) : (
        <Paper variant="outlined" sx={{ p: 2 }}>{fileActions}</Paper>
      )}

      {queue.length > 0 && (
        <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 3 }, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5 }}>
            <Typography variant="h2" className="tabular-nums" sx={{ fontSize: 16 }}>
              Your files ({queue.length} files · <span className="mono tabular-nums">{totalPages}</span> pages)
            </Typography>
            <Button size="small" variant="text" disabled={isBusy} onClick={() => { clearAnnouncement(); setQueue([]); resetDrag(); }} sx={{ color: 'text.secondary' }}>
              Clear files
            </Button>
          </Box>

          <Typography id="merge-order-help" variant="body2" color="text.secondary">
            Drag a handle onto another document to change its position, or use the Move up and Move down buttons.
          </Typography>
          <Box component="ol" aria-label="Merge order" aria-describedby="merge-order-help" sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, listStyle: 'none', m: 0, p: 0 }}>
            {queue.map((item, idx) => (
              <Box
                key={item.id}
                component="li"
                data-merge-queue-id={item.id}
                className="pdfy-card-interactive"
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
                  display: 'grid',
                  gridTemplateColumns: { xs: '28px 1fr', sm: '28px 32px minmax(0, 1fr) auto' },
                  alignItems: 'center',
                  gap: { xs: 1, sm: 1.5 },
                  px: 1.5,
                  py: 1.25,
                  borderRadius: 2,
                  bgcolor: 'background.default',
                  border: '1px solid',
                  borderColor: dropTargetId === item.id && draggedId !== item.id ? 'primary.main' : 'divider',
                  boxShadow: dropTargetId === item.id && draggedId !== item.id ? theme => `0 0 0 2px ${theme.palette.primary.main}` : 'none',
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
                  onPointerDown={event => handleTouchPointerDown(event, item.id)}
                  onPointerMove={handleTouchPointerMove}
                  onPointerUp={event => handleTouchPointerEnd(event, true)}
                  onPointerCancel={event => handleTouchPointerEnd(event, false)}
                  sx={{ display: 'flex', color: 'text.secondary', cursor: isBusy ? 'default' : 'grab', p: 0.5, touchAction: queue.length > 1 && !isBusy ? 'none' : 'auto' }}
                >
                  <DragIcon fontSize="small" />
                </Box>
                <Typography className="mono tabular-nums" sx={{ display: { xs: 'none', sm: 'block' }, fontSize: 13, color: 'primary.main', fontWeight: 600, minWidth: 24 }}>
                  {String(idx + 1).padStart(2, '0')}
                </Typography>

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 600, overflowWrap: 'anywhere' }}>
                    {item.file.name}
                  </Typography>
                  <Typography className="mono tabular-nums" sx={{ fontSize: 12, color: 'text.secondary' }}>
                    {item.pageCount} {item.pageCount === 1 ? 'page' : 'pages'} · {(item.file.size / 1024).toFixed(1)} KB
                    {item.sampleSize ? ` · ${formatPageSizeLabel(item.sampleSize)}` : ''}
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, gridColumn: { xs: '2', sm: 'auto' } }}>
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
                    <IconButton aria-label={`Remove ${item.file.name}`} disabled={isBusy} size="small" onClick={() => removeFile(item.id)} sx={{ '&:hover': { color: 'error.main' } }}>
                      <DeleteIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
            ))}
          </Box>

          {hasMixedSizes && pageSizeMode === 'original' && (
            <Alert
              severity="info"
              role="note"
              sx={{ alignItems: 'center' }}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography variant="body2">
                  Mixed page sizes detected (common when combining standard PDFs with phone scans). Normalize page sizes so every page displays uniformly in Adobe Acrobat without re-encoding scan images.
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  <Button size="small" variant="outlined" disabled={isBusy} onClick={() => setPageSizeMode('match-first')}>
                    Match first PDF
                  </Button>
                  <Button size="small" variant="outlined" disabled={isBusy} onClick={() => setPageSizeMode('a4')}>
                    Fit all to A4
                  </Button>
                </Box>
              </Box>
            </Alert>
          )}

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) minmax(0, 240px)' }, gap: 1.5, pt: 1 }}>
            <TextField
              label="Download filename"
              size="small"
              value={outputName}
              disabled={isBusy}
              onChange={e => setOutputName(e.target.value)}
              fullWidth
            />
            <TextField
              select
              label="Page size"
              size="small"
              value={pageSizeMode}
              disabled={isBusy}
              onChange={e => setPageSizeMode(e.target.value as MergePageSizeMode)}
              fullWidth
            >
              <MenuItem value="original">Original (keep each size)</MenuItem>
              <MenuItem value="match-first">Match first PDF</MenuItem>
              <MenuItem value="a4">A4 (210 × 297 mm)</MenuItem>
              <MenuItem value="letter">US Letter (8.5 × 11 in)</MenuItem>
            </TextField>
          </Box>

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, justifyContent: { xs: 'stretch', sm: 'flex-end' } }}>
            {onOpenInOrganizer && (
              <Button
                ref={organizeButtonRef}
                variant="outlined"
                size="large"
                startIcon={isMerging ? <CircularProgress size={18} color="inherit" /> : <OrganizeIcon />}
                disabled={queue.length < 2 || isBusy}
                onClick={mergeAndOrganize}
                sx={{ py: 1.1, px: 2.5 }}
              >
                Merge &amp; organize pages
              </Button>
            )}
            <Button
              variant="contained"
              size="large"
              startIcon={isMerging ? <CircularProgress size={18} color="inherit" /> : <MergeIcon />}
              disabled={queue.length < 2 || isBusy}
              onClick={mergePDFs}
              sx={{ py: 1.1, px: 3 }}
            >
              {isMerging ? 'Preparing PDF…' : 'Download merged PDF'}
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

