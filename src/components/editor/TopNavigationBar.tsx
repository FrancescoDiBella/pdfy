import { useState } from 'react';
import type { RefObject } from 'react';
import { Box, IconButton, Tooltip, Button, TextField, CircularProgress, Menu, MenuItem, Divider, Dialog, DialogTitle, DialogContent, DialogActions, ListItemIcon } from '@mui/material';
import { ArrowBack, Undo, Redo, MoreVert, ChevronLeft, ChevronRight, ZoomIn, DownloadOutlined, WidgetsOutlined, Tune, Gesture, ApprovalOutlined, NoteAddOutlined, DeleteOutlined, ClearAll, PaletteOutlined, FolderOpenOutlined, PrintOutlined, CompressOutlined, DashboardCustomizeOutlined, Check, VisibilityOffOutlined } from '@mui/icons-material';
import AppearanceControl from '../AppearanceControl';

interface Props {
  actionsRef: RefObject<HTMLButtonElement | null>;
  docTitle: string; onTitleChange: (value: string) => void;
  onOpenPDF: () => void; onNewPDF: () => void;
  onExport: () => void; onPrint: () => void; onCompress?: () => void; onOrganize?: () => void; onClear: () => void; onBack: () => void; busy: boolean; exporting: boolean;
  onAddPage: () => void; onDeletePage: () => void; numPages: number;
  canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void;
  onOpenSignature: () => void; onOpenStamp: () => void;
  panel: 'tools' | 'properties' | null; onPanel: (panel: 'tools' | 'properties') => void;
  redactedPageCount?: number; burnInRedactions?: boolean; onToggleBurnInRedactions?: () => void;
}

