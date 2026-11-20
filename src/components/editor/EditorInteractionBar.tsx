import { Box, Button, IconButton, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import { NearMeOutlined, PanToolOutlined, DrawOutlined, EditOutlined, OpenInFull, ContentCopy, DeleteOutlined, Done } from '@mui/icons-material';
import type { EditorElement } from './types';

export type InteractionMode = 'select' | 'pan' | 'draw' | 'text';
function itemName(element: EditorElement) {
  return ({ text: 'Text', 'edit-text': 'PDF text', rect: 'Rectangle', circle: 'Circle', image: 'Image', highlight: 'Highlight', redact: 'Cover', draw: 'Drawing' })[element.type];
}
interface Props {
  status?: string; mode: InteractionMode; selected: EditorElement | null; resizing: boolean; disabled: boolean;
  onMode: (mode: InteractionMode) => void; onResize: () => void; onEdit: () => void; onDuplicate: () => void; onDelete: () => void;
}
export default function EditorInteractionBar(props: Props) {
  const hint = props.mode === 'pan' ? 'Swipe anywhere on the page to scroll.' : props.mode === 'draw' ? 'Draw on the page. Choose Select to move items.' : props.mode === 'text' ? 'Choose original text on the page or in Tools.' : 'Drag an item to move it. Swipe blank space to scroll.';
  return (
    <Box
      className="pdfy-glass"
      sx={{
        position: 'relative',
        zIndex: 9,
        flexShrink: 0,
        borderBottom: 1,
        borderColor: 'var(--pdfy-glass-hairline)',
        display: 'flex',
        flexDirection: { xs: 'column', md: 'row' },
        alignItems: { xs: 'stretch', md: 'center' },
        px: { xs: 1, sm: 1.5 },
        py: 0.5,
        gap: { xs: 0.25, md: 1.5 },
        '@media (min-width: 760px) and (max-height: 500px)': {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 1.5,
          '& .editor-mode-controls': { flex: '0 0 288px' },
        },
      }}
    >
      <ToggleButtonGroup
        className="editor-mode-controls lg-segmented"
        aria-label="Canvas mode"
        value={props.mode}
        exclusive
        onChange={(_, mode) => { if (mode) props.onMode(mode); }}
        sx={{
          display: 'flex',
          flex: { xs: '0 0 auto', md: '0 0 300px' },
          gap: 0.375,
          '& .MuiToggleButtonGroup-grouped': {
            border: 0,
            margin: 0,
            borderRadius: '999px !important',
          },
          '& .MuiToggleButton-root': {
            flex: 1,
            minWidth: 0,
            minHeight: 36,
            gap: 0.625,
            py: 0.375,
            px: 1,
            borderRadius: 999,
            fontSize: '0.8125rem',
            fontWeight: 500,
            color: 'text.primary',
            '@media (pointer: coarse)': { minHeight: 40 },
            '&.Mui-selected': {
              bgcolor: 'var(--lg-segmented-active-bg)',
              color: 'primary.main',
              fontWeight: 650,
              boxShadow: 'var(--lg-segmented-active-shadow)',
              '&:hover': {
                bgcolor: 'var(--lg-segmented-active-bg)',
              },
            },
          },
        }}
      >
        <ToggleButton value="select" disabled={props.disabled}><NearMeOutlined fontSize="small" />Select</ToggleButton>
        <ToggleButton value="pan" disabled={props.disabled}><PanToolOutlined fontSize="small" />Pan</ToggleButton>
        <ToggleButton value="draw" disabled={props.disabled}><DrawOutlined fontSize="small" />Draw</ToggleButton>
      </ToggleButtonGroup>
      <Box role="toolbar" aria-label="Selected item actions" sx={{ minHeight: 40, '@media (pointer: coarse)': { minHeight: 44 }, display: 'flex', alignItems: 'center', gap: 0.25, minWidth: 0, flex: 1 }}>
        {props.status ? <Typography role="status" variant="body2" sx={{ px: 1 }}>{props.status}</Typography> : props.selected && props.mode === 'select' ? <>
          <Typography variant="caption" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', pl: 1, fontWeight: 600 }}>{itemName(props.selected)}</Typography>
          <Button size="small" startIcon={<EditOutlined />} onClick={props.onEdit} disabled={props.disabled} sx={{ minWidth: 0, px: 1.25 }}>Edit</Button>
          <Button size="small" variant={props.resizing ? 'contained' : 'text'} startIcon={<OpenInFull />} aria-pressed={props.resizing} onClick={props.onResize} disabled={props.disabled} sx={{ minWidth: 0, px: 1.25 }}>Resize</Button>
          <Tooltip title="Duplicate item"><span><IconButton aria-label="Duplicate item" onClick={props.onDuplicate} disabled={props.disabled}><ContentCopy fontSize="small" /></IconButton></span></Tooltip>
          <Tooltip title={props.selected.type === 'edit-text' ? 'Revert text edit' : 'Delete item'}><span><IconButton aria-label={props.selected.type === 'edit-text' ? 'Revert text edit' : 'Delete item'} onClick={props.onDelete} disabled={props.disabled}><DeleteOutlined fontSize="small" /></IconButton></span></Tooltip>
        </> : <>
          <Typography id="editor-mode-hint" variant="caption" color="text.secondary" sx={{ flex: 1, minWidth: 0, px: 1, lineHeight: 1.35 }}>{hint}</Typography>
          {(props.mode === 'draw' || props.mode === 'text') && <Button size="small" variant="contained" aria-label={props.mode === 'draw' ? 'Done drawing' : 'Done editing text'} startIcon={<Done />} onClick={() => props.onMode('select')} disabled={props.disabled} sx={{ flexShrink: 0, px: 1.5, borderRadius: 999 }}>Done</Button>}
        </>}
      </Box>
    </Box>
  );
}
