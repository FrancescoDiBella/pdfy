import type { ReactNode } from 'react';
import { Box, Drawer, IconButton, Typography, useMediaQuery } from '@mui/material';
import { Close } from '@mui/icons-material';
import { useVisibleViewport } from '../hooks/useVisibleViewport';

export default function ToolPanel({ open, title, onClose, children, disableRestoreFocus = false, onClosed }: { open: boolean; title: string; onClose: () => void; children: ReactNode; disableRestoreFocus?: boolean; onClosed?: () => void }) {
  const wide = useMediaQuery('(min-width:1200px) and (min-height:600px)');
  const viewport = useVisibleViewport();
  const desktopInset = 12;
  const height = wide
    ? Math.max(240, viewport.height - desktopInset * 2)
    : Math.round(viewport.height * 0.65);
  return (
    <Drawer
      anchor={wide ? 'right' : 'bottom'}
      open={open}
      onClose={onClose}
      ModalProps={{ disableRestoreFocus }}
      slotProps={{
        transition: { onExited: onClosed },
        paper: {
          role: 'dialog',
          'aria-label': title,
          'aria-modal': true,
          className: 'lg-surface lg-panel',
          sx: {
            position: 'fixed',
            width: wide ? 364 : '100%',
            maxWidth: wide ? 'calc(100vw - 24px)' : '100%',
            height,
            maxHeight: height,
            top: wide ? viewport.top + desktopInset : viewport.top + viewport.height - height,
            right: wide ? desktopInset : 0,
            left: wide ? 'auto' : 0,
            bottom: 'auto',
            borderRadius: wide ? '22px' : '24px 24px 0 0',
            overflow: 'hidden',
            bgcolor: 'var(--lg-fill-panel)',
            backgroundImage: 'var(--lg-surface-sheen)',
            borderColor: 'var(--lg-outer-hairline)',
            color: 'text.primary',
            pb: wide ? 0 : 'env(safe-area-inset-bottom)',
          },
        },
      }}
    >
      {!wide && (
        <Box aria-hidden="true" sx={{ display: 'flex', justifyContent: 'center', pt: 1.125, pb: 0.25, flexShrink: 0 }}>
          <Box
            sx={{
              width: 38,
              height: 4.5,
              borderRadius: 999,
              bgcolor: theme => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.28)' : 'rgba(15, 23, 42, 0.22)',
            }}
          />
        </Box>
      )}
      <Box
        sx={{
          px: 2,
          pt: wide ? 1.75 : 0.75,
          pb: 1.25,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          borderBottom: 1,
          borderColor: 'var(--pdfy-glass-hairline)',
        }}
      >
        <Typography variant="h2">{title}</Typography>
        <IconButton
          autoFocus
          aria-label={`Close ${title.toLowerCase()}`}
          onClick={onClose}
          sx={{ bgcolor: 'var(--pdfy-glass-subtle)' }}
        >
          <Close fontSize="small" />
        </IconButton>
      </Box>
      <Box className="pdfy-scroll-region" sx={{ flex: 1, minHeight: 0, overflow: 'auto', overscrollBehavior: 'contain' }}>{children}</Box>
    </Drawer>
  );
}
