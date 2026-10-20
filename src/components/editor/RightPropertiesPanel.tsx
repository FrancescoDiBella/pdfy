import {
  Box,
  Typography,
  TextField,
  Slider,
  Divider,
  ToggleButtonGroup,
  ToggleButton,
  Select,
  MenuItem,
  FormControl,
  Button,
} from '@mui/material';
import {
  FormatAlignLeft,
  FormatAlignCenter,
  FormatAlignRight,
  FormatBold,
  FormatItalic,
  ContentCopy as DuplicateIcon,
  DeleteOutlined as DeleteIcon,
} from '@mui/icons-material';
import type { EditorElement } from './types';

interface Props {
  element: EditorElement | null;
  onUpdate: (id: string, patch: Partial<EditorElement>) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}

function NumericField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <Box sx={{ flex: 1 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 10, mb: 0.5, display: 'block' }}>
        {label}
      </Typography>
      <TextField
        size="small"
        type="number"
        value={Math.round(value)}
        onChange={e => onChange(Number(e.target.value))}
        fullWidth
        slotProps={{
          htmlInput: {
            style: {
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 12,
              padding: '6px 8px',
            },
          },
        }}
      />
    </Box>
  );
}

const HIGHLIGHT_SWATCHES = ['#FACC15', '#34D399', '#38BDF8', '#F472B6', '#A78BFA'];

