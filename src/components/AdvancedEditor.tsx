import { useState, useRef, useCallback } from 'react';
import { Box, Button, Typography, Paper, CircularProgress } from '@mui/material';
import { CloudUpload as UploadIcon, Add as AddIcon } from '@mui/icons-material';
import { PDFDocument, rgb } from 'pdf-lib';
import { Document, Page, pdfjs } from 'react-pdf';
import { Rnd } from 'react-rnd';
import type { EditorElement, ElementType } from './editor/types';
import TopNavigationBar from './editor/TopNavigationBar';
import LeftToolboxPanel from './editor/LeftToolboxPanel';
import RightPropertiesPanel from './editor/RightPropertiesPanel';

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
  const pageRef = useRef<HTMLDivElement>(null);

  const selectedElement = elements.find(e => e.id === selectedId) ?? null;

  /* ── File I/O ────────────────────────────── */
  const loadFile = async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    setOriginalBytes(bytes);
    setFileBlob(file);
    setElements([]);
    setSelectedId(null);
    setDocTitle(file.name.replace(/\.pdf$/i, ''));
  };

  const createBlank = async () => {
    const doc = await PDFDocument.create();
    doc.addPage([A4_W * (72 / 96), A4_H * (72 / 96)]);
    const bytes = await doc.save();
    setOriginalBytes(bytes);
    setFileBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
    setElements([]);
    setSelectedId(null);
  };

  /* ── Element CRUD ────────────────────────── */
  const addElement = useCallback((type: ElementType) => {
    if (!fileBlob) return;
    const el: EditorElement = {
      id: crypto.randomUUID(),
      type, x: 80, y: 80,
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
  }, [fileBlob]);

  const deleteElement = (id: string) => {
    setElements(prev => prev.filter(e => e.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const updateElement = (id: string, patch: Partial<EditorElement>) => {
    setElements(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
  };

  /* ── Export ───────────────────────────────── */
  const exportPDF = async () => {
    if (!originalBytes) return;
    setIsSaving(true);
    try {
      const doc = await PDFDocument.load(originalBytes);
      const page = doc.getPages()[0];
      const { width: pw, height: ph } = page.getSize();
      const sx = pw / pageDims.width;
      const sy = ph / pageDims.height;

      for (const el of elements) {
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
      />

      {/* Main 3-Panel Layout */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Panel */}
        <LeftToolboxPanel
          elements={elements} selectedId={selectedId}
          onSelect={setSelectedId} onDelete={deleteElement} onAdd={addElement}
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
            onLoadSuccess={() => {}}
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
                pageNumber={1}
                width={canvasWidth}
                onRenderSuccess={(data: any) => setPageDims({ width: data.width, height: data.height })}
                renderTextLayer={false}
                renderAnnotationLayer={false}
              />

              {/* Draggable Elements */}
              {pageDims.width > 0 && elements.map(el => (
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
                  resizeHandleStyles={{
                    topLeft: handleStyle, topRight: handleStyle, bottomLeft: handleStyle, bottomRight: handleStyle,
                    top: edgeH, bottom: edgeH, left: edgeV, right: edgeV,
                  }}
                  style={{
                    zIndex: selectedId === el.id ? 20 : 10,
                    border: selectedId === el.id ? '1px solid #6366F1' : '1px solid transparent',
                    backgroundColor: el.type === 'rect'
                      ? `${el.fillColor || '#6366F1'}${Math.round((el.opacity ?? 0.35) * 255).toString(16).padStart(2, '0')}`
                      : 'transparent',
                    cursor: 'grab',
                    boxSizing: 'border-box' as const,
                    transition: 'box-shadow 0.15s ease-out',
                    boxShadow: selectedId === el.id ? '0 12px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.3)' : 'none',
                  }}
                >
                  {/* Hover outline */}
                  <Box sx={{
                    position: 'absolute', inset: -1, pointerEvents: 'none',
                    border: selectedId === el.id ? 'none' : '1px dashed transparent',
                    borderRadius: '2px',
                    '.react-draggable:hover &, :hover > &': { borderColor: 'rgba(99,102,241,0.5)' },
                    transition: 'border-color 0.15s ease',
                  }} />

                  {el.type === 'text' && (
                    <textarea
                      value={el.content}
                      onChange={e => updateElement(el.id, { content: e.target.value })}
                      style={{
                        width: '100%', height: '100%',
                        background: 'transparent', border: 'none',
                        color: '#000', resize: 'none', outline: 'none',
                        fontFamily: 'Inter, sans-serif',
                        fontSize: `${el.fontSize ?? 16}px`,
                        fontWeight: el.fontWeight ?? 400,
                        textAlign: (el.textAlign as any) ?? 'left',
                        padding: '4px 6px',
                      }}
                    />
                  )}
                  {el.type === 'image' && el.src && (
                    <img src={el.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />
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
