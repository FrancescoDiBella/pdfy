import { Box, Typography, Tooltip, IconButton, Divider, Slider, Button } from '@mui/material';
import {
  TextFields as TextIcon,
  Image as ImageIcon,
  CropSquare as RectIcon,
  RadioButtonUnchecked as CircleIcon,
  BorderColor as HighlightIcon,
  Security as RedactIcon,
  Gesture as DrawIcon,
  Layers as LayersIcon,
  Delete as DeleteIcon,
  ContentCopy as DuplicateIcon,
  EditNote as EditNoteIcon,
  Draw as SignatureIcon,
} from '@mui/icons-material';
import type { EditorElement, ElementType } from './types';

interface Props {
  elements: EditorElement[];
  selectedId: string | null;
  isDrawMode: boolean;
  isEditTextMode: boolean;
  drawColor: string;
  drawWidth: number;
  drawOpacity: number;
  onChangeDrawColor: (c: string) => void;
  onChangeDrawWidth: (w: number) => void;
  onChangeDrawOpacity: (o: number) => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onAdd: (type: ElementType) => void;
  onOpenSignature: () => void;
  onToggleDrawMode: () => void;
  onToggleEditTextMode: () => void;
}

const typeIcon = (t: ElementType) => {
  if (t === 'text') return <TextIcon sx={{ fontSize: 16 }} />;
  if (t === 'image') return <ImageIcon sx={{ fontSize: 16 }} />;
  if (t === 'circle') return <CircleIcon sx={{ fontSize: 16 }} />;
  if (t === 'highlight') return <HighlightIcon sx={{ fontSize: 16 }} />;
  if (t === 'redact') return <RedactIcon sx={{ fontSize: 16 }} />;
  if (t === 'draw') return <DrawIcon sx={{ fontSize: 16 }} />;
  if (t === 'edit-text') return <EditNoteIcon sx={{ fontSize: 16 }} />;
  return <RectIcon sx={{ fontSize: 16 }} />;
};

const typeLabel = (el: EditorElement | ElementType) => {
  if (typeof el !== 'string' && el.label) return el.label;
  const t = typeof el === 'string' ? el : el.type;
  if (t === 'text') return 'Text Block';
  if (t === 'image') return 'Image / Sign';
  if (t === 'circle') return 'Circle Shape';
  if (t === 'highlight') return 'Highlight';
  if (t === 'redact') return 'Redaction';
  if (t === 'draw') return 'Freehand Ink';
  if (t === 'edit-text') return 'Edited PDF Text';
  return 'Rectangle';
};

