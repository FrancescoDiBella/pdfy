import { useState } from 'react';
import type { RefObject } from 'react';
import { Box, IconButton, Tooltip, Button, TextField, CircularProgress, Menu, MenuItem, Divider, Dialog, DialogTitle, DialogContent, DialogActions, ListItemIcon } from '@mui/material';
import { ArrowBack, Undo, Redo, MoreVert, ChevronLeft, ChevronRight, ZoomIn, DownloadOutlined, WidgetsOutlined, Tune, Gesture, ApprovalOutlined, NoteAddOutlined, DeleteOutlined, ClearAll, PaletteOutlined, FolderOpenOutlined } from '@mui/icons-material';
import AppearanceControl from '../AppearanceControl';

interface Props {
  actionsRef: RefObject<HTMLButtonElement | null>;
  docTitle: string; onTitleChange: (value: string) => void;
  onOpenPDF: () => void; onNewPDF: () => void;
  onExport: () => void; onClear: () => void; onBack: () => void; busy: boolean; exporting: boolean;
  onAddPage: () => void; onDeletePage: () => void; numPages: number;
  canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void;
  onOpenSignature: () => void; onOpenStamp: () => void;
  panel: 'tools' | 'properties' | null; onPanel: (panel: 'tools' | 'properties') => void;
}

export default function TopNavigationBar({ actionsRef, ...props }: Props) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [settings, setSettings] = useState(false);
  const action = (run: () => void) => { setAnchor(null); run(); };
  return (
    <Box component="header" aria-label="Editor controls" sx={{ flexShrink: 0, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', px: { xs: 1, sm: 2 }, pt: 'env(safe-area-inset-top)', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', '@media (min-width: 900px), (min-width: 760px) and (max-height: 500px)': { gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: 1, '& .editor-tools-row': { pb: 0 }, '& .editor-tools-button': { flex: '0 0 auto', minWidth: 100 } } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, minWidth: 0 }}>
        <IconButton aria-label="Return to workspace" disabled={props.busy} onClick={props.onBack}><ArrowBack /></IconButton>
        <TextField label="Document title" value={props.docTitle} onChange={event => props.onTitleChange(event.target.value)} disabled={props.busy} size="small" sx={{ flex: 1, minWidth: 0, '& input': { fontSize: 16 } }} />
        <Button variant="contained" aria-label="Export PDF" disabled={props.busy} onClick={props.onExport} sx={{ px: { xs: 1.5, sm: 2 }, flexShrink: 0 }}>
          {props.exporting ? <CircularProgress aria-label="Working on the PDF" size={20} color="inherit" /> : <DownloadOutlined sx={{ mr: 0.5 }} />}<Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Export PDF</Box><Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>Export</Box>
        </Button>
      </Box>
      <Box className="editor-tools-row" sx={{ display: 'flex', gap: 0.5, alignItems: 'center', pb: 0.5 }}>
        <Button className="editor-tools-button" startIcon={<WidgetsOutlined />} variant={props.panel === 'tools' ? 'contained' : 'outlined'} aria-expanded={props.panel === 'tools'} onClick={() => props.onPanel('tools')} disabled={props.busy} sx={{ flex: 1, minWidth: 0, px: 1 }}>Tools</Button>
        <Tooltip title="Properties"><span><IconButton aria-label="Properties" aria-expanded={props.panel === 'properties'} color={props.panel === 'properties' ? 'primary' : 'default'} onClick={() => props.onPanel('properties')} disabled={props.busy}><Tune /></IconButton></span></Tooltip>
        <Tooltip title="Undo annotation"><span><IconButton aria-label="Undo" disabled={!props.canUndo || props.busy} onClick={props.onUndo}><Undo /></IconButton></span></Tooltip>
        <Tooltip title="Redo annotation"><span><IconButton aria-label="Redo" disabled={!props.canRedo || props.busy} onClick={props.onRedo}><Redo /></IconButton></span></Tooltip>
        <IconButton ref={actionsRef} aria-label="Document actions" aria-haspopup="menu" aria-expanded={!!anchor} disabled={props.busy} onClick={event => setAnchor(event.currentTarget)}><MoreVert /></IconButton>
      </Box>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        <MenuItem disabled={props.busy} onClick={() => action(props.onOpenPDF)}><ListItemIcon><FolderOpenOutlined /></ListItemIcon>Open another PDF</MenuItem>
        <MenuItem disabled={props.busy} onClick={() => action(props.onNewPDF)}><ListItemIcon><NoteAddOutlined /></ListItemIcon>New blank document</MenuItem>
        <Divider />
        <MenuItem disabled={props.busy} onClick={() => action(props.onOpenSignature)}><ListItemIcon><Gesture /></ListItemIcon>Sign PDF</MenuItem>
        <MenuItem disabled={props.busy} onClick={() => action(props.onOpenStamp)}><ListItemIcon><ApprovalOutlined /></ListItemIcon>Add Stamp</MenuItem>
        <MenuItem disabled={props.busy} onClick={() => action(props.onAddPage)}><ListItemIcon><NoteAddOutlined /></ListItemIcon>Append blank page</MenuItem>
        <MenuItem disabled={props.numPages <= 1 || props.busy} onClick={() => action(props.onDeletePage)}><ListItemIcon><DeleteOutlined /></ListItemIcon>Delete current page</MenuItem>
        <MenuItem disabled={props.busy} onClick={() => action(props.onClear)}><ListItemIcon><ClearAll /></ListItemIcon>Clear all annotations</MenuItem>
        <Divider />
        <MenuItem onClick={() => action(() => setSettings(true))}><ListItemIcon><PaletteOutlined /></ListItemIcon>Appearance</MenuItem>
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
      <Button aria-label={`${Math.round(props.zoom * 100)}% zoom, fit width`} disabled={props.busy} onClick={props.onFitWidth} sx={{ minWidth: 0, px: 1 }}>Fit width</Button>
      <IconButton disabled={props.busy} aria-label="Zoom options" aria-haspopup="menu" aria-expanded={!!anchor} onClick={event => setAnchor(event.currentTarget)}><ZoomIn /></IconButton>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => { props.onZoomIn(); setAnchor(null); }}>Zoom in</MenuItem>
        <MenuItem onClick={() => { props.onZoomOut(); setAnchor(null); }}>Zoom out</MenuItem>
        <MenuItem onClick={() => { props.onFitWidth(); setAnchor(null); }}>Fit width</MenuItem>
      </Menu>
    </Box>
  );
}
