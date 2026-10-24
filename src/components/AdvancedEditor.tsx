import { pdfDocumentOptions } from '../utils/pdfRendering';
import { useState, useRef, useCallback, useEffect, useReducer } from 'react';
import { Box, Button, Typography, Paper, CircularProgress, Snackbar, Alert, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions } from '@mui/material';
import {
  CloudUpload as UploadIcon,
  ArrowBack as BackIcon,
  Add as AddIcon,
  ReceiptLong as InvoiceIcon,
  Description as BriefIcon,
} from '@mui/icons-material';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { Document, Page, pdfjs } from 'react-pdf';
import EditorElementFrame from './editor/EditorElementFrame';
import EditorInteractionBar from './editor/EditorInteractionBar';
import type { InteractionMode } from './editor/EditorInteractionBar';
import { pageGeometry, editorSize, sourceTextGeometry, sourceMaskBounds, textLayout, constrainBounds, updateGeometry } from '../utils/editorGeometry';
import type { PageGeometry } from '../utils/editorGeometry';
import { drawEditorElements } from '../utils/exportEditorElements';
import { reduceEditorHistory } from '../utils/editorHistory';
import type { TextItem, TextStyle } from 'pdfjs-dist/types/src/display/api';
import type { EditorElement, ElementType, StrokePoint } from './editor/types';
import TopNavigationBar, { EditorViewControls } from './editor/TopNavigationBar';
import ToolPanel from './ToolPanel';
import { useEditorPan } from '../hooks/useEditorPan';
import { useVisibleViewport } from '../hooks/useVisibleViewport';
import LeftToolboxPanel from './editor/LeftToolboxPanel';
import RightPropertiesPanel from './editor/RightPropertiesPanel';
import DrawingCanvas from './editor/DrawingCanvas';
import SignatureModal, { type SignatureTabMode } from './editor/SignatureModal';
import { generateSamplePDF, type SampleTemplateId } from '../utils/pdfSamples';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

// A4 at 96 DPI
const A4_W = 794;
const A4_H = 1123;
const DEFAULT_PAGE_GEOMETRY: PageGeometry = { x: 0, y: 0, width: A4_W * .75, height: A4_H * .75, rotation: 0 };

interface Props {
  onBack: () => void;
  active?: boolean;
  initialFile?: File | null;
}

async function prepareEditorFile(source: File | (() => Promise<File>)) {
  const file = typeof source === 'function' ? await source() : source;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await PDFDocument.load(bytes);
  if (!pdf.getPageCount()) throw new Error('Empty PDF');
  return { file, bytes, pageCount: pdf.getPageCount(), sizes: Object.fromEntries(pdf.getPages().map((page, index) => [index, pageGeometry(page)])) };
}

