import { Box, Typography, TextField, Slider, Divider, ToggleButtonGroup, ToggleButton, Select, MenuItem, FormControl, InputLabel } from '@mui/material';
import { FormatAlignLeft, FormatAlignCenter, FormatAlignRight, FormatBold } from '@mui/icons-material';
import type { EditorElement } from './types';

interface Props {
  element: EditorElement | null;
  onUpdate: (id: string, patch: Partial<EditorElement>) => void;
}

function NumericField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <Box sx={{ flex: 1 }}>
      <Typography variant="caption" sx={{ color: '#4B5563', fontSize: 10, mb: 0.5, display: 'block' }}>{label}</Typography>
      <TextField
        size="small"
        type="number"
        value={Math.round(value)}
        onChange={e => onChange(Number(e.target.value))}
        fullWidth
        slotProps={{ htmlInput: { style: { fontFamily: '"JetBrains Mono", monospace', fontSize: 12, padding: '6px 8px' } } }}
      />
    </Box>
  );
}

export default function RightPropertiesPanel({ element, onUpdate }: Props) {
  return (
    <Box sx={{
      width: 320, flexShrink: 0, height: '100%',
      bgcolor: 'rgba(22, 30, 49, 0.65)',
      backdropFilter: 'blur(16px) saturate(180%)',
      borderLeft: '1px solid rgba(255,255,255,0.08)',
      display: 'flex', flexDirection: 'column', overflow: 'auto',
    }}>
      {!element ? (
        <Box sx={{ p: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <Typography variant="caption" sx={{ color: '#4B5563', textAlign: 'center' }}>Select an element<br />to view properties</Typography>
        </Box>
      ) : (
        <>
          {/* Transform */}
          <Box sx={{ p: 2.5 }}>
            <Typography variant="caption" sx={{ color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, mb: 1.5, display: 'block' }}>
              Transform
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
              <NumericField label="X" value={element.x} onChange={v => onUpdate(element.id, { x: v })} />
              <NumericField label="Y" value={element.y} onChange={v => onUpdate(element.id, { y: v })} />
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <NumericField label="W" value={element.width} onChange={v => onUpdate(element.id, { width: v })} />
              <NumericField label="H" value={element.height} onChange={v => onUpdate(element.id, { height: v })} />
            </Box>
          </Box>

          <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />

          {/* Appearance */}
          <Box sx={{ p: 2.5 }}>
            <Typography variant="caption" sx={{ color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, mb: 1.5, display: 'block' }}>
              Appearance
            </Typography>
            {(element.type === 'rect' || element.type === 'draw' || element.type === 'edit-text') && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" sx={{ color: '#9CA3AF', fontSize: 11, mb: 0.5, display: 'block' }}>
                  {element.type === 'draw' ? 'Stroke Color' : 'Fill Color (Mask)'}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <input
                    type="color"
                    value={(element.type === 'draw' ? element.strokeColor : element.fillColor) || (element.type === 'edit-text' ? '#ffffff' : '#6366F1')}
                    onChange={e => onUpdate(element.id, element.type === 'draw' ? { strokeColor: e.target.value } : { fillColor: e.target.value })}
                    style={{ width: 32, height: 32, border: 'none', borderRadius: 6, cursor: 'pointer', background: 'transparent' }}
                  />
                  <Typography className="mono" sx={{ color: '#9CA3AF' }}>
                    {((element.type === 'draw' ? element.strokeColor : element.fillColor) || (element.type === 'edit-text' ? '#ffffff' : '#6366F1')).toUpperCase()}
                  </Typography>
                </Box>
              </Box>
            )}
            {element.type === 'edit-text' && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" sx={{ color: '#9CA3AF', fontSize: 11, mb: 0.5, display: 'block' }}>
                  Text Color
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <input
                    type="color"
                    value={element.strokeColor || '#000000'}
                    onChange={e => onUpdate(element.id, { strokeColor: e.target.value })}
                    style={{ width: 32, height: 32, border: 'none', borderRadius: 6, cursor: 'pointer', background: 'transparent' }}
                  />
                  <Typography className="mono" sx={{ color: '#9CA3AF' }}>
                    {(element.strokeColor || '#000000').toUpperCase()}
                  </Typography>
                </Box>
              </Box>
            )}
            {(element.type === 'rect' || element.type === 'draw') && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" sx={{ color: '#9CA3AF', fontSize: 11, mb: 0.5, display: 'block' }}>Stroke Width</Typography>
                <Slider
                  min={0} max={10} step={1}
                  value={element.strokeWidth ?? (element.type === 'draw' ? 3 : 2)}
                  onChange={(_, v) => onUpdate(element.id, { strokeWidth: v as number })}
                  size="small"
                />
              </Box>
            )}
            <Box>
              <Typography variant="caption" sx={{ color: '#9CA3AF', fontSize: 11, mb: 0.5, display: 'block' }}>Opacity</Typography>
              <Slider
                min={0} max={1} step={0.05}
                value={element.opacity ?? 1}
                onChange={(_, v) => onUpdate(element.id, { opacity: v as number })}
                size="small"
              />
            </Box>
          </Box>
 
          {/* Typography (text and edit-text) */}
          {(element.type === 'text' || element.type === 'edit-text') && (
            <>
              <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
              <Box sx={{ p: 2.5 }}>
                <Typography variant="caption" sx={{ color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, mb: 1.5, display: 'block' }}>
                  Typography
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 1.5 }}>
                  <FormControl size="small" fullWidth sx={{ '& .MuiOutlinedInput-root': { color: '#F3F4F6', fontSize: 13, '& fieldset': { borderColor: 'rgba(255,255,255,0.2)' } }, '& .MuiSvgIcon-root': { color: '#9CA3AF' } }}>
                    <Select
                      value={element.fontFamily || 'Helvetica'}
                      onChange={e => onUpdate(element.id, { fontFamily: e.target.value as string })}
                      displayEmpty
                    >
                      <MenuItem value="Helvetica">Helvetica (Standard)</MenuItem>
                      <MenuItem value="Times Roman">Times Roman (Standard)</MenuItem>
                      <MenuItem value="Courier">Courier (Standard)</MenuItem>
                      <MenuItem value="Roboto">Roboto</MenuItem>
                      <MenuItem value="Open Sans">Open Sans</MenuItem>
                      <MenuItem value="Lato">Lato</MenuItem>
                      <MenuItem value="Montserrat">Montserrat</MenuItem>
                    </Select>
                  </FormControl>
                  <NumericField label="Size (px)" value={element.fontSize ?? 16} onChange={v => onUpdate(element.id, { fontSize: v })} />
                </Box>
                <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
                  <ToggleButtonGroup
                    size="small"
                    value={element.textAlign ?? 'left'}
                    exclusive
                    onChange={(_, v) => { if (v) onUpdate(element.id, { textAlign: v }); }}
                    sx={{ '& .MuiToggleButton-root': { borderColor: 'rgba(255,255,255,0.08)', color: '#9CA3AF', '&.Mui-selected': { bgcolor: 'rgba(99,102,241,0.15)', color: '#6366F1' } } }}
                  >
                    <ToggleButton value="left"><FormatAlignLeft sx={{ fontSize: 16 }} /></ToggleButton>
                    <ToggleButton value="center"><FormatAlignCenter sx={{ fontSize: 16 }} /></ToggleButton>
                    <ToggleButton value="right"><FormatAlignRight sx={{ fontSize: 16 }} /></ToggleButton>
                  </ToggleButtonGroup>
                  <ToggleButtonGroup
                    size="small"
                    value={element.fontWeight === 700 ? 'bold' : ''}
                    onChange={() => onUpdate(element.id, { fontWeight: element.fontWeight === 700 ? 400 : 700 })}
                    sx={{ '& .MuiToggleButton-root': { borderColor: 'rgba(255,255,255,0.08)', color: '#9CA3AF', '&.Mui-selected': { bgcolor: 'rgba(99,102,241,0.15)', color: '#6366F1' } } }}
                  >
                    <ToggleButton value="bold"><FormatBold sx={{ fontSize: 16 }} /></ToggleButton>
                  </ToggleButtonGroup>
                </Box>
              </Box>
            </>
          )}
        </>
      )}
    </Box>
  );
}
