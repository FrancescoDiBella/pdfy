import { Box, Typography, TextField, Slider, Divider, ToggleButtonGroup, ToggleButton, MenuItem, Button, IconButton, FormControlLabel, Switch } from '@mui/material';
import { ArrowBack, ArrowForward, ArrowUpward, ArrowDownward } from '@mui/icons-material';
import type { EditorElement } from './types';

interface Props {
  element: EditorElement | null; onUpdate: (id: string, patch: Partial<EditorElement>) => void;
  onDelete: (id: string) => void; onDuplicate: (id: string) => void;
}

function NumericField({ label, value, min = 0, onChange }: { label: string; value: number; min?: number; onChange: (value: number) => void }) {
  return <TextField label={label} type="number" value={Math.round(value)} fullWidth slotProps={{ htmlInput: { min, inputMode: 'decimal' } }} onChange={event => {
    const next = Number(event.target.value); if (Number.isFinite(next)) onChange(Math.max(min, next));
  }} />;
}

export default function RightPropertiesPanel({ element, onUpdate, onDelete, onDuplicate }: Props) {
  if (!element) return <Box sx={{ p: 2 }}><Typography>Select an item on the page or in Tools, then edit its text, position, and appearance here.</Typography></Box>;
  const text = element.type === 'text' || element.type === 'edit-text';
  const colorKey = text || element.type === 'draw' ? 'strokeColor' : 'fillColor';
  return (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      {text && <TextField label="Text content" helperText={element.type === 'edit-text' ? 'This covers the original text; it remains in the PDF.' : 'Resize the box to show more lines.'} multiline minRows={2} maxRows={5} value={element.content ?? ''} onChange={event => onUpdate(element.id, { content: event.target.value })} fullWidth />}
      {element.type === 'image' && <FormControlLabel label="Keep image proportions" control={<Switch checked={element.lockAspectRatio !== false} onChange={(_, checked) => onUpdate(element.id, { lockAspectRatio: checked })} />} />}
      <Typography variant="h2">Position and size</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.5 }}>
        <NumericField label="Horizontal position" value={element.x} onChange={x => onUpdate(element.id, { x })} />
        <NumericField label="Vertical position" value={element.y} onChange={y => onUpdate(element.id, { y })} />
        <NumericField label="Width" value={element.width} min={element.type === 'edit-text' ? .1 : 10} onChange={width => onUpdate(element.id, { width })} />
        <NumericField label="Height" value={element.height} min={element.type === 'edit-text' ? .1 : 10} onChange={height => onUpdate(element.id, { height })} />
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 1 }}>
        {[{ label: 'left', x: -10, y: 0, icon: <ArrowBack /> }, { label: 'up', x: 0, y: -10, icon: <ArrowUpward /> }, { label: 'down', x: 0, y: 10, icon: <ArrowDownward /> }, { label: 'right', x: 10, y: 0, icon: <ArrowForward /> }].map(move => <IconButton key={move.label} aria-label={`Move selection ${move.label}`} onClick={() => onUpdate(element.id, { x: Math.max(0, element.x + move.x), y: Math.max(0, element.y + move.y) })}>{move.icon}</IconButton>)}
      </Box>
      <Divider />
      {element.type !== 'image' && <TextField label={text ? 'Text color' : element.type === 'draw' ? 'Stroke color' : 'Fill color'} type="color" value={element[colorKey] ?? (text ? '#0F172A' : '#6366F1')} onChange={event => onUpdate(element.id, { [colorKey]: event.target.value })} fullWidth />}
      {element.type === 'edit-text' && <TextField label="Background mask color" type="color" value={element.fillColor ?? '#FFFFFF'} onChange={event => onUpdate(element.id, { fillColor: event.target.value })} fullWidth />}
      {element.type !== 'redact' && <Box><Typography>Opacity: {Math.round((element.opacity ?? 1) * 100)}%</Typography><Slider aria-label="Item opacity" min={0.1} max={1} step={0.05} value={element.opacity ?? 1} onChange={(_, opacity) => onUpdate(element.id, { opacity: opacity as number })} /></Box>}
      {['rect', 'circle', 'draw'].includes(element.type) && <Box><Typography>Stroke width</Typography><Slider aria-label="Item stroke width" min={0} max={12} value={element.strokeWidth ?? 2} onChange={(_, strokeWidth) => onUpdate(element.id, { strokeWidth: strokeWidth as number })} /></Box>}
      {text && <>
        <TextField select label="Text rotation" value={element.textRotation ?? 0} onChange={event => { const textRotation = Number(event.target.value); const sideways = textRotation % 180 !== (element.textRotation ?? 0) % 180; onUpdate(element.id, { textRotation, ...(sideways ? { width: element.height, height: element.width } : {}) }); }} fullWidth>{[0, 90, 180, 270].map(rotation => <MenuItem key={rotation} value={rotation}>{rotation}°</MenuItem>)}</TextField>
        <NumericField label="Font size" value={element.fontSize ?? 16} min={1} onChange={fontSize => onUpdate(element.id, { fontSize })} />
        <TextField select label="Font family" value={element.fontFamily ?? 'Helvetica'} onChange={event => onUpdate(element.id, { fontFamily: event.target.value })} fullWidth>{['Helvetica', 'Times Roman', 'Courier'].map(font => <MenuItem key={font} value={font}>{font}</MenuItem>)}</TextField>
        <ToggleButtonGroup value={element.textAlign ?? 'left'} exclusive onChange={(_, value) => { if (value) onUpdate(element.id, { textAlign: value }); }} aria-label="Text alignment" fullWidth>{['left', 'center', 'right'].map(align => <ToggleButton key={align} value={align}>{align}</ToggleButton>)}</ToggleButtonGroup>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}><Button variant="outlined" aria-pressed={(element.fontWeight === 700 || element.fontWeight === 'bold')} onClick={() => onUpdate(element.id, { fontWeight: (element.fontWeight === 700 || element.fontWeight === 'bold') ? 400 : 700 })}>Bold</Button><Button variant="outlined" aria-pressed={element.fontStyle === 'italic'} onClick={() => onUpdate(element.id, { fontStyle: element.fontStyle === 'italic' ? 'normal' : 'italic' })}>Italic</Button></Box>
      </>}
      <Divider /><Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}><Button variant="outlined" onClick={() => onDuplicate(element.id)}>Duplicate item</Button><Button variant="outlined" color="error" onClick={() => onDelete(element.id)}>{element.type === 'edit-text' ? 'Revert text edit' : 'Delete item'}</Button></Box>
    </Box>
  );
}
