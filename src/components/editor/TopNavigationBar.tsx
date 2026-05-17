import { Box, Typography, Chip, IconButton, Tooltip, Button, TextField, Divider, CircularProgress } from '@mui/material';
import {
  Lock as LockIcon,
  ArrowBack as BackIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  SaveAlt as ExportIcon,
  DeleteSweep as ClearIcon,
} from '@mui/icons-material';

interface Props {
  docTitle: string;
  onTitleChange: (v: string) => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onExport: () => void;
  onClear: () => void;
  onBack: () => void;
  isSaving: boolean;
}

export default function TopNavigationBar({ docTitle, onTitleChange, zoom, onZoomIn, onZoomOut, onExport, onClear, onBack, isSaving }: Props) {
  return (
    <Box sx={{
      width: '100%', height: 64, flexShrink: 0,
      display: 'flex', alignItems: 'center', px: 3, gap: 2,
      bgcolor: 'rgba(22, 30, 49, 0.65)',
      backdropFilter: 'blur(16px) saturate(180%)',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      zIndex: 1100,
    }}>
      {/* Logo & Back */}
      <Tooltip title="Back to tools">
        <IconButton onClick={onBack} sx={{ mr: 0.5 }}>
          <BackIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </Tooltip>

      <Box sx={{
        width: 32, height: 32, borderRadius: '8px',
        background: 'linear-gradient(135deg, #6366F1, #A855F7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Typography sx={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>P</Typography>
      </Box>

      <Typography variant="h1" sx={{ fontSize: 18, mr: 1, whiteSpace: 'nowrap' }}>
        PDFy <span style={{ color: '#A855F7', fontWeight: 300 }}>Studio</span>
      </Typography>

      <Chip
        icon={<LockIcon sx={{ fontSize: '12px !important' }} />}
        label="100% Local"
        size="small"
        sx={{
          bgcolor: 'rgba(16,185,129,0.12)', color: '#10B981',
          border: '1px solid rgba(16,185,129,0.25)',
          fontWeight: 600, fontSize: 10, height: 24,
          '& .MuiChip-icon': { color: '#10B981' },
        }}
      />

      <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.08)', mx: 1 }} />

      {/* Document Title */}
      <TextField
        variant="standard"
        value={docTitle}
        onChange={e => onTitleChange(e.target.value)}
        slotProps={{
          input: {
            disableUnderline: true,
            sx: {
              fontSize: 14, fontWeight: 500, color: '#F9FAFB',
              px: 1, py: 0.5, borderRadius: '6px',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' },
              '&.Mui-focused': { bgcolor: 'rgba(255,255,255,0.06)' },
            },
          },
        }}
        sx={{ flex: 1, maxWidth: 300 }}
      />

      <Box sx={{ flex: 1 }} />

      {/* Zoom Controls */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <IconButton size="small" onClick={onZoomOut}><ZoomOutIcon sx={{ fontSize: 18 }} /></IconButton>
        <Typography className="mono" sx={{ color: '#9CA3AF', minWidth: 40, textAlign: 'center', fontSize: 12 }}>
          {Math.round(zoom * 100)}%
        </Typography>
        <IconButton size="small" onClick={onZoomIn}><ZoomInIcon sx={{ fontSize: 18 }} /></IconButton>
      </Box>

      <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.08)', mx: 1 }} />

      {/* Actions */}
      <Tooltip title="Clear Canvas">
        <IconButton onClick={onClear} sx={{ color: '#EF4444' }}>
          <ClearIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>

      <Button
        variant="contained"
        startIcon={isSaving ? <CircularProgress size={16} color="inherit" /> : <ExportIcon />}
        disabled={isSaving}
        onClick={onExport}
        sx={{ px: 2.5 }}
      >
        {isSaving ? 'Exporting…' : 'Export PDF'}
      </Button>
    </Box>
  );
}
