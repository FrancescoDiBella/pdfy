import type { ReactNode } from 'react';
import { Box, Paper, Typography } from '@mui/material';

interface Props {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}

export default function ToolIntro({ icon, title, description, children }: Props) {
  return (
    <Paper
      variant="outlined"
      className="pdfy-panel-enter pdfy-glass-card"
      sx={{
        p: { xs: 2, sm: 3 },
        display: 'flex',
        flexDirection: 'column',
        gap: { xs: 1.75, sm: 2.25 },
        borderInlineStartWidth: 3,
        borderInlineStartColor: 'primary.main',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: { xs: 1.5, sm: 2 }, flexWrap: 'wrap' }}>
        <Box
          sx={{
            display: 'grid',
            placeItems: 'center',
            width: 44,
            height: 44,
            borderRadius: 2.5,
            border: 1,
            borderColor: 'var(--pdfy-glass-border)',
            bgcolor: 'var(--pdfy-glass-active-bg)',
            color: 'primary.main',
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Typography variant="h2" sx={{ mb: 0.5 }}>{title}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: '58ch', textWrap: 'pretty' }}>{description}</Typography>
        </Box>
      </Box>
      <Box sx={{ pt: { xs: 1.5, sm: 2 }, borderTop: 1, borderColor: 'var(--pdfy-glass-border)', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1.75 }}>
        {children}
      </Box>
    </Paper>
  );
}
