import { useState, useRef } from 'react';
import { 
  Box, Button, Typography, Paper, CircularProgress, Tooltip, Divider, ButtonGroup
} from '@mui/material';
import { 
  CloudUpload as UploadIcon, 
  Save as SaveIcon,
  TextFields as TextIcon,
  Image as ImageIcon,
  CropSquare as RectIcon,
  Add as AddIcon
} from '@mui/icons-material';
import { PDFDocument, rgb } from 'pdf-lib';
import { Document, Page, pdfjs } from 'react-pdf';
import { Rnd } from 'react-rnd';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

type ElementType = 'text' | 'image' | 'rect';

interface EditorElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  content?: string; // For text
  src?: string; // For image
}

export default function AdvancedEditor() {
  const [fileBlob, setFileBlob] = useState<Blob | null>(null);
  const [originalBytes, setOriginalBytes] = useState<Uint8Array | null>(null);
  const [, setNumPages] = useState<number | null>(null);
  const [elements, setElements] = useState<EditorElement[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [pageDimensions, setPageDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const pageRef = useRef<HTMLDivElement>(null);

  const loadFileBytes = async (file: File) => {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    setOriginalBytes(bytes);
    setFileBlob(file);
    setElements([]);
  };

  const createBlankPDF = async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([600, 800]); // Default size
    const bytes = await pdfDoc.save();
    setOriginalBytes(bytes);
    setFileBlob(new Blob([bytes as any], { type: 'application/pdf' }));
    setElements([]);
  };

  const addElement = (type: ElementType) => {
    if (!fileBlob) return;
    const newElement: EditorElement = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      x: 50,
      y: 50,
      width: type === 'rect' ? 100 : type === 'image' ? 150 : 200,
      height: type === 'text' ? 40 : 100,
      content: type === 'text' ? 'Double click to edit' : undefined,
      src: type === 'image' ? 'https://via.placeholder.com/150' : undefined // Placeholder
    };

    if (type === 'image') {
      // In a real app, this would trigger a file upload dialog for the image
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (re) => {
            newElement.src = re.target?.result as string;
            setElements([...elements, newElement]);
          };
          reader.readAsDataURL(file);
        }
      };
      input.click();
    } else {
      setElements([...elements, newElement]);
    }
  };

  const handleDragStop = (id: string, d: any) => {
    setElements(elements.map(el => el.id === id ? { ...el, x: d.x, y: d.y } : el));
  };

  const handleResizeStop = (id: string, _e: any, _direction: any, ref: any, _delta: any, position: any) => {
    setElements(elements.map(el => el.id === id ? { 
      ...el, 
      width: parseInt(ref.style.width, 10), 
      height: parseInt(ref.style.height, 10),
      ...position
    } : el));
  };

  const updateTextContent = (id: string, content: string) => {
    setElements(elements.map(el => el.id === id ? { ...el, content } : el));
  };

  const savePDF = async () => {
    if (!originalBytes) return;
    setIsSaving(true);
    try {
      const pdfDoc = await PDFDocument.load(originalBytes);
      const pages = pdfDoc.getPages();
      const page = pages[0]; // Assuming single page for simplicity in this demo
      
      const { width: pdfWidth, height: pdfHeight } = page.getSize();
      
      // Calculate scale factor between rendered page and actual PDF page
      const scaleX = pdfWidth / pageDimensions.width;
      const scaleY = pdfHeight / pageDimensions.height;

      for (const el of elements) {
        // PDF-lib y-axis is from bottom-left
        const pdfX = el.x * scaleX;
        const pdfY = pdfHeight - ((el.y + el.height) * scaleY);
        const pdfElWidth = el.width * scaleX;
        const pdfElHeight = el.height * scaleY;

        if (el.type === 'text') {
          page.drawText(el.content || '', {
            x: pdfX,
            y: pdfY + 12, // adjustment for baseline
            size: 16 * scaleY, // approximate font size
            color: rgb(0, 0, 0),
          });
        } else if (el.type === 'rect') {
          page.drawRectangle({
            x: pdfX,
            y: pdfY,
            width: pdfElWidth,
            height: pdfElHeight,
            borderColor: rgb(1, 0.2, 0.4),
            borderWidth: 2,
            color: rgb(1, 0.2, 0.4),
            opacity: 0.5,
          });
        } else if (el.type === 'image' && el.src) {
          try {
            let image;
            if (el.src.includes('png')) {
              image = await pdfDoc.embedPng(el.src);
            } else {
              image = await pdfDoc.embedJpg(el.src);
            }
            page.drawImage(image, {
              x: pdfX,
              y: pdfY,
              width: pdfElWidth,
              height: pdfElHeight,
            });
          } catch(e) {
            console.error("Could not embed image", e);
          }
        }
      }

      const savedPdf = await pdfDoc.save();
      const blob = new Blob([savedPdf as any], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `edited_document.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (error) {
      console.error("Error saving PDF", error);
      alert("Failed to save PDF.");
    } finally {
      setIsSaving(false);
    }
  };

  const onRenderSuccess = (pageData: any) => {
    setPageDimensions({ width: pageData.width, height: pageData.height });
  };

  if (!fileBlob) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 2 }}>PDF Studio Editor</Typography>
        <Paper sx={{ p: 5, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, border: '1px dashed rgba(255,255,255,0.2)' }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            size="large"
            onClick={createBlankPDF}
            sx={{ px: 4, py: 1.5 }}
          >
            Create Blank PDF
          </Button>
          <Typography variant="overline" color="text.secondary">OR</Typography>
          <Button
            variant="outlined"
            component="label"
            startIcon={<UploadIcon />}
            size="large"
          >
            Upload Existing PDF
            <input type="file" hidden accept="application/pdf" onChange={(e) => e.target.files && loadFileBytes(e.target.files[0])} />
          </Button>
        </Paper>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>
      
      <Paper sx={{ p: 1, display: 'flex', gap: 2, alignItems: 'center', justifyContent: 'center' }}>
        <ButtonGroup variant="contained" aria-label="outlined primary button group">
          <Tooltip title="Add Text">
            <Button onClick={() => addElement('text')}><TextIcon /></Button>
          </Tooltip>
          <Tooltip title="Add Image">
            <Button onClick={() => addElement('image')}><ImageIcon /></Button>
          </Tooltip>
          <Tooltip title="Add Rectangle">
            <Button onClick={() => addElement('rect')}><RectIcon /></Button>
          </Tooltip>
        </ButtonGroup>

        <Divider orientation="vertical" flexItem />

        <Button
          variant="contained"
          color="secondary"
          startIcon={isSaving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
          disabled={isSaving}
          onClick={savePDF}
        >
          {isSaving ? 'Exporting...' : 'Export Final PDF'}
        </Button>
      </Paper>

      <Box sx={{ 
        flexGrow: 1, 
        overflow: 'auto', 
        bgcolor: 'background.default', 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center',
        p: 2,
        borderRadius: 2,
        position: 'relative'
      }}>
        <Document
          file={fileBlob}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
          loading={<CircularProgress />}
        >
          <Box sx={{ position: 'relative' }} ref={pageRef}>
            {/* We only render the first page in this demo for simplicity */}
            <Paper elevation={8} sx={{ mb: 2, overflow: 'hidden' }}>
              <Page
                pageNumber={1}
                width={800} // Fixed width for easier math, can be dynamic
                onRenderSuccess={onRenderSuccess}
                renderTextLayer={false}
                renderAnnotationLayer={false}
              />
            </Paper>

            {/* Overlay for Rnd elements */}
            {pageDimensions.width > 0 && elements.map((el) => (
              <Rnd
                key={el.id}
                size={{ width: el.width, height: el.height }}
                position={{ x: el.x, y: el.y }}
                onDragStop={(_, d) => handleDragStop(el.id, d)}
                onResizeStop={(_e, _direction, ref, _delta, position) => handleResizeStop(el.id, _e, _direction, ref, _delta, position)}
                bounds="parent"
                style={{ 
                  zIndex: 10, 
                  border: '1px solid #FF3366', 
                  backgroundColor: el.type === 'rect' ? 'rgba(255, 51, 102, 0.2)' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxSizing: 'border-box'
                }}
              >
                {el.type === 'text' && (
                  <textarea
                    value={el.content}
                    onChange={(e) => updateTextContent(el.id, e.target.value)}
                    style={{
                      width: '100%',
                      height: '100%',
                      background: 'transparent',
                      border: 'none',
                      color: '#000', // Assuming light PDF background
                      fontSize: '16px',
                      resize: 'none',
                      outline: 'none',
                      fontFamily: 'sans-serif'
                    }}
                  />
                )}
                {el.type === 'image' && el.src && (
                  <img src={el.src} alt="Uploaded" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                )}
              </Rnd>
            ))}
          </Box>
        </Document>
      </Box>
    </Box>
  );
}
