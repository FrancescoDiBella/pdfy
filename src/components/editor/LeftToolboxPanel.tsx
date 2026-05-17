import { Box, Typography, Tooltip, IconButton, Divider } from '@mui/material';
import {
  TextFields as TextIcon,
  Image as ImageIcon,
  CropSquare as RectIcon,
  Layers as LayersIcon,
  Delete as DeleteIcon,
  Visibility as VisIcon,
} from '@mui/icons-material';
import type { EditorElement, ElementType } from './types';

interface Props {
  elements: EditorElement[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: (type: ElementType) => void;
}

const typeIcon = (t: ElementType) =>
  t === 'text' ? <TextIcon sx={{ fontSize: 16 }} /> : t === 'image' ? <ImageIcon sx={{ fontSize: 16 }} /> : <RectIcon sx={{ fontSize: 16 }} />;

const typeLabel = (t: ElementType) =>
  t === 'text' ? 'Text' : t === 'image' ? 'Image' : 'Rectangle';

export default function LeftToolboxPanel({ elements, selectedId, onSelect, onDelete, onAdd }: Props) {
  return (
    <Box sx={{
      width: 280, flexShrink: 0, height: '100%',
      bgcolor: 'rgba(22, 30, 49, 0.65)',
      backdropFilter: 'blur(16px) saturate(180%)',
      borderRight: '1px solid rgba(255,255,255,0.08)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Asset Library */}
      <Box sx={{ p: 2.5 }}>
        <Typography variant="caption" sx={{ color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, mb: 1.5, display: 'block' }}>
          Add Element
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {(['text', 'image', 'rect'] as ElementType[]).map(t => (
            <Tooltip key={t} title={`Add ${typeLabel(t)}`}>
              <IconButton
                onClick={() => onAdd(t)}
                sx={{
                  flex: 1, borderRadius: '8px', py: 1.5,
                  bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.08)', borderColor: '#6366F1' },
                }}
              >
                {typeIcon(t)}
              </IconButton>
            </Tooltip>
          ))}
        </Box>
      </Box>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />

      {/* Layer Tree */}
      <Box sx={{ p: 2.5, flex: 1, overflow: 'auto' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <LayersIcon sx={{ fontSize: 14, color: '#4B5563' }} />
          <Typography variant="caption" sx={{ color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
            Layers ({elements.length})
          </Typography>
        </Box>

        {elements.length === 0 && (
          <Typography variant="caption" sx={{ color: '#4B5563', fontStyle: 'italic' }}>No elements yet</Typography>
        )}

        {[...elements].reverse().map(el => (
          <Box
            key={el.id}
            onClick={() => onSelect(el.id)}
            sx={{
              display: 'flex', alignItems: 'center', gap: 1, p: 1, mb: 0.5,
              borderRadius: '8px', cursor: 'pointer',
              bgcolor: selectedId === el.id ? 'rgba(99,102,241,0.12)' : 'transparent',
              border: selectedId === el.id ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' },
              transition: 'all 0.15s ease',
            }}
          >
            <Box sx={{ color: selectedId === el.id ? '#6366F1' : '#9CA3AF' }}>{typeIcon(el.type)}</Box>
            <Typography sx={{ flex: 1, fontSize: 12, color: selectedId === el.id ? '#F9FAFB' : '#9CA3AF', fontWeight: selectedId === el.id ? 500 : 400 }}>
              {typeLabel(el.type)}
            </Typography>
            <VisIcon sx={{ fontSize: 14, color: '#4B5563' }} />
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); onDelete(el.id); }} sx={{ p: 0.5 }}>
              <DeleteIcon sx={{ fontSize: 14, color: '#4B5563', '&:hover': { color: '#EF4444' } }} />
            </IconButton>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
