import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Button,
  Typography,
  TextField,
  ToggleButtonGroup,
  ToggleButton,
  Slider,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  Draw as DrawIcon,
  Keyboard as TypeIcon,
  Approval as StampIcon,
  DeleteOutlined as ClearIcon,
  FileUploadOutlined as UploadIcon,
  AutoFixHigh as MagicIcon,
} from '@mui/icons-material';

export type SignatureTabMode = 'draw' | 'type' | 'upload' | 'stamp';

interface Props {
  open: boolean;
  initialTab?: SignatureTabMode;
  onClose: () => void;
  onInsertImage: (dataUrl: string, width: number, height: number, label: string) => void;
}

const INK_COLORS = [
  { label: 'Midnight Ink', value: '#0F172A' },
  { label: 'Fountain Blue', value: '#1D4ED8' },
  { label: 'Executive Crimson', value: '#B91C1C' },
];

const SCAN_INK_MODES = [
  { label: 'Fountain Blue', value: '#1D4ED8' },
  { label: 'Midnight Black', value: '#0F172A' },
  { label: 'Archival Charcoal', value: '#334155' },
  { label: 'Executive Crimson', value: '#B91C1C' },
  { label: 'Original Scan Hue', value: 'original' },
];

const STAMP_PRESETS = [
  { label: 'APPROVED', sub: 'VERIFIED & SIGNED', color: '#10B981' },
  { label: 'CONFIDENTIAL', sub: 'RESTRICTED ACCESS', color: '#EF4444' },
  { label: 'FINAL COPY', sub: 'ARCHIVE RECORD', color: '#6366F1' },
  { label: 'DRAFT', sub: 'FOR REVIEW ONLY', color: '#F59E0B' },
  { label: 'VOID', sub: 'CANCELLED DOCUMENT', color: '#DC2626' },
  { label: 'PAID', sub: 'REMITTANCE RECEIVED', color: '#059669' },
];

/**
 * Generates a realistic synthetic photo of a handwritten signature on slightly shadowed/warm paper
 * so users can test the PNG ink extraction filters with one click.
 */
function createSamplePaperScanDataUrl(): string {
  const c = document.createElement('canvas');
  c.width = 560;
  c.height = 220;
  const ctx = c.getContext('2d')!;

  // Simulated uneven warm paper lighting + subtle noise
  const grad = ctx.createLinearGradient(0, 0, 560, 220);
  grad.addColorStop(0, '#F3EFE6');
  grad.addColorStop(0.5, '#EAE4D7');
  grad.addColorStop(1, '#DCD4C4');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, c.width, c.height);

  // Faint ruled notebook line on the paper scan
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(20, 165);
  ctx.lineTo(540, 165);
  ctx.stroke();

  // Simulated natural pen strokes with varying pressure
  ctx.save();
  ctx.strokeStyle = '#1E293B';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Capital 'E' / flourish
  ctx.lineWidth = 3.8;
  ctx.beginPath();
  ctx.moveTo(95, 65);
  ctx.bezierCurveTo(60, 55, 55, 105, 88, 112);
  ctx.bezierCurveTo(60, 118, 52, 162, 102, 154);
  ctx.stroke();

  // Cursive body strokes
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.moveTo(102, 154);
  ctx.bezierCurveTo(125, 145, 138, 82, 145, 75);
  ctx.bezierCurveTo(148, 115, 142, 148, 158, 148);
  ctx.bezierCurveTo(172, 148, 182, 118, 195, 118);
  ctx.bezierCurveTo(205, 118, 202, 148, 220, 146);
  ctx.bezierCurveTo(240, 144, 265, 68, 285, 62);
  ctx.bezierCurveTo(270, 110, 262, 158, 288, 152);
  ctx.bezierCurveTo(312, 146, 330, 112, 355, 122);
  ctx.bezierCurveTo(378, 130, 395, 115, 435, 108);
  ctx.stroke();

  // Expressive signature underline loop
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(78, 174);
  ctx.bezierCurveTo(210, 156, 360, 148, 485, 136);
  ctx.bezierCurveTo(445, 148, 390, 168, 415, 182);
  ctx.stroke();
  ctx.restore();

  return c.toDataURL('image/png');
}

