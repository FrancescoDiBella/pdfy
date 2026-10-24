import { useRef, useState } from 'react';
import { Box, Button, Typography, Paper, CircularProgress, IconButton, TextField, Slider, Switch, FormControlLabel, MenuItem, Alert, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions } from '@mui/material';
import { RotateRight, RotateLeft, DeleteOutlined, ArrowBack, ArrowForward, ContentCopy, AddBoxOutlined, DashboardCustomizeOutlined } from '@mui/icons-material';
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { Document, Page, pdfjs } from 'react-pdf';
import { pdfDocumentOptions } from '../utils/pdfRendering';
import { generateSamplePDF } from '../utils/pdfSamples';
import { usePDFSession, type PDFSession } from '../hooks/usePDFSession';
import PDFSessionControls from './PDFSessionControls';
import ToolIntro from './ToolIntro';
import ToolPanel from './ToolPanel';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
interface PageConfig { id: string; originalIndex: number; rotation: number }
async function prepare(file: File) {
  const pdf = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });
  if (!pdf.getPageCount()) throw new Error('Empty PDF');
  return { count: pdf.getPageCount() };
}

export default function PDFOrganizer({ initialFile, active = true }: { initialFile?: File | null; active?: boolean }) {
  const replacement = usePDFSession(prepare, initialFile);
  const [isExporting, setIsExporting] = useState(false);
  return <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
    {!replacement.session && <ToolIntro icon={<DashboardCustomizeOutlined />} title="Put your pages in order" description="Move, rotate, copy, or remove pages. Add a watermark or page numbers when you need them."><Typography color="text.secondary">Open a PDF to get started.</Typography></ToolIntro>}
    <PDFSessionControls tool="Organize" active={active} hasSession={!!replacement.session} busy={replacement.isReading || isExporting} pendingName={replacement.pending?.file.name} error={replacement.error} onOpen={replacement.open} onSample={() => replacement.open(() => generateSamplePDF('multi-page-report'))} onCancel={replacement.cancel} onConfirm={replacement.confirm} />
    {replacement.session && <Box component="fieldset" disabled={replacement.isReading || !!replacement.pending} sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}><OrganizerWorkspace key={replacement.session.id} session={replacement.session} active={active} onExporting={setIsExporting} /></Box>}
  </Box>;
}

