import { pdfDocumentOptions } from '../utils/pdfRendering';
import { useState, useRef, useCallback, useEffect } from 'react';
import { Box, Button, Typography, Paper, CircularProgress, Snackbar, Alert } from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Add as AddIcon,
  ReceiptLong as InvoiceIcon,
  Description as BriefIcon,
} from '@mui/icons-material';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { Document, Page, pdfjs } from 'react-pdf';
import { Rnd } from 'react-rnd';
import type { EditorElement, ElementType, StrokePoint } from './editor/types';
import TopNavigationBar from './editor/TopNavigationBar';
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

const CUSTOM_FONTS: Record<string, string> = {
  'Roboto': 'https://raw.githubusercontent.com/google/fonts/main/apache/roboto/Roboto-Regular.ttf',
  'Open Sans': 'https://raw.githubusercontent.com/google/fonts/main/ofl/opensans/OpenSans-Regular.ttf',
  'Lato': 'https://raw.githubusercontent.com/google/fonts/main/ofl/lato/Lato-Regular.ttf',
  'Montserrat': 'https://raw.githubusercontent.com/google/fonts/main/ofl/montserrat/static/Montserrat-Regular.ttf',
};

const fontCache: Record<string, ArrayBuffer> = {};

interface Props {
  onBack: () => void;
  initialFile?: File | null;
}

