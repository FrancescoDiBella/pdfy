import { Box, Typography, IconButton, Divider, Slider, Button, TextField } from '@mui/material';
import { DeleteOutlined, ContentCopy, TextFields, BorderColorOutlined, CropSquare, RadioButtonUnchecked, ImageOutlined, Rectangle, DrawOutlined, EditNote, Gesture, ApprovalOutlined, LayersOutlined } from '@mui/icons-material';
import type { EditorElement, ElementType } from './types';

interface Props {
  elements: EditorElement[]; selectedId: string | null; isDrawMode: boolean; isEditTextMode: boolean;
  drawColor: string; drawWidth: number; drawOpacity: number;
  onChangeDrawColor: (color: string) => void; onChangeDrawWidth: (width: number) => void; onChangeDrawOpacity: (opacity: number) => void;
  pdfText: { index: number; text: string }[]; onEditPDFText: (index: number) => void;
  onSelect: (id: string) => void; onDelete: (id: string) => void; onDuplicate: (id: string) => void;
  onAdd: (type: ElementType) => void; onOpenSignature: () => void; onOpenStamp: () => void; onToggleDrawMode: () => void; onToggleEditTextMode: () => void;
}

const tools = [
  { type: 'text', label: 'Text Block', icon: <TextFields /> }, { type: 'highlight', label: 'Highlighter', icon: <BorderColorOutlined /> },
  { type: 'rect', label: 'Rectangle', icon: <CropSquare /> }, { type: 'circle', label: 'Circle', icon: <RadioButtonUnchecked /> },
  { type: 'image', label: 'Upload Image', icon: <ImageOutlined /> }, { type: 'redact', label: 'Cover area', icon: <Rectangle /> },
] as const;
const tile = { minHeight: 72, display: 'flex', flexDirection: 'column', gap: 0.5, p: 1, textAlign: 'center', lineHeight: 1.4 } as const;

export default function LeftToolboxPanel(props: Props) {
  return <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
    <Box><Typography variant="h3">Add to this page</Typography><Typography variant="body2" color="text.secondary">Choose a tool. Drag added items into place and use Edit for their details.</Typography></Box>
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
      {tools.map(tool => <Button key={tool.type} variant="outlined" onClick={() => props.onAdd(tool.type)} sx={tile}>{tool.icon}<span>{tool.label}</span></Button>)}
      <Button variant="outlined" onClick={props.onOpenSignature} sx={tile}><Gesture /><span>Signature</span></Button>
      <Button variant="outlined" onClick={props.onOpenStamp} sx={tile}><ApprovalOutlined /><span>Stamp</span></Button>
    </Box>
    <Divider />
    <Typography variant="h3">Edit the page</Typography>
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
      <Button variant={props.isDrawMode ? 'contained' : 'outlined'} aria-pressed={props.isDrawMode} onClick={props.onToggleDrawMode} sx={tile}><DrawOutlined /><span>{props.isDrawMode ? 'Stop drawing' : 'Freehand'}</span></Button>
      <Button variant={props.isEditTextMode ? 'contained' : 'outlined'} aria-pressed={props.isEditTextMode} onClick={props.onToggleEditTextMode} sx={tile}><EditNote /><span>{props.isEditTextMode ? 'Stop text editing' : 'Edit Text'}</span></Button>
    </Box>
    {props.isDrawMode && <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="h3">Drawing brush</Typography>
      <TextField type="color" label="Brush color" value={props.drawColor} onChange={event => props.onChangeDrawColor(event.target.value)} fullWidth />
      <Box><Typography>Brush width: {props.drawWidth}</Typography><Slider aria-label="Brush width" min={1} max={16} value={props.drawWidth} onChange={(_, value) => props.onChangeDrawWidth(value as number)} /></Box>
      <Box><Typography>Brush opacity: {Math.round(props.drawOpacity * 100)}%</Typography><Slider aria-label="Brush opacity" min={0.15} max={1} step={0.05} value={props.drawOpacity} onChange={(_, value) => props.onChangeDrawOpacity(value as number)} /></Box>
    </Box>}
    {props.isEditTextMode && <><Typography variant="h3">Text in this PDF</Typography>{!props.pdfText.length && <Typography color="text.secondary">No selectable text was found. Use Text Block to add your own.</Typography>}{props.pdfText.map(item => <Button key={item.index} variant="outlined" onClick={() => props.onEditPDFText(item.index)} sx={{ justifyContent: 'flex-start', textAlign: 'left', overflowWrap: 'anywhere' }}>{item.text}</Button>)}</>}
    <Divider />
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><LayersOutlined color="action" /><Typography variant="h3">Items on this page</Typography></Box>
    {!props.elements.length && <Typography color="text.secondary">Your added items appear here. Select one to move, resize, or edit it.</Typography>}
    {props.elements.map((element, index) => {
      const label = element.label || tools.find(tool => tool.type === element.type)?.label || (element.type === 'draw' ? 'Drawing' : 'Edited text');
      return <Box key={element.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, border: 1, borderColor: props.selectedId === element.id ? 'primary.main' : 'divider', borderRadius: 2 }}>
        <Button aria-label={`Select ${label} ${index + 1}`} aria-pressed={props.selectedId === element.id} onClick={() => props.onSelect(element.id)} sx={{ flex: 1, minWidth: 0, justifyContent: 'flex-start', overflowWrap: 'anywhere', textAlign: 'left' }}>{label} {index + 1}</Button>
        <IconButton aria-label={`Duplicate ${label} ${index + 1}`} onClick={() => props.onDuplicate(element.id)}><ContentCopy fontSize="small" /></IconButton>
        <IconButton aria-label={`Delete ${label} ${index + 1}`} onClick={() => props.onDelete(element.id)}><DeleteOutlined fontSize="small" /></IconButton>
      </Box>;
    })}
  </Box>;
}