function OrganizerWorkspace({ session: { file, data }, active, onExporting }: { session: PDFSession<{ count: number }>; active: boolean; onExporting: (busy: boolean) => void }) {
  const initialPages = () => Array.from({ length: data.count }, (_, originalIndex) => ({ id: crypto.randomUUID(), originalIndex, rotation: 0 }));
  const [pageConfigs, setPageConfigs] = useState<PageConfig[]>(initialPages);
  const [isExporting, setIsExporting] = useState(false);
  const [settings, setSettings] = useState(false);
  const [confirm, setConfirm] = useState<{ type: 'delete'; id: string } | { type: 'reset' } | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
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
  const movePage = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= pageConfigs.length) return;
    const next = [...pageConfigs]; const [page] = next.splice(index, 1); next.splice(target, 0, page);
    setPageConfigs(next); setAnnouncement(`Moved page ${index + 1} to position ${target + 1}.`);
    requestAnimationFrame(() => document.getElementById(`organizer-page-${page.id}`)?.focus());
  };
  const rotatePage = (id: string, delta: number) => setPageConfigs(previous => previous.map(page => page.id === id ? { ...page, rotation: (page.rotation + delta + 360) % 360 } : page));
  const insert = (index: number, blank: boolean) => {
    const next = [...pageConfigs]; next.splice(index + 1, 0, { ...next[index], id: crypto.randomUUID(), ...(blank ? { originalIndex: -1, rotation: 0 } : {}) }); setPageConfigs(next);
  };
  const exportOrganizedPDF = async () => {
    if (!file || pageConfigs.length === 0) return;
    setIsExporting(true);
    onExporting(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
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
          let label = '';
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

      const savedBytes = await outDoc.save();
      const blob = new Blob([savedBytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `organized_${file.name}`;
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

  return <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
    <Box><Typography variant="h2" sx={{ overflowWrap: 'anywhere' }}>{file.name}</Typography><Typography color="text.secondary">{pageConfigs.length} pages</Typography></Box>
    <Paper variant="outlined" sx={{ p: 1, display: 'flex', flexWrap: 'wrap', gap: 1, position: 'sticky', top: 0, zIndex: 2 }}>
      <Button ref={settingsButton} variant="outlined" aria-expanded={settings} onClick={() => setSettings(true)}>Page settings</Button>
      <Button variant="contained" disabled={isExporting} onClick={exportOrganizedPDF}>{isExporting ? 'Preparing PDF…' : 'Download organized PDF'}</Button>
    </Paper>
    {toast && <Alert severity={toast.severity} onClose={() => setToast(null)}>{toast.message}</Alert>}
    <Typography role="status" className="sr-only">{announcement}</Typography>
    <Document file={file} options={pdfDocumentOptions} loading={<CircularProgress aria-label="Loading page previews" />} error={<Alert severity="warning">Previews could not be displayed. Your page actions and download remain available.</Alert>}>
      <Box component="ol" aria-label="Page order" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: 2 }}>
        {pageConfigs.map((page, index) => <Paper component="li" variant="outlined" key={page.id} sx={{ p: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
          <Typography component="h3" id={`organizer-page-${page.id}`} tabIndex={-1} sx={{ fontWeight: 600 }}>Page {index + 1} · {page.originalIndex === -1 ? 'Blank' : `Source ${page.originalIndex + 1}`} · {page.rotation}°</Typography>
          <Box sx={{ width: 170, height: 235, bgcolor: '#FFFFFF', overflow: 'hidden', position: 'relative', display: 'grid', placeItems: 'center' }}>
            <Box sx={{ transform: `rotate(${page.rotation}deg)` }}>{page.originalIndex === -1 ? <Box sx={{ width: 170, height: 235 }} /> : <Page pageNumber={page.originalIndex + 1} width={170} renderTextLayer={false} renderAnnotationLayer={false} />}</Box>
            {enableWatermark && <Typography sx={{ position: 'absolute', color: watermarkColor, opacity: watermarkOpacity, transform: watermarkDiagonal ? 'rotate(-45deg)' : 'none', fontWeight: 700, fontSize: Math.max(10, watermarkSize * 0.28), textAlign: 'center', overflowWrap: 'anywhere' }}>{watermarkText}</Typography>}
            {enablePageNumbers && <Typography sx={{ position: 'absolute', fontSize: 9, color: '#444444', bgcolor: '#FFFFFF', bottom: pageNumberPosition.startsWith('bottom') ? 5 : 'auto', top: pageNumberPosition.startsWith('top') ? 5 : 'auto', right: pageNumberPosition.endsWith('right') ? 5 : 'auto' }}>{pageNumberFormat === 'page-of' ? `Page ${index + 1} of ${pageConfigs.length}` : pageNumberFormat === 'simple' ? index + 1 : `${batesPrefix}${String(index + 1).padStart(4, '0')}`}</Typography>}
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(44px, 1fr))', gap: 1, width: '100%' }}>
            <IconButton aria-label={`Move page ${index + 1} earlier`} disabled={index === 0 || isExporting} onClick={() => movePage(index, -1)}><ArrowBack /></IconButton>
            <IconButton aria-label={`Rotate page ${index + 1}`} disabled={isExporting} onClick={() => rotatePage(page.id, 90)}><RotateRight /></IconButton>
            <IconButton aria-label={`Move page ${index + 1} later`} disabled={index === pageConfigs.length - 1 || isExporting} onClick={() => movePage(index, 1)}><ArrowForward /></IconButton>
            <IconButton aria-label={`Duplicate page ${index + 1}`} disabled={isExporting} onClick={() => insert(index, false)}><ContentCopy /></IconButton>
            <IconButton aria-label={`Add blank after page ${index + 1}`} disabled={isExporting} onClick={() => insert(index, true)}><AddBoxOutlined /></IconButton>
            <IconButton aria-label={`Delete page ${index + 1}`} disabled={pageConfigs.length <= 1 || isExporting} onClick={event => { trigger.current = event.currentTarget; setConfirm({ type: 'delete', id: page.id }); }}><DeleteOutlined /></IconButton>
          </Box>
        </Paper>)}
      </Box>
    </Document>
    <ToolPanel open={active && settings} title="Page settings" onClose={() => setSettings(false)}>
      <Box component="fieldset" disabled={isExporting} sx={{ border: 0, m: 0, p: 2, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
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
        <Button variant="outlined" onClick={() => { trigger.current = settingsButton.current; setSettings(false); setConfirm({ type: 'reset' }); }}>Reset page order</Button>
      </Box>
    </ToolPanel>
    <Dialog open={active && !!confirm} onClose={() => setConfirm(null)} aria-labelledby="organizer-confirm-title" disableRestoreFocus slotProps={{ transition: { onExited: () => (trigger.current?.isConnected ? trigger.current : settingsButton.current)?.focus() } }}>
      <DialogTitle id="organizer-confirm-title">{confirm?.type === 'reset' ? 'Reset page order?' : 'Delete this page?'}</DialogTitle>
      <DialogContent><DialogContentText>{confirm?.type === 'reset' ? 'Restore every original source page and remove page copies, blank pages, and rotations. Watermark and numbering settings will stay.' : 'Remove this page from the working document. Your original file stays unchanged.'}</DialogContentText></DialogContent>
      <DialogActions><Button autoFocus onClick={() => setConfirm(null)}>Cancel</Button><Button color="error" onClick={() => { if (confirm?.type === 'reset') setPageConfigs(initialPages()); else if (confirm) setPageConfigs(previous => previous.filter(page => page.id !== confirm.id)); setConfirm(null); }}>Confirm</Button></DialogActions>
    </Dialog>
  </Box>;
}
