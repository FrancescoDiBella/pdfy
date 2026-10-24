import { createTheme } from '@mui/material/styles';

export const workspaceTheme = createTheme({
  colorSchemes: {
    light: {
      palette: {
        primary: { main: '#5145CD', contrastText: '#FFFFFF' },
        background: { default: '#F5F6FA', paper: '#FFFFFF' },
        text: { primary: '#202336', secondary: '#555C70' },
        divider: '#DCE0EA',
      },
    },
    dark: {
      palette: {
        primary: { main: '#B4ACFF', contrastText: '#211B50' },
        background: { default: '#12151F', paper: '#1C2030' },
        text: { primary: '#F2F3FA', secondary: '#B8BED1' },
        divider: '#3D4358',
      },
    },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h1: { fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.035em' },
    h2: { fontSize: '1.25rem', fontWeight: 650, letterSpacing: '-0.02em' },
    h3: { fontSize: '1rem', fontWeight: 650, letterSpacing: '-0.01em' },
    body1: { fontSize: '1rem', lineHeight: 1.65 },
    body2: { fontSize: '0.875rem', lineHeight: 1.6 },
    caption: { fontSize: '0.8125rem', lineHeight: 1.5 },
    button: { textTransform: 'none', fontWeight: 600, fontSize: '0.875rem' },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: theme => ({
        body: { backgroundColor: theme.palette.background.default },
        ':focus-visible': { outline: `3px solid ${theme.palette.primary.main}`, outlineOffset: 3 },
      }),
    },
    MuiPaper: {
      styleOverrides: { root: { backgroundImage: 'none' }, outlined: ({ theme }) => ({ borderColor: theme.palette.divider }) },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { minHeight: 44, padding: '9px 18px', lineHeight: 1.4 },
        outlined: ({ theme }) => ({ borderColor: theme.palette.text.secondary }),
      },
    },
    MuiIconButton: { styleOverrides: { root: { minWidth: 44, minHeight: 44, borderRadius: 10 } } },
    MuiOutlinedInput: {
      styleOverrides: { notchedOutline: ({ theme }) => ({ borderColor: theme.palette.text.secondary }) },
    },
    MuiListItemButton: { styleOverrides: { root: { minHeight: 48, borderRadius: 10 } } },
    MuiToggleButton: { styleOverrides: { root: { minHeight: 44, minWidth: 44, textTransform: 'none' } } },
    MuiTooltip: { styleOverrides: { tooltip: { fontSize: '0.8125rem' } } },
  },
});
