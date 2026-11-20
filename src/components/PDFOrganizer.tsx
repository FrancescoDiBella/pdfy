import { useEffect, useId, useRef, useState, type ChangeEvent, type DragEvent, type PointerEvent } from 'react';
import { Box, Button, Typography, Paper, CircularProgress, IconButton, TextField, Slider, Switch, FormControlLabel, FormControl, FormLabel, RadioGroup, Radio, Divider, Menu, MenuItem, Alert, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Tooltip } from '@mui/material';
import { RotateRight, RotateLeft, DeleteOutlined, ArrowBack, ArrowForward, ContentCopy, AddBoxOutlined, DashboardCustomizeOutlined, PrintOutlined, CompressOutlined, EditOutlined, MergeType, DragIndicator, SwapVert } from '@mui/icons-material';
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { Document, Page, pdfjs } from 'react-pdf';
import { pdfDocumentOptions } from '../utils/pdfRendering';
import { generateSamplePDF } from '../utils/pdfSamples';
import { appendPDFsToFile } from '../utils/pdfMerge';
import {
  applyPageMarginCrop,
  clampCropMarginPct,
  computePreviewClipInset,
  DEFAULT_DOCUMENT_CROP,
  formatCropSummary,
  hasActiveCrop,
  MAX_CROP_MARGIN_PCT,
  movePageToIndex,
  removePageById,
  reorderPageItems,
  resolveCropMarginsPct,
  resolveEffectivePageCrop,
  restorePageAtIndex,
  type CropMarginsPct,
  type MarginCropConfig,
  type MarginCropPreset,
  type OrganizablePage,
} from '../utils/pdfOrganize';
import {
  applyHeaderFooterBatesToPage,
  clampBatesDigits,
  clampBatesStart,
  DEFAULT_HEADER_FOOTER_BATES,
  formatBatesNumber,
  interpolateStampText,
  resolveStampTargetIndices,
  STAMP_ZONES,
  type HeaderFooterBatesConfig,
} from '../utils/pdfBates';
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

function CropMarginField({
  label,
  value,
  describedBy,
  onChange,
}: {
  label: string;
  value: number;
  describedBy: string;
  onChange: (next: number) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState('');
  return (
    <TextField
      label={label}
      type="number"
      size="small"
      fullWidth
      value={focused ? draft : String(value)}
      slotProps={{
        htmlInput: {
          min: 0,
          max: MAX_CROP_MARGIN_PCT,
          step: 1,
          inputMode: 'decimal',
          'aria-describedby': describedBy,
        },
      }}
      sx={{ '& input': { fontSize: 16, fontVariantNumeric: 'tabular-nums' } }}
      onFocus={() => {
        setDraft(String(value));
        setFocused(true);
      }}
      onChange={event => {
        const raw = event.target.value;
        setDraft(raw);
        if (raw.trim() === '') return;
        const parsed = Number(raw);
        if (Number.isFinite(parsed) && parsed >= 0 && parsed <= MAX_CROP_MARGIN_PCT) {
          onChange(clampCropMarginPct(parsed));
        }
      }}
      onBlur={() => {
        setFocused(false);
        if (draft.trim() === '') return;
        const parsed = Number(draft);
        if (Number.isFinite(parsed)) {
          onChange(clampCropMarginPct(parsed));
        }
      }}
    />
  );
}

export default function PDFOrganizer({
  initialFile,
  active = true,
  onSessionChange,
  onOpenInPrint,
  onOpenInCompress,
  onOpenInEditor,
}: {
  initialFile?: File | null;
  active?: boolean;
  onSessionChange?: (active: boolean) => void;
  onOpenInPrint?: (file: File) => void;
  onOpenInCompress?: (file: File) => void;
  onOpenInEditor?: (file: File) => void;
}) {
  const replacement = usePDFSession(prepare, initialFile);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    onSessionChange?.(!!replacement.session);
  }, [replacement.session, onSessionChange]);

  return <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
    {!replacement.session && <ToolIntro icon={<DashboardCustomizeOutlined />} title="Put your pages in order" description="Move, rotate, trim margins, copy, add another PDF, or remove pages. Add a watermark or page numbers when you need them."><Typography color="text.secondary">Open a PDF to get started, or merge multiple PDFs first.</Typography></ToolIntro>}
    <PDFSessionControls tool="Organize" active={active} hasSession={!!replacement.session} busy={replacement.isReading || isExporting} pendingName={replacement.pending?.file.name} error={replacement.error} onOpen={replacement.open} onSample={() => replacement.open(() => generateSamplePDF('multi-page-report'))} onCancel={replacement.cancel} onConfirm={replacement.confirm} />
    {replacement.session && <Box component="fieldset" disabled={replacement.isReading || !!replacement.pending} sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}><legend className="sr-only">Organize workspace</legend><OrganizerWorkspace key={replacement.session.id} session={replacement.session} active={active} onExporting={setIsExporting} onOpenInPrint={onOpenInPrint} onOpenInCompress={onOpenInCompress} onOpenInEditor={onOpenInEditor} /></Box>}
  </Box>;
}

