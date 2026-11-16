import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type PointerEvent } from 'react';
import { Box, Button, Typography, Paper, CircularProgress, IconButton, TextField, Slider, Switch, FormControlLabel, Menu, MenuItem, Alert, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions } from '@mui/material';
import { RotateRight, RotateLeft, DeleteOutlined, ArrowBack, ArrowForward, ContentCopy, AddBoxOutlined, DashboardCustomizeOutlined, PrintOutlined, MergeType, DragIndicator, SwapVert } from '@mui/icons-material';
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { Document, Page, pdfjs } from 'react-pdf';
import { pdfDocumentOptions } from '../utils/pdfRendering';
import { generateSamplePDF } from '../utils/pdfSamples';
import { appendPDFsToFile } from '../utils/pdfMerge';
import { movePageToIndex, removePageById, reorderPageItems, restorePageAtIndex, type OrganizablePage } from '../utils/pdfOrganize';
import { usePDFSession, type PDFSession } from '../hooks/usePDFSession';
import PDFSessionControls from './PDFSessionControls';
import ToolIntro from './ToolIntro';
import ToolPanel from './ToolPanel';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
const PAGE_DRAG_TYPE = 'application/x-pdfy-organize-page';
async function prepare(file: File) {
  const pdf = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });
  if (!pdf.getPageCount()) throw new Error('Empty PDF');
  return { count: pdf.getPageCount() };
}

export default function PDFOrganizer({ initialFile, active = true, onOpenInPrint }: { initialFile?: File | null; active?: boolean; onOpenInPrint?: (file: File) => void }) {
  const replacement = usePDFSession(prepare, initialFile);
  const [isExporting, setIsExporting] = useState(false);
  return <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
    {!replacement.session && <ToolIntro icon={<DashboardCustomizeOutlined />} title="Put your pages in order" description="Move, rotate, copy, add another PDF, or remove pages. Add a watermark or page numbers when you need them."><Typography color="text.secondary">Open a PDF to get started, or merge multiple PDFs first.</Typography></ToolIntro>}
    <PDFSessionControls tool="Organize" active={active} hasSession={!!replacement.session} busy={replacement.isReading || isExporting} pendingName={replacement.pending?.file.name} error={replacement.error} onOpen={replacement.open} onSample={() => replacement.open(() => generateSamplePDF('multi-page-report'))} onCancel={replacement.cancel} onConfirm={replacement.confirm} />
    {replacement.session && <Box component="fieldset" disabled={replacement.isReading || !!replacement.pending} sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}><OrganizerWorkspace key={replacement.session.id} session={replacement.session} active={active} onExporting={setIsExporting} onOpenInPrint={onOpenInPrint} /></Box>}
  </Box>;
}

