import { createTheme } from '@mui/material/styles';

const APPLE_DISPLAY = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", system-ui, sans-serif';
const APPLE_UI = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif';

export const workspaceTheme = createTheme({
  colorSchemes: {
    light: {
      palette: {
        primary: { main: '#0062CC', dark: '#004EA3', light: '#2A80E0', contrastText: '#FFFFFF' },
        secondary: { main: '#4F46E5', dark: '#3F37C9', light: '#6D66EE', contrastText: '#FFFFFF' },
        background: { default: '#EDF2F8', paper: '#FFFFFF' },
        text: { primary: '#0F172A', secondary: '#475569' },
        divider: 'rgba(15, 23, 42, 0.10)',
      },
    },
    dark: {
      palette: {
        primary: { main: '#5AA9FF', dark: '#7BBCFF', light: '#93C9FF', contrastText: '#061325' },
        secondary: { main: '#A5B4FC', dark: '#C4CFFE', light: '#D8E0FF', contrastText: '#0D1026' },
        background: { default: '#0A0D14', paper: '#161B26' },
        text: { primary: '#F3F6FC', secondary: '#9FAAC0' },
        divider: 'rgba(255, 255, 255, 0.12)',
      },
    },
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: APPLE_UI,
    h1: {
      fontFamily: APPLE_DISPLAY,
      fontSize: 'clamp(1.375rem, 1.15rem + 0.85vw, 1.75rem)',
      fontWeight: 700,
      lineHeight: 1.16,
      letterSpacing: '-0.028em',
      textWrap: 'balance',
    },
    h2: {
      fontFamily: APPLE_DISPLAY,
      fontSize: '1.1875rem',
      fontWeight: 650,
      lineHeight: 1.24,
      letterSpacing: '-0.02em',
      textWrap: 'balance',
    },
    h3: {
      fontFamily: APPLE_DISPLAY,
      fontSize: '1.03125rem',
      fontWeight: 600,
      lineHeight: 1.32,
      letterSpacing: '-0.015em',
      textWrap: 'balance',
    },
    body1: { fontSize: '0.96875rem', lineHeight: 1.56 },
    body2: { fontSize: '0.875rem', lineHeight: 1.5 },
    caption: { fontSize: '0.8125rem', lineHeight: 1.42 },
    button: { textTransform: 'none', fontWeight: 600, fontSize: '0.875rem', letterSpacing: '-0.008em' },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: theme => ({
        body: {
          backgroundColor: theme.palette.background.default,
          color: theme.palette.text.primary,
          fontVariantNumeric: 'lining-nums',
        },
        ':focus-visible': {
          outline: `2.5px solid ${theme.palette.primary.main}`,
          outlineOffset: 2,
        },
      }),
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          transition: 'border-color 160ms cubic-bezier(0.2, 0, 0, 1), background-color 160ms cubic-bezier(0.2, 0, 0, 1), box-shadow 160ms cubic-bezier(0.2, 0, 0, 1)',
        },
        outlined: ({ theme }) => ({
          borderColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.13)' : 'rgba(15, 23, 42, 0.10)',
        }),
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          minHeight: 44,
          padding: '8px 18px',
          borderRadius: 999,
          lineHeight: 1.32,
          transition: 'background-color 150ms cubic-bezier(0.2, 0, 0, 1), border-color 150ms cubic-bezier(0.2, 0, 0, 1), box-shadow 150ms cubic-bezier(0.2, 0, 0, 1), transform 120ms cubic-bezier(0.2, 0, 0, 1)',
          '&:active:not(:disabled)': {
            '@media (prefers-reduced-motion: no-preference)': {
              transform: 'scale(0.975)',
            },
          },
        },
        contained: ({ theme }) => ({
          boxShadow: theme.palette.mode === 'dark'
            ? 'inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 4px 14px -4px rgba(90, 169, 255, 0.45)'
            : 'inset 0 1px 0 rgba(255, 255, 255, 0.28), 0 4px 14px -4px rgba(0, 98, 204, 0.42)',
        }),
        sizeSmall: {
          minHeight: 36,
          padding: '6px 14px',
          fontSize: '0.8125rem',
          '@media (pointer: coarse)': {
            minHeight: 44,
            padding: '8px 15px',
          },
        },
        outlined: ({ theme }) => ({
          borderColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.20)' : 'rgba(15, 23, 42, 0.16)',
          backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.62)',
          '&:hover': {
            backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.09)' : 'rgba(255, 255, 255, 0.88)',
            borderColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.30)' : 'rgba(15, 23, 42, 0.24)',
          },
        }),
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          minWidth: 44,
          minHeight: 44,
          borderRadius: 999,
          transition: 'background-color 150ms cubic-bezier(0.2, 0, 0, 1), color 150ms cubic-bezier(0.2, 0, 0, 1), transform 120ms cubic-bezier(0.2, 0, 0, 1)',
          '&:active:not(:disabled)': {
            '@media (prefers-reduced-motion: no-preference)': {
              transform: 'scale(0.94)',
            },
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
        notchedOutline: ({ theme }) => ({
          borderColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.22)' : 'rgba(15, 23, 42, 0.20)',
        }),
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          minHeight: 44,
          borderRadius: 12,
          transition: 'background-color 150ms cubic-bezier(0.2, 0, 0, 1), color 150ms cubic-bezier(0.2, 0, 0, 1), box-shadow 150ms cubic-bezier(0.2, 0, 0, 1)',
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          minHeight: 44,
          minWidth: 44,
          borderRadius: 12,
          textTransform: 'none',
          transition: 'background-color 150ms cubic-bezier(0.2, 0, 0, 1), border-color 150ms cubic-bezier(0.2, 0, 0, 1)',
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: ({ theme }) => ({
          borderRadius: 16,
          backgroundColor: theme.palette.mode === 'dark' ? 'rgba(24, 30, 44, 0.86)' : 'rgba(255, 255, 255, 0.86)',
          backdropFilter: 'blur(26px) saturate(190%)',
          WebkitBackdropFilter: 'blur(26px) saturate(190%)',
          border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.78)'}`,
          boxShadow: theme.palette.mode === 'dark'
            ? '0 18px 40px -10px rgba(0, 0, 0, 0.72), inset 0 1px 0 rgba(255, 255, 255, 0.18)'
            : '0 14px 36px -10px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(15, 23, 42, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
        }),
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          fontVariantNumeric: 'tabular-nums',
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          fontSize: '0.8125rem',
          borderRadius: 10,
        },
      },
    },
  },
});
