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
      sx={theme => ({
        p: { xs: 2.25, sm: 3.25 },
        borderRadius: '22px',
        bgcolor: 'background.paper',
        display: 'flex',
        flexDirection: 'column',
        gap: { xs: 2, sm: 2.5 },
        boxShadow: theme.palette.mode === 'dark'
          ? '0 10px 30px -16px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.08)'
          : '0 1px 3px rgba(15, 23, 42, 0.04), 0 14px 32px -20px rgba(15, 23, 42, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.90)',
      })}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: { xs: 1.5, sm: 2 }, flexWrap: 'wrap' }}>
        <Box
          aria-hidden="true"
          sx={theme => ({
            display: 'grid',
            placeItems: 'center',
            width: 52,
            height: 52,
            borderRadius: '15px',
            border: '1px solid',
            borderColor: theme.palette.mode === 'dark' ? 'rgba(90, 169, 255, 0.30)' : 'rgba(0, 98, 204, 0.18)',
            backgroundImage: theme.palette.mode === 'dark'
              ? 'linear-gradient(155deg, rgba(90, 169, 255, 0.28) 0%, rgba(79, 70, 229, 0.16) 100%)'
              : 'linear-gradient(155deg, rgba(56, 152, 255, 0.16) 0%, rgba(0, 98, 204, 0.06) 100%)',
            bgcolor: 'var(--pdfy-glass-active-bg)',
            boxShadow: theme.palette.mode === 'dark'
              ? 'inset 0 1px 0.5px rgba(255, 255, 255, 0.28), 0 6px 18px -6px rgba(90, 169, 255, 0.35)'
              : 'inset 0 1px 0.5px rgba(255, 255, 255, 0.96), 0 6px 18px -6px rgba(0, 98, 204, 0.24)',
            color: 'primary.main',
            flexShrink: 0,
            '& svg': { fontSize: 25 },
          })}
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
