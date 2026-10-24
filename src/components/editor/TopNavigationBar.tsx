import { useState } from 'react';
import { Box, IconButton, Tooltip, Button, TextField, CircularProgress, Menu, MenuItem, Divider, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { ArrowBack, Undo, Redo, MoreVert, ChevronLeft, ChevronRight, ZoomIn, DownloadOutlined } from '@mui/icons-material';
import AppearanceControl from '../AppearanceControl';

interface Props {
  docTitle: string; onTitleChange: (value: string) => void;
  onExport: () => void; onClear: () => void; onBack: () => void; isSaving: boolean;
  onAddPage: () => void; onDeletePage: () => void; numPages: number;
  canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void;
  onOpenSignature: () => void; onOpenStamp: () => void;
  panel: 'tools' | 'properties' | null; onPanel: (panel: 'tools' | 'properties') => void;
}

export default function TopNavigationBar(props: Props) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [settings, setSettings] = useState(false);
  const action = (run: () => void) => { setAnchor(null); run(); };
  return (
    <Box component="header" aria-label="Editor controls" sx={{ flexShrink: 0, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', px: { xs: 1, sm: 2 }, pt: 'env(safe-area-inset-top)' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1, minWidth: 0 }}>
        <IconButton aria-label="Return to workspace" disabled={props.isSaving} onClick={props.onBack}><ArrowBack /></IconButton>
        <TextField label="Document title" value={props.docTitle} onChange={event => props.onTitleChange(event.target.value)} disabled={props.isSaving} size="small" sx={{ flex: 1, minWidth: 0, '& input': { fontSize: 16 } }} />
        <Button variant="contained" aria-label="Export PDF" disabled={props.isSaving} onClick={props.onExport} sx={{ px: { xs: 1.5, sm: 2 }, flexShrink: 0 }}>
          {props.isSaving ? <CircularProgress size={20} color="inherit" /> : <DownloadOutlined sx={{ mr: 0.5 }} />}<Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Export PDF</Box><Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>Export</Box>
        </Button>
      </Box>
      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', pb: 1 }}>
        <Button variant={props.panel === 'tools' ? 'contained' : 'outlined'} aria-expanded={props.panel === 'tools'} onClick={() => props.onPanel('tools')} disabled={props.isSaving} sx={{ flex: 1, minWidth: 0, px: 1 }}>Tools</Button>
        <Button variant={props.panel === 'properties' ? 'contained' : 'outlined'} aria-expanded={props.panel === 'properties'} onClick={() => props.onPanel('properties')} disabled={props.isSaving} sx={{ flex: 1, minWidth: 0, px: 1 }}>Properties</Button>
        <Tooltip title="Undo annotation"><span><IconButton aria-label="Undo" disabled={!props.canUndo || props.isSaving} onClick={props.onUndo}><Undo /></IconButton></span></Tooltip>
        <Tooltip title="Redo annotation"><span><IconButton aria-label="Redo" disabled={!props.canRedo || props.isSaving} onClick={props.onRedo}><Redo /></IconButton></span></Tooltip>
        <IconButton aria-label="Document actions" aria-haspopup="menu" aria-expanded={!!anchor} onClick={event => setAnchor(event.currentTarget)}><MoreVert /></IconButton>
      </Box>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        <MenuItem disabled={props.isSaving} onClick={() => action(props.onOpenSignature)}>Sign PDF</MenuItem>
        <MenuItem disabled={props.isSaving} onClick={() => action(props.onOpenStamp)}>Add Stamp</MenuItem>
        <MenuItem disabled={props.isSaving} onClick={() => action(props.onAddPage)}>Append blank page</MenuItem>
        <MenuItem disabled={props.numPages <= 1 || props.isSaving} onClick={() => action(props.onDeletePage)}>Delete current page</MenuItem>
        <MenuItem disabled={props.isSaving} onClick={() => action(props.onClear)}>Clear all annotations</MenuItem>
        <Divider />
        <MenuItem onClick={() => action(() => setSettings(true))}>Appearance</MenuItem>
      </Menu>
      <Dialog open={settings} onClose={() => setSettings(false)} aria-labelledby="editor-appearance-title">
        <DialogTitle id="editor-appearance-title">Appearance</DialogTitle><DialogContent><AppearanceControl /></DialogContent><DialogActions><Button autoFocus onClick={() => setSettings(false)}>Done</Button></DialogActions>
      </Dialog>
    </Box>
  );
}

interface ViewProps {
  busy: boolean;
  zoom: number; onZoomIn: () => void; onZoomOut: () => void; onFitWidth: () => void;
  currentPageIndex: number; numPages: number; onPrevPage: () => void; onNextPage: () => void;
}

export function EditorViewControls(props: ViewProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <Box component="footer" aria-label="Document view" sx={{ flexShrink: 0, bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider', px: 1, py: 0.5, pb: 'max(4px, env(safe-area-inset-bottom))', display: 'flex', alignItems: 'center', gap: 0.25 }}>
      <IconButton aria-label="Previous page" disabled={props.busy || props.currentPageIndex === 0} onClick={props.onPrevPage}><ChevronLeft /></IconButton>
      <Box role="status" sx={{ minWidth: 64, textAlign: 'center', fontSize: 14 }}>Page {props.currentPageIndex + 1} / {props.numPages}</Box>
      <IconButton aria-label="Next page" disabled={props.busy || props.currentPageIndex >= props.numPages - 1} onClick={props.onNextPage}><ChevronRight /></IconButton>
      <Box sx={{ flex: 1 }} />
      <Button aria-label={`${Math.round(props.zoom * 100)}% zoom, fit width`} onClick={props.onFitWidth} sx={{ minWidth: 0, px: 1 }}>Fit width</Button>
      <IconButton aria-label="Zoom options" aria-haspopup="menu" aria-expanded={!!anchor} onClick={event => setAnchor(event.currentTarget)}><ZoomIn /></IconButton>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => { props.onZoomIn(); setAnchor(null); }}>Zoom in</MenuItem>
        <MenuItem onClick={() => { props.onZoomOut(); setAnchor(null); }}>Zoom out</MenuItem>
        <MenuItem onClick={() => { props.onFitWidth(); setAnchor(null); }}>Fit width</MenuItem>
      </Menu>
    </Box>
  );
}