export default function AdvancedEditor({ onBack, initialFile }: Props) {
  const [fileBlob, setFileBlob] = useState<Blob | null>(null);
  const [originalBytes, setOriginalBytes] = useState<Uint8Array | null>(null);
  const [elements, setElements] = useState<EditorElement[]>([]);
  const [history, setHistory] = useState<EditorElement[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pageDims, setPageDims] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [docTitle, setDocTitle] = useState('Untitled Document');

  // Brush controls
  const [isDrawMode, setIsDrawMode] = useState(false);
  const [drawColor, setDrawColor] = useState('#0F172A');
  const [drawWidth, setDrawWidth] = useState(3);
  const [drawOpacity, setDrawOpacity] = useState(1);

  // Signature & Stamp modal
  const [sigModalOpen, setSigModalOpen] = useState(false);
  const [sigModalTab, setSigModalTab] = useState<SignatureTabMode>('upload');

  const [toast, setToast] = useState<{ message: string; severity: 'success' | 'error' | 'info' } | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  // Multi-page states
  const [numPages, setNumPages] = useState(1);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [pdfPageDimsMap, setPdfPageDimsMap] = useState<Record<number, { width: number; height: number }>>({});

  const [isEditTextMode, setIsEditTextMode] = useState(false);
  const [pageTextItems, setPageTextItems] = useState<any[]>([]);
  const [pageTextStyles, setPageTextStyles] = useState<Record<string, any>>({});
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingInputValue, setEditingInputValue] = useState('');

  const selectedElement = elements.find(e => e.id === selectedId) ?? null;

  /* ── History Helper ───────────────────────── */
  const pushElements = useCallback(
    (updater: EditorElement[] | ((prev: EditorElement[]) => EditorElement[])) => {
      setElements(prev => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        setHistory(h => {
          const sliced = h.slice(0, historyIndex + 1);
          return [...sliced, next];
        });
        setHistoryIndex(idx => idx + 1);
        return next;
      });
    },
    [historyIndex]
  );

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const nextIdx = historyIndex - 1;
      setHistoryIndex(nextIdx);
      setElements(history[nextIdx]);
      setSelectedId(null);
    }
  }, [history, historyIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextIdx = historyIndex + 1;
      setHistoryIndex(nextIdx);
      setElements(history[nextIdx]);
      setSelectedId(null);
    }
  }, [history, historyIndex]);

  /* ── File I/O ────────────────────────────── */
  const loadFile = useCallback(async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    setOriginalBytes(bytes);
    setFileBlob(file);
    setElements([]);
    setHistory([[]]);
    setHistoryIndex(0);
    setSelectedId(null);
    setDocTitle(file.name.replace(/\.pdf$/i, ''));
    setCurrentPageIndex(0);
    setNumPages(1);
    setPdfPageDimsMap({});
  }, []);

  useEffect(() => {
    if (initialFile) {
      loadFile(initialFile);
    }
  }, [initialFile, loadFile]);

  const loadSampleTemplate = async (templateId: SampleTemplateId) => {
    const file = await generateSamplePDF(templateId);
    await loadFile(file);
    setToast({ message: `Loaded ${file.name} into canvas editor.`, severity: 'info' });
  };

  const createBlank = async () => {
    const doc = await PDFDocument.create();
    doc.addPage([A4_W * (72 / 96), A4_H * (72 / 96)]);
    const bytes = await doc.save();
    setOriginalBytes(bytes);
    setFileBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
    setElements([]);
    setHistory([[]]);
    setHistoryIndex(0);
    setSelectedId(null);
    setDocTitle('Untitled Document');
    setCurrentPageIndex(0);
    setNumPages(1);
    setPdfPageDimsMap({});
  };

  /* ── Element CRUD ────────────────────────── */
  const addElement = useCallback(
    (type: ElementType) => {
      if (!fileBlob) return;
      const offset = (elements.length % 5) * 18;
      const el: EditorElement = {
        id: crypto.randomUUID(),
        type,
        x: 90 + offset,
        y: 110 + offset,
        pageIndex: currentPageIndex,
        width: type === 'text' ? 220 : type === 'highlight' || type === 'redact' ? 200 : 120,
        height: type === 'text' ? 40 : type === 'highlight' || type === 'redact' ? 28 : 120,
        content: type === 'text' ? 'Double-click to edit text…' : undefined,
        fontSize: 16,
        fontFamily: 'Helvetica',
        fontWeight: 400,
        textAlign: 'left',
        fillColor:
          type === 'highlight'
            ? '#FACC15'
            : type === 'redact'
              ? '#000000'
              : '#6366F1',
        strokeColor: '#0F172A',
        strokeWidth: type === 'highlight' || type === 'redact' ? 0 : 2,
        opacity: type === 'highlight' ? 0.4 : type === 'rect' || type === 'circle' ? 0.35 : 1,
      };

      if (type === 'image') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = e => {
          const f = (e.target as HTMLInputElement).files?.[0];
          if (!f) return;
          const reader = new FileReader();
          reader.onload = r => {
            el.src = r.target?.result as string;
            el.label = f.name;
            pushElements(prev => [...prev, el]);
            setSelectedId(el.id);
          };
          reader.readAsDataURL(f);
        };
        input.click();
      } else {
        pushElements(prev => [...prev, el]);
        setSelectedId(el.id);
      }
    },
    [fileBlob, currentPageIndex, elements.length, pushElements]
  );

  const handleInsertSignatureImage = useCallback(
    (dataUrl: string, width: number, height: number, label: string) => {
      const el: EditorElement = {
        id: crypto.randomUUID(),
        type: 'image',
        label,
        x: 120,
        y: 620,
        pageIndex: currentPageIndex,
        width,
        height,
        src: dataUrl,
        opacity: 1,
      };
      pushElements(prev => [...prev, el]);
      setSelectedId(el.id);
      setToast({ message: `Placed ${label} on Page ${currentPageIndex + 1}. Drag to position.`, severity: 'success' });
    },
    [currentPageIndex, pushElements]
  );

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

      const padding = drawWidth + 2;
      minX -= padding;
      minY -= padding;
      maxX += padding;
      maxY += padding;

      const relPoints = points.map(p => ({
        x: (p.x - minX) / zoom,
        y: (p.y - minY) / zoom,
      }));

      const el: EditorElement = {
        id: crypto.randomUUID(),
        type: 'draw',
        x: minX / zoom,
        y: minY / zoom,
        pageIndex: currentPageIndex,
        width: (maxX - minX) / zoom || 1,
        height: (maxY - minY) / zoom || 1,
        points: relPoints,
        strokeColor: drawColor,
        strokeWidth: drawWidth,
        opacity: drawOpacity,
      };
      pushElements(prev => [...prev, el]);
    },
    [drawColor, drawWidth, drawOpacity, currentPageIndex, zoom, pushElements]
  );

  const deleteElement = useCallback(
    (id: string) => {
      pushElements(prev => prev.filter(e => e.id !== id));
      if (selectedId === id) setSelectedId(null);
    },
    [pushElements, selectedId]
  );

  const duplicateElement = useCallback(
    (id: string) => {
      const target = elements.find(e => e.id === id);
      if (!target) return;
      const copy: EditorElement = {
        ...target,
        id: crypto.randomUUID(),
        x: Math.min(A4_W - target.width, target.x + 20),
        y: Math.min(A4_H - target.height, target.y + 20),
      };
      pushElements(prev => [...prev, copy]);
      setSelectedId(copy.id);
    },
    [elements, pushElements]
  );

  const updateElement = useCallback(
    (id: string, patch: Partial<EditorElement>) => {
      pushElements(prev => prev.map(e => (e.id === id ? { ...e, ...patch } : e)));
    },
    [pushElements]
  );

  /* ── Keyboard Shortcuts ───────────────────── */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;

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
  }, [selectedId, elements, handleUndo, handleRedo, duplicateElement, deleteElement, updateElement]);

  /* ── Page Navigation & Manipulation ──────── */
  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  const handlePrevPage = () => {
    if (currentPageIndex > 0) {
      setCurrentPageIndex(currentPageIndex - 1);
      setSelectedId(null);
    }
  };

  const handleNextPage = () => {
    if (currentPageIndex < numPages - 1) {
      setCurrentPageIndex(currentPageIndex + 1);
      setSelectedId(null);
    }
  };

  const addPage = async () => {
    if (!originalBytes) return;
    try {
      const doc = await PDFDocument.load(originalBytes);
      doc.addPage([A4_W * (72 / 96), A4_H * (72 / 96)]);
      const bytes = await doc.save();
      setOriginalBytes(bytes);
      setFileBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
      const nextPagesCount = doc.getPageCount();
      setNumPages(nextPagesCount);
      setCurrentPageIndex(nextPagesCount - 1);
      setSelectedId(null);
      setToast({ message: `Added Page ${nextPagesCount}`, severity: 'info' });
    } catch (err) {
      console.error(err);
      setToast({ message: 'Failed to add page.', severity: 'error' });
    }
  };

  const deletePage = async () => {
    if (!originalBytes || numPages <= 1) return;
    try {
      const doc = await PDFDocument.load(originalBytes);
      doc.removePage(currentPageIndex);
      const bytes = await doc.save();
      setOriginalBytes(bytes);
      setFileBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }));

      pushElements(prev =>
        prev
          .filter(el => (el.pageIndex ?? 0) !== currentPageIndex)
          .map(el => {
            const elPageIndex = el.pageIndex ?? 0;
            if (elPageIndex > currentPageIndex) {
              return { ...el, pageIndex: elPageIndex - 1 };
            }
            return el;
          })
      );

      const newNumPages = doc.getPageCount();
      setNumPages(newNumPages);
      setCurrentPageIndex(prev => Math.min(prev, newNumPages - 1));
      setSelectedId(null);
      setToast({ message: 'Removed current page from document.', severity: 'info' });
    } catch (err) {
      console.error(err);
      setToast({ message: 'Failed to delete page.', severity: 'error' });
    }
  };

  useEffect(() => {
    const fetchTextContent = async () => {
      if (!originalBytes) {
        setPageTextItems([]);
        return;
      }
      try {
        const loadingTask = pdfjs.getDocument({
          data: originalBytes.slice(),
          ...pdfDocumentOptions,
        });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(currentPageIndex + 1);
        const textContent = await page.getTextContent();
        setPageTextItems(textContent.items);
        setPageTextStyles(textContent.styles || {});
      } catch (err) {
        console.error('Failed to parse text content:', err);
        setPageTextItems([]);
        setPageTextStyles({});
      }
    };
    fetchTextContent();
  }, [originalBytes, currentPageIndex]);

  useEffect(() => {
    const customFonts = elements
      .map(e => e.fontFamily)
      .filter((f): f is string => !!f && Object.keys(CUSTOM_FONTS).includes(f));

    const uniqueFonts = [...new Set(customFonts)];
    if (uniqueFonts.length > 0) {
      const familyString = uniqueFonts.map(f => `family=${f.replace(/ /g, '+')}`).join('&');
      const url = `https://fonts.googleapis.com/css2?${familyString}&display=swap`;
      let link = document.getElementById('custom-google-fonts') as HTMLLinkElement;
      if (!link) {
        link = document.createElement('link');
        link.id = 'custom-google-fonts';
        link.rel = 'stylesheet';
        document.head.appendChild(link);
      }
      if (link.href !== url) link.href = url;
    }
  }, [elements]);

  /* ── Export ───────────────────────────────── */
  const resolveFont = async (doc: PDFDocument, el: EditorElement) => {
    if (el.fontFamily && CUSTOM_FONTS[el.fontFamily]) {
      try {
        if (!fontCache[el.fontFamily]) {
          const res = await fetch(CUSTOM_FONTS[el.fontFamily]);
          fontCache[el.fontFamily] = await res.arrayBuffer();
        }
        return await doc.embedFont(fontCache[el.fontFamily]);
      } catch (err) {
        console.warn('Failed to embed custom font, falling back.', err);
      }
    }

    let fontEnum = StandardFonts.Helvetica;
    const familyLower = (el.fontFamily || '').toLowerCase();
    const isBold = el.fontWeight === 'bold' || el.fontWeight === 700 || familyLower.includes('bold');
    const isItalic = el.fontStyle === 'italic' || familyLower.includes('italic') || familyLower.includes('oblique');

    if (familyLower.includes('times') || familyLower.includes('serif')) {
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

  const parseHex = (hex: string) => {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.slice(0, 2), 16) / 255 || 0;
    const g = parseInt(clean.slice(2, 4), 16) / 255 || 0;
    const b = parseInt(clean.slice(4, 6), 16) / 255 || 0;
    return rgb(r, g, b);
  };

  const exportPDF = async () => {
    if (!originalBytes) return;
    setIsSaving(true);
    try {
      const doc = await PDFDocument.load(originalBytes);
      const pages = doc.getPages();

      for (const el of elements) {
        const elPageIndex = el.pageIndex ?? 0;
        const page = pages[elPageIndex];
        if (!page) continue;
        const { width: pw, height: ph } = page.getSize();
        const sx = pw / A4_W;
        const sy = ph / A4_H;

        const px = el.x * sx;
        const py = ph - (el.y + el.height) * sy;
        const ew = el.width * sx;
        const eh = el.height * sy;

        if (el.type === 'text') {
          const embedFont = await resolveFont(doc, el);
          const fontSize = (el.fontSize ?? 16) * sy;
          const color = parseHex(el.strokeColor || '#0F172A');
          page.drawText(el.content || '', {
            x: px + 4 * sx,
            y: py + eh - fontSize - 4 * sy,
            size: fontSize,
            font: embedFont,
            color,
            opacity: el.opacity ?? 1,
          });
        } else if (
          el.type === 'edit-text' &&
          el.originalPdfX !== undefined &&
          el.originalPdfY !== undefined
        ) {
          const maskColor = parseHex(el.fillColor || '#FFFFFF');
          const maskH = el.originalPdfH || eh;
          page.drawRectangle({
            x: el.originalPdfX,
            y: el.originalPdfY - maskH * 0.25,
            width: el.originalPdfW || ew,
            height: maskH * 1.25,
            color: maskColor,
          });

          const textColor = parseHex(el.strokeColor || '#000000');
          const embedFont = await resolveFont(doc, el);
          page.drawText(el.content || '', {
            x: px,
            y: py + eh * 0.2,
            size: eh,
            font: embedFont,
            color: textColor,
            opacity: el.opacity ?? 1,
          });
        } else if (el.type === 'rect' || el.type === 'highlight' || el.type === 'redact') {
          const color = parseHex(
            el.fillColor || (el.type === 'highlight' ? '#FACC15' : el.type === 'redact' ? '#000000' : '#6366F1')
          );
          const op = el.type === 'redact' ? 1 : el.opacity ?? (el.type === 'highlight' ? 0.4 : 0.35);
          page.drawRectangle({
            x: px,
            y: py,
            width: ew,
            height: eh,
            color,
            borderColor: color,
            borderWidth: el.type === 'highlight' || el.type === 'redact' ? 0 : el.strokeWidth ?? 2,
            opacity: op,
          });
        } else if (el.type === 'circle') {
          const color = parseHex(el.fillColor || '#6366F1');
          page.drawEllipse({
            x: px + ew / 2,
            y: py + eh / 2,
            xScale: ew / 2,
            yScale: eh / 2,
            color,
            borderColor: color,
            borderWidth: el.strokeWidth ?? 2,
            opacity: el.opacity ?? 0.35,
          });
        } else if (el.type === 'image' && el.src) {
          try {
            const img = el.src.includes('png')
              ? await doc.embedPng(el.src)
              : await doc.embedJpg(el.src);
            page.drawImage(img, {
              x: px,
              y: py,
              width: ew,
              height: eh,
              opacity: el.opacity ?? 1,
            });
          } catch (err) {
            console.error('Image embed failed', err);
          }
        } else if (el.type === 'draw' && el.points && el.points.length >= 2) {
          const color = parseHex(el.strokeColor || '#0F172A');
          const lineW = (el.strokeWidth ?? 3) * Math.min(sx, sy);

          for (let i = 1; i < el.points.length; i++) {
            const screenX1 = el.x + el.points[i - 1].x;
            const screenY1 = el.y + el.points[i - 1].y;
            const x1 = screenX1 * sx;
            const y1 = ph - screenY1 * sy;

            const screenX2 = el.x + el.points[i].x;
            const screenY2 = el.y + el.points[i].y;
            const x2 = screenX2 * sx;
            const y2 = ph - screenY2 * sy;

            page.drawLine({
              start: { x: x1, y: y1 },
              end: { x: x2, y: y2 },
              thickness: lineW,
              color,
              opacity: el.opacity ?? 1,
            });
          }
        }
      }

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
      setToast({ message: 'Export failed.', severity: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  /* ── Splash (no file loaded) ─────────────── */
  if (!fileBlob) {
    return (
      <Box
        sx={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: '#0B0F19',
          p: 3,
        }}
      >
        <Paper
          sx={{
            p: 5,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2.5,
            border: '1px solid rgba(255,255,255,0.1)',
            maxWidth: 520,
            width: '100%',
          }}
        >
          <Typography variant="h1" sx={{ fontSize: 26 }}>
            Advanced Vector & Text Editor
          </Typography>
          <Typography variant="body1" sx={{ color: '#9CA3AF', textAlign: 'center' }}>
            Edit embedded PDF text in place, apply ink signatures, official stamps, permanent redactions, and vector annotations.
          </Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, width: '100%', mt: 1 }}>
            <Button
              variant="contained"
              size="large"
              startIcon={<AddIcon />}
              onClick={createBlank}
              sx={{ py: 1.4, whiteSpace: 'nowrap' }}
            >
              Blank A4 Canvas
            </Button>
            <Button
              variant="outlined"
              size="large"
              component="label"
              startIcon={<UploadIcon />}
              sx={{ py: 1.4, whiteSpace: 'nowrap', borderColor: 'rgba(255,255,255,0.16)', color: '#F9FAFB' }}
            >
              Upload PDF File
              <input
                type="file"
                hidden
                accept="application/pdf"
                onChange={e => e.target.files && loadFile(e.target.files[0])}
              />
            </Button>
          </Box>

          <Box sx={{ width: '100%', pt: 1 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1, textAlign: 'center' }}>
              Or launch immediately with a sample template:
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<InvoiceIcon />}
                onClick={() => loadSampleTemplate('service-invoice')}
                sx={{ py: 1, whiteSpace: 'nowrap' }}
              >
                Sample Invoice
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<BriefIcon />}
                onClick={() => loadSampleTemplate('executive-brief')}
                sx={{ py: 1, whiteSpace: 'nowrap' }}
              >
                3-Page Tech Spec
              </Button>
            </Box>
          </Box>

          <Button variant="text" size="small" onClick={onBack} sx={{ color: '#9CA3AF', mt: 1 }}>
            ← Return to PDFy Studio Workspace
          </Button>
        </Paper>
      </Box>
    );
  }

  /* ── Full Editor Layout ──────────────────── */
  const canvasWidth = A4_W * zoom;
  const canvasHeight = A4_H * zoom;

  return (
    <Box sx={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#0B0F19', overflow: 'hidden' }}>
      {/* Top Bar */}
      <TopNavigationBar
        docTitle={docTitle}
        onTitleChange={setDocTitle}
        zoom={zoom}
        onZoomIn={() => setZoom(z => Math.min(z + 0.1, 2))}
        onZoomOut={() => setZoom(z => Math.max(z - 0.1, 0.4))}
        onExport={exportPDF}
        onClear={() => {
          pushElements([]);
          setSelectedId(null);
        }}
        onBack={onBack}
        isSaving={isSaving}
        currentPageIndex={currentPageIndex}
        numPages={numPages}
        onPrevPage={handlePrevPage}
        onNextPage={handleNextPage}
        onAddPage={addPage}
        onDeletePage={deletePage}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
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

      {/* Main 3-Panel Layout */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Panel */}
        <LeftToolboxPanel
          elements={elements.filter(el => (el.pageIndex ?? 0) === currentPageIndex)}
          selectedId={selectedId}
          isDrawMode={isDrawMode}
          isEditTextMode={isEditTextMode}
          drawColor={drawColor}
          drawWidth={drawWidth}
          drawOpacity={drawOpacity}
          onChangeDrawColor={setDrawColor}
          onChangeDrawWidth={setDrawWidth}
          onChangeDrawOpacity={setDrawOpacity}
          onSelect={setSelectedId}
          onDelete={deleteElement}
          onDuplicate={duplicateElement}
          onAdd={addElement}
          onOpenSignature={() => {
            setSigModalTab('draw');
            setSigModalOpen(true);
          }}
          onToggleDrawMode={() => {
            setIsDrawMode(d => !d);
            setIsEditTextMode(false);
          }}
          onToggleEditTextMode={() => {
            setIsEditTextMode(m => !m);
            setIsDrawMode(false);
          }}
        />

        {/* Canvas Viewport */}
        <Box
          onClick={() => setSelectedId(null)}
          sx={{
            flex: 1,
            overflow: 'auto',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
            p: 5,
            bgcolor: '#0B0F19',
          }}
        >
          <Document
            options={pdfDocumentOptions}
            file={fileBlob}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={<CircularProgress sx={{ color: '#6366F1' }} />}
          >
            <Box
              ref={pageRef}
              onClick={e => e.stopPropagation()}
              sx={{
                position: 'relative',
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
                onRenderSuccess={(data: any) => {
                  setPageDims({ width: data.width, height: data.height });
                  setPdfPageDimsMap(prev => ({
                    ...prev,
                    [currentPageIndex]: { width: data.originalWidth, height: data.originalHeight },
                  }));
                }}
                renderTextLayer={false}
                renderAnnotationLayer={false}
              />

              {/* Drawing Canvas Overlay */}
              {pageDims.width > 0 && (
                <DrawingCanvas
                  width={canvasWidth}
                  height={canvasHeight}
                  isActive={isDrawMode}
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
                      const w = item.width;
                      const h = item.height || item.transform[3];
                      const pdfDims = pdfPageDimsMap[currentPageIndex] || { width: A4_W, height: A4_H };

                      const scaleX = A4_W / pdfDims.width;
                      const scaleY = A4_H / pdfDims.height;

                      const x = tx * scaleX;
                      const y = (pdfDims.height - ty - h) * scaleY;

                      const left = x * zoom;
                      const top = y * zoom;
                      const width = w * scaleX * zoom;
                      const height = h * scaleY * zoom;

                      const isEdited = elements.some(
                        el =>
                          el.type === 'edit-text' &&
                          (el.pageIndex ?? 0) === currentPageIndex &&
                          Math.abs((el.originalPdfX ?? 0) - tx) < 0.1 &&
                          Math.abs((el.originalPdfY ?? 0) - ty) < 0.1
                      );

                      if (isEdited) return null;

                      const uniqueId = `parsed-text-${idx}`;
                      const style = pageTextStyles[item.fontName] || {};
                      const fontFamily = style.fontFamily || 'sans-serif';
                      const familyLower = fontFamily.toLowerCase();
                      const isBold = familyLower.includes('bold');
                      const isItalic = familyLower.includes('italic') || familyLower.includes('oblique');
                      const colorArr = item.color || [0, 0, 0];
                      const hexColor =
                        '#' +
                        colorArr
                          .map((c: any) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0'))
                          .join('');

                      return (
                        <Box
                          key={uniqueId}
                          onDoubleClick={e => {
                            e.stopPropagation();
                            setEditingTextId(uniqueId);
                            setEditingInputValue(item.str);
                          }}
                          sx={{
                            position: 'absolute',
                            left,
                            top,
                            width: Math.max(width, 20),
                            height: Math.max(height, 12),
                            border: '1px dashed rgba(99, 102, 241, 0.5)',
                            bgcolor: 'rgba(99, 102, 241, 0.06)',
                            cursor: 'text',
                            display: 'flex',
                            alignItems: 'center',
                            userSelect: 'none',
                            '&:hover': {
                              border: '1px solid #6366F1',
                              bgcolor: 'rgba(99, 102, 241, 0.16)',
                            },
                          }}
                        >
                          {editingTextId === uniqueId ? (
                            <input
                              autoFocus
                              value={editingInputValue}
                              onChange={e => setEditingInputValue(e.target.value)}
                              onBlur={() => {
                                if (editingInputValue !== item.str) {
                                  const newEl: EditorElement = {
                                    id: crypto.randomUUID(),
                                    type: 'edit-text',
                                    pageIndex: currentPageIndex,
                                    x,
                                    y,
                                    width: Math.max(w * scaleX, 60),
                                    height: Math.max(h * scaleY, 16),
                                    content: editingInputValue,
                                    originalText: item.str,
                                    originalPdfX: tx,
                                    originalPdfY: ty,
                                    originalPdfW: w,
                                    originalPdfH: h,
                                    fontSize: h * scaleY,
                                    fontFamily: fontFamily,
                                    fontWeight: isBold ? 'bold' : 'normal',
                                    fontStyle: isItalic ? 'italic' : 'normal',
                                    fillColor: '#FFFFFF',
                                    strokeColor: hexColor,
                                  };
                                  pushElements(prev => [...prev, newEl]);
                                }
                                setEditingTextId(null);
                              }}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.currentTarget.blur();
                                } else if (e.key === 'Escape') {
                                  setEditingTextId(null);
                                }
                              }}
                              onClick={e => e.stopPropagation()}
                              onDoubleClick={e => e.stopPropagation()}
                              style={{
                                width: '100%',
                                height: '100%',
                                background: '#111827',
                                color: '#F9FAFB',
                                border: '1px solid #6366F1',
                                outline: 'none',
                                fontSize: `${h * scaleY * zoom}px`,
                                fontFamily: fontFamily,
                                fontWeight: isBold ? 'bold' : 'normal',
                                fontStyle: isItalic ? 'italic' : 'normal',
                                padding: '0 2px',
                              }}
                            />
                          ) : (
                            <Typography
                              sx={{
                                fontSize: `${h * scaleY * zoom}px`,
                                fontFamily: fontFamily,
                                fontWeight: isBold ? 'bold' : 'normal',
                                fontStyle: isItalic ? 'italic' : 'normal',
                                lineHeight: 1,
                                color: 'transparent',
                                whiteSpace: 'nowrap',
                                width: '100%',
                                overflow: 'hidden',
                              }}
                            >
                              {item.str}
                            </Typography>
                          )}
                        </Box>
                      );
                    })}
                </Box>
              )}

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
                      <Rnd
                        key={el.id}
                        size={{ width: el.width * zoom, height: el.height * zoom }}
                        position={{ x: el.x * zoom, y: el.y * zoom }}
                        onDragStop={(_, d) => updateElement(el.id, { x: d.x / zoom, y: d.y / zoom })}
                        onDragStart={() => setSelectedId(el.id)}
                        onResizeStop={(_, __, ref, ___, pos) =>
                          updateElement(el.id, {
                            width: parseInt(ref.style.width, 10) / zoom,
                            height: parseInt(ref.style.height, 10) / zoom,
                            x: pos.x / zoom,
                            y: pos.y / zoom,
                          })
                        }
                        onMouseDown={e => {
                          e.stopPropagation();
                          setSelectedId(el.id);
                        }}
                        bounds="parent"
                        enableResizing={el.type !== 'draw'}
                        resizeHandleStyles={
                          el.type !== 'draw'
                            ? {
                                topLeft: handleStyle,
                                topRight: handleStyle,
                                bottomLeft: handleStyle,
                                bottomRight: handleStyle,
                                top: edgeH,
                                bottom: edgeH,
                                left: edgeV,
                                right: edgeV,
                              }
                            : {}
                        }
                        style={{
                          zIndex: selectedId === el.id ? 20 : 10,
                          border:
                            selectedId === el.id && el.type !== 'draw'
                              ? '1.5px solid #6366F1'
                              : '1px solid transparent',
                          borderRadius: el.type === 'circle' ? '50%' : '2px',
                          backgroundColor: isShape
                            ? `${fillHex}${Math.round(op * 255)
                                .toString(16)
                                .padStart(2, '0')}`
                            : el.type === 'edit-text'
                              ? el.fillColor || '#FFFFFF'
                              : 'transparent',
                          mixBlendMode: el.type === 'highlight' ? 'multiply' : 'normal',
                          cursor: el.type === 'draw' ? 'move' : 'grab',
                          boxSizing: 'border-box' as const,
                        }}
                      >
                        {(el.type === 'text' || el.type === 'edit-text') && (
                          <textarea
                            value={el.content}
                            onChange={e => updateElement(el.id, { content: e.target.value })}
                            style={{
                              width: '100%',
                              height: '100%',
                              background: 'transparent',
                              border: 'none',
                              color: el.strokeColor || '#0F172A',
                              opacity: el.opacity ?? 1,
                              resize: 'none',
                              outline: 'none',
                              fontFamily: el.fontFamily || 'Helvetica, sans-serif',
                              fontSize: `${(el.fontSize ?? 16) * zoom}px`,
                              fontWeight: el.fontWeight ?? 400,
                              fontStyle: el.fontStyle ?? 'normal',
                              textAlign: (el.textAlign as any) ?? 'left',
                              padding: el.type === 'edit-text' ? '0px 2px' : '4px 6px',
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
                              objectFit: 'contain',
                              pointerEvents: 'none',
                              opacity: el.opacity ?? 1,
                            }}
                          />
                        )}
                        {el.type === 'draw' && el.points && el.points.length > 0 && (
                          <svg
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
                              fill="none"
                              stroke={el.strokeColor || '#0F172A'}
                              strokeWidth={(el.strokeWidth || 3) * zoom}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              opacity={el.opacity ?? 1}
                            />
                          </svg>
                        )}
                      </Rnd>
                    );
                  })}
            </Box>
          </Document>
        </Box>

        {/* Right Panel */}
        <RightPropertiesPanel
          element={selectedElement}
          onUpdate={updateElement}
          onDelete={deleteElement}
          onDuplicate={duplicateElement}
        />
      </Box>

      {/* Signature & Stamp Studio Modal */}
      <SignatureModal
        open={sigModalOpen}
        initialTab={sigModalTab}
        onClose={() => setSigModalOpen(false)}
        onInsertImage={handleInsertSignatureImage}
      />

      <Snackbar
        open={!!toast}
        autoHideDuration={3200}
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

/* ── Resize Handle Styles ──────────────────── */
const handleStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  backgroundColor: '#FFFFFF',
  border: '2px solid #6366F1',
  borderRadius: 2,
};
const edgeH: React.CSSProperties = { height: 4, top: '50%', cursor: 'ns-resize' };
const edgeV: React.CSSProperties = { width: 4, left: '50%', cursor: 'ew-resize' };

