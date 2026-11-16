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
      className="pdfy-panel-enter"
      sx={{
        p: { xs: 2.5, sm: 4 },
        display: 'flex',
        flexDirection: 'column',
        gap: 2.5,
        borderInlineStartWidth: 3,
        borderInlineStartColor: 'primary.main',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
        <Box
          sx={{
            display: 'grid',
            placeItems: 'center',
            width: 48,
            height: 48,
            borderRadius: 2,
            border: 1,
            borderColor: 'divider',
            bgcolor: 'background.default',
            color: 'primary.main',
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
        <Box sx={{ flex: 1, minWidth: 220 }}>
          <Typography variant="h2" sx={{ mb: 0.75 }}>{title}</Typography>
          <Typography color="text.secondary" sx={{ maxWidth: '58ch', textWrap: 'pretty' }}>{description}</Typography>
        </Box>
      </Box>
      <Box sx={{ pt: 2, borderTop: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
        {children}
      </Box>
    </Paper>
  );
}
