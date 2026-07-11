import { useState, useRef, useCallback, useEffect } from 'react';
import { Box, Button, Typography, Paper, CircularProgress } from '@mui/material';
import { CloudUpload as UploadIcon, Add as AddIcon } from '@mui/icons-material';
import { PDFDocument, rgb } from 'pdf-lib';
import { Document, Page, pdfjs } from 'react-pdf';
import { Rnd } from 'react-rnd';
import type { EditorElement, ElementType, StrokePoint } from './editor/types';
import TopNavigationBar from './editor/TopNavigationBar';
import LeftToolboxPanel from './editor/LeftToolboxPanel';
import RightPropertiesPanel from './editor/RightPropertiesPanel';
import DrawingCanvas from './editor/DrawingCanvas';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

// A4 at 96 DPI
const A4_W = 794;
const A4_H = 1123;

interface Props { onBack: () => void; }

export default function AdvancedEditor({ onBack }: Props) {
  const [fileBlob, setFileBlob] = useState<Blob | null>(null);
  const [originalBytes, setOriginalBytes] = useState<Uint8Array | null>(null);
  const [elements, setElements] = useState<EditorElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pageDims, setPageDims] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [docTitle, setDocTitle] = useState('Untitled Document');
  const [isDrawMode, setIsDrawMode] = useState(false);
  const [drawColor] = useState('#000000');
  const [drawWidth] = useState(3);
  const [drawOpacity] = useState(1);
  const pageRef = useRef<HTMLDivElement>(null);

  // Multi-page states
  const [numPages, setNumPages] = useState(1);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [pageDimsMap, setPageDimsMap] = useState<Record<number, { width: number; height: number }>>({});

  const [isEditTextMode, setIsEditTextMode] = useState(false);
  const [pageTextItems, setPageTextItems] = useState<any[]>([]);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingInputValue, setEditingInputValue] = useState('');

  const selectedElement = elements.find(e => e.id === selectedId) ?? null;

  /* ── File I/O ────────────────────────────── */
  const loadFile = async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    setOriginalBytes(bytes);
    setFileBlob(file);
    setElements([]);
    setSelectedId(null);
    setDocTitle(file.name.replace(/\.pdf$/i, ''));
    setCurrentPageIndex(0);
    setNumPages(1);
    setPageDimsMap({});
  };

  const createBlank = async () => {
    const doc = await PDFDocument.create();
    doc.addPage([A4_W * (72 / 96), A4_H * (72 / 96)]);
    const bytes = await doc.save();
    setOriginalBytes(bytes);
    setFileBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
    setElements([]);
    setSelectedId(null);
    setCurrentPageIndex(0);
    setNumPages(1);
    setPageDimsMap({});
  };

  /* ── Element CRUD ────────────────────────── */
  const addElement = useCallback((type: ElementType) => {
    if (!fileBlob) return;
    const el: EditorElement = {
      id: crypto.randomUUID(),
      type, x: 80, y: 80,
      pageIndex: currentPageIndex,
      width: type === 'text' ? 200 : 120,
      height: type === 'text' ? 36 : 120,
      content: type === 'text' ? 'Type here…' : undefined,
      fontSize: 16, fontWeight: 400, textAlign: 'left',
      fillColor: '#6366F1', strokeWidth: 2, opacity: type === 'rect' ? 0.35 : 1,
    };

    if (type === 'image') {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*';
      input.onchange = (e) => {
        const f = (e.target as HTMLInputElement).files?.[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = (r) => {
          el.src = r.target?.result as string;
          setElements(prev => [...prev, el]);
          setSelectedId(el.id);
        };
        reader.readAsDataURL(f);
      };
      input.click();
    } else {
      setElements(prev => [...prev, el]);
      setSelectedId(el.id);
    }
  }, [fileBlob, currentPageIndex]);

  /* ── Drawing ─────────────────────────────── */
  const handleStrokeComplete = useCallback((points: StrokePoint[]) => {
    // Find bounding box of the stroke
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    
    // Add padding so thick strokes aren't clipped by the bounding box
    const padding = drawWidth + 2; 
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    // Make points relative to bounding box
    const relPoints = points.map(p => ({
      x: p.x - minX,
      y: p.y - minY,
    }));

    const el: EditorElement = {
      id: crypto.randomUUID(),
      type: 'draw',
      x: minX, y: minY,
      pageIndex: currentPageIndex,
      width: maxX - minX || 1,
      height: maxY - minY || 1,
      points: relPoints,
      strokeColor: drawColor,
      strokeWidth: drawWidth,
      opacity: drawOpacity,
    };
    setElements(prev => [...prev, el]);
  }, [drawColor, drawWidth, drawOpacity, currentPageIndex]);

  const deleteElement = (id: string) => {
    setElements(prev => prev.filter(e => e.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const updateElement = (id: string, patch: Partial<EditorElement>) => {
    setElements(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
  };

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
    } catch (err) {
      console.error(err);
      alert('Failed to add page.');
    }
  };

  const deletePage = async () => {
    if (!originalBytes || numPages <= 1) return;
    if (!window.confirm('Are you sure you want to delete the current page? This will also delete all elements on this page.')) return;
    try {
      const doc = await PDFDocument.load(originalBytes);
      doc.removePage(currentPageIndex);
      const bytes = await doc.save();
      setOriginalBytes(bytes);
      setFileBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }));

      // Remove all elements associated with the deleted page and shift remaining
      setElements(prev =>
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
    } catch (err) {
      console.error(err);
      alert('Failed to delete page.');
    }
  };

  useEffect(() => {
    const fetchTextContent = async () => {
      if (!originalBytes) {
        setPageTextItems([]);
        return;
      }
      try {
        const loadingTask = pdfjs.getDocument({ data: originalBytes.slice() });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(currentPageIndex + 1);
        const textContent = await page.getTextContent();
        setPageTextItems(textContent.items);
      } catch (err) {
        console.error('Failed to parse text content:', err);
        setPageTextItems([]);
      }
    };
    fetchTextContent();
  }, [originalBytes, currentPageIndex]);

  /* ── Export ───────────────────────────────── */
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
        const dims = pageDimsMap[elPageIndex] || pageDimsMap[currentPageIndex] || { width: A4_W, height: A4_H };
        const sx = pw / dims.width;
        const sy = ph / dims.height;

        const px = el.x * sx;
        const py = ph - ((el.y + el.height) * sy);
        const ew = el.width * sx;
        const eh = el.height * sy;

        if (el.type === 'text') {
          page.drawText(el.content || '', {
            x: px, y: py + 12,
            size: (el.fontSize ?? 16) * sy,
            color: rgb(0, 0, 0),
          });
        } else if (el.type === 'edit-text' && el.originalPdfX !== undefined && el.originalPdfY !== undefined) {
          // Draw solid masking rectangle over the original text to erase it
          const hexMask = el.fillColor || '#FFFFFF';
          const mr = parseInt(hexMask.slice(1, 3), 16) / 255;
          const mg = parseInt(hexMask.slice(3, 5), 16) / 255;
          const mb = parseInt(hexMask.slice(5, 7), 16) / 255;
          page.drawRectangle({
            x: el.originalPdfX,
            y: el.originalPdfY,
            width: el.originalPdfW || ew,
            height: el.originalPdfH || eh,
            color: rgb(mr, mg, mb),
          });

          // Draw the new text at its current dragged position
          const hexText = el.strokeColor || '#000000';
          const tr = parseInt(hexText.slice(1, 3), 16) / 255;
          const tg = parseInt(hexText.slice(3, 5), 16) / 255;
          const tb = parseInt(hexText.slice(5, 7), 16) / 255;
          
          page.drawText(el.content || '', {
            x: px,
            y: py + 2, // Slight Y offset to align nicely
            size: eh,
            color: rgb(tr, tg, tb),
          });
        } else if (el.type === 'rect') {
          const hex = el.fillColor || '#6366F1';
          const r = parseInt(hex.slice(1, 3), 16) / 255;
          const g = parseInt(hex.slice(3, 5), 16) / 255;
          const b = parseInt(hex.slice(5, 7), 16) / 255;
          page.drawRectangle({
            x: px, y: py, width: ew, height: eh,
            color: rgb(r, g, b),
            borderColor: rgb(r, g, b),
            borderWidth: el.strokeWidth ?? 2,
            opacity: el.opacity ?? 0.35,
          });
        } else if (el.type === 'image' && el.src) {
          try {
            const img = el.src.includes('png')
              ? await doc.embedPng(el.src)
              : await doc.embedJpg(el.src);
            page.drawImage(img, { x: px, y: py, width: ew, height: eh });
          } catch (err) { console.error('Image embed failed', err); }
        } else if (el.type === 'draw' && el.points && el.points.length >= 2) {
          // Convert stroke points to PDF coordinates and draw as a polyline
          const hex = el.strokeColor || '#000000';
          const r = parseInt(hex.slice(1, 3), 16) / 255;
          const g = parseInt(hex.slice(3, 5), 16) / 255;
          const b = parseInt(hex.slice(5, 7), 16) / 255;
          const lineW = (el.strokeWidth ?? 3) * Math.min(sx, sy);

          for (let i = 1; i < el.points.length; i++) {
            const screenX1 = el.x + el.points[i - 1].x;
            const screenY1 = el.y + el.points[i - 1].y;
            const x1 = screenX1 * sx;
            const y1 = ph - (screenY1 * sy);

            const screenX2 = el.x + el.points[i].x;
            const screenY2 = el.y + el.points[i].y;
            const x2 = screenX2 * sx;
            const y2 = ph - (screenY2 * sy);
            
            page.drawLine({
              start: { x: x1, y: y1 },
              end: { x: x2, y: y2 },
              thickness: lineW,
              color: rgb(r, g, b),
              opacity: el.opacity ?? 1,
            });
          }
        }
      }

      const saved = await doc.save();
      const url = URL.createObjectURL(new Blob([saved as BlobPart], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url; a.download = `${docTitle || 'document'}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 200);
    } catch (err) {
      console.error(err); alert('Export failed.');
    } finally { setIsSaving(false); }
  };

  /* ── Splash (no file loaded) ─────────────── */
  if (!fileBlob) {
    return (
      <Box sx={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#0B0F19' }}>
        <Paper sx={{ p: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, border: '1px dashed rgba(255,255,255,0.15)', maxWidth: 420 }}>
          <Typography variant="h1" sx={{ fontSize: 28 }}>
            PDFy <span style={{ color: '#A855F7', fontWeight: 300 }}>Studio</span>
          </Typography>
          <Typography variant="body1" sx={{ color: '#9CA3AF', textAlign: 'center' }}>
            Create a new document or open an existing PDF to start editing.
          </Typography>
          <Button variant="contained" size="large" startIcon={<AddIcon />} onClick={createBlank} sx={{ width: '100%', py: 1.5 }}>
            Create Blank PDF
          </Button>
          <Typography variant="caption" sx={{ color: '#4B5563' }}>or</Typography>
          <Button variant="outlined" size="large" component="label" startIcon={<UploadIcon />} sx={{ width: '100%' }}>
            Upload Existing PDF
            <input type="file" hidden accept="application/pdf" onChange={e => e.target.files && loadFile(e.target.files[0])} />
          </Button>
          <Button variant="text" size="small" onClick={onBack} sx={{ color: '#9CA3AF', mt: 1 }}>← Back to tools</Button>
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
        docTitle={docTitle} onTitleChange={setDocTitle}
        zoom={zoom}
        onZoomIn={() => setZoom(z => Math.min(z + 0.1, 2))}
        onZoomOut={() => setZoom(z => Math.max(z - 0.1, 0.3))}
        onExport={exportPDF}
        onClear={() => { setElements([]); setSelectedId(null); }}
        onBack={onBack}
        isSaving={isSaving}
        currentPageIndex={currentPageIndex}
        numPages={numPages}
        onPrevPage={handlePrevPage}
        onNextPage={handleNextPage}
        onAddPage={addPage}
        onDeletePage={deletePage}
      />

      {/* Main 3-Panel Layout */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Panel */}
        <LeftToolboxPanel
          elements={elements.filter(el => (el.pageIndex ?? 0) === currentPageIndex)}
          selectedId={selectedId}
          isDrawMode={isDrawMode}
          isEditTextMode={isEditTextMode}
          onSelect={setSelectedId} onDelete={deleteElement} onAdd={addElement}
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
            flex: 1, overflow: 'auto',
            display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
            p: 5, bgcolor: '#0B0F19',
          }}
        >
          <Document
            file={fileBlob}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={<CircularProgress sx={{ color: '#6366F1' }} />}
          >
            <Box
              ref={pageRef}
              onClick={e => e.stopPropagation()}
              sx={{
                position: 'relative',
                width: canvasWidth, height: canvasHeight,
                boxShadow: '0 12px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.3)',
                borderRadius: '4px', overflow: 'hidden',
              }}
            >
              {/* PDF Page */}
              <Page
                pageNumber={currentPageIndex + 1}
                width={canvasWidth}
                onRenderSuccess={(data: any) => {
                  setPageDims({ width: data.width, height: data.height });
                  setPageDimsMap(prev => ({
                    ...prev,
                    [currentPageIndex]: { width: data.width / zoom, height: data.height / zoom }
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
                  strokeWidth={drawWidth}
                  opacity={drawOpacity}
                  onStrokeComplete={handleStrokeComplete}
                />
              )}

              {/* Interactive PDF Text Overlay (Edit Mode) */}
              {isEditTextMode && pageDims.width > 0 && (
                <Box
                  sx={{
                    position: 'absolute',
                    top: 0, left: 0,
                    width: '100%', height: '100%',
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
                      const ph = pageDimsMap[currentPageIndex]?.height || A4_H;
                      
                      const x = tx;
                      const y = ph - ty - h;

                      const left = x * zoom;
                      const top = y * zoom;
                      const width = w * zoom;
                      const height = h * zoom;

                      const isEdited = elements.some(
                        el => el.type === 'edit-text' &&
                              (el.pageIndex ?? 0) === currentPageIndex &&
                              Math.abs((el.originalPdfX ?? 0) - tx) < 0.1 &&
                              Math.abs((el.originalPdfY ?? 0) - ty) < 0.1
                      );

                      if (isEdited) return null;

                      const uniqueId = `parsed-text-${idx}`;

                      return (
                        <Box
                          key={uniqueId}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            setEditingTextId(uniqueId);
                            setEditingInputValue(item.str);
                          }}
                          sx={{
                            position: 'absolute',
                            left, top, width: Math.max(width, 20), height: Math.max(height, 12),
                            border: '1px dashed rgba(168, 85, 247, 0.4)',
                            bgcolor: 'rgba(168, 85, 247, 0.05)',
                            cursor: 'text',
                            display: 'flex',
                            alignItems: 'center',
                            userSelect: 'none',
                            '&:hover': {
                              border: '1px solid #A855F7',
                              bgcolor: 'rgba(168, 85, 247, 0.15)',
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
                                    x, y,
                                    width: w,
                                    height: h,
                                    content: editingInputValue,
                                    originalText: item.str,
                                    originalPdfX: tx,
                                    originalPdfY: ty,
                                    originalPdfW: w,
                                    originalPdfH: h,
                                    fontSize: h,
                                    fillColor: '#FFFFFF',
                                    strokeColor: '#000000',
                                  };
                                  setElements(prev => [...prev, newEl]);
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
                                background: '#1F2937',
                                color: '#F3F4F6',
                                border: '1px solid #A855F7',
                                outline: 'none',
                                fontSize: `${h * zoom}px`,
                                fontFamily: 'inherit',
                                padding: '0 2px',
                              }}
                            />
                          ) : (
                            <Typography
                              sx={{
                                fontSize: `${h * zoom}px`,
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
              {pageDims.width > 0 && elements
                .filter(el => (el.pageIndex ?? 0) === currentPageIndex)
                .map(el => (
                <Rnd
                  key={el.id}
                  size={{ width: el.width, height: el.height }}
                  position={{ x: el.x, y: el.y }}
                  onDragStop={(_, d) => updateElement(el.id, { x: d.x, y: d.y })}
                  onDragStart={() => setSelectedId(el.id)}
                  onResizeStop={(_, __, ref, ___, pos) => updateElement(el.id, {
                    width: parseInt(ref.style.width, 10),
                    height: parseInt(ref.style.height, 10),
                    ...pos,
                  })}
                  onMouseDown={(e) => { e.stopPropagation(); setSelectedId(el.id); }}
                  bounds="parent"
                  enableResizing={el.type !== 'draw'}
                  resizeHandleStyles={el.type !== 'draw' ? {
                    topLeft: handleStyle, topRight: handleStyle, bottomLeft: handleStyle, bottomRight: handleStyle,
                    top: edgeH, bottom: edgeH, left: edgeV, right: edgeV,
                  } : {}}
                  style={{
                    zIndex: selectedId === el.id ? 20 : 10,
                    border: (selectedId === el.id && el.type !== 'draw') ? '1px solid #6366F1' : '1px solid transparent',
                    backgroundColor: el.type === 'rect'
                      ? `${el.fillColor || '#6366F1'}${Math.round((el.opacity ?? 0.35) * 255).toString(16).padStart(2, '0')}`
                      : el.type === 'edit-text'
                        ? el.fillColor || '#FFFFFF'
                        : 'transparent',
                    cursor: el.type === 'draw' ? 'move' : 'grab',
                    boxSizing: 'border-box' as const,
                    transition: 'box-shadow 0.15s ease-out',
                    boxShadow: (selectedId === el.id && el.type !== 'draw') ? '0 12px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.3)' : 'none',
                  }}
                >
                  {/* Hover outline */}
                  <Box sx={{
                    position: 'absolute', inset: -1, pointerEvents: 'none',
                    border: (selectedId === el.id || el.type === 'draw') ? 'none' : '1px dashed transparent',
                    borderRadius: '2px',
                    '.react-draggable:hover &, :hover > &': { borderColor: (el.type !== 'draw') ? 'rgba(99,102,241,0.5)' : 'transparent' },
                    transition: 'border-color 0.15s ease',
                  }} />

                  {(el.type === 'text' || el.type === 'edit-text') && (
                    <textarea
                      value={el.content}
                      onChange={e => updateElement(el.id, { content: e.target.value })}
                      style={{
                        width: '100%', height: '100%',
                        background: 'transparent', border: 'none',
                        color: el.type === 'edit-text' ? (el.strokeColor || '#000000') : '#000000',
                        resize: 'none', outline: 'none',
                        fontFamily: 'Inter, sans-serif',
                        fontSize: `${el.fontSize ?? 16}px`,
                        fontWeight: el.fontWeight ?? 400,
                        textAlign: (el.textAlign as any) ?? 'left',
                        padding: el.type === 'edit-text' ? '0px 2px' : '4px 6px',
                        overflow: 'hidden',
                      }}
                    />
                  )}
                  {el.type === 'image' && el.src && (
                    <img src={el.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />
                  )}
                  {el.type === 'draw' && el.points && el.points.length > 0 && (
                    <svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', pointerEvents: 'none' }}>
                      <path
                        d={`M ${el.points[0].x} ${el.points[0].y} ` + 
                           el.points.slice(1).map((p, i, arr) => {
                             if (i === 0) return '';
                             const prev = arr[i - 1];
                             const midX = (prev.x + p.x) / 2;
                             const midY = (prev.y + p.y) / 2;
                             return `Q ${prev.x} ${prev.y} ${midX} ${midY} `;
                           }).join('') + (el.points.length > 1 ? `L ${el.points[el.points.length-1].x} ${el.points[el.points.length-1].y}` : '')}
                        fill="none"
                        stroke={el.strokeColor || '#000000'}
                        strokeWidth={el.strokeWidth || 3}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity={el.opacity ?? 1}
                      />
                    </svg>
                  )}
                </Rnd>
              ))}
            </Box>
          </Document>
        </Box>

        {/* Right Panel */}
        <RightPropertiesPanel element={selectedElement} onUpdate={updateElement} />
      </Box>
    </Box>
  );
}

/* ── Resize Handle Styles ──────────────────── */
const handleStyle: React.CSSProperties = {
  width: 8, height: 8,
  backgroundColor: '#FFFFFF',
  border: '2px solid #6366F1',
  borderRadius: 2,
};
const edgeH: React.CSSProperties = { height: 4, top: '50%', cursor: 'ns-resize' };
const edgeV: React.CSSProperties = { width: 4, left: '50%', cursor: 'ew-resize' };
