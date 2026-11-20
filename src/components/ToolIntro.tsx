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
        p: { xs: 2.25, sm: 3.25 },
        borderRadius: '22px',
        display: 'flex',
        flexDirection: 'column',
        gap: { xs: 2, sm: 2.5 },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: { xs: 1.5, sm: 2 }, flexWrap: 'wrap' }}>
        <Box
          sx={{
            display: 'grid',
            placeItems: 'center',
            width: 48,
            height: 48,
            borderRadius: '14px',
            border: 1,
            borderColor: 'var(--pdfy-glass-border)',
            bgcolor: 'var(--pdfy-glass-active-bg)',
            boxShadow: 'var(--pdfy-glass-active-shadow)',
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
      <Box sx={{ pt: { xs: 1.75, sm: 2.25 }, borderTop: 1, borderColor: 'var(--pdfy-glass-hairline)', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1.75 }}>
        {children}
      </Box>
    </Paper>
  );
}