function OrganizerWorkspace({
  session: { file, data },
  active,
  onExporting,
  onOpenInPrint,
  onOpenInCompress,
  onOpenInEditor,
}: {
  session: PDFSession<{ count: number }>;
  active: boolean;
  onExporting: (busy: boolean) => void;
  onOpenInPrint?: (file: File) => void;
  onOpenInCompress?: (file: File) => void;
  onOpenInEditor?: (file: File) => void;
}) {
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
  const compressButtonRef = useRef<HTMLButtonElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const addFileInputRef = useRef<HTMLInputElement>(null);
  const touchDragRef = useRef<{ pointerId: number; sourceId: string; targetId: string | null } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [documentCrop, setDocumentCrop] = useState<MarginCropConfig>(() => ({
    preset: DEFAULT_DOCUMENT_CROP.preset,
    margins: { ...DEFAULT_DOCUMENT_CROP.margins },
  }));
  const [cropTarget, setCropTarget] = useState<'all' | string>('all');
  const cropHintId = useId();
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
  const [batesConfig, setBatesConfig] = useState<HeaderFooterBatesConfig>(() => ({
    ...DEFAULT_HEADER_FOOTER_BATES,
    zones: { ...DEFAULT_HEADER_FOOTER_BATES.zones },
  }));
  const [batesRangeTouched, setBatesRangeTouched] = useState(false);
  const batesRangeHintId = useId();
  const batesRangeErrorId = useId();
  const batesTokensHintId = useId();
  const [toast, setToast] = useState<{ message: string; severity: 'success' | 'error' | 'info' } | null>(null);
  const isBusy = isExporting || isAddingPDFs;

  const batesTargetResolution = resolveStampTargetIndices(batesConfig.pageRange, pageConfigs.length);
  const batesSequenceMap = new Map<number, number>();
  batesTargetResolution.indices.forEach((pageIdx, seqIdx) => {
    batesSequenceMap.set(pageIdx, seqIdx);
  });
  const showBatesRangeError = batesConfig.enabled && batesRangeTouched && !!batesTargetResolution.error;
  const todayIso = new Date().toISOString().slice(0, 10);

  const activeTargetPage = cropTarget !== 'all' ? pageConfigs.find(page => page.id === cropTarget) ?? null : null;
  const effectiveCropTarget = activeTargetPage ? cropTarget : 'all';
  const activePresetValue: MarginCropPreset | 'inherit' = activeTargetPage
    ? (activeTargetPage.crop?.preset ?? 'inherit')
    : documentCrop.preset;
  const activeCustomMargins = activeTargetPage
    ? (activeTargetPage.crop?.margins ?? documentCrop.margins)
    : documentCrop.margins;
  const showCustomMarginFields = activePresetValue === 'custom';
  const pageCropOverrideCount = pageConfigs.filter(page => !!page.crop).length;

  const handleChangeCropPreset = (nextValue: MarginCropPreset | 'inherit') => {
    if (activeTargetPage) {
      if (nextValue === 'inherit') {
        setPageConfigs(previous => previous.map(page => page.id === activeTargetPage.id ? { ...page, crop: undefined } : page));
      } else {
        setPageConfigs(previous => previous.map(page => {
          if (page.id !== activeTargetPage.id) return page;
          const margins = page.crop?.margins ?? documentCrop.margins;
          return { ...page, crop: { preset: nextValue, margins: { ...margins } } };
        }));
      }
      return;
    }
    if (nextValue !== 'inherit') {
      setDocumentCrop(previous => ({ ...previous, preset: nextValue }));
    }
  };

  const handleChangeCustomMargin = (side: keyof CropMarginsPct, nextValue: number) => {
    const clamped = clampCropMarginPct(nextValue);
    if (activeTargetPage) {
      setPageConfigs(previous => previous.map(page => {
        if (page.id !== activeTargetPage.id) return page;
        const baseMargins = page.crop?.margins ?? documentCrop.margins;
        return {
          ...page,
          crop: {
            preset: 'custom',
            margins: { ...baseMargins, [side]: clamped },
          },
        };
      }));
      return;
    }
    setDocumentCrop(previous => ({
      preset: 'custom',
      margins: { ...previous.margins, [side]: clamped },
    }));
  };

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
    const sourcePage = pageConfigs[index];
    const copiedCrop = !blank && sourcePage.crop
      ? { preset: sourcePage.crop.preset, margins: { ...sourcePage.crop.margins } }
      : undefined;
    const next = [...pageConfigs];
    next.splice(index + 1, 0, {
      ...sourcePage,
      id: crypto.randomUUID(),
      crop: copiedCrop,
      ...(blank ? { originalIndex: -1, rotation: 0 } : {}),
    });
    setPageConfigs(next);
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
    const fontRegular = await outDoc.embedFont(StandardFonts.Helvetica);
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

      const effectiveCrop = resolveEffectivePageCrop(cfg, documentCrop);
      const { x: boxX, y: boxY, width, height } = applyPageMarginCrop(page, effectiveCrop);

      // Apply Watermark if enabled
      if (enableWatermark && watermarkText.trim()) {
        const textWidth = fontBold.widthOfTextAtSize(watermarkText, watermarkSize);
        if (watermarkDiagonal) {
          page.drawText(watermarkText, {
            x: boxX + width / 2 - (textWidth * Math.cos(Math.PI / 4)) / 2,
            y: boxY + height / 2 - (textWidth * Math.sin(Math.PI / 4)) / 2,
            size: watermarkSize,
            font: fontBold,
            color: wmColor,
            opacity: watermarkOpacity,
            rotate: degrees(45),
          });
        } else {
          page.drawText(watermarkText, {
            x: boxX + (width - textWidth) / 2,
            y: boxY + height / 2,
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
        let x = boxX + (width - labelWidth) / 2;
        let y = boxY + 28;

        if (pageNumberPosition === 'bottom-right') {
          x = boxX + width - labelWidth - 40;
          y = boxY + 28;
        } else if (pageNumberPosition === 'top-right') {
          x = boxX + width - labelWidth - 40;
          y = boxY + height - 32;
        }

        page.drawText(label, {
          x,
          y,
          size: fontSize,
          font: fontMono,
          color: rgb(0.35, 0.39, 0.45),
        });
      }

      // Apply 6-zone Headers, Footers & Bates Numbering if enabled and page is in target range
      if (batesConfig.enabled && !batesTargetResolution.error) {
        const seqIndex = batesSequenceMap.get(i);
        if (seqIndex !== undefined) {
          applyHeaderFooterBatesToPage(
            page,
            fontRegular,
            { x: boxX, y: boxY, width, height },
            batesConfig,
            {
              pageNumber: i + 1,
              sequenceIndex: seqIndex,
              totalPages: pageConfigs.length,
              dateIso: todayIso,
              filename: workingFile.name,
            },
          );
        }
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

  const pendingHandoffRef = useRef<{ target: 'print' | 'compress' | 'edit'; file: File } | null>(null);

  useEffect(() => {
    if (isExporting || !pendingHandoffRef.current) return;
    const next = pendingHandoffRef.current;
    pendingHandoffRef.current = null;
    if (next.target === 'print') {
      printButtonRef.current?.focus();
      onOpenInPrint?.(next.file);
    } else if (next.target === 'compress') {
      compressButtonRef.current?.focus();
      onOpenInCompress?.(next.file);
    } else {
      editButtonRef.current?.focus();
      onOpenInEditor?.(next.file);
    }
  }, [isExporting, onOpenInPrint, onOpenInCompress, onOpenInEditor]);

  const handoffOrganizedPDF = async (target: 'print' | 'compress' | 'edit') => {
    const callback = target === 'print' ? onOpenInPrint : target === 'compress' ? onOpenInCompress : onOpenInEditor;
    if (!workingFile || pageConfigs.length === 0 || !callback) return;
    setIsExporting(true);
    onExporting(true);
    try {
      const savedBytes = await buildOrganizedPDFBytes();
      pendingHandoffRef.current = {
        target,
        file: new File([savedBytes as BlobPart], `organized_${workingFile.name}`, { type: 'application/pdf' }),
      };
    } catch (err) {
      pendingHandoffRef.current = null;
      console.error(`Error preparing organized PDF for ${target}:`, err);
      setToast({ message: `Failed to prepare organized PDF for ${target}.`, severity: 'error' });
    } finally {
      setIsExporting(false);
      onExporting(false);
    }
  };

  return <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
    <Box><Typography variant="h2" sx={{ overflowWrap: 'anywhere' }}>{workingFile.name}</Typography><Typography color="text.secondary" className="tabular-nums">{pageConfigs.length} pages</Typography></Box>
    <Paper variant="outlined" sx={{ p: 1, display: 'flex', flexWrap: 'wrap', gap: 1, position: 'sticky', top: 0, zIndex: 2 }}>
      <Button variant="outlined" startIcon={isAddingPDFs ? <CircularProgress size={16} color="inherit" /> : <MergeType />} disabled={isBusy} onClick={() => addFileInputRef.current?.click()}>
        {isAddingPDFs ? 'Adding PDF…' : 'Add PDF…'}
      </Button>
      <input ref={addFileInputRef} aria-label="Add PDF files to organize" type="file" hidden multiple accept="application/pdf,.pdf" disabled={isBusy} onChange={handleAddPDFs} />
      <Button ref={settingsButton} variant="outlined" aria-expanded={settings} disabled={isBusy} onClick={() => setSettings(true)}>Page settings</Button>
      <Button variant="contained" disabled={isBusy} onClick={exportOrganizedPDF}>{isExporting ? 'Preparing PDF…' : 'Download organized PDF'}</Button>
      {onOpenInPrint && <Button ref={printButtonRef} variant="outlined" startIcon={<PrintOutlined />} disabled={isBusy} onClick={() => void handoffOrganizedPDF('print')}>Print…</Button>}
      {onOpenInCompress && <Button ref={compressButtonRef} variant="outlined" startIcon={<CompressOutlined />} disabled={isBusy} onClick={() => void handoffOrganizedPDF('compress')}>Compress…</Button>}
      {onOpenInEditor && <Button ref={editButtonRef} variant="outlined" startIcon={<EditOutlined />} disabled={isBusy} onClick={() => void handoffOrganizedPDF('edit')}>Edit…</Button>}
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
        {pageConfigs.map((page, index) => {
          const effectivePageCrop = resolveEffectivePageCrop(page, documentCrop);
          const pageCropActive = hasActiveCrop(effectivePageCrop);
          const previewClip = computePreviewClipInset(page.rotation, resolveCropMarginsPct(effectivePageCrop));
          return <Paper
          component="li"
          variant="outlined"
          key={page.id}
          data-organize-page-id={page.id}
          className="pdfy-page-tile pdfy-card-interactive"
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
            <Typography component="h3" id={`organizer-page-${page.id}`} tabIndex={-1} className="tabular-nums" sx={{ fontWeight: 600, fontSize: '0.875rem', flex: 1, textAlign: 'center', overflowWrap: 'anywhere' }}>
              Page {index + 1} · {page.originalIndex === -1 ? 'Blank' : `Source ${page.originalIndex + 1}`} · {page.rotation}°{pageCropActive ? ` · ${formatCropSummary(effectivePageCrop)}` : ''}
            </Typography>
            <Tooltip title="Move to position" describeChild>
              <Box component="span" sx={{ display: 'inline-flex', flexShrink: 0 }}>
                <IconButton
                  size="small"
                  aria-label={`Move page ${index + 1} to position…`}
                  disabled={pageConfigs.length <= 1 || isBusy}
                  onClick={event => setMoveMenu({ anchorEl: event.currentTarget, pageId: page.id, index })}
                >
                  <SwapVert fontSize="small" />
                </IconButton>
              </Box>
            </Tooltip>
          </Box>
          <Box
            className="pdfy-workbench-mat"
            sx={{
              width: '100%',
              maxWidth: 224,
              aspectRatio: '1 / 1',
              borderRadius: 1.5,
              position: 'relative',
              overflow: 'hidden',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Box
              sx={{
                position: 'absolute',
                inset: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transform: `rotate(${page.rotation}deg)`,
                '@media (prefers-reduced-motion: no-preference)': {
                  transition: 'transform 160ms cubic-bezier(0.2, 0, 0, 1)',
                },
                '& .react-pdf__Page': {
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'transparent !important',
                },
                '& .react-pdf__Page__canvas': {
                  maxWidth: '100% !important',
                  maxHeight: '100% !important',
                  width: 'auto !important',
                  height: 'auto !important',
                  objectFit: 'contain',
                  display: 'block',
                  bgcolor: '#FFFFFF',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.16)',
                  clipPath: previewClip,
                },
              }}
            >
              {page.originalIndex === -1 ? (
                <Box sx={{ height: '100%', maxWidth: '100%', aspectRatio: '210 / 297', bgcolor: '#FFFFFF', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.16)', clipPath: previewClip }} />
              ) : (
                <Page pageNumber={page.originalIndex + 1} width={180} renderTextLayer={false} renderAnnotationLayer={false} />
              )}
            </Box>
            {enableWatermark && <Typography sx={{ position: 'absolute', pointerEvents: 'none', color: watermarkColor, opacity: watermarkOpacity, transform: watermarkDiagonal ? 'rotate(-45deg)' : 'none', fontWeight: 700, fontSize: Math.max(10, watermarkSize * 0.28), textAlign: 'center', overflowWrap: 'anywhere' }}>{watermarkText}</Typography>}
            {enablePageNumbers && (
              <Typography
                className="tabular-nums"
                sx={{
                  position: 'absolute',
                  pointerEvents: 'none',
                  fontSize: 9,
                  color: '#444444',
                  bgcolor: '#FFFFFF',
                  px: 0.5,
                  borderRadius: 0.5,
                  bottom: pageNumberPosition.startsWith('bottom') ? 5 : 'auto',
                  top: pageNumberPosition.startsWith('top') ? 5 : 'auto',
                  right: pageNumberPosition.endsWith('right') ? 5 : 'auto',
                  left: pageNumberPosition.endsWith('right') ? 'auto' : '50%',
                  transform: pageNumberPosition.endsWith('right') ? 'none' : 'translateX(-50%)',
                }}
              >
                {pageNumberFormat === 'page-of' ? `Page ${index + 1} of ${pageConfigs.length}` : pageNumberFormat === 'simple' ? index + 1 : `${batesPrefix}${String(index + 1).padStart(4, '0')}`}
              </Typography>
            )}
            {batesConfig.enabled && !batesTargetResolution.error && batesSequenceMap.has(index) && (
              <Typography
                className="tabular-nums"
                data-testid={`organizer-bates-badge-${index + 1}`}
                sx={{
                  position: 'absolute',
                  pointerEvents: 'none',
                  fontSize: 9,
                  fontWeight: 600,
                  color: '#1A1916',
                  bgcolor: 'rgba(255, 254, 250, 0.94)',
                  border: '1px solid rgba(180, 60, 24, 0.45)',
                  px: 0.6,
                  borderRadius: 0.5,
                  top: 6,
                  left: 6,
                  maxWidth: 'calc(100% - 12px)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {formatBatesNumber(
                  batesConfig.batesPrefix,
                  batesConfig.batesSuffix,
                  batesConfig.batesStart,
                  batesConfig.batesDigits,
                  batesSequenceMap.get(index)!,
                )}
              </Typography>
            )}
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(44px, 1fr))', gap: 1, width: '100%' }}>
            <Tooltip title="Move earlier" describeChild><Box component="span" sx={{ display: 'grid' }}><IconButton aria-label={`Move page ${index + 1} earlier`} disabled={index === 0 || isBusy} onClick={() => movePage(index, -1)}><ArrowBack /></IconButton></Box></Tooltip>
            <Tooltip title="Rotate 90° clockwise" describeChild><Box component="span" sx={{ display: 'grid' }}><IconButton aria-label={`Rotate page ${index + 1}`} disabled={isBusy} onClick={() => rotatePage(page.id, 90)}><RotateRight /></IconButton></Box></Tooltip>
            <Tooltip title="Move later" describeChild><Box component="span" sx={{ display: 'grid' }}><IconButton aria-label={`Move page ${index + 1} later`} disabled={index === pageConfigs.length - 1 || isBusy} onClick={() => movePage(index, 1)}><ArrowForward /></IconButton></Box></Tooltip>
            <Tooltip title="Duplicate page" describeChild><Box component="span" sx={{ display: 'grid' }}><IconButton aria-label={`Duplicate page ${index + 1}`} disabled={isBusy} onClick={() => insert(index, false)}><ContentCopy /></IconButton></Box></Tooltip>
            <Tooltip title="Add blank page after" describeChild><Box component="span" sx={{ display: 'grid' }}><IconButton aria-label={`Add blank after page ${index + 1}`} disabled={isBusy} onClick={() => insert(index, true)}><AddBoxOutlined /></IconButton></Box></Tooltip>
            <Tooltip title="Delete page" describeChild><Box component="span" sx={{ display: 'grid' }}><IconButton aria-label={`Delete page ${index + 1}`} disabled={pageConfigs.length <= 1 || isBusy} onClick={() => deletePage(index, page)}><DeleteOutlined /></IconButton></Box></Tooltip>
          </Box>
        </Paper>;
        })}
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
      <Box component="fieldset" disabled={isBusy} sx={{ border: 0, m: 0, p: 2, display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}>
        <legend className="sr-only">Page settings controls</legend>

        <details className="pdfy-details" open>
          <summary>Margin crop</summary>
          <Box sx={{ px: 1.75, pb: 1.75, pt: 0.5, display: 'flex', flexDirection: 'column', gap: 1.75, minWidth: 0 }}>
            <TextField
              select
              label="Apply margin crop to"
              value={effectiveCropTarget}
              onChange={event => setCropTarget(event.target.value)}
              fullWidth
              slotProps={{ select: { MenuProps: { slotProps: { list: { sx: { '& .MuiMenuItem-root': { minHeight: 44 } } } } } } }}
            >
              <MenuItem value="all">All pages ({formatCropSummary(documentCrop)})</MenuItem>
              {pageConfigs.map((page, idx) => (
                <MenuItem key={page.id} value={page.id}>
                  Page {idx + 1}{page.crop ? ` (${formatCropSummary(page.crop)})` : ''}
                </MenuItem>
              ))}
            </TextField>
            <FormControl component="fieldset" sx={{ minWidth: 0 }}>
              <FormLabel component="legend" sx={{ fontWeight: 600, fontSize: '0.875rem', mb: 0.5 }}>Margin crop preset</FormLabel>
              <RadioGroup
                aria-label="Margin crop preset"
                value={activePresetValue}
                onChange={event => handleChangeCropPreset(event.target.value as MarginCropPreset | 'inherit')}
              >
                {activeTargetPage && (
                  <FormControlLabel
                    value="inherit"
                    control={<Radio size="small" />}
                    label={`Follow all pages (${formatCropSummary(documentCrop)})`}
                  />
                )}
                <FormControlLabel value="original" control={<Radio size="small" />} label="Original" />
                <FormControlLabel value="trim-4" control={<Radio size="small" />} label="Trim 4%" />
                <FormControlLabel value="trim-8" control={<Radio size="small" />} label="Trim 8%" />
                <FormControlLabel value="custom" control={<Radio size="small" />} label="Custom margins" />
              </RadioGroup>
            </FormControl>
            {showCustomMarginFields && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                <Typography id={cropHintId} variant="caption" color="text.secondary">
                  Trim 0% to {MAX_CROP_MARGIN_PCT}% from each visual edge using PDF CropBox adjustments.
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.5 }}>
                  <CropMarginField label="Top margin (%)" value={activeCustomMargins.top} describedBy={cropHintId} onChange={val => handleChangeCustomMargin('top', val)} />
                  <CropMarginField label="Bottom margin (%)" value={activeCustomMargins.bottom} describedBy={cropHintId} onChange={val => handleChangeCustomMargin('bottom', val)} />
                  <CropMarginField label="Left margin (%)" value={activeCustomMargins.left} describedBy={cropHintId} onChange={val => handleChangeCustomMargin('left', val)} />
                  <CropMarginField label="Right margin (%)" value={activeCustomMargins.right} describedBy={cropHintId} onChange={val => handleChangeCustomMargin('right', val)} />
                </Box>
              </Box>
            )}
            {!activeTargetPage && pageCropOverrideCount > 0 && (
              <Button
                type="button"
                variant="outlined"
                size="small"
                onClick={() => setPageConfigs(previous => previous.map(page => ({ ...page, crop: undefined })))}
              >
                Clear page crop overrides ({pageCropOverrideCount})
              </Button>
            )}
          </Box>
        </details>

        <details className="pdfy-details">
          <summary>Headers, footers &amp; Bates numbering</summary>
          <Box sx={{ px: 1.75, pb: 1.75, pt: 0.5, display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={batesConfig.enabled}
                  onChange={event => setBatesConfig(prev => ({ ...prev, enabled: event.target.checked }))}
                />
              }
              label="Enable headers, footers & Bates stamps"
            />
            <Typography id={batesTokensHintId} variant="caption" color="text.secondary">
              Available tokens: <code>{'{bates}'}</code>, <code>{'{page}'}</code>, <code>{'{total}'}</code>, <code>{'{date}'}</code>, <code>{'{filename}'}</code>.
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.25 }}>
              <TextField
                size="small"
                label="Bates prefix"
                value={batesConfig.batesPrefix}
                disabled={!batesConfig.enabled}
                onChange={event => setBatesConfig(prev => ({ ...prev, batesPrefix: event.target.value }))}
              />
              <TextField
                size="small"
                label="Bates suffix"
                value={batesConfig.batesSuffix}
                disabled={!batesConfig.enabled}
                onChange={event => setBatesConfig(prev => ({ ...prev, batesSuffix: event.target.value }))}
              />
              <TextField
                size="small"
                type="number"
                label="Bates start number"
                value={batesConfig.batesStart}
                disabled={!batesConfig.enabled}
                slotProps={{ htmlInput: { min: 0, step: 1 } }}
                onChange={event => setBatesConfig(prev => ({ ...prev, batesStart: clampBatesStart(Number(event.target.value)) }))}
              />
              <TextField
                size="small"
                type="number"
                label="Zero-pad digits"
                value={batesConfig.batesDigits}
                disabled={!batesConfig.enabled}
                slotProps={{ htmlInput: { min: 1, max: 10, step: 1 } }}
                onChange={event => setBatesConfig(prev => ({ ...prev, batesDigits: clampBatesDigits(Number(event.target.value)) }))}
              />
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {/* Hint placed above input per validate-input-after-interaction guidance */}
              <Typography id={batesRangeHintId} variant="caption" color="text.secondary">
                Apply stamps to pages (leave blank for all {pageConfigs.length} pages, or e.g. 2-{Math.max(2, pageConfigs.length)} to skip cover).
              </Typography>
              <TextField
                size="small"
                label="Stamp page range"
                placeholder={`1-${pageConfigs.length}`}
                value={batesConfig.pageRange}
                disabled={!batesConfig.enabled}
                error={showBatesRangeError}
                slotProps={{
                  htmlInput: {
                    'aria-invalid': showBatesRangeError ? 'true' : 'false',
                    'aria-describedby': showBatesRangeError ? `${batesRangeHintId} ${batesRangeErrorId}` : batesRangeHintId,
                  },
                }}
                onBlur={() => setBatesRangeTouched(true)}
                onChange={event => setBatesConfig(prev => ({ ...prev, pageRange: event.target.value }))}
                fullWidth
              />
              {showBatesRangeError && (
                <Typography id={batesRangeErrorId} variant="caption" color="error" sx={{ fontWeight: 600 }}>
                  Error: {batesTargetResolution.error}
                </Typography>
              )}
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {STAMP_ZONES.map(zone => (
                <TextField
                  key={zone.id}
                  size="small"
                  label={`${zone.label} stamp`}
                  value={batesConfig.zones[zone.id]}
                  disabled={!batesConfig.enabled}
                  slotProps={{ htmlInput: { 'aria-describedby': batesTokensHintId } }}
                  onChange={event =>
                    setBatesConfig(prev => ({
                      ...prev,
                      zones: { ...prev.zones, [zone.id]: event.target.value },
                    }))
                  }
                  fullWidth
                />
              ))}
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 88px', gap: 1.25, alignItems: 'center' }}>
              <Box>
                <Typography variant="caption" color="text.secondary" className="tabular-nums">Stamp font size ({batesConfig.fontSize} pt)</Typography>
                <Slider
                  aria-label="Stamp font size"
                  size="small"
                  min={7}
                  max={16}
                  step={0.5}
                  value={batesConfig.fontSize}
                  disabled={!batesConfig.enabled}
                  onChange={(_, value) => setBatesConfig(prev => ({ ...prev, fontSize: value as number }))}
                />
              </Box>
              <TextField
                size="small"
                label="Stamp color"
                type="color"
                value={batesConfig.colorHex}
                disabled={!batesConfig.enabled}
                onChange={event => setBatesConfig(prev => ({ ...prev, colorHex: event.target.value }))}
              />
            </Box>
            {batesConfig.enabled && !batesTargetResolution.error && batesTargetResolution.indices.length > 0 && (
              <Paper variant="outlined" sx={{ p: 1.25, bgcolor: 'background.default' }} data-testid="bates-live-preview">
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 700, mb: 0.5 }}>
                  Live preview (first stamped page: Page {batesTargetResolution.indices[0] + 1})
                </Typography>
                <Typography variant="caption" className="mono" sx={{ display: 'block', overflowWrap: 'anywhere' }}>
                  {interpolateStampText(
                    batesConfig.zones['bottom-right'] || batesConfig.zones['bottom-center'] || batesConfig.zones['top-right'] || '{bates}',
                    {
                      pageNumber: batesTargetResolution.indices[0] + 1,
                      totalPages: pageConfigs.length,
                      bates: formatBatesNumber(batesConfig.batesPrefix, batesConfig.batesSuffix, batesConfig.batesStart, batesConfig.batesDigits, 0),
                      dateIso: todayIso,
                      filename: workingFile.name,
                    },
                  )}
                </Typography>
              </Paper>
            )}
          </Box>
        </details>

        <details className="pdfy-details" open>
          <summary>Watermark</summary>
          <Box sx={{ px: 1.75, pb: 1.75, pt: 0.5, display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}>
            <FormControlLabel control={<Switch checked={enableWatermark} onChange={event => setEnableWatermark(event.target.checked)} />} label="Watermark" />
            <TextField label="Watermark Text" value={watermarkText} onChange={event => setWatermarkText(event.target.value)} disabled={!enableWatermark} fullWidth />
            <TextField label="Watermark color" type="color" value={watermarkColor} onChange={event => setWatermarkColor(event.target.value)} disabled={!enableWatermark} fullWidth />
            <Box><Typography>Watermark opacity</Typography><Slider aria-label="Watermark opacity" min={0.05} max={0.8} step={0.01} value={watermarkOpacity} onChange={(_, value) => setWatermarkOpacity(value as number)} disabled={!enableWatermark} /></Box>
            <Box><Typography>Watermark size</Typography><Slider aria-label="Watermark size" min={16} max={120} value={watermarkSize} onChange={(_, value) => setWatermarkSize(value as number)} disabled={!enableWatermark} /></Box>
            <FormControlLabel control={<Switch checked={watermarkDiagonal} disabled={!enableWatermark} onChange={event => setWatermarkDiagonal(event.target.checked)} />} label="Diagonal watermark" />
          </Box>
        </details>

        <details className="pdfy-details" open>
          <summary>Simple page numbers</summary>
          <Box sx={{ px: 1.75, pb: 1.75, pt: 0.5, display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}>
            <FormControlLabel control={<Switch checked={enablePageNumbers} onChange={event => setEnablePageNumbers(event.target.checked)} />} label="Page numbers" />
            <TextField select label="Number format" value={pageNumberFormat} onChange={event => setPageNumberFormat(event.target.value as typeof pageNumberFormat)} disabled={!enablePageNumbers}>{[['page-of', 'Page 1 of 3'], ['simple', '1, 2, 3'], ['bates', 'Prefix and number']].map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
            {pageNumberFormat === 'bates' && <TextField label="Number prefix" value={batesPrefix} onChange={event => setBatesPrefix(event.target.value)} />}
            <TextField select label="Number position" value={pageNumberPosition} onChange={event => setPageNumberPosition(event.target.value as typeof pageNumberPosition)} disabled={!enablePageNumbers}>{[['bottom-center', 'Bottom center'], ['bottom-right', 'Bottom right'], ['top-right', 'Top right']].map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
          </Box>
        </details>

        <Divider />
        <Button type="button" variant="outlined" startIcon={<RotateLeft />} onClick={() => setPageConfigs(previous => previous.map(page => ({ ...page, rotation: (page.rotation + 270) % 360 })))}>Rotate all left</Button>
        <Button type="button" variant="outlined" startIcon={<RotateRight />} onClick={() => setPageConfigs(previous => previous.map(page => ({ ...page, rotation: (page.rotation + 90) % 360 })))}>Rotate all right</Button>
        <Button type="button" variant="outlined" onClick={() => { trigger.current = settingsButton.current; setSettings(false); setConfirmReset(true); }}>Reset page order</Button>
      </Box>
    </ToolPanel>
    <Dialog open={active && confirmReset} onClose={() => setConfirmReset(false)} aria-labelledby="organizer-confirm-title" disableRestoreFocus slotProps={{ transition: { onExited: () => (trigger.current?.isConnected ? trigger.current : settingsButton.current)?.focus() } }}>
      <DialogTitle id="organizer-confirm-title">Reset page order?</DialogTitle>
      <DialogContent><DialogContentText>Restore every original source page and remove page copies, blank pages, per-page crop overrides, and rotations. Document crop, watermark, and numbering settings will stay.</DialogContentText></DialogContent>
      <DialogActions><Button autoFocus onClick={() => setConfirmReset(false)}>Cancel</Button><Button color="error" onClick={() => { setPageConfigs(buildInitialPages(sourcePageCount)); setCropTarget('all'); setDeletedUndo(null); setConfirmReset(false); }}>Confirm</Button></DialogActions>
    </Dialog>
  </Box>;
}