export default function SignatureModal({ open, initialTab = 'draw', onClose, onInsertImage }: Props) {
  const [tab, setTab] = useState<SignatureTabMode>(initialTab);
  const [inkColor, setInkColor] = useState('#1D4ED8');
  const [typedName, setTypedName] = useState('Alexander Vance');
  const [selectedStamp, setSelectedStamp] = useState(STAMP_PRESETS[0]);
  const [includeDate, setIncludeDate] = useState(true);

  // PNG / Scan Upload & Real-Time Ink Filter States
  const [uploadedSrc, setUploadedSrc] = useState<string | null>(null);
  const [processedDataUrl, setProcessedDataUrl] = useState<string | null>(null);
  const [processedDims, setProcessedDims] = useState<{ width: number; height: number }>({ width: 220, height: 80 });
  const [threshold, setThreshold] = useState<number>(188); // 80 - 245: luminance cutoff for paper removal
  const [contrastBoost, setContrastBoost] = useState<number>(2.2); // 1.0 - 4.0: stroke sharpness/darkness
  const [strokeBoldness, setStrokeBoldness] = useState<number>(1); // 0 = fine, 1 = natural, 2 = bold wet ink
  const [scanInkColor, setScanInkColor] = useState<string>('#1D4ED8');
  const [removeBackground, setRemoveBackground] = useState<boolean>(true);
  const [autoCropInk, setAutoCropInk] = useState<boolean>(true);
  const [previewPaperMode, setPreviewPaperMode] = useState<'paper' | 'checker'>('paper');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const hasStrokes = useRef(false);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasStrokes.current = false;
  }, []);

  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setTimeout(() => clearCanvas(), 50);
      if (!uploadedSrc) {
        setUploadedSrc(createSamplePaperScanDataUrl());
      }
    }
  }, [open, initialTab, clearCanvas, uploadedSrc]);

  // Process the uploaded PNG/image through the ink extraction & paper removal pipeline
  useEffect(() => {
    if (!uploadedSrc) return;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      const maxDim = 700;
      const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));

      const off = document.createElement('canvas');
      off.width = w;
      off.height = h;
      const ctx = off.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);

      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;

      // Parse target ink color if recoloring
      let targetR = 15,
        targetG = 23,
        targetB = 42;
      const useCustomHue = scanInkColor !== 'original';
      if (useCustomHue) {
        const clean = scanInkColor.replace('#', '');
        targetR = parseInt(clean.slice(0, 2), 16) || 0;
        targetG = parseInt(clean.slice(2, 4), 16) || 0;
        targetB = parseInt(clean.slice(4, 6), 16) || 0;
      }

      // Compute per-pixel ink alpha map first so we can optionally apply stroke dilation (wet ink effect)
      const alphaMap = new Float32Array(w * h);

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3] / 255;

        if (a < 0.05) {
          alphaMap[i >> 2] = 0;
          continue;
        }

        // Perceived luminance (0 = darkest ink, 255 = brightest paper)
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;

        if (!removeBackground) {
          // Keep background, but apply contrast curve around threshold
          const norm = (lum - threshold) / 255;
          const adj = Math.max(0, Math.min(255, threshold + norm * contrastBoost * 255));
          const ratio = adj / Math.max(1, lum);
          data[i] = Math.min(255, Math.round(r * ratio));
          data[i + 1] = Math.min(255, Math.round(g * ratio));
          data[i + 2] = Math.min(255, Math.round(b * ratio));
          alphaMap[i >> 2] = a;
        } else {
          // Smooth ink extraction: pixels darker than threshold become opaque ink
          if (lum >= threshold) {
            alphaMap[i >> 2] = 0;
          } else {
            const rawStrength = (threshold - lum) / Math.max(1, threshold);
            const boosted = Math.min(1, Math.pow(rawStrength, 1 / Math.max(0.5, contrastBoost * 0.65)) * contrastBoost);
            alphaMap[i >> 2] = boosted * a;
          }
        }
      }

      // Optional morphological dilation for bold / wet fountain pen stroke feel
      let finalAlpha = alphaMap;
      if (removeBackground && strokeBoldness > 0) {
        finalAlpha = new Float32Array(w * h);
        const radius = strokeBoldness === 2 ? 1 : 0;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const idx = y * w + x;
            let maxA = alphaMap[idx];
            if (strokeBoldness >= 1) {
              // 4-connected neighbor boost for crisp fountain pen body
              if (x > 0) maxA = Math.max(maxA, alphaMap[idx - 1] * 0.78);
              if (x < w - 1) maxA = Math.max(maxA, alphaMap[idx + 1] * 0.78);
              if (y > 0) maxA = Math.max(maxA, alphaMap[idx - w] * 0.78);
              if (y < h - 1) maxA = Math.max(maxA, alphaMap[idx + w] * 0.78);
            }
            if (radius === 1) {
              // 8-connected diagonal boost for bold marker feel
              if (x > 0 && y > 0) maxA = Math.max(maxA, alphaMap[idx - w - 1] * 0.65);
              if (x < w - 1 && y > 0) maxA = Math.max(maxA, alphaMap[idx - w + 1] * 0.65);
              if (x > 0 && y < h - 1) maxA = Math.max(maxA, alphaMap[idx + w - 1] * 0.65);
              if (x < w - 1 && y < h - 1) maxA = Math.max(maxA, alphaMap[idx + w + 1] * 0.65);
            }
            finalAlpha[idx] = Math.min(1, maxA);
          }
        }
      }

      // Write final pixels and compute tight ink bounding box
      let minX = w,
        minY = h,
        maxX = 0,
        maxY = 0;
      let foundInk = false;

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const pIdx = y * w + x;
          const i = pIdx * 4;
          const outA = finalAlpha[pIdx];

          if (removeBackground) {
            if (outA <= 0.04) {
              data[i + 3] = 0;
              continue;
            }
            if (useCustomHue) {
              // Subtle shading variation so strokes look like real liquid ink on paper
              const shade = 0.85 + 0.15 * (1 - outA);
              data[i] = Math.round(targetR * shade);
              data[i + 1] = Math.round(targetG * shade);
              data[i + 2] = Math.round(targetB * shade);
            } else {
              // Darken original scan color proportionally to contrast boost
              const darken = Math.max(0.15, 1 - (contrastBoost - 1) * 0.35);
              data[i] = Math.round(data[i] * darken);
              data[i + 1] = Math.round(data[i + 1] * darken);
              data[i + 2] = Math.round(data[i + 2] * darken);
            }
            data[i + 3] = Math.round(outA * 255);
          }

          if (data[i + 3] > 25) {
            foundInk = true;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
      }

      ctx.putImageData(imgData, 0, 0);

      if (autoCropInk && removeBackground && foundInk && maxX > minX && maxY > minY) {
        const pad = 14;
        const cx = Math.max(0, minX - pad);
        const cy = Math.max(0, minY - pad);
        const cw = Math.min(w - cx, maxX - minX + pad * 2);
        const ch = Math.min(h - cy, maxY - minY + pad * 2);

        const cropped = document.createElement('canvas');
        cropped.width = cw;
        cropped.height = ch;
        const cCtx = cropped.getContext('2d')!;
        cCtx.drawImage(off, cx, cy, cw, ch, 0, 0, cw, ch);

        const aspect = cw / Math.max(1, ch);
        const targetW = Math.min(260, Math.max(140, Math.round(85 * aspect)));
        const targetH = Math.max(45, Math.round(targetW / aspect));

        setProcessedDims({ width: targetW, height: targetH });
        setProcessedDataUrl(cropped.toDataURL('image/png'));
      } else {
        const aspect = w / Math.max(1, h);
        const targetW = Math.min(260, Math.max(140, Math.round(85 * aspect)));
        const targetH = Math.max(45, Math.round(targetW / aspect));
        setProcessedDims({ width: targetW, height: targetH });
        setProcessedDataUrl(off.toDataURL('image/png'));
      }
    };
    img.src = uploadedSrc;
    return () => {
      cancelled = true;
    };
  }, [uploadedSrc, threshold, contrastBoost, strokeBoldness, scanInkColor, removeBackground, autoCropInk]);

  const handleUploadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = r => {
      setUploadedSrc(r.target?.result as string);
    };
    reader.readAsDataURL(f);
  };

  const getPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvasRef.current!.width / rect.width),
      y: (e.clientY - rect.top) * (canvasRef.current!.height / rect.height),
    };
  };

  const startDraw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDrawing.current = true;
    hasStrokes.current = true;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.strokeStyle = inkColor;
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const moveDraw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const endDraw = () => {
    isDrawing.current = false;
  };

  const handleInsert = () => {
    if (tab === 'draw') {
      const canvas = canvasRef.current;
      if (!canvas) return;
      onInsertImage(canvas.toDataURL('image/png'), 200, 80, 'Ink Signature');
      onClose();
      return;
    }

    if (tab === 'type') {
      const offscreen = document.createElement('canvas');
      offscreen.width = 480;
      offscreen.height = 160;
      const ctx = offscreen.getContext('2d')!;
      ctx.clearRect(0, 0, offscreen.width, offscreen.height);
      ctx.fillStyle = inkColor;
      ctx.font = 'italic 54px "Georgia", "Times New Roman", serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(typedName || 'Signed', 24, 80);

      ctx.strokeStyle = inkColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(24, 118);
      ctx.quadraticCurveTo(180, 108, 340, 122);
      ctx.stroke();

      onInsertImage(offscreen.toDataURL('image/png'), 210, 70, 'Signature');
      onClose();
      return;
    }

    if (tab === 'upload') {
      if (!processedDataUrl) return;
      onInsertImage(processedDataUrl, processedDims.width, processedDims.height, 'Scanned Ink Signature');
      onClose();
      return;
    }

    if (tab === 'stamp') {
      const offscreen = document.createElement('canvas');
      offscreen.width = 440;
      offscreen.height = 160;
      const ctx = offscreen.getContext('2d')!;
      ctx.clearRect(0, 0, offscreen.width, offscreen.height);

      ctx.strokeStyle = selectedStamp.color;
      ctx.lineWidth = 6;
      ctx.strokeRect(12, 12, 416, 136);

      ctx.lineWidth = 2;
      ctx.strokeRect(20, 20, 400, 120);

      ctx.fillStyle = selectedStamp.color;
      ctx.textAlign = 'center';
      ctx.font = 'bold 42px "Plus Jakarta Sans", "Helvetica", sans-serif';
      ctx.fillText(selectedStamp.label, 220, 78);

      const dateStr = new Date().toISOString().slice(0, 10);
      const subText = includeDate ? `${selectedStamp.sub}  ·  ${dateStr}` : selectedStamp.sub;
      ctx.font = 'bold 16px "JetBrains Mono", monospace';
      ctx.fillText(subText, 220, 114);

      onInsertImage(offscreen.toDataURL('image/png'), 190, 70, `Stamp: ${selectedStamp.label}`);
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            bgcolor: '#111827',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 2.5,
          },
        },
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5, pb: 1 }}>
        <Typography variant="h2" sx={{ fontSize: 17 }}>
          Signature & Official Stamp Studio
        </Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={tab}
          onChange={(_, v) => v && setTab(v)}
        >
          <ToggleButton value="draw" sx={{ px: 1.5, py: 0.5, fontSize: 12, gap: 0.75, whiteSpace: 'nowrap' }}>
            <DrawIcon sx={{ fontSize: 15 }} /> Draw Ink
          </ToggleButton>
          <ToggleButton value="upload" sx={{ px: 1.5, py: 0.5, fontSize: 12, gap: 0.75, whiteSpace: 'nowrap' }}>
            <UploadIcon sx={{ fontSize: 16 }} /> PNG / Paper Scan
          </ToggleButton>
          <ToggleButton value="type" sx={{ px: 1.5, py: 0.5, fontSize: 12, gap: 0.75, whiteSpace: 'nowrap' }}>
            <TypeIcon sx={{ fontSize: 15 }} /> Calligraphic
          </ToggleButton>
          <ToggleButton value="stamp" sx={{ px: 1.5, py: 0.5, fontSize: 12, gap: 0.75, whiteSpace: 'nowrap' }}>
            <StampIcon sx={{ fontSize: 15 }} /> Official Stamp
          </ToggleButton>
        </ToggleButtonGroup>
      </DialogTitle>

      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: '12px !important' }}>
        {/* ─── TAB 1 & 3: DRAW INK OR TYPE CALLIGRAPHIC ─── */}
        {(tab === 'draw' || tab === 'type') && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', mr: 1 }}>
                Ink Color:
              </Typography>
              {INK_COLORS.map(c => (
                <Button
                  key={c.value}
                  size="small"
                  variant={inkColor === c.value ? 'contained' : 'outlined'}
                  onClick={() => setInkColor(c.value)}
                  sx={{ minWidth: 0, px: 1.25, py: 0.4, fontSize: 11, whiteSpace: 'nowrap' }}
                >
                  <Box
                    sx={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      bgcolor: c.value,
                      mr: 0.75,
                      border: '1px solid rgba(255,255,255,0.4)',
                    }}
                  />
                  {c.label}
                </Button>
              ))}
            </Box>
            {tab === 'draw' && (
              <Button size="small" startIcon={<ClearIcon />} onClick={clearCanvas} sx={{ color: 'text.secondary' }}>
                Clear Pad
              </Button>
            )}
          </Box>
        )}

        {tab === 'draw' && (
          <Box
            sx={{
              bgcolor: '#F9FAFB',
              borderRadius: 2,
              border: '1px solid rgba(255,255,255,0.15)',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <canvas
              ref={canvasRef}
              width={640}
              height={190}
              onMouseDown={startDraw}
              onMouseMove={moveDraw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              style={{ width: '100%', height: 190, display: 'block', cursor: 'crosshair' }}
            />
            <Box
              sx={{
                position: 'absolute',
                bottom: 36,
                left: 32,
                right: 32,
                borderBottom: '1px dashed #CBD5E1',
                pointerEvents: 'none',
              }}
            />
            <Typography
              variant="caption"
              sx={{ position: 'absolute', bottom: 12, left: 32, color: '#94A3B8', pointerEvents: 'none' }}
            >
              Sign above the baseline using mouse or trackpad
            </Typography>
          </Box>
        )}

        {tab === 'type' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Full Name or Initials"
              fullWidth
              size="small"
              value={typedName}
              onChange={e => setTypedName(e.target.value)}
            />
            <Box
              sx={{
                bgcolor: '#F9FAFB',
                borderRadius: 2,
                p: 3,
                minHeight: 140,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Typography
                sx={{
                  fontFamily: '"Georgia", "Times New Roman", serif',
                  fontStyle: 'italic',
                  fontSize: 42,
                  color: inkColor,
                  borderBottom: `2px solid ${inkColor}`,
                  px: 3,
                  pb: 0.5,
                }}
              >
                {typedName || 'Signature'}
              </Typography>
            </Box>
          </Box>
        )}

        {/* ─── TAB 2: PNG / PAPER SIGNATURE SCANNER WITH REAL-TIME INK FILTERS ─── */}
        {tab === 'upload' && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '7fr 5fr' }, gap: 2.5 }}>
            {/* Left Column: Live Before/After & On-Paper Preview */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    variant="contained"
                    component="label"
                    size="small"
                    startIcon={<UploadIcon sx={{ fontSize: 16 }} />}
                    sx={{ whiteSpace: 'nowrap' }}
                  >
                    Upload Signature PNG / Photo
                    <input type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={handleUploadFile} />
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<MagicIcon sx={{ fontSize: 15 }} />}
                    onClick={() => setUploadedSrc(createSamplePaperScanDataUrl())}
                    sx={{ whiteSpace: 'nowrap' }}
                  >
                    Sample Scan
                  </Button>
                </Box>

                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={previewPaperMode}
                  onChange={(_, v) => v && setPreviewPaperMode(v)}
                >
                  <ToggleButton value="paper" sx={{ px: 1.2, py: 0.3, fontSize: 11, whiteSpace: 'nowrap' }}>
                    On Paper Preview
                  </ToggleButton>
                  <ToggleButton value="checker" sx={{ px: 1.2, py: 0.3, fontSize: 11, whiteSpace: 'nowrap' }}>
                    Alpha Grid
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>

              {/* Main Live Processed Output Preview */}
              <Box
                sx={{
                  height: 205,
                  borderRadius: 2,
                  border: '1px solid rgba(255,255,255,0.14)',
                  overflow: 'hidden',
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  p: 2,
                  background:
                    previewPaperMode === 'paper'
                      ? 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)'
                      : 'repeating-conic-gradient(#CBD5E1 0% 25%, #F8FAFC 0% 50%) 50% / 16px 16px',
                }}
              >
                {previewPaperMode === 'paper' && (
                  <>
                    <Box
                      sx={{
                        position: 'absolute',
                        bottom: 42,
                        left: 36,
                        right: 36,
                        borderBottom: '1px solid #94A3B8',
                        pointerEvents: 'none',
                      }}
                    />
                    <Typography
                      className="mono"
                      sx={{
                        position: 'absolute',
                        bottom: 22,
                        left: 36,
                        fontSize: 9.5,
                        color: '#64748B',
                        pointerEvents: 'none',
                      }}
                    >
                      AUTHORIZED SIGNATURE  ·  REAL-PAPER INK EXTRACTION PREVIEW
                    </Typography>
                  </>
                )}

                {processedDataUrl ? (
                  <img
                    src={processedDataUrl}
                    alt="Filtered signature preview"
                    referrerPolicy="no-referrer"
                    style={{
                      maxWidth: '90%',
                      maxHeight: '145px',
                      objectFit: 'contain',
                      zIndex: 2,
                      filter: previewPaperMode === 'paper' ? 'drop-shadow(0 0.5px 0.4px rgba(15,23,42,0.18))' : 'none',
                    }}
                  />
                ) : (
                  <Typography variant="body2" sx={{ color: '#64748B' }}>
                    Upload a PNG or photo of your signature
                  </Typography>
                )}
              </Box>

              {/* Original Source Thumbnail Strip */}
              {uploadedSrc && (
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    px: 1.5,
                    py: 1,
                    borderRadius: 1.5,
                    bgcolor: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.07)',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <img
                      src={uploadedSrc}
                      alt="Original raw scan"
                      referrerPolicy="no-referrer"
                      style={{
                        width: 68,
                        height: 30,
                        objectFit: 'cover',
                        borderRadius: 4,
                        border: '1px solid rgba(255,255,255,0.2)',
                      }}
                    />
                    <Box>
                      <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#F9FAFB' }}>
                        Source Image → Clean Ink Vectorized Alpha
                      </Typography>
                      <Typography className="mono" sx={{ fontSize: 10.5, color: 'text.secondary' }}>
                        Output Size: {processedDims.width} × {processedDims.height} pt · Transparent PNG
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              )}
            </Box>

            {/* Right Column: Real-Time Stroke & Paper Filters */}
            <Box
              sx={{
                p: 2,
                borderRadius: 2,
                bgcolor: 'rgba(11, 15, 23, 0.7)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                flexDirection: 'column',
                gap: 1.75,
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 700, color: '#F9FAFB', letterSpacing: '0.02em' }}>
                On-Paper Stroke Enhancement Filters
              </Typography>

              {/* Ink Color Replacement */}
              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.75 }}>
                  Pen Ink Finish
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                  {SCAN_INK_MODES.map(mode => {
                    const active = scanInkColor === mode.value;
                    return (
                      <Button
                        key={mode.value}
                        size="small"
                        variant={active ? 'contained' : 'outlined'}
                        onClick={() => setScanInkColor(mode.value)}
                        sx={{ minWidth: 0, px: 1, py: 0.35, fontSize: 10.5, whiteSpace: 'nowrap' }}
                      >
                        {mode.value !== 'original' && (
                          <Box
                            sx={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              bgcolor: mode.value,
                              mr: 0.6,
                              border: '1px solid rgba(255,255,255,0.45)',
                            }}
                          />
                        )}
                        {mode.label}
                      </Button>
                    );
                  })}
                </Box>
              </Box>

              {/* Background Paper Cutoff Slider */}
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Paper Background Cutoff
                  </Typography>
                  <Typography className="mono" sx={{ fontSize: 11, color: '#818CF8' }}>
                    {threshold}
                  </Typography>
                </Box>
                <Slider
                  size="small"
                  min={90}
                  max={245}
                  value={threshold}
                  disabled={!removeBackground}
                  onChange={(_, v) => setThreshold(v as number)}
                />
              </Box>

              {/* Stroke Contrast / Sharpness Slider */}
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Stroke Contrast & Ink Density
                  </Typography>
                  <Typography className="mono" sx={{ fontSize: 11, color: '#818CF8' }}>
                    {contrastBoost.toFixed(1)}x
                  </Typography>
                </Box>
                <Slider
                  size="small"
                  min={1.0}
                  max={4.0}
                  step={0.1}
                  value={contrastBoost}
                  onChange={(_, v) => setContrastBoost(v as number)}
                />
              </Box>

              {/* Pen Nib / Stroke Weight */}
              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>
                  Stroke Weight (Paper Bleed)
                </Typography>
                <ToggleButtonGroup
                  size="small"
                  fullWidth
                  exclusive
                  value={strokeBoldness}
                  onChange={(_, v) => v !== null && setStrokeBoldness(v)}
                >
                  <ToggleButton value={0} sx={{ py: 0.4, fontSize: 11, whiteSpace: 'nowrap' }}>
                    Fine Nib
                  </ToggleButton>
                  <ToggleButton value={1} sx={{ py: 0.4, fontSize: 11, whiteSpace: 'nowrap' }}>
                    Fountain Pen
                  </ToggleButton>
                  <ToggleButton value={2} sx={{ py: 0.4, fontSize: 11, whiteSpace: 'nowrap' }}>
                    Wet Felt Tip
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>

              {/* Switches */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, pt: 0.5 }}>
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={removeBackground}
                      onChange={e => setRemoveBackground(e.target.checked)}
                    />
                  }
                  label={<Typography variant="caption" sx={{ color: '#D1D5DB' }}>Strip paper background to transparent</Typography>}
                />
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={autoCropInk}
                      disabled={!removeBackground}
                      onChange={e => setAutoCropInk(e.target.checked)}
                    />
                  }
                  label={<Typography variant="caption" sx={{ color: '#D1D5DB' }}>Auto-trim whitespace around strokes</Typography>}
                />
              </Box>
            </Box>
          </Box>
        )}

        {/* ─── TAB 4: OFFICIAL VECTOR STAMP ─── */}
        {tab === 'stamp' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
              {STAMP_PRESETS.map(st => (
                <Button
                  key={st.label}
                  variant={selectedStamp.label === st.label ? 'contained' : 'outlined'}
                  onClick={() => setSelectedStamp(st)}
                  sx={{ py: 1, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}
                >
                  {st.label}
                </Button>
              ))}
            </Box>

            <Box
              sx={{
                bgcolor: '#F9FAFB',
                borderRadius: 2,
                p: 3,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Box
                sx={{
                  border: `3px solid ${selectedStamp.color}`,
                  px: 3.5,
                  py: 1.25,
                  textAlign: 'center',
                  color: selectedStamp.color,
                }}
              >
                <Typography sx={{ fontWeight: 800, fontSize: 24, letterSpacing: '0.06em' }}>
                  {selectedStamp.label}
                </Typography>
                <Typography className="mono" sx={{ fontSize: 10, fontWeight: 700 }}>
                  {selectedStamp.sub} {includeDate ? `· ${new Date().toISOString().slice(0, 10)}` : ''}
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                size="small"
                variant="outlined"
                onClick={() => setIncludeDate(d => !d)}
                sx={{ fontSize: 11 }}
              >
                {includeDate ? 'Hide Date Stamp' : 'Include Current Date'}
              </Button>
            </Box>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} variant="outlined" size="small">
          Cancel
        </Button>
        <Button onClick={handleInsert} variant="contained" size="small">
          Place on PDF Page
        </Button>
      </DialogActions>
    </Dialog>
  );
}
