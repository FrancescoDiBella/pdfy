import type { ReactNode } from 'react';
import { Box, Drawer, IconButton, Typography, useMediaQuery } from '@mui/material';
import { Close } from '@mui/icons-material';
import { useVisibleViewport } from '../hooks/useVisibleViewport';

export default function ToolPanel({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const wide = useMediaQuery('(min-width:1200px) and (min-height:600px)');
  const viewport = useVisibleViewport();
  const height = wide ? viewport.height : Math.round(viewport.height * 0.65);
  return (
    <Drawer anchor={wide ? 'right' : 'bottom'} open={open} onClose={onClose} slotProps={{ paper: {
      role: 'dialog', 'aria-label': title, 'aria-modal': true,
      sx: { width: wide ? 360 : '100%', maxWidth: '100%', height, maxHeight: height, top: viewport.top + viewport.height - height, bottom: 'auto', borderRadius: wide ? 0 : '20px 20px 0 0', bgcolor: 'background.paper', color: 'text.primary', pb: 'env(safe-area-inset-bottom)' },
    } }}>
      <Box sx={{ p: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="h2">{title}</Typography>
        <IconButton autoFocus aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}><Close /></IconButton>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', overscrollBehavior: 'contain' }}>{children}</Box>
    </Drawer>
  );
}