function OrganizerWorkspace({ session: { file, data }, active, onExporting, onOpenInPrint }: { session: PDFSession<{ count: number }>; active: boolean; onExporting: (busy: boolean) => void; onOpenInPrint?: (file: File) => void }) {
  const [workingFile, setWorkingFile] = useState(file);
  const [sourcePageCount, setSourcePageCount] = useState(data.count);
  const buildInitialPages = (count: number): OrganizablePage[] => Array.from({ length: count }, (_, originalIndex) => ({ id: crypto.randomUUID(), originalIndex, rotation: 0 }));
  const [pageConfigs, setPageConfigs] = useState<OrganizablePage[]>(() => buildInitialPages(data.count));
  const [isExporting, setIsExporting] = useState(false);
  const [isAddingPDFs, setIsAddingPDFs] = useState(false);
  const [settings, setSettings] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [draggedPageId, setDraggedPageId] = useState<string | null>(null);
  const [dropTargetPageId, setDropTargetPageId] = useState<string | null>(null);
  const [moveMenu, setMoveMenu] = useState<{ anchorEl: HTMLElement; pageId: string; index: number } | null>(null);
  const [deletedUndo, setDeletedUndo] = useState<{ page: OrganizablePage; index: number; pageNumber: number } | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const printButtonRef = useRef<HTMLButtonElement>(null);
  const addFileInputRef = useRef<HTMLInputElement>(null);
  const touchDragRef = useRef<{ pointerId: number; sourceId: string; targetId: string | null } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [enableWatermark, setEnableWatermark] = useState(false);
  const [watermarkText, setWatermarkText] = useState('CONFIDENTIAL');
  const [watermarkColor, setWatermarkColor] = useState('#EF4444');
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.22);
  const [watermarkSize, setWatermarkSize] = useState(48);
  const [watermarkDiagonal, setWatermarkDiagonal] = useState(true);
  const [enablePageNumbers, setEnablePageNumbers] = useState(true);
  const [pageNumberFormat, setPageNumberFormat] = useState<'page-of' | 'simple' | 'bates'>('page-of');
  const [pageNumberPosition, setPageNumberPosition] = useState<'bottom-center' | 'bottom-right' | 'top-right'>('bottom-center');
  const [batesPrefix, setBatesPrefix] = useState('DOC-');
  const [toast, setToast] = useState<{ message: string; severity: 'success' | 'error' | 'info' } | null>(null);
  const isBusy = isExporting || isAddingPDFs;

  const movePage = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= pageConfigs.length) return;
    const next = movePageToIndex(pageConfigs, index, target);
    const page = pageConfigs[index];
    setPageConfigs(next);
    setAnnouncement(`Moved page ${index + 1} to position ${target + 1}.`);
    requestAnimationFrame(() => document.getElementById(`organizer-page-${page.id}`)?.focus());
  };

  const movePageToPosition = (fromIndex: number, toIndex: number) => {
    const next = movePageToIndex(pageConfigs, fromIndex, toIndex);
    setMoveMenu(null);
    if (next === pageConfigs) return;
    setPageConfigs(next);
    setAnnouncement(`Moved page ${fromIndex + 1} to position ${toIndex + 1}.`);
  };

  const resetDrag = () => {
    setDraggedPageId(null);
    setDropTargetPageId(null);
  };

  const commitPageReorder = (sourceId: string, targetId: string | null) => {
    if (!targetId || sourceId === targetId) return;
    const fromIndex = pageConfigs.findIndex(item => item.id === sourceId);
    const next = reorderPageItems(pageConfigs, sourceId, targetId);
    if (next !== pageConfigs) {
      const toIndex = next.findIndex(item => item.id === sourceId);
      setPageConfigs(next);
      setAnnouncement(`Moved page ${fromIndex + 1} to position ${toIndex + 1}.`);
    }
  };

  const handleDropPage = (event: DragEvent, targetId: string) => {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData(PAGE_DRAG_TYPE);
    if (!isBusy && sourceId && sourceId === draggedPageId) {
      commitPageReorder(sourceId, targetId);
    }
    resetDrag();
  };

  const handleTouchHandlePointerDown = (event: PointerEvent<HTMLElement>, pageId: string) => {
    if (event.pointerType === 'mouse' || isBusy || pageConfigs.length <= 1) return;
    event.preventDefault();
    touchDragRef.current = { pointerId: event.pointerId, sourceId: pageId, targetId: null };
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Ignore synthetic pointer events without an active OS pointer capture.
    }
    setDraggedPageId(pageId);
  };

  const handleTouchHandlePointerMove = (event: PointerEvent<HTMLElement>) => {
    const activeTouch = touchDragRef.current;
    if (!activeTouch || activeTouch.pointerId !== event.pointerId) return;
    const hitCard = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-organize-page-id]');
    const hitId = hitCard?.dataset.organizePageId ?? null;
    activeTouch.targetId = hitId;
    setDropTargetPageId(hitId && hitId !== activeTouch.sourceId ? hitId : null);
  };

  const handleTouchHandlePointerEnd = (event: PointerEvent<HTMLElement>, commit: boolean) => {
    const activeTouch = touchDragRef.current;
    if (!activeTouch || activeTouch.pointerId !== event.pointerId) return;
    touchDragRef.current = null;
    if (commit && !isBusy) {
      commitPageReorder(activeTouch.sourceId, activeTouch.targetId);
    }
    resetDrag();
  };

  const rotatePage = (id: string, delta: number) => setPageConfigs(previous => previous.map(page => page.id === id ? { ...page, rotation: (page.rotation + delta + 360) % 360 } : page));
  const insert = (index: number, blank: boolean) => {
    const next = [...pageConfigs]; next.splice(index + 1, 0, { ...next[index], id: crypto.randomUUID(), ...(blank ? { originalIndex: -1, rotation: 0 } : {}) }); setPageConfigs(next);
  };

  const deletePage = (index: number, page: OrganizablePage) => {
    const result = removePageById(pageConfigs, page.id);
    if (!result) return;
    setPageConfigs(result.nextPages);
    setDeletedUndo({ page: result.removed, index: result.removedIndex, pageNumber: index + 1 });
    setAnnouncement(`Removed page ${index + 1}. Undo available.`);
    const nextFocus = result.nextPages[Math.min(index, result.nextPages.length - 1)];
    if (nextFocus) {
      requestAnimationFrame(() => document.getElementById(`organizer-page-${nextFocus.id}`)?.focus());
    }
  };

  const handleUndoDelete = () => {
    if (!deletedUndo) return;
    const restored = restorePageAtIndex(pageConfigs, deletedUndo.page, deletedUndo.index);
    const restoredId = deletedUndo.page.id;
    const restoredNumber = deletedUndo.pageNumber;
    setPageConfigs(restored);
    setDeletedUndo(null);
    setAnnouncement(`Restored page ${restoredNumber}.`);
    requestAnimationFrame(() => document.getElementById(`organizer-page-${restoredId}`)?.focus());
  };

  const handleAddPDFs = async (event: ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(event.target.files || []);
    event.target.value = '';
    if (!incoming.length || isBusy) return;
    setIsAddingPDFs(true);
    onExporting(true);
    try {
      const result = await appendPDFsToFile(workingFile, incoming);
      if (result.addedCount > 0) {
        setWorkingFile(result.combinedFile);
        setSourcePageCount(result.previousPageCount + result.addedCount);
        const appended: OrganizablePage[] = Array.from({ length: result.addedCount }, (_, i) => ({
          id: crypto.randomUUID(),
          originalIndex: result.previousPageCount + i,
          rotation: 0,
        }));
        setPageConfigs(previous => [...previous, ...appended]);
        const summary = `Added ${result.addedCount} ${result.addedCount === 1 ? 'page' : 'pages'} from ${result.acceptedNames.join(', ')}.`;
        setAnnouncement(summary);
        setToast({
          message: result.rejected.length
            ? `${summary} Skipped unreadable PDF(s): ${result.rejected.join(', ')}.`
            : summary,
          severity: result.rejected.length ? 'info' : 'success',
        });
      } else if (result.rejected.length) {
        setToast({ message: `Could not add ${result.rejected.join(', ')}. Use readable, unencrypted PDFs.`, severity: 'error' });
      }
    } catch {
      setToast({ message: 'Could not merge the selected PDF(s). Ensure none are password-encrypted.', severity: 'error' });
    } finally {
      setIsAddingPDFs(false);
      onExporting(false);
    }
  };

  const buildOrganizedPDFBytes = async () => {
    const arrayBuffer = await workingFile.arrayBuffer();
    const srcDoc = await PDFDocument.load(arrayBuffer);
    const outDoc = await PDFDocument.create();
    const fontBold = await outDoc.embedFont(StandardFonts.HelveticaBold);
    const fontMono = await outDoc.embedFont(StandardFonts.Courier);

    const hexToRgb = (hex: string) => {
      const clean = hex.replace('#', '');
      const r = parseInt(clean.slice(0, 2), 16) / 255 || 0;
      const g = parseInt(clean.slice(2, 4), 16) / 255 || 0;
      const b = parseInt(clean.slice(4, 6), 16) / 255 || 0;
      return rgb(r, g, b);
    };

    const wmColor = hexToRgb(watermarkColor);

    for (let i = 0; i < pageConfigs.length; i++) {
      const cfg = pageConfigs[i];
      let page;
      if (cfg.originalIndex === -1) {
        page = outDoc.addPage([595.28, 841.89]);
      } else {
        const [copied] = await outDoc.copyPages(srcDoc, [cfg.originalIndex]);
        page = outDoc.addPage(copied);
      }

      const currentRot = page.getRotation().angle;
      page.setRotation(degrees((currentRot + cfg.rotation) % 360));

      const { width, height } = page.getSize();

      // Apply Watermark if enabled
      if (enableWatermark && watermarkText.trim()) {
        const textWidth = fontBold.widthOfTextAtSize(watermarkText, watermarkSize);
        if (watermarkDiagonal) {
          page.drawText(watermarkText, {
            x: width / 2 - (textWidth * Math.cos(Math.PI / 4)) / 2,
            y: height / 2 - (textWidth * Math.sin(Math.PI / 4)) / 2,
            size: watermarkSize,
            font: fontBold,
            color: wmColor,
            opacity: watermarkOpacity,
            rotate: degrees(45),
          });
        } else {
          page.drawText(watermarkText, {
            x: (width - textWidth) / 2,
            y: height / 2,
            size: watermarkSize,
            font: fontBold,
            color: wmColor,
            opacity: watermarkOpacity,
          });
        }
      }

      // Apply Page Numbering if enabled
      if (enablePageNumbers) {
        let label: string;
        if (pageNumberFormat === 'page-of') {
          label = `Page ${i + 1} of ${pageConfigs.length}`;
        } else if (pageNumberFormat === 'simple') {
          label = `${i + 1}`;
        } else {
          label = `${batesPrefix}${String(i + 1).padStart(4, '0')}`;
        }

        const fontSize = 9.5;
        const labelWidth = fontMono.widthOfTextAtSize(label, fontSize);
        let x = (width - labelWidth) / 2;
        let y = 28;

        if (pageNumberPosition === 'bottom-right') {
          x = width - labelWidth - 40;
          y = 28;
        } else if (pageNumberPosition === 'top-right') {
          x = width - labelWidth - 40;
          y = height - 32;
        }

        page.drawText(label, {
          x,
          y,
          size: fontSize,
          font: fontMono,
          color: rgb(0.35, 0.39, 0.45),
        });
      }
    }

    return await outDoc.save();
  };

  const exportOrganizedPDF = async () => {
    if (!workingFile || pageConfigs.length === 0) return;
    setIsExporting(true);
    onExporting(true);
    try {
      const savedBytes = await buildOrganizedPDFBytes();
      const blob = new Blob([savedBytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `organized_${workingFile.name}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 200);
      setToast({ message: `Exported ${pageConfigs.length} pages with applied layout & stamps.`, severity: 'success' });
    } catch (err) {
      console.error('Error exporting organized PDF:', err);
      setToast({ message: 'Failed to export organized PDF.', severity: 'error' });
    } finally {
      setIsExporting(false);
      onExporting(false);
    }
  };

  const pendingPrintFileRef = useRef<File | null>(null);

  useEffect(() => {
    if (isExporting || !pendingPrintFileRef.current) return;
    const nextFile = pendingPrintFileRef.current;
    pendingPrintFileRef.current = null;
    printButtonRef.current?.focus();
    onOpenInPrint?.(nextFile);
  }, [isExporting, onOpenInPrint]);

  const printOrganizedPDF = async () => {
    if (!workingFile || pageConfigs.length === 0 || !onOpenInPrint) return;
    setIsExporting(true);
    onExporting(true);
    try {
      const savedBytes = await buildOrganizedPDFBytes();
      pendingPrintFileRef.current = new File([savedBytes as BlobPart], `organized_${workingFile.name}`, { type: 'application/pdf' });
    } catch (err) {
      pendingPrintFileRef.current = null;
      console.error('Error preparing organized PDF for print:', err);
      setToast({ message: 'Failed to prepare organized PDF for printing.', severity: 'error' });
    } finally {
      setIsExporting(false);
      onExporting(false);
    }
  };

  return <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
    <Box><Typography variant="h2" sx={{ overflowWrap: 'anywhere' }}>{workingFile.name}</Typography><Typography color="text.secondary">{pageConfigs.length} pages</Typography></Box>
    <Paper variant="outlined" sx={{ p: 1, display: 'flex', flexWrap: 'wrap', gap: 1, position: 'sticky', top: 0, zIndex: 2 }}>
      <Button variant="outlined" startIcon={isAddingPDFs ? <CircularProgress size={16} color="inherit" /> : <MergeType />} disabled={isBusy} onClick={() => addFileInputRef.current?.click()}>
        {isAddingPDFs ? 'Adding PDF…' : 'Add PDF…'}
      </Button>
      <input ref={addFileInputRef} aria-label="Add PDF files to organize" type="file" hidden multiple accept="application/pdf,.pdf" disabled={isBusy} onChange={handleAddPDFs} />
      <Button ref={settingsButton} variant="outlined" aria-expanded={settings} disabled={isBusy} onClick={() => setSettings(true)}>Page settings</Button>
      <Button variant="contained" disabled={isBusy} onClick={exportOrganizedPDF}>{isExporting ? 'Preparing PDF…' : 'Download organized PDF'}</Button>
      {onOpenInPrint && <Button ref={printButtonRef} variant="outlined" startIcon={<PrintOutlined />} disabled={isBusy} onClick={printOrganizedPDF}>Print…</Button>}
    </Paper>
    {deletedUndo && (
      <Alert
        severity="info"
        onClose={() => setDeletedUndo(null)}
        action={<Button color="inherit" size="small" onClick={handleUndoDelete}>Undo</Button>}
      >
        Removed page {deletedUndo.pageNumber}.
      </Alert>
    )}
    {toast && <Alert severity={toast.severity} onClose={() => setToast(null)}>{toast.message}</Alert>}
    <Typography role="status" className="sr-only">{announcement}</Typography>
    <Document file={workingFile} options={pdfDocumentOptions} loading={<CircularProgress aria-label="Loading page previews" />} error={<Alert severity="warning">Previews could not be displayed. Your page actions and download remain available.</Alert>}>
      <Box component="ol" aria-label="Page order" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: 2 }}>
        {pageConfigs.map((page, index) => <Paper
          component="li"
          variant="outlined"
          key={page.id}
          data-organize-page-id={page.id}
          onDragOver={event => {
            if (isBusy || !draggedPageId || !event.dataTransfer.types.includes(PAGE_DRAG_TYPE)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            setDropTargetPageId(page.id);
          }}
          onDragLeave={event => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTargetPageId(null);
          }}
          onDrop={event => handleDropPage(event, page.id)}
          sx={{
            p: 2,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1.5,
            minWidth: 0,
            borderColor: dropTargetPageId === page.id && draggedPageId !== page.id ? 'primary.main' : undefined,
            borderWidth: dropTargetPageId === page.id && draggedPageId !== page.id ? 2 : 1,
            opacity: draggedPageId === page.id ? 0.55 : 1,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.5, width: '100%', minWidth: 0 }}>
            <Box
              component="span"
              data-testid={`organizer-drag-handle-${index + 1}`}
              draggable={!isBusy && pageConfigs.length > 1}
              aria-hidden="true"
              title={`Drag page ${index + 1} to reorder`}
              onDragStart={event => {
                if (isBusy) { event.preventDefault(); return; }
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData(PAGE_DRAG_TYPE, page.id);
                setDraggedPageId(page.id);
              }}
              onDragEnd={resetDrag}
              onPointerDown={event => handleTouchHandlePointerDown(event, page.id)}
              onPointerMove={handleTouchHandlePointerMove}
              onPointerUp={event => handleTouchHandlePointerEnd(event, true)}
              onPointerCancel={event => handleTouchHandlePointerEnd(event, false)}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 34,
                height: 34,
                borderRadius: 1,
                cursor: isBusy || pageConfigs.length <= 1 ? 'default' : 'grab',
                color: 'text.secondary',
                touchAction: pageConfigs.length > 1 && !isBusy ? 'none' : 'auto',
                flexShrink: 0,
              }}
            >
              <DragIndicator fontSize="small" />
            </Box>
            <Typography component="h3" id={`organizer-page-${page.id}`} tabIndex={-1} sx={{ fontWeight: 600, flex: 1, textAlign: 'center', overflowWrap: 'anywhere' }}>
              Page {index + 1} · {page.originalIndex === -1 ? 'Blank' : `Source ${page.originalIndex + 1}`} · {page.rotation}°
            </Typography>
            <IconButton
              size="small"
              aria-label={`Move page ${index + 1} to position…`}
              disabled={pageConfigs.length <= 1 || isBusy}
              onClick={event => setMoveMenu({ anchorEl: event.currentTarget, pageId: page.id, index })}
              sx={{ flexShrink: 0 }}
            >
              <SwapVert fontSize="small" />
            </IconButton>
          </Box>
          <Box sx={{ width: 170, height: 235, bgcolor: '#FFFFFF', overflow: 'hidden', position: 'relative', display: 'grid', placeItems: 'center' }}>
            <Box sx={{ transform: `rotate(${page.rotation}deg)` }}>{page.originalIndex === -1 ? <Box sx={{ width: 170, height: 235 }} /> : <Page pageNumber={page.originalIndex + 1} width={170} renderTextLayer={false} renderAnnotationLayer={false} />}</Box>
            {enableWatermark && <Typography sx={{ position: 'absolute', color: watermarkColor, opacity: watermarkOpacity, transform: watermarkDiagonal ? 'rotate(-45deg)' : 'none', fontWeight: 700, fontSize: Math.max(10, watermarkSize * 0.28), textAlign: 'center', overflowWrap: 'anywhere' }}>{watermarkText}</Typography>}
            {enablePageNumbers && <Typography sx={{ position: 'absolute', fontSize: 9, color: '#444444', bgcolor: '#FFFFFF', bottom: pageNumberPosition.startsWith('bottom') ? 5 : 'auto', top: pageNumberPosition.startsWith('top') ? 5 : 'auto', right: pageNumberPosition.endsWith('right') ? 5 : 'auto' }}>{pageNumberFormat === 'page-of' ? `Page ${index + 1} of ${pageConfigs.length}` : pageNumberFormat === 'simple' ? index + 1 : `${batesPrefix}${String(index + 1).padStart(4, '0')}`}</Typography>}
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(44px, 1fr))', gap: 1, width: '100%' }}>
            <IconButton aria-label={`Move page ${index + 1} earlier`} disabled={index === 0 || isBusy} onClick={() => movePage(index, -1)}><ArrowBack /></IconButton>
            <IconButton aria-label={`Rotate page ${index + 1}`} disabled={isBusy} onClick={() => rotatePage(page.id, 90)}><RotateRight /></IconButton>
            <IconButton aria-label={`Move page ${index + 1} later`} disabled={index === pageConfigs.length - 1 || isBusy} onClick={() => movePage(index, 1)}><ArrowForward /></IconButton>
            <IconButton aria-label={`Duplicate page ${index + 1}`} disabled={isBusy} onClick={() => insert(index, false)}><ContentCopy /></IconButton>
            <IconButton aria-label={`Add blank after page ${index + 1}`} disabled={isBusy} onClick={() => insert(index, true)}><AddBoxOutlined /></IconButton>
            <IconButton aria-label={`Delete page ${index + 1}`} disabled={pageConfigs.length <= 1 || isBusy} onClick={() => deletePage(index, page)}><DeleteOutlined /></IconButton>
          </Box>
        </Paper>)}
      </Box>
    </Document>
    <Menu
      open={active && !!moveMenu}
      anchorEl={moveMenu?.anchorEl ?? null}
      onClose={() => setMoveMenu(null)}
      slotProps={{
        list: {
          'aria-label': moveMenu ? `Move page ${moveMenu.index + 1} to position` : 'Move page to position',
        },
      }}
    >
      {moveMenu && pageConfigs.map((targetPage, targetIndex) => (
        <MenuItem
          key={targetPage.id}
          disabled={targetIndex === moveMenu.index}
          selected={targetIndex === moveMenu.index}
          onClick={() => movePageToPosition(moveMenu.index, targetIndex)}
        >
          Position {targetIndex + 1}{targetIndex === moveMenu.index ? ' (current)' : ''}
        </MenuItem>
      ))}
    </Menu>
    <ToolPanel open={active && settings} title="Page settings" onClose={() => setSettings(false)}>
      <Box component="fieldset" disabled={isBusy} sx={{ border: 0, m: 0, p: 2, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <FormControlLabel control={<Switch checked={enableWatermark} onChange={event => setEnableWatermark(event.target.checked)} />} label="Watermark" />
        <TextField label="Watermark Text" value={watermarkText} onChange={event => setWatermarkText(event.target.value)} disabled={!enableWatermark} fullWidth />
        <TextField label="Watermark color" type="color" value={watermarkColor} onChange={event => setWatermarkColor(event.target.value)} disabled={!enableWatermark} fullWidth />
        <Box><Typography>Watermark opacity</Typography><Slider aria-label="Watermark opacity" min={0.05} max={0.8} step={0.01} value={watermarkOpacity} onChange={(_, value) => setWatermarkOpacity(value as number)} disabled={!enableWatermark} /></Box>
        <Box><Typography>Watermark size</Typography><Slider aria-label="Watermark size" min={16} max={120} value={watermarkSize} onChange={(_, value) => setWatermarkSize(value as number)} disabled={!enableWatermark} /></Box>
        <FormControlLabel control={<Switch checked={watermarkDiagonal} disabled={!enableWatermark} onChange={event => setWatermarkDiagonal(event.target.checked)} />} label="Diagonal watermark" />
        <FormControlLabel control={<Switch checked={enablePageNumbers} onChange={event => setEnablePageNumbers(event.target.checked)} />} label="Page numbers" />
        <TextField select label="Number format" value={pageNumberFormat} onChange={event => setPageNumberFormat(event.target.value as typeof pageNumberFormat)} disabled={!enablePageNumbers}>{[['page-of', 'Page 1 of 3'], ['simple', '1, 2, 3'], ['bates', 'Prefix and number']].map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
        {pageNumberFormat === 'bates' && <TextField label="Number prefix" value={batesPrefix} onChange={event => setBatesPrefix(event.target.value)} />}
        <TextField select label="Number position" value={pageNumberPosition} onChange={event => setPageNumberPosition(event.target.value as typeof pageNumberPosition)} disabled={!enablePageNumbers}>{[['bottom-center', 'Bottom center'], ['bottom-right', 'Bottom right'], ['top-right', 'Top right']].map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
        <Button variant="outlined" startIcon={<RotateLeft />} onClick={() => setPageConfigs(previous => previous.map(page => ({ ...page, rotation: (page.rotation + 270) % 360 })))}>Rotate all left</Button>
        <Button variant="outlined" startIcon={<RotateRight />} onClick={() => setPageConfigs(previous => previous.map(page => ({ ...page, rotation: (page.rotation + 90) % 360 })))}>Rotate all right</Button>
        <Button variant="outlined" onClick={() => { trigger.current = settingsButton.current; setSettings(false); setConfirmReset(true); }}>Reset page order</Button>
      </Box>
    </ToolPanel>
    <Dialog open={active && confirmReset} onClose={() => setConfirmReset(false)} aria-labelledby="organizer-confirm-title" disableRestoreFocus slotProps={{ transition: { onExited: () => (trigger.current?.isConnected ? trigger.current : settingsButton.current)?.focus() } }}>
      <DialogTitle id="organizer-confirm-title">Reset page order?</DialogTitle>
      <DialogContent><DialogContentText>Restore every original source page and remove page copies, blank pages, and rotations. Watermark and numbering settings will stay.</DialogContentText></DialogContent>
      <DialogActions><Button autoFocus onClick={() => setConfirmReset(false)}>Cancel</Button><Button color="error" onClick={() => { setPageConfigs(buildInitialPages(sourcePageCount)); setDeletedUndo(null); setConfirmReset(false); }}>Confirm</Button></DialogActions>
    </Dialog>
  </Box>;
}