export default function TopNavigationBar({ actionsRef, ...props }: Props) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [settings, setSettings] = useState(false);
  const action = (run: () => void) => { setAnchor(null); run(); };
  const redactedPages = props.redactedPageCount ?? 0;
  return (
    <Box
      component="header"
      aria-label="Editor controls"
      className="pdfy-glass"
      sx={{
        position: 'relative',
        zIndex: 10,
        flexShrink: 0,
        borderBottom: 1,
        borderColor: 'var(--pdfy-glass-hairline)',
        px: { xs: 1, sm: 2 },
        pt: 'max(10px, env(safe-area-inset-top, 0px))',
        pb: 0.75,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr)',
        '@media (min-width: 900px), (min-width: 760px) and (max-height: 500px)': {
          gridTemplateColumns: 'minmax(0, 1fr) auto',
          alignItems: 'center',
          gap: 1,
          '& .editor-tools-row': { pt: 0, pb: 0 },
          '& .editor-tools-button': { flex: '0 0 auto', minWidth: 100 },
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.25, minWidth: 0 }}>
        <IconButton aria-label="Return to workspace" disabled={props.busy} onClick={props.onBack}><ArrowBack /></IconButton>
        <TextField
          label="Document title"
          value={props.docTitle}
          onChange={event => props.onTitleChange(event.target.value)}
          disabled={props.busy}
          size="small"
          sx={{
            flex: 1,
            minWidth: 0,
            '& input': { fontSize: 16 },
            '& .MuiOutlinedInput-root': {
              borderRadius: '14px',
              bgcolor: 'var(--pdfy-glass-subtle)',
            },
          }}
        />
        <Button variant="contained" aria-label="Export PDF" disabled={props.busy} onClick={props.onExport} sx={{ px: { xs: 1.5, sm: 2 }, borderRadius: 999, flexShrink: 0 }}>
          {props.exporting ? <CircularProgress aria-label="Working on the PDF" size={20} color="inherit" /> : <DownloadOutlined sx={{ mr: 0.5 }} />}<Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Export PDF</Box><Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>Export</Box>
        </Button>
      </Box>
      <Box className="editor-tools-row" sx={{ display: 'flex', gap: 0.5, alignItems: 'center', pt: 0.25, pb: 0 }}>
        <Button className="editor-tools-button" startIcon={<WidgetsOutlined />} variant={props.panel === 'tools' ? 'contained' : 'outlined'} aria-expanded={props.panel === 'tools'} onClick={() => props.onPanel('tools')} disabled={props.busy} sx={{ flex: 1, minWidth: 0, px: 1.25, borderRadius: 999 }}>Tools</Button>
        <Tooltip title="Properties">
          <span>
            <IconButton
              aria-label="Properties"
              aria-expanded={props.panel === 'properties'}
              color={props.panel === 'properties' ? 'primary' : 'default'}
              onClick={() => props.onPanel('properties')}
              disabled={props.busy}
              sx={{
                bgcolor: props.panel === 'properties' ? 'var(--pdfy-glass-active-bg)' : 'transparent',
                boxShadow: props.panel === 'properties' ? 'var(--pdfy-glass-active-shadow)' : 'none',
              }}
            >
              <Tune />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Undo annotation"><span><IconButton aria-label="Undo" disabled={!props.canUndo || props.busy} onClick={props.onUndo}><Undo /></IconButton></span></Tooltip>
        <Tooltip title="Redo annotation"><span><IconButton aria-label="Redo" disabled={!props.canRedo || props.busy} onClick={props.onRedo}><Redo /></IconButton></span></Tooltip>
        <IconButton ref={actionsRef} aria-label="Document actions" aria-haspopup="menu" aria-expanded={!!anchor} disabled={props.busy} onClick={event => setAnchor(event.currentTarget)}><MoreVert /></IconButton>
      </Box>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)} slotProps={{ paper: { variant: 'outlined', sx: { borderColor: 'var(--pdfy-glass-border)' } }, list: { sx: { '& .MuiMenuItem-root': { minHeight: 44 } } } }}>
        {redactedPages > 0 && props.onToggleBurnInRedactions && (
          <MenuItem
            role="menuitemcheckbox"
            aria-checked={props.burnInRedactions !== false}
            disabled={props.busy}
            onClick={() => action(props.onToggleBurnInRedactions!)}
          >
            <ListItemIcon>{props.burnInRedactions !== false ? <Check /> : <VisibilityOffOutlined />}</ListItemIcon>
            Burn-in redactions ({redactedPages} {redactedPages === 1 ? 'page' : 'pages'})
          </MenuItem>
        )}
        {redactedPages > 0 && props.onToggleBurnInRedactions && <Divider sx={{ borderColor: 'var(--pdfy-glass-hairline)' }} />}
        <MenuItem disabled={props.busy} onClick={() => action(props.onPrint)}><ListItemIcon><PrintOutlined /></ListItemIcon>Print PDF…</MenuItem>
        {props.onOrganize && <MenuItem disabled={props.busy} onClick={() => action(props.onOrganize!)}><ListItemIcon><DashboardCustomizeOutlined /></ListItemIcon>Organize pages…</MenuItem>}
        {props.onCompress && <MenuItem disabled={props.busy} onClick={() => action(props.onCompress!)}><ListItemIcon><CompressOutlined /></ListItemIcon>Compress PDF…</MenuItem>}
        <MenuItem disabled={props.busy} onClick={() => action(props.onOpenPDF)}><ListItemIcon><FolderOpenOutlined /></ListItemIcon>Open another PDF</MenuItem>
        <MenuItem disabled={props.busy} onClick={() => action(props.onNewPDF)}><ListItemIcon><NoteAddOutlined /></ListItemIcon>New blank document</MenuItem>
        <Divider sx={{ borderColor: 'var(--pdfy-glass-hairline)' }} />
        <MenuItem disabled={props.busy} onClick={() => action(props.onOpenSignature)}><ListItemIcon><Gesture /></ListItemIcon>Sign PDF</MenuItem>
        <MenuItem disabled={props.busy} onClick={() => action(props.onOpenStamp)}><ListItemIcon><ApprovalOutlined /></ListItemIcon>Add Stamp</MenuItem>
        <MenuItem disabled={props.busy} onClick={() => action(props.onAddPage)}><ListItemIcon><NoteAddOutlined /></ListItemIcon>Append blank page</MenuItem>
        <MenuItem disabled={props.numPages <= 1 || props.busy} onClick={() => action(props.onDeletePage)}><ListItemIcon><DeleteOutlined /></ListItemIcon>Delete current page</MenuItem>
        <MenuItem disabled={props.busy} onClick={() => action(props.onClear)}><ListItemIcon><ClearAll /></ListItemIcon>Clear all annotations</MenuItem>
        <Divider sx={{ borderColor: 'var(--pdfy-glass-hairline)' }} />
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
    <Box
      component="footer"
      aria-label="Document view"
      className="pdfy-glass"
      sx={{
        position: 'relative',
        zIndex: 10,
        flexShrink: 0,
        borderTop: 1,
        borderColor: 'var(--pdfy-glass-hairline)',
        px: { xs: 0.75, sm: 1.5 },
        py: 0.5,
        pb: 'max(4px, env(safe-area-inset-bottom))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 0.5,
      }}
    >
      <Box className="lg-segmented" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0, flexShrink: 0 }}>
        <IconButton
          aria-label="Previous page"
          size="small"
          disabled={props.busy || props.currentPageIndex === 0}
          onClick={props.onPrevPage}
          sx={{ minWidth: 36, minHeight: 36, '@media (pointer: coarse)': { minWidth: 44, minHeight: 44 } }}
        >
          <ChevronLeft fontSize="small" />
        </IconButton>
        <Box role="status" className="tabular-nums" sx={{ minWidth: 56, px: 0.25, textAlign: 'center', fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          Page {props.currentPageIndex + 1} / {props.numPages}
        </Box>
        <IconButton
          aria-label="Next page"
          size="small"
          disabled={props.busy || props.currentPageIndex >= props.numPages - 1}
          onClick={props.onNextPage}
          sx={{ minWidth: 36, minHeight: 36, '@media (pointer: coarse)': { minWidth: 44, minHeight: 44 } }}
        >
          <ChevronRight fontSize="small" />
        </IconButton>
      </Box>
      <Box className="lg-segmented" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0, flexShrink: 0 }}>
        <Box component="span" className="tabular-nums" sx={{ display: 'none', '@media (min-width: 380px)': { display: 'inline' }, fontSize: 13, fontWeight: 600, color: 'text.secondary', fontVariantNumeric: 'tabular-nums', pl: 1, pr: 0.25 }}>
          {Math.round(props.zoom * 100)}%
        </Box>
        <Button
          size="small"
          aria-label={`${Math.round(props.zoom * 100)}% zoom, fit width`}
          disabled={props.busy}
          onClick={props.onFitWidth}
          sx={{
            minWidth: 0,
            minHeight: 36,
            px: { xs: 0.875, sm: 1.25 },
            borderRadius: 999,
            color: 'text.primary',
            whiteSpace: 'nowrap',
            '@media (pointer: coarse)': { minHeight: 44 },
          }}
        >
          Fit width
        </Button>
        <IconButton
          size="small"
          disabled={props.busy}
          aria-label="Zoom options"
          aria-haspopup="menu"
          aria-expanded={!!anchor}
          onClick={event => setAnchor(event.currentTarget)}
          sx={{ minWidth: 36, minHeight: 36, '@media (pointer: coarse)': { minWidth: 44, minHeight: 44 } }}
        >
          <ZoomIn fontSize="small" />
        </IconButton>
      </Box>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)} slotProps={{ paper: { variant: 'outlined', sx: { borderColor: 'var(--pdfy-glass-border)' } }, list: { sx: { '& .MuiMenuItem-root': { minHeight: 44 } } } }}>
        <MenuItem onClick={() => { props.onZoomIn(); setAnchor(null); }}>Zoom in</MenuItem>
        <MenuItem onClick={() => { props.onZoomOut(); setAnchor(null); }}>Zoom out</MenuItem>
        <MenuItem onClick={() => { props.onFitWidth(); setAnchor(null); }}>Fit width</MenuItem>
      </Menu>
    </Box>
  );
}
