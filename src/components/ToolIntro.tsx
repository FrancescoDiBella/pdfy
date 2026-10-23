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
    <Paper variant="outlined" sx={{ p: { xs: 2.5, sm: 4.5 }, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2.5 }}>
      <Box sx={{ display: 'grid', placeItems: 'center', width: 56, height: 56, borderRadius: 3, color: 'primary.main', bgcolor: 'action.selected' }}>{icon}</Box>
      <Box>
        <Typography variant="h2" sx={{ mb: 1 }}>{title}</Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 500 }}>{description}</Typography>
      </Box>
      {children}
    </Paper>
  );
}