export default function AdvancedEditor({ onBack, initialFile, active = true }: Props) {
  const [fileBlob, setFileBlob] = useState<Blob | null>(null);
  const [originalBytes, setOriginalBytes] = useState<Uint8Array | null>(null);
  const [history, dispatchHistory] = useReducer(reduceEditorHistory<EditorElement>, { entries: [[]], index: 0 });
  const historyIndex = history.index;
  const elements = history.entries[historyIndex];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isChangingPages, setIsChangingPages] = useState(false);
  const pageOperation = useRef(false);
  const [pageDims, setPageDims] = useState({ width: 0, height: 0 });
  const [manualZoom, setManualZoom] = useState<number | null>(null);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth - 24);
  const [panelState, setPanelState] = useState<{ view: 'tools' | 'properties'; open: boolean }>({ view: 'tools', open: false });
  const panel = panelState.open ? panelState.view : null;
  const openPanel = (view: 'tools' | 'properties') => setPanelState({ view, open: true });
  const closePanel = () => setPanelState(previous => ({ ...previous, open: false }));
  const [confirmAction, setConfirmAction] = useState<'clear' | 'page' | null>(null);
  const [isLoading, setIsLoading] = useState(!!initialFile);
  const viewport = useVisibleViewport();
  const [mode, setMode] = useState<InteractionMode>('select');
  const [resizing, setResizing] = useState(false);
  const [returnToCanvas, setReturnToCanvas] = useState(false);
  const [transforming, setTransforming] = useState(false);
  const transformingRef = useRef(false);
  const onGesture = useCallback((value: boolean) => { transformingRef.current = value; setTransforming(value); }, []);
  const pdfInput = useRef<HTMLInputElement>(null);
  const actionsButton = useRef<HTMLButtonElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<Awaited<ReturnType<typeof prepareEditorFile>> | null>(null);
  const zoom = manualZoom ?? Math.max(0.1, Math.min(1, viewportWidth / A4_W));
  const [docTitle, setDocTitle] = useState('Untitled Document');

  // Brush controls
  const isDrawMode = mode === 'draw';
  const [drawColor, setDrawColor] = useState('#0F172A');
  const [drawWidth, setDrawWidth] = useState(3);
  const [drawOpacity, setDrawOpacity] = useState(1);

  // Signature & Stamp modal
  const [sigModalOpen, setSigModalOpen] = useState(false);
  const [sigModalTab, setSigModalTab] = useState<SignatureTabMode>('upload');

  const [toast, setToast] = useState<{ message: string; severity: 'success' | 'error' | 'info' } | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const loadRequest = useRef({ sequence: 0 });

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width;
      if (width > 0) setViewportWidth(width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [fileBlob]);

  // Multi-page states
  const [numPages, setNumPages] = useState(1);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [pdfPageDimsMap, setPdfPageDimsMap] = useState<Record<number, PageGeometry>>({});

  const isEditTextMode = mode === 'text';
  const busy = isSaving || isChangingPages || isLoading || !!pendingFile;
  const controlsBusy = busy || transforming;
  const currentGeometry = pdfPageDimsMap[currentPageIndex] ?? DEFAULT_PAGE_GEOMETRY;
  const pageSize = editorSize(currentGeometry);
  const context = `${currentPageIndex}:${mode}:${zoom}:${viewportWidth}:${viewport.height}:${viewport.top}:${panelState.open}:${busy}:${active}`;
  const panEvents = useEditorPan(active && !busy && mode === 'pan', context, onGesture, () => transformingRef.current);
  const [parsedText, setParsedText] = useState<{ source: Uint8Array; page: number; items: (TextItem & { color?: number[] })[]; styles: Record<string, TextStyle> } | null>(null);
  const currentText = parsedText?.source === originalBytes && parsedText?.page === currentPageIndex ? parsedText : null;
  const pageTextItems = currentText?.items ?? [];
  const pageTextStyles = currentText?.styles ?? {};

  const selectedElement = elements.find(e => e.id === selectedId) ?? null;

  /* ── History Helper ───────────────────────── */
  const pushElements = useCallback((value: EditorElement[] | ((current: EditorElement[]) => EditorElement[])) => dispatchHistory({ type: 'push', value }), []);
  const handleUndo = useCallback(() => { if (transformingRef.current) return; dispatchHistory({ type: 'undo' }); setSelectedId(null); }, []);
  const handleRedo = useCallback(() => { if (transformingRef.current) return; dispatchHistory({ type: 'redo' }); setSelectedId(null); }, []);

  const installFile = useCallback((file: File, bytes: Uint8Array, pageCount: number, sizes: Record<number, PageGeometry>) => {
    setOriginalBytes(bytes); setFileBlob(file); dispatchHistory({ type: 'reset', value: [] });
    setSelectedId(null); setDocTitle(file.name.replace(/\.pdf$/i, '')); setCurrentPageIndex(0);
    setNumPages(pageCount); setPdfPageDimsMap(sizes); setPageDims({ width: 0, height: 0 });
    setManualZoom(null); setMode('select'); setResizing(false); setToast(null);
  }, []);

  const loadFile = useCallback(async (source: File | (() => Promise<File>)) => {
    if (transformingRef.current) return;
    const id = ++loadRequest.current.sequence;
    setIsLoading(true); setToast(null);
    try {
      const prepared = await prepareEditorFile(source);
      if (id === loadRequest.current.sequence) {
        if (fileBlob) setPendingFile(prepared);
        else installFile(prepared.file, prepared.bytes, prepared.pageCount, prepared.sizes);
      }
    } catch {
      if (id === loadRequest.current.sequence) setToast({ message: 'Could not open this PDF. Choose a valid, unprotected document with at least one page.', severity: 'error' });
    } finally {
      if (id === loadRequest.current.sequence) setIsLoading(false);
    }
  }, [installFile, fileBlob]);

  useEffect(() => {
    const request = loadRequest.current;
    const id = ++request.sequence;
    if (initialFile) void prepareEditorFile(initialFile).then(prepared => {
      if (id !== request.sequence) return;
      installFile(prepared.file, prepared.bytes, prepared.pageCount, prepared.sizes);
      setIsLoading(false);
    }).catch(() => {
      if (id !== request.sequence) return;
      setToast({ message: 'Could not open this PDF. Choose another document.', severity: 'error' });
      setIsLoading(false);
    });
    return () => { request.sequence++; };
  }, [initialFile, installFile]);

  const loadSampleTemplate = (templateId: SampleTemplateId) => loadFile(() => generateSamplePDF(templateId));
  const createBlank = () => loadFile(async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([A4_W * (72 / 96), A4_H * (72 / 96)]);
    return new File([await pdf.save() as BlobPart], 'Untitled Document.pdf', { type: 'application/pdf' });
  });

  const placeInView = useCallback((width: number, height: number) => {
    const rect = pageRef.current?.getBoundingClientRect(); const view = viewportRef.current?.getBoundingClientRect();
    const size = editorSize(pdfPageDimsMap[currentPageIndex] ?? DEFAULT_PAGE_GEOMETRY);
    let center = { x: size.width / 2, y: size.height / 2 };
    if (rect && view) center = { x: ((Math.max(rect.left, view.left) + Math.min(rect.right, view.right)) / 2 - rect.left) * size.width / rect.width, y: ((Math.max(rect.top, view.top) + Math.min(rect.bottom, view.bottom)) / 2 - rect.top) * size.height / rect.height };
    const ratio = Math.min(1, size.width / width, size.height / height);
    return constrainBounds({ x: center.x - width * ratio / 2, y: center.y - height * ratio / 2, width: width * ratio, height: height * ratio }, size);
  }, [pdfPageDimsMap, currentPageIndex]);

  const selectItem = (id: string) => { setSelectedId(id); setResizing(false); };
  const changeMode = (next: InteractionMode) => { if (transformingRef.current) return; setMode(next); setResizing(false); };
  const addElement = useCallback((type: ElementType) => {
    if (!fileBlob || pageOperation.current || isSaving || isLoading || transformingRef.current) return;
    if (type === 'image') { imageInput.current?.click(); return; }
    const width = type === 'text' ? 220 : type === 'highlight' || type === 'redact' ? 200 : 120;
    const height = type === 'text' ? 40 : type === 'highlight' || type === 'redact' ? 28 : 120;
    const element: EditorElement = {
      id: crypto.randomUUID(), type, ...placeInView(width, height), pageIndex: currentPageIndex,
      content: type === 'text' ? 'Your text' : undefined, fontSize: 16, fontFamily: 'Helvetica', fontWeight: 400, textAlign: 'left',
      fillColor: type === 'highlight' ? '#FACC15' : type === 'redact' ? '#000000' : '#6366F1', strokeColor: '#0F172A',
      strokeWidth: type === 'highlight' || type === 'redact' ? 0 : 2, opacity: type === 'highlight' ? .4 : type === 'rect' || type === 'circle' ? .35 : 1,
    };
    pushElements(previous => [...previous, element]); setSelectedId(element.id); setMode('select'); setResizing(false);
  }, [fileBlob, currentPageIndex, pushElements, isSaving, isLoading, placeInView]);

  const insertImage = async (file: File) => {
    if (busy || transformingRef.current) return;
    const request = loadRequest.current.sequence;
    setIsLoading(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const png = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
      const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      if (!png && !jpg) throw new Error('Choose a PNG or JPEG image.');
      const src = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Could not read this image.'));
        reader.readAsDataURL(new Blob([bytes], { type: png ? 'image/png' : 'image/jpeg' }));
      });
      const image = new Image(); image.src = src; await image.decode();
      if (request !== loadRequest.current.sequence) return;
      const scale = Math.min(220 / image.naturalWidth, 180 / image.naturalHeight, 1);
      const element: EditorElement = { id: crypto.randomUUID(), type: 'image', label: file.name, src, pageIndex: currentPageIndex, ...placeInView(image.naturalWidth * scale, image.naturalHeight * scale), opacity: 1 };
      pushElements(previous => [...previous, element]); selectItem(element.id); setMode('select');
    } catch (error) { if (request === loadRequest.current.sequence) setToast({ message: error instanceof Error ? error.message : 'Could not open this image.', severity: 'error' }); }
    finally { if (request === loadRequest.current.sequence) setIsLoading(false); }
  };

  const handleInsertSignatureImage = useCallback((src: string, width: number, height: number, label: string) => {
    const element: EditorElement = { id: crypto.randomUUID(), type: 'image', label, ...placeInView(width, height), pageIndex: currentPageIndex, src, opacity: 1 };
    pushElements(previous => [...previous, element]); setSelectedId(element.id); setMode('select'); setResizing(false);
    setToast({ message: `Placed ${label}. Drag to move it or choose Edit.`, severity: 'success' });
  }, [currentPageIndex, pushElements, placeInView]);

  /* ── Drawing ─────────────────────────────── */
  const handleStrokeComplete = useCallback(
    (points: StrokePoint[]) => {
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const p of points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }

      const padding = (drawWidth / 2 + 2) * zoom;
      minX -= padding;
      minY -= padding;
      maxX += padding;
      maxY += padding;

      const size = editorSize(pdfPageDimsMap[currentPageIndex] ?? DEFAULT_PAGE_GEOMETRY);
      const bounds = constrainBounds({ x: minX / zoom, y: minY / zoom, width: (maxX - minX) / zoom || 1, height: (maxY - minY) / zoom || 1 }, size);
      const relPoints = points.map(point => ({ x: point.x / zoom - bounds.x, y: point.y / zoom - bounds.y }));

      const el: EditorElement = {
        id: crypto.randomUUID(),
        type: 'draw',
        ...bounds,
        pageIndex: currentPageIndex,
        points: relPoints,
        strokeColor: drawColor,
        strokeWidth: drawWidth,
        opacity: drawOpacity,
      };
      pushElements(prev => [...prev, el]);
    },
    [drawColor, drawWidth, drawOpacity, currentPageIndex, zoom, pushElements, pdfPageDimsMap]
  );

  const deleteElement = useCallback(
    (id: string) => {
      if (transformingRef.current) return;
      pushElements(prev => prev.filter(e => e.id !== id));
      if (selectedId === id) setSelectedId(null);
    },
    [pushElements, selectedId]
  );

  const duplicateElement = useCallback(
    (id: string) => {
      if (transformingRef.current) return;
      const target = elements.find(e => e.id === id);
      if (!target) return;
      const copy: EditorElement = {
        ...target,
        id: crypto.randomUUID(),
        ...constrainBounds({ ...target, x: target.x + 20, y: target.y + 20 }, editorSize(pdfPageDimsMap[target.pageIndex ?? 0] ?? currentGeometry), target.type === 'edit-text' ? .1 : 10),
      };
      pushElements(prev => [...prev, copy]);
      setSelectedId(copy.id);
    },
    [elements, pushElements, pdfPageDimsMap, currentGeometry]
  );

  const updateElement = useCallback(
    (id: string, patch: Partial<EditorElement>) => {
      if (transformingRef.current) return;
      pushElements(prev => prev.map(element => element.id === id ? updateGeometry(element, patch, editorSize(pdfPageDimsMap[element.pageIndex ?? 0] ?? DEFAULT_PAGE_GEOMETRY)) : element));
    },
    [pushElements, pdfPageDimsMap]
  );

  const editPDFText = (item: TextItem & { color?: number[] }) => {
    if (pageOperation.current || isSaving || isLoading || transformingRef.current) return;
    const existing = elements.find(element => element.type === 'edit-text' && (element.pageIndex ?? 0) === currentPageIndex && element.originalPdfX === item.transform[4] && element.originalPdfY === item.transform[5]);
    if (existing) { setSelectedId(existing.id); setMode('select'); setResizing(false); openPanel('properties'); return; }
    const geometry = sourceTextGeometry(item, currentGeometry);
    if (!geometry) { setToast({ message: 'This text has a rotated or skewed layout that cannot be edited directly. Use Text Block to add new text.', severity: 'info' }); return; }
    const height = Math.abs(item.height) || Math.hypot(item.transform[2], item.transform[3]);
    const originalFamily = pageTextStyles[item.fontName]?.fontFamily?.toLowerCase() ?? '';
    const family = originalFamily.includes('mono') || originalFamily.includes('courier') ? 'Courier' : originalFamily.includes('times') || (originalFamily.includes('serif') && !originalFamily.includes('sans')) ? 'Times Roman' : 'Helvetica';
    const element: EditorElement = {
      id: crypto.randomUUID(), type: 'edit-text', pageIndex: currentPageIndex,
      ...geometry, ...constrainBounds(geometry, pageSize, .1),
      content: item.str, originalText: item.str, originalPdfX: item.transform[4], originalPdfY: item.transform[5], originalPdfW: item.width, originalPdfH: height,
      fontFamily: family, fontWeight: originalFamily.includes('bold') ? 700 : 400,
      fontStyle: /italic|oblique/i.test(originalFamily) ? 'italic' : 'normal', fillColor: '#FFFFFF',
      strokeColor: '#' + (item.color ?? [0, 0, 0]).map(color => Math.max(0, Math.min(255, Math.round(color))).toString(16).padStart(2, '0')).join(''),
    };
    pushElements(previous => [...previous, element]); setSelectedId(element.id); setMode('select'); setResizing(false); openPanel('properties');
  };

  /* ── Keyboard Shortcuts ───────────────────── */
  useEffect(() => {
    if (!active || busy) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (transformingRef.current) return;
      const target = e.target;
      if (!(target instanceof Element) || !editorRef.current?.contains(target)) return;
      if (target.closest('input, textarea, select, button, a[href], [contenteditable]:not([contenteditable="false"]), [role="dialog"], [role="menu"], [role="slider"], [role="listbox"]')) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }
      if (mode !== 'select') return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd' && selectedId) {
        e.preventDefault();
        duplicateElement(selectedId);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        deleteElement(selectedId);
        return;
      }
      if (selectedId && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const el = elements.find(item => item.id === selectedId);
        if (!el) return;
        if (e.key === 'ArrowUp') updateElement(selectedId, { y: Math.max(0, el.y - step) });
        if (e.key === 'ArrowDown') updateElement(selectedId, { y: el.y + step });
        if (e.key === 'ArrowLeft') updateElement(selectedId, { x: Math.max(0, el.x - step) });
        if (e.key === 'ArrowRight') updateElement(selectedId, { x: el.x + step });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, busy, mode, selectedId, elements, handleUndo, handleRedo, duplicateElement, deleteElement, updateElement]);

  /* ── Page Navigation & Manipulation ──────── */
  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  const handlePrevPage = () => {
    if (transformingRef.current) return;
    if (currentPageIndex > 0) {
      setCurrentPageIndex(currentPageIndex - 1);
      setSelectedId(null);
    }
  };

  const handleNextPage = () => {
    if (transformingRef.current) return;
    if (currentPageIndex < numPages - 1) {
      setCurrentPageIndex(currentPageIndex + 1);
      setSelectedId(null);
    }
  };

  const addPage = async () => {
    if (!originalBytes || pageOperation.current || isSaving || isLoading || transformingRef.current) return;
    pageOperation.current = true; setIsChangingPages(true);
    try {
      const doc = await PDFDocument.load(originalBytes);
      doc.addPage([A4_W * (72 / 96), A4_H * (72 / 96)]);
      const bytes = await doc.save();
      setOriginalBytes(bytes);
      setFileBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
      setPdfPageDimsMap(Object.fromEntries(doc.getPages().map((page, index) => [index, pageGeometry(page)])));
      const nextPagesCount = doc.getPageCount();
      setNumPages(nextPagesCount);
      setCurrentPageIndex(nextPagesCount - 1);
      setSelectedId(null);
      setToast({ message: `Added Page ${nextPagesCount}`, severity: 'info' });
    } catch (err) {
      console.error(err);
      setToast({ message: 'Failed to add page.', severity: 'error' });
    } finally { pageOperation.current = false; setIsChangingPages(false); }
  };

  const deletePage = async () => {
    if (!originalBytes || numPages <= 1 || pageOperation.current || isSaving || isLoading || transformingRef.current) return;
    pageOperation.current = true; setIsChangingPages(true);
    try {
      const doc = await PDFDocument.load(originalBytes);
      doc.removePage(currentPageIndex);
      const bytes = await doc.save();
      setOriginalBytes(bytes);
      setFileBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
      setPdfPageDimsMap(Object.fromEntries(doc.getPages().map((page, index) => [index, pageGeometry(page)])));

      const remaining = elements
        .filter(element => (element.pageIndex ?? 0) !== currentPageIndex)
        .map(element => (element.pageIndex ?? 0) > currentPageIndex ? { ...element, pageIndex: (element.pageIndex ?? 0) - 1 } : element);
      dispatchHistory({ type: 'reset', value: remaining });

      const newNumPages = doc.getPageCount();
      setNumPages(newNumPages);
      setCurrentPageIndex(prev => Math.min(prev, newNumPages - 1));
      setSelectedId(null);
      setToast({ message: 'Removed current page from document.', severity: 'info' });
    } catch (err) {
      console.error(err);
      setToast({ message: 'Failed to delete page.', severity: 'error' });
    } finally { pageOperation.current = false; setIsChangingPages(false); }
  };

  useEffect(() => {
    if (!originalBytes) return;
    let cancelled = false;
    const task = pdfjs.getDocument({ data: originalBytes.slice(), ...pdfDocumentOptions });
    void task.promise.then(async pdf => {
      const page = await pdf.getPage(currentPageIndex + 1);
      const content = await page.getTextContent();
      if (!cancelled) setParsedText({ source: originalBytes, page: currentPageIndex, items: content.items.filter((item): item is TextItem => 'str' in item), styles: content.styles });
    }).catch(() => { if (!cancelled) setParsedText(null); });
    return () => { cancelled = true; void task.destroy(); };
  }, [originalBytes, currentPageIndex]);

  /* ── Export ───────────────────────────────── */
  const resolveFont = async (doc: PDFDocument, el: EditorElement) => {
    let fontEnum: StandardFonts;
    const familyLower = (el.fontFamily || '').toLowerCase();
    const isBold = el.fontWeight === 'bold' || el.fontWeight === 700 || familyLower.includes('bold');
    const isItalic = el.fontStyle === 'italic' || familyLower.includes('italic') || familyLower.includes('oblique');

    if (familyLower.includes('times') || (familyLower.includes('serif') && !familyLower.includes('sans'))) {
      if (isBold && isItalic) fontEnum = StandardFonts.TimesRomanBoldItalic;
      else if (isBold) fontEnum = StandardFonts.TimesRomanBold;
      else if (isItalic) fontEnum = StandardFonts.TimesRomanItalic;
      else fontEnum = StandardFonts.TimesRoman;
    } else if (familyLower.includes('courier') || familyLower.includes('mono')) {
      if (isBold && isItalic) fontEnum = StandardFonts.CourierBoldOblique;
      else if (isBold) fontEnum = StandardFonts.CourierBold;
      else if (isItalic) fontEnum = StandardFonts.CourierOblique;
      else fontEnum = StandardFonts.Courier;
    } else {
      if (isBold && isItalic) fontEnum = StandardFonts.HelveticaBoldOblique;
      else if (isBold) fontEnum = StandardFonts.HelveticaBold;
      else if (isItalic) fontEnum = StandardFonts.HelveticaOblique;
      else fontEnum = StandardFonts.Helvetica;
    }
    return await doc.embedFont(fontEnum);
  };

  const exportPDF = async () => {
    if (!originalBytes || pageOperation.current || isLoading || transformingRef.current) return;
    setIsSaving(true);
    try {
      const doc = await PDFDocument.load(originalBytes);
      await drawEditorElements(doc, elements, resolveFont);

      const saved = await doc.save();
      const url = URL.createObjectURL(new Blob([saved as BlobPart], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${docTitle || 'document'}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 200);
      setToast({ message: `Exported ${docTitle || 'document'}.pdf`, severity: 'success' });
    } catch (err) {
      console.error(err);
      const message = err instanceof Error && err.message.includes('cannot encode') ? 'The selected font cannot export one of these characters. Edit the text and try again.' : 'Could not export this PDF. Your edits are still here; try again.';
      setToast({ message, severity: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  /* ── Splash (no file loaded) ─────────────── */
  if (!fileBlob) {
    return (
      <Box
        sx={{
          width: '100%',
          height: viewport.height,
          position: 'fixed', top: viewport.top, left: 0, right: 0,
          overflow: 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          flexDirection: 'column',
          bgcolor: 'background.default',
          p: { xs: 2, sm: 3 },
        }}
      >
        <Paper
          sx={{
            p: { xs: 2.5, sm: 4 },
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2.5,
            border: 1, borderColor: 'divider',
            maxWidth: 520,
            flexShrink: 0,
            width: '100%',
          }}
        >
          <Typography variant="h1" sx={{ fontSize: 26 }}>
            Edit your PDF
          </Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary', textAlign: 'center' }}>
            Open a PDF or start a blank page. Add text, images, shapes, drawings, and signatures.
          </Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: '1fr 1fr' }, gap: 1.5, width: '100%', mt: 1 }}>
            <Button
              variant="contained"
              size="large"
              startIcon={<AddIcon />}
              onClick={createBlank} disabled={isLoading}
              sx={{ py: 1.4, whiteSpace: 'nowrap' }}
            >
              New blank PDF
            </Button>
            <Button
              variant="outlined"
              size="large"
              component="label" disabled={isLoading}
              startIcon={<UploadIcon />}
              sx={{ py: 1.4 }}
            >
              Open PDF
              <input
                type="file"
                hidden
                accept="application/pdf"
                aria-label="PDF to edit" disabled={isLoading} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void loadFile(file); }}
              />
            </Button>
          </Box>

          <Box sx={{ width: '100%', pt: 1 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1, textAlign: 'center' }}>
              Or launch immediately with a sample template:
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: '1fr 1fr' }, gap: 1.5 }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<InvoiceIcon />}
                disabled={isLoading} onClick={() => loadSampleTemplate('service-invoice')}
                sx={{ py: 1, whiteSpace: 'nowrap' }}
              >
                Sample Invoice
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<BriefIcon />}
                disabled={isLoading} onClick={() => loadSampleTemplate('executive-brief')}
                sx={{ py: 1, whiteSpace: 'nowrap' }}
              >
                Sample brief (3 pages)
              </Button>
            </Box>
          </Box>

          {isLoading && <CircularProgress aria-label="Preparing PDF" />}
          {toast && <Alert severity={toast.severity}>{toast.message}</Alert>}
          <Button startIcon={<BackIcon />} variant="text" size="small" onClick={onBack} sx={{ color: 'text.secondary', mt: 1 }}>
            Return to workspace
          </Button>
        </Paper>
      </Box>
    );
  }

  /* ── Full Editor Layout ──────────────────── */
  const canvasWidth = A4_W * zoom;
  const canvasHeight = pageSize.height * zoom;

  return (
    <Box ref={editorRef} sx={{ width: '100%', height: viewport.height, position: 'fixed', top: viewport.top, left: 0, right: 0, display: 'flex', flexDirection: 'column', bgcolor: 'background.default', color: 'text.primary', overflow: 'hidden' }}>
      <input ref={pdfInput} type="file" accept="application/pdf" aria-label="Replacement PDF for Edit" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void loadFile(file); }} />
      <input ref={imageInput} type="file" accept="image/png,image/jpeg" aria-label="Image to insert" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void insertImage(file); }} />
      <h1 className="sr-only">Edit PDF</h1>
      {/* Top Bar */}
      <TopNavigationBar actionsRef={actionsButton}
        docTitle={docTitle}
        onTitleChange={setDocTitle}
        panel={panel}
        onPanel={next => { if (panel === next) closePanel(); else openPanel(next); }}
        onExport={exportPDF}
        onClear={() => setConfirmAction('clear')}
        onBack={() => { if (!transformingRef.current) onBack(); }}
        busy={controlsBusy} exporting={isSaving}
        onOpenPDF={() => pdfInput.current?.click()} onNewPDF={createBlank}
        numPages={numPages}
        onAddPage={addPage}
        onDeletePage={() => setConfirmAction('page')}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.entries.length - 1}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onOpenSignature={() => {
          setSigModalTab('draw');
          setSigModalOpen(true);
        }}
        onOpenStamp={() => {
          setSigModalTab('stamp');
          setSigModalOpen(true);
        }}
      />

      <EditorInteractionBar status={isChangingPages ? 'Updating pages…' : isLoading ? 'Opening file…' : isSaving ? 'Preparing download…' : undefined} mode={mode} selected={selectedElement} resizing={resizing} disabled={controlsBusy} onMode={changeMode} onResize={() => setResizing(value => !value)} onEdit={() => openPanel('properties')} onDuplicate={() => { if (selectedId) duplicateElement(selectedId); }} onDelete={() => { if (selectedId) deleteElement(selectedId); }} />
      <Typography id="editor-canvas-help" className="sr-only">Drag an item to move it. Choose Resize for a corner handle. Arrow keys move the selected item; Shift uses larger steps. Escape cancels an active gesture. Pan lets you scroll over items.</Typography>
      {/* Document viewport */}
      <Box sx={{ display: 'flex', flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
        {/* Canvas Viewport */}
        <Box
          ref={viewportRef}
          {...panEvents}
          inert={busy}
          role="region" aria-label="Editor document viewport"
          onClick={() => { if (mode === 'select') { setSelectedId(null); setResizing(false); } }}
          sx={{
            flex: 1,
            overflow: 'auto',
            display: 'flex',
            minWidth: 0, minHeight: 0, overscrollBehavior: 'contain', pointerEvents: busy ? 'none' : 'auto',
            p: { xs: 1.5, sm: 3 },
            bgcolor: 'action.hover', touchAction: 'pan-x pan-y pinch-zoom', cursor: mode === 'pan' ? transforming ? 'grabbing' : 'grab' : 'default',
          }}
        >
          <Document
            options={pdfDocumentOptions}
            file={fileBlob}
            className="editor-document"
            onLoadSuccess={onDocumentLoadSuccess}
            loading={<CircularProgress sx={{ color: '#6366F1' }} />}
          >
            <Box
              ref={pageRef}
              role="region"
              aria-label="PDF editing canvas" aria-describedby="editor-canvas-help"
              tabIndex={0}
              onPointerDownCapture={event => {
                if (event.target instanceof Element && !event.target.closest('input, textarea, select, button, a[href], [contenteditable]:not([contenteditable="false"])')) {
                  pageRef.current?.focus({ preventScroll: true });
                }
              }}
              onClick={() => { if (mode === 'select') { setSelectedId(null); setResizing(false); } }}
              sx={{
                position: 'relative',
                mx: 'auto', flexShrink: 0,
                width: canvasWidth,
                height: canvasHeight,
                boxShadow: '0 12px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.3)',
                borderRadius: '4px',
                overflow: 'hidden',
                bgcolor: '#FFFFFF',
              }}
            >
              {/* PDF Page */}
              <Page
                pageNumber={currentPageIndex + 1}
                width={canvasWidth}
                onRenderSuccess={(data) => {
                  setPageDims({ width: data.width, height: data.height });

                }}
                renderTextLayer={false}
                renderAnnotationLayer={false}
              />

              {/* Drawing Canvas Overlay */}
              {pageDims.width > 0 && (
                <DrawingCanvas
                  key={`draw:${context}`}
                  width={canvasWidth}
                  height={canvasHeight}
                  isActive={isDrawMode && active && !busy}
                  onGesture={onGesture}
                  strokeColor={drawColor}
                  strokeWidth={drawWidth * zoom}
                  opacity={drawOpacity}
                  onStrokeComplete={handleStrokeComplete}
                />
              )}

              {/* Interactive PDF Text Overlay (Edit Mode) */}
              {isEditTextMode && pageDims.width > 0 && (
                <Box
                  sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    zIndex: 15,
                    pointerEvents: 'auto',
                  }}
                >
                  {pageTextItems
                    .filter(item => item.str && item.str.trim())
                    .map((item, idx) => {
                      const tx = item.transform[4];
                      const ty = item.transform[5];
                      const geometry = sourceTextGeometry(item, currentGeometry);
                      if (!geometry) return null;
                      const left = geometry.x * zoom; const top = geometry.y * zoom;
                      const width = geometry.width * zoom; const height = geometry.height * zoom;

                      const isEdited = elements.some(
                        el =>
                          el.type === 'edit-text' &&
                          (el.pageIndex ?? 0) === currentPageIndex &&
                          Math.abs((el.originalPdfX ?? 0) - tx) < 0.1 &&
                          Math.abs((el.originalPdfY ?? 0) - ty) < 0.1
                      );

                      if (isEdited) return null;

                      return <Box component="button" type="button" key={idx} aria-label={`Edit text: ${item.str.slice(0, 80)}`} onClick={event => { event.stopPropagation(); editPDFText(item); }} sx={{ position: 'absolute', left, top, width: Math.max(width, 24), height: Math.max(height, 24), border: '1px dashed #6366F1', bgcolor: 'rgba(99,102,241,0.08)', cursor: 'text', p: 0 }} />;
                    })}
                </Box>
              )}

              {elements.filter(element => (element.pageIndex ?? 0) === currentPageIndex).map(element => {
                const mask = sourceMaskBounds(element, currentGeometry);
                return mask && <Box key={`mask-${element.id}`} className="editor-source-mask" aria-hidden="true" style={{ left: mask.x * zoom, top: mask.y * zoom, width: mask.width * zoom, height: mask.height * zoom, backgroundColor: element.fillColor || '#FFFFFF' }} sx={{ position: 'absolute', zIndex: 8, pointerEvents: 'none' }} />;
              })}

              {/* Draggable Elements */}
              {pageDims.width > 0 &&
                elements
                  .filter(el => (el.pageIndex ?? 0) === currentPageIndex)
                  .map(el => {
                    const isShape = el.type === 'rect' || el.type === 'circle' || el.type === 'highlight' || el.type === 'redact';
                    const fillHex =
                      el.fillColor ||
                      (el.type === 'highlight' ? '#FACC15' : el.type === 'redact' ? '#000000' : '#6366F1');
                    const op = el.type === 'redact' ? 1 : el.opacity ?? (el.type === 'highlight' ? 0.4 : 0.35);

                    return (
                      <EditorElementFrame
                        key={`${el.id}:${context}`} itemId={el.id}
                        bounds={el} pageSize={pageSize} zoom={zoom} selected={selectedId === el.id} enabled={active && !busy && mode === 'select'} label={el.label || (el.type === 'edit-text' ? 'PDF text' : el.type === 'rect' ? 'rectangle' : el.type === 'draw' ? 'drawing' : el.type === 'redact' ? 'cover' : el.type)}
                        showResize={resizing} preserveRatio={el.type === 'image' && el.lockAspectRatio !== false} pageRef={pageRef}
                        onSelect={() => setSelectedId(el.id)} onEdit={() => openPanel('properties')} onCommit={bounds => updateElement(el.id, bounds)} onGesture={onGesture} isGestureActive={() => transformingRef.current}
                      >{displayBounds => {
                        const layout = textLayout(displayBounds, el.textRotation);
                        return <Box sx={{ width: '100%', height: '100%', borderRadius: el.type === 'circle' ? '50%' : '2px', bgcolor: isShape ? `${fillHex}${Math.round(op * 255).toString(16).padStart(2, '0')}` : 'transparent', mixBlendMode: el.type === 'highlight' ? 'multiply' : 'normal', overflow: 'hidden' }}>
                        {(el.type === 'text' || el.type === 'edit-text') && (
                          <textarea
                            aria-label="Annotation text" readOnly tabIndex={-1}
                            value={el.content}
                            onChange={e => updateElement(el.id, { content: e.target.value })}
                            style={{
                              position: 'absolute', left: layout.x * zoom, top: layout.y * zoom, width: layout.width * zoom, height: layout.height * zoom, transform: `rotate(${layout.rotation}deg)`, transformOrigin: 'top left',
                              background: 'transparent',
                              border: 'none',
                              color: el.strokeColor || '#0F172A',
                              opacity: el.opacity ?? 1,
                              resize: 'none',
                              outline: 'none',
                              fontFamily: el.fontFamily === 'Times Roman' ? '"Times New Roman", serif' : el.fontFamily === 'Courier' ? '"Courier New", monospace' : 'Arial, Helvetica, sans-serif',
                              fontSize: `${(el.fontSize ?? 16) * zoom}px`,
                              fontWeight: el.fontWeight ?? 400,
                              fontStyle: el.fontStyle ?? 'normal',
                              textAlign: el.textAlign ?? 'left',
                              padding: el.type === 'edit-text' ? 0 : `${4 * zoom}px`, lineHeight: 1.2, tabSize: 4, overflowWrap: 'break-word',
                              overflow: 'hidden',
                            }}
                          />
                        )}
                        {el.type === 'image' && el.src && (
                          <img
                            src={el.src}
                            alt={el.label || 'Embedded asset'}
                            referrerPolicy="no-referrer"
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'fill',
                              pointerEvents: 'none',
                              opacity: el.opacity ?? 1,
                            }}
                          />
                        )}
                        {el.type === 'draw' && el.points && el.points.length > 0 && (
                          <svg viewBox={`0 0 ${el.width * zoom} ${el.height * zoom}`} preserveAspectRatio="none"
                            width="100%"
                            height="100%"
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              overflow: 'visible',
                              pointerEvents: 'none',
                            }}
                          >
                            <path
                              d={
                                `M ${el.points[0].x * zoom} ${el.points[0].y * zoom} ` +
                                el.points
                                  .slice(1)
                                  .map((p, i, arr) => {
                                    if (i === 0) return '';
                                    const prev = arr[i - 1];
                                    const midX = ((prev.x + p.x) / 2) * zoom;
                                    const midY = ((prev.y + p.y) / 2) * zoom;
                                    return `Q ${prev.x * zoom} ${prev.y * zoom} ${midX} ${midY} `;
                                  })
                                  .join('') +
                                (el.points.length > 1
                                  ? `L ${el.points[el.points.length - 1].x * zoom} ${
                                      el.points[el.points.length - 1].y * zoom
                                    }`
                                  : '')
                              }
                              fill="none" vectorEffect="non-scaling-stroke"
                              stroke={el.strokeColor || '#0F172A'}
                              strokeWidth={(el.strokeWidth || 3) * zoom}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              opacity={el.opacity ?? 1}
                            />
                          </svg>
                        )}
                        </Box>;
                      }}</EditorElementFrame>
                    );
                  })}
            </Box>
          </Document>
        </Box>

      </Box>
      <EditorViewControls busy={controlsBusy} zoom={zoom} onZoomIn={() => { if (!transformingRef.current) setManualZoom(Math.min(3, zoom + 0.1)); }} onZoomOut={() => { if (!transformingRef.current) setManualZoom(Math.max(0.1, zoom - 0.1)); }} onFitWidth={() => { if (!transformingRef.current) setManualZoom(null); }} currentPageIndex={currentPageIndex} numPages={numPages} onPrevPage={handlePrevPage} onNextPage={handleNextPage} />
      <ToolPanel open={active && !!panel} title={panelState.view === 'tools' ? 'Editor tools' : 'Item properties'} onClose={() => closePanel()} disableRestoreFocus={returnToCanvas} onClosed={() => {
        if (returnToCanvas && active) {
          if (selectedId) document.getElementById(`editor-item-${selectedId}`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          pageRef.current?.focus({ preventScroll: true });
        }
        setReturnToCanvas(false);
      }}>
        {panelState.view === 'tools' ? (<LeftToolboxPanel
          elements={elements.filter(el => (el.pageIndex ?? 0) === currentPageIndex)}
          selectedId={selectedId}
          isDrawMode={isDrawMode}
          isEditTextMode={isEditTextMode}
          drawColor={drawColor}
          drawWidth={drawWidth}
          drawOpacity={drawOpacity}
          pdfText={pageTextItems.map((item, index) => ({ index, text: item.str })).filter(item => item.text.trim())}
          onEditPDFText={index => editPDFText(pageTextItems[index])}
          onChangeDrawColor={setDrawColor}
          onChangeDrawWidth={setDrawWidth}
          onChangeDrawOpacity={setDrawOpacity}
          onSelect={id => { selectItem(id); setMode('select'); setReturnToCanvas(true); closePanel(); }}
          onDelete={deleteElement}
          onDuplicate={duplicateElement}
          onAdd={type => { addElement(type); setReturnToCanvas(true); closePanel(); }}
          onOpenSignature={() => {
            closePanel();
            setSigModalTab('draw');
            setSigModalOpen(true);
          }}
          onOpenStamp={() => { closePanel(); setSigModalTab('stamp'); setSigModalOpen(true); }}
          onToggleDrawMode={() => { changeMode(isDrawMode ? 'select' : 'draw'); closePanel(); }}
          onToggleEditTextMode={() => changeMode(isEditTextMode ? 'select' : 'text')}
        />) : (<RightPropertiesPanel
          element={selectedElement}
          onUpdate={updateElement}
          onDelete={deleteElement}
          onDuplicate={duplicateElement}
        />)}
      </ToolPanel>
      <Dialog open={active && !!pendingFile} onClose={() => setPendingFile(null)} aria-labelledby="editor-replacement-title" aria-describedby="editor-replacement-description" slotProps={{ transition: { onExited: () => { if (active) actionsButton.current?.focus({ preventScroll: true }); } } }}>
        <DialogTitle id="editor-replacement-title">Replace the Edit document?</DialogTitle>
        <DialogContent><DialogContentText id="editor-replacement-description">Open {pendingFile?.file.name}? This replaces the current PDF and its edits. Download your work first if you want to keep it.</DialogContentText></DialogContent>
        <DialogActions><Button autoFocus onClick={() => setPendingFile(null)}>Cancel</Button><Button variant="contained" onClick={() => { if (pendingFile) { installFile(pendingFile.file, pendingFile.bytes, pendingFile.pageCount, pendingFile.sizes); setPendingFile(null); closePanel(); } }}>Replace document</Button></DialogActions>
      </Dialog>
      <Dialog open={active && !!confirmAction} onClose={() => setConfirmAction(null)} aria-labelledby="editor-confirm-title">
        <DialogTitle id="editor-confirm-title">{confirmAction === 'page' ? 'Delete this page?' : 'Clear all annotations?'}</DialogTitle>
        <DialogContent><DialogContentText>{confirmAction === 'page' ? 'This removes the current PDF page and its annotations. Page deletion cannot be undone. Download a copy first if you want to keep it.' : 'This removes all annotations from every page. You can undo this change.'}</DialogContentText></DialogContent>
        <DialogActions><Button autoFocus onClick={() => setConfirmAction(null)}>Cancel</Button><Button color="error" onClick={() => { if (confirmAction === 'page') void deletePage(); else { pushElements([]); setSelectedId(null); } setConfirmAction(null); }}>Confirm</Button></DialogActions>
      </Dialog>

      {/* Signature & Stamp Studio Modal */}
      <SignatureModal
        open={sigModalOpen && active}
        initialTab={sigModalTab}
        onClose={() => setSigModalOpen(false)}
        onInsertImage={handleInsertSignatureImage}
      />

      <Snackbar
        open={!!toast}
        autoHideDuration={3200}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        sx={{ bottom: 'calc(64px + env(safe-area-inset-bottom))' }}
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

/* ── Resize Handle Styles ──────────────────── */
