import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Button,
  TextField,
  Divider,
  CircularProgress,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  SaveAlt as ExportIcon,
  DeleteSweep as ClearIcon,
  ChevronLeft as PrevIcon,
  ChevronRight as NextIcon,
  AddCircleOutlined as AddPageIcon,
  RemoveCircleOutlined as DeletePageIcon,
  Undo as UndoIcon,
  Redo as RedoIcon,
  Draw as SignatureIcon,
  Approval as StampIcon,
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
  currentPageIndex: number;
  numPages: number;
  onPrevPage: () => void;
  onNextPage: () => void;
  onAddPage: () => void;
  onDeletePage: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onOpenSignature: () => void;
  onOpenStamp: () => void;
}

export default function TopNavigationBar({
  docTitle,
  onTitleChange,
  zoom,
  onZoomIn,
  onZoomOut,
  onExport,
  onClear,
  onBack,
  isSaving,
  currentPageIndex,
  numPages,
  onPrevPage,
  onNextPage,
  onAddPage,
  onDeletePage,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onOpenSignature,
  onOpenStamp,
}: Props) {
  return (
    <Box
      sx={{
        width: '100%',
        height: 60,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        px: 2.5,
        gap: 1.5,
        bgcolor: '#111827',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        zIndex: 1100,
      }}
    >
      {/* Back + Brand */}
      <Tooltip title="Return to Workspace">
        <IconButton onClick={onBack} size="small">
          <BackIcon sx={{ fontSize: 19 }} />
        </IconButton>
      </Tooltip>

      <Typography
        variant="h1"
        sx={{
          fontSize: 16,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        PDFy Studio
      </Typography>

      <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.08)', mx: 0.5 }} />

      {/* Document Title */}
      <TextField
        variant="standard"
        value={docTitle}
        onChange={e => onTitleChange(e.target.value)}
        slotProps={{
          input: {
            disableUnderline: true,
            sx: {
              fontSize: 13,
              fontWeight: 500,
              color: '#F9FAFB',
              px: 1,
              py: 0.5,
              borderRadius: '6px',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' },
              '&.Mui-focused': { bgcolor: 'rgba(255,255,255,0.06)' },
            },
          },
        }}
        sx={{ width: 200 }}
      />

      <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.08)', mx: 0.5 }} />

      {/* Undo / Redo */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
        <Tooltip title="Undo (Ctrl+Z)">
          <span>
            <IconButton size="small" onClick={onUndo} disabled={!canUndo}>
              <UndoIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Redo (Ctrl+Y)">
          <span>
            <IconButton size="small" onClick={onRedo} disabled={!canRedo}>
              <RedoIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {/* Quick Sign & Stamp Buttons */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<SignatureIcon sx={{ fontSize: 15 }} />}
          onClick={onOpenSignature}
          sx={{ py: 0.5, px: 1.5, fontSize: 12, whiteSpace: 'nowrap' }}
        >
          Sign PDF
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={<StampIcon sx={{ fontSize: 15 }} />}
          onClick={onOpenStamp}
          sx={{ py: 0.5, px: 1.5, fontSize: 12, whiteSpace: 'nowrap' }}
        >
          Add Stamp
        </Button>
      </Box>

      <Box sx={{ flex: 1 }} />

      {/* Zoom Controls */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Tooltip title="Zoom Out">
          <IconButton size="small" onClick={onZoomOut}>
            <ZoomOutIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Typography className="mono" sx={{ color: '#9CA3AF', minWidth: 44, textAlign: 'center', fontSize: 12 }}>
          {Math.round(zoom * 100)}%
        </Typography>
        <Tooltip title="Zoom In">
          <IconButton size="small" onClick={onZoomIn}>
            <ZoomInIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Box>

      <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.08)', mx: 0.5 }} />

      {/* Page Navigation */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Tooltip title="Previous Page">
          <span>
            <IconButton size="small" onClick={onPrevPage} disabled={currentPageIndex === 0}>
              <PrevIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </span>
        </Tooltip>
        <Typography className="mono" sx={{ color: '#9CA3AF', minWidth: 78, textAlign: 'center', fontSize: 12, whiteSpace: 'nowrap' }}>
          Page {currentPageIndex + 1} / {numPages}
        </Typography>
        <Tooltip title="Next Page">
          <span>
            <IconButton size="small" onClick={onNextPage} disabled={currentPageIndex === numPages - 1}>
              <NextIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </span>
        </Tooltip>

        <Tooltip title="Append Blank Page">
          <IconButton size="small" onClick={onAddPage} sx={{ color: '#10B981' }}>
            <AddPageIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>

        <Tooltip title="Delete Current Page">
          <span>
            <IconButton size="small" onClick={onDeletePage} disabled={numPages <= 1} sx={{ color: '#EF4444' }}>
              <DeletePageIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.08)', mx: 0.5 }} />

      {/* Clear & Export */}
      <Tooltip title="Clear All Annotations">
        <IconButton size="small" onClick={onClear} sx={{ color: '#EF4444' }}>
          <ClearIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>

      <Button
        variant="contained"
        startIcon={isSaving ? <CircularProgress size={15} color="inherit" /> : <ExportIcon />}
        disabled={isSaving}
        onClick={onExport}
        sx={{ px: 2.25, py: 0.75, whiteSpace: 'nowrap', flexShrink: 0 }}
      >
        {isSaving ? 'Exporting…' : 'Export PDF'}
      </Button>
    </Box>
  );
}