export default function RightPropertiesPanel({ element, onUpdate, onDelete, onDuplicate }: Props) {
  return (
    <Box
      sx={{
        width: 300,
        flexShrink: 0,
        height: '100%',
        bgcolor: '#111827',
        borderLeft: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
      }}
    >
      {!element ? (
        <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 1 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center' }}>
            Select any layer on the canvas
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.disabled', textAlign: 'center' }}>
            Use arrow keys to nudge selected items or double-click PDF text in "Edit Text" mode.
          </Typography>
        </Box>
      ) : (
        <>
          {/* Coordinates & Dimensions */}
          <Box sx={{ p: 2.5 }}>
            <Typography
              variant="caption"
              sx={{ color: 'text.secondary', fontWeight: 600, mb: 1.5, display: 'block' }}
            >
              Geometry & Coordinates
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
              <NumericField label="X (pt)" value={element.x} onChange={v => onUpdate(element.id, { x: v })} />
              <NumericField label="Y (pt)" value={element.y} onChange={v => onUpdate(element.id, { y: v })} />
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <NumericField label="Width" value={element.width} onChange={v => onUpdate(element.id, { width: Math.max(10, v) })} />
              <NumericField label="Height" value={element.height} onChange={v => onUpdate(element.id, { height: Math.max(10, v) })} />
            </Box>
          </Box>

          <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />

          {/* Appearance */}
          <Box sx={{ p: 2.5 }}>
            <Typography
              variant="caption"
              sx={{ color: 'text.secondary', fontWeight: 600, mb: 1.5, display: 'block' }}
            >
              Appearance & Fill
            </Typography>

            {element.type === 'highlight' && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" sx={{ color: '#9CA3AF', fontSize: 11, mb: 0.75, display: 'block' }}>
                  Highlighter Marker Color
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  {HIGHLIGHT_SWATCHES.map(sw => (
                    <Box
                      key={sw}
                      onClick={() => onUpdate(element.id, { fillColor: sw })}
                      sx={{
                        width: 24,
                        height: 24,
                        borderRadius: '6px',
                        bgcolor: sw,
                        cursor: 'pointer',
                        border: element.fillColor === sw ? '2px solid #F9FAFB' : '1px solid rgba(255,255,255,0.2)',
                      }}
                    />
                  ))}
                </Box>
              </Box>
            )}

            {(element.type === 'rect' ||
              element.type === 'circle' ||
              element.type === 'redact' ||
              element.type === 'draw' ||
              element.type === 'edit-text') && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" sx={{ color: '#9CA3AF', fontSize: 11, mb: 0.5, display: 'block' }}>
                  {element.type === 'draw'
                    ? 'Stroke Color'
                    : element.type === 'edit-text'
                      ? 'Background Mask Color'
                      : element.type === 'redact'
                        ? 'Redaction Block Color'
                        : 'Shape Color'}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <input
                    type="color"
                    value={
                      (element.type === 'draw' ? element.strokeColor : element.fillColor) ||
                      (element.type === 'edit-text' ? '#ffffff' : element.type === 'redact' ? '#000000' : '#6366F1')
                    }
                    onChange={e =>
                      onUpdate(
                        element.id,
                        element.type === 'draw' ? { strokeColor: e.target.value } : { fillColor: e.target.value }
                      )
                    }
                    style={{
                      width: 32,
                      height: 32,
                      border: 'none',
                      borderRadius: 6,
                      cursor: 'pointer',
                      background: 'transparent',
                    }}
                  />
                  <Typography className="mono" sx={{ color: '#9CA3AF' }}>
                    {(
                      (element.type === 'draw' ? element.strokeColor : element.fillColor) ||
                      (element.type === 'edit-text' ? '#ffffff' : element.type === 'redact' ? '#000000' : '#6366F1')
                    ).toUpperCase()}
                  </Typography>
                </Box>
              </Box>
            )}

            {(element.type === 'text' || element.type === 'edit-text') && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" sx={{ color: '#9CA3AF', fontSize: 11, mb: 0.5, display: 'block' }}>
                  Text Color
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <input
                    type="color"
                    value={element.strokeColor || '#0F172A'}
                    onChange={e => onUpdate(element.id, { strokeColor: e.target.value })}
                    style={{
                      width: 32,
                      height: 32,
                      border: 'none',
                      borderRadius: 6,
                      cursor: 'pointer',
                      background: 'transparent',
                    }}
                  />
                  <Typography className="mono" sx={{ color: '#9CA3AF' }}>
                    {(element.strokeColor || '#0F172A').toUpperCase()}
                  </Typography>
                </Box>
              </Box>
            )}

            {(element.type === 'rect' || element.type === 'circle' || element.type === 'draw') && (
              <Box sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="caption" sx={{ color: '#9CA3AF', fontSize: 11 }}>
                    Stroke Width
                  </Typography>
                  <Typography className="mono" sx={{ fontSize: 11, color: '#9CA3AF' }}>
                    {element.strokeWidth ?? 2}px
                  </Typography>
                </Box>
                <Slider
                  min={0}
                  max={12}
                  step={1}
                  value={element.strokeWidth ?? (element.type === 'draw' ? 3 : 2)}
                  onChange={(_, v) => onUpdate(element.id, { strokeWidth: v as number })}
                  size="small"
                />
              </Box>
            )}

            {element.type !== 'redact' && (
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="caption" sx={{ color: '#9CA3AF', fontSize: 11 }}>
                    Opacity
                  </Typography>
                  <Typography className="mono" sx={{ fontSize: 11, color: '#9CA3AF' }}>
                    {Math.round((element.opacity ?? 1) * 100)}%
                  </Typography>
                </Box>
                <Slider
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={element.opacity ?? 1}
                  onChange={(_, v) => onUpdate(element.id, { opacity: v as number })}
                  size="small"
                />
              </Box>
            )}
          </Box>

          {/* Typography (text and edit-text) */}
          {(element.type === 'text' || element.type === 'edit-text') && (
            <>
              <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
              <Box sx={{ p: 2.5 }}>
                <Typography
                  variant="caption"
                  sx={{ color: 'text.secondary', fontWeight: 600, mb: 1.5, display: 'block' }}
                >
                  Typography
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 1.5 }}>
                  <FormControl size="small" fullWidth>
                    <Select
                      value={element.fontFamily || 'Helvetica'}
                      onChange={e => onUpdate(element.id, { fontFamily: e.target.value as string })}
                      displayEmpty
                    >
                      <MenuItem value="Helvetica">Helvetica (Sans)</MenuItem>
                      <MenuItem value="Times Roman">Times Roman (Serif)</MenuItem>
                      <MenuItem value="Courier">Courier (Monospace)</MenuItem>
                      <MenuItem value="Roboto">Roboto</MenuItem>
                      <MenuItem value="Open Sans">Open Sans</MenuItem>
                      <MenuItem value="Lato">Lato</MenuItem>
                      <MenuItem value="Montserrat">Montserrat</MenuItem>
                    </Select>
                  </FormControl>
                  <NumericField
                    label="Font Size (pt)"
                    value={element.fontSize ?? 16}
                    onChange={v => onUpdate(element.id, { fontSize: Math.max(6, v) })}
                  />
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <ToggleButtonGroup
                    size="small"
                    value={element.textAlign ?? 'left'}
                    exclusive
                    onChange={(_, v) => {
                      if (v) onUpdate(element.id, { textAlign: v });
                    }}
                  >
                    <ToggleButton value="left">
                      <FormatAlignLeft sx={{ fontSize: 16 }} />
                    </ToggleButton>
                    <ToggleButton value="center">
                      <FormatAlignCenter sx={{ fontSize: 16 }} />
                    </ToggleButton>
                    <ToggleButton value="right">
                      <FormatAlignRight sx={{ fontSize: 16 }} />
                    </ToggleButton>
                  </ToggleButtonGroup>

                  <ToggleButtonGroup
                    size="small"
                    value={[
                      element.fontWeight === 700 || element.fontWeight === 'bold' ? 'bold' : '',
                      element.fontStyle === 'italic' ? 'italic' : '',
                    ].filter(Boolean)}
                    onChange={(_, values: string[]) => {
                      onUpdate(element.id, {
                        fontWeight: values.includes('bold') ? 700 : 400,
                        fontStyle: values.includes('italic') ? 'italic' : 'normal',
                      });
                    }}
                  >
                    <ToggleButton value="bold">
                      <FormatBold sx={{ fontSize: 16 }} />
                    </ToggleButton>
                    <ToggleButton value="italic">
                      <FormatItalic sx={{ fontSize: 16 }} />
                    </ToggleButton>
                  </ToggleButtonGroup>
                </Box>
              </Box>
            </>
          )}

          <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />

          {/* Layer Actions */}
          <Box sx={{ p: 2.5, display: 'flex', gap: 1, mt: 'auto' }}>
            <Button
              variant="outlined"
              size="small"
              fullWidth
              startIcon={<DuplicateIcon />}
              onClick={() => onDuplicate(element.id)}
              sx={{ whiteSpace: 'nowrap' }}
            >
              Duplicate
            </Button>
            <Button
              variant="outlined"
              size="small"
              color="error"
              fullWidth
              startIcon={<DeleteIcon />}
              onClick={() => onDelete(element.id)}
              sx={{ whiteSpace: 'nowrap', borderColor: 'rgba(239,68,68,0.35)', color: '#F87171' }}
            >
              Delete
            </Button>
          </Box>
        </>
      )}
    </Box>
  );
}