export default function LeftToolboxPanel({
  elements,
  selectedId,
  isDrawMode,
  isEditTextMode,
  drawColor,
  drawWidth,
  drawOpacity,
  onChangeDrawColor,
  onChangeDrawWidth,
  onChangeDrawOpacity,
  onSelect,
  onDelete,
  onDuplicate,
  onAdd,
  onOpenSignature,
  onToggleDrawMode,
  onToggleEditTextMode,
}: Props) {
  const tools: { type: ElementType; label: string }[] = [
    { type: 'text', label: 'Text Block' },
    { type: 'highlight', label: 'Highlighter' },
    { type: 'redact', label: 'Redact Area' },
    { type: 'rect', label: 'Rectangle' },
    { type: 'circle', label: 'Circle' },
    { type: 'image', label: 'Upload Image' },
  ];

  return (
    <Box
      sx={{
        width: 280,
        flexShrink: 0,
        height: '100%',
        bgcolor: '#111827',
        borderRight: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Vector & Annotation Tools */}
      <Box sx={{ p: 2 }}>
        <Typography
          variant="caption"
          sx={{
            color: 'text.secondary',
            fontWeight: 600,
            mb: 1.25,
            display: 'block',
          }}
        >
          Insert Elements
        </Typography>

        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, mb: 1.5 }}>
          {tools.map(({ type, label }) => (
            <Tooltip key={type} title={label}>
              <Button
                onClick={() => onAdd(type)}
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 0.5,
                  py: 1.25,
                  px: 0.5,
                  borderRadius: '8px',
                  bgcolor: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: '#D1D5DB',
                  minWidth: 0,
                  '&:hover': {
                    bgcolor: 'rgba(99, 102, 241, 0.12)',
                    borderColor: '#6366F1',
                    color: '#F9FAFB',
                  },
                }}
              >
                {typeIcon(type)}
                <Typography sx={{ fontSize: 10, fontWeight: 500, whiteSpace: 'nowrap' }}>
                  {label.split(' ')[0]}
                </Typography>
              </Button>
            </Tooltip>
          ))}
        </Box>

        <Button
          fullWidth
          variant="outlined"
          startIcon={<SignatureIcon sx={{ fontSize: 16 }} />}
          onClick={onOpenSignature}
          sx={{ mb: 1.5, py: 0.85, fontSize: 12, whiteSpace: 'nowrap' }}
        >
          Signature & Stamp Pad
        </Button>

        <Typography
          variant="caption"
          sx={{
            color: 'text.secondary',
            fontWeight: 600,
            mb: 1,
            display: 'block',
          }}
        >
          Interactive Canvas Modes
        </Typography>

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
          <Button
            onClick={onToggleDrawMode}
            startIcon={<DrawIcon sx={{ fontSize: 15 }} />}
            sx={{
              py: 1,
              fontSize: 11.5,
              whiteSpace: 'nowrap',
              bgcolor: isDrawMode ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.03)',
              border: isDrawMode ? '1px solid #6366F1' : '1px solid rgba(255,255,255,0.08)',
              color: isDrawMode ? '#818CF8' : '#9CA3AF',
            }}
          >
            {isDrawMode ? 'Exit Ink' : 'Freehand'}
          </Button>

          <Button
            onClick={onToggleEditTextMode}
            startIcon={<EditNoteIcon sx={{ fontSize: 16 }} />}
            sx={{
              py: 1,
              fontSize: 11.5,
              whiteSpace: 'nowrap',
              bgcolor: isEditTextMode ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.03)',
              border: isEditTextMode ? '1px solid #6366F1' : '1px solid rgba(255,255,255,0.08)',
              color: isEditTextMode ? '#818CF8' : '#9CA3AF',
            }}
          >
            {isEditTextMode ? 'Exit Text' : 'Edit Text'}
          </Button>
        </Box>

        {/* Active Freehand Brush Settings */}
        {isDrawMode && (
          <Box
            sx={{
              mt: 1.5,
              p: 1.5,
              borderRadius: 1.5,
              bgcolor: 'rgba(11, 15, 25, 0.6)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Brush Color
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                {['#0F172A', '#EF4444', '#2563EB', '#10B981'].map(preset => (
                  <Box
                    key={preset}
                    onClick={() => onChangeDrawColor(preset)}
                    sx={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      bgcolor: preset,
                      cursor: 'pointer',
                      border: drawColor === preset ? '2px solid #F9FAFB' : '1px solid rgba(255,255,255,0.2)',
                    }}
                  />
                ))}
                <input
                  type="color"
                  value={drawColor}
                  onChange={e => onChangeDrawColor(e.target.value)}
                  style={{ width: 22, height: 22, border: 'none', background: 'transparent', cursor: 'pointer' }}
                />
              </Box>
            </Box>

            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>Stroke Width</Typography>
                <Typography className="mono" sx={{ fontSize: 10 }}>{drawWidth}px</Typography>
              </Box>
              <Slider
                size="small"
                min={1}
                max={16}
                value={drawWidth}
                onChange={(_, v) => onChangeDrawWidth(v as number)}
              />
            </Box>

            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>Ink Opacity</Typography>
                <Typography className="mono" sx={{ fontSize: 10 }}>{Math.round(drawOpacity * 100)}%</Typography>
              </Box>
              <Slider
                size="small"
                min={0.15}
                max={1}
                step={0.05}
                value={drawOpacity}
                onChange={(_, v) => onChangeDrawOpacity(v as number)}
              />
            </Box>
          </Box>
        )}
      </Box>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />

      {/* Layer Tree */}
      <Box sx={{ p: 2, flex: 1, overflow: 'auto' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <LayersIcon sx={{ fontSize: 15, color: 'text.secondary' }} />
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
              Page Layers
            </Typography>
          </Box>
          <Typography className="mono" sx={{ fontSize: 11, color: 'text.secondary' }}>
            {elements.length}
          </Typography>
        </Box>

        {elements.length === 0 && (
          <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', py: 2, textAlign: 'center' }}>
            No annotations on this page yet.
          </Typography>
        )}

        {[...elements].reverse().map(el => (
          <Box
            key={el.id}
            onClick={() => onSelect(el.id)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              p: 1,
              mb: 0.5,
              borderRadius: '8px',
              cursor: 'pointer',
              bgcolor: selectedId === el.id ? 'rgba(99,102,241,0.14)' : 'transparent',
              border: selectedId === el.id ? '1px solid rgba(99,102,241,0.35)' : '1px solid transparent',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' },
              transition: 'all 0.15s ease',
            }}
          >
            <Box sx={{ color: selectedId === el.id ? '#818CF8' : '#9CA3AF', display: 'flex' }}>
              {typeIcon(el.type)}
            </Box>
            <Typography
              sx={{
                flex: 1,
                fontSize: 12,
                color: selectedId === el.id ? '#F9FAFB' : '#9CA3AF',
                fontWeight: selectedId === el.id ? 600 : 400,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {el.content ? el.content.slice(0, 22) : typeLabel(el)}
            </Typography>
            <Tooltip title="Duplicate Layer (Ctrl+D)">
              <IconButton
                size="small"
                onClick={e => {
                  e.stopPropagation();
                  onDuplicate(el.id);
                }}
                sx={{ p: 0.4 }}
              >
                <DuplicateIcon sx={{ fontSize: 13, color: '#6B7280', '&:hover': { color: '#F9FAFB' } }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Delete Layer (Del)">
              <IconButton
                size="small"
                onClick={e => {
                  e.stopPropagation();
                  onDelete(el.id);
                }}
                sx={{ p: 0.4 }}
              >
                <DeleteIcon sx={{ fontSize: 14, color: '#6B7280', '&:hover': { color: '#EF4444' } }} />
              </IconButton>
            </Tooltip>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
