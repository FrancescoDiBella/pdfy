import { createTheme } from '@mui/material/styles';

const DISPLAY_SERIF = '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, ui-serif, serif';
const UI_SANS = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export const workspaceTheme = createTheme({
  colorSchemes: {
    light: {
      palette: {
        primary: { main: '#B43C18', contrastText: '#FFFFFF' },
        secondary: { main: '#1D4E68', contrastText: '#FFFFFF' },
        background: { default: '#F6F3EC', paper: '#FFFEFA' },
        text: { primary: '#1A1916', secondary: '#544E43' },
        divider: '#CFC7B6',
      },
    },
    dark: {
      palette: {
        primary: { main: '#F08B5E', contrastText: '#1A110B' },
        secondary: { main: '#7AB6D6', contrastText: '#0F181E' },
        background: { default: '#131210', paper: '#1D1B18' },
        text: { primary: '#F4EFE6', secondary: '#BFB7A8' },
        divider: '#464137',
      },
    },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: UI_SANS,
    h1: {
      fontFamily: DISPLAY_SERIF,
      fontSize: 'clamp(1.5rem, 1.25rem + 1vw, 1.95rem)',
      fontWeight: 700,
      lineHeight: 1.18,
      letterSpacing: '-0.02em',
      textWrap: 'balance',
    },
    h2: {
      fontSize: '1.25rem',
      fontWeight: 650,
      lineHeight: 1.28,
      letterSpacing: '-0.015em',
      textWrap: 'balance',
    },
    h3: {
      fontSize: '1.0625rem',
      fontWeight: 650,
      lineHeight: 1.35,
      letterSpacing: '-0.01em',
      textWrap: 'balance',
    },
    body1: { fontSize: '1rem', lineHeight: 1.6 },
    body2: { fontSize: '0.875rem', lineHeight: 1.55 },
    caption: { fontSize: '0.8125rem', lineHeight: 1.45 },
    button: { textTransform: 'none', fontWeight: 600, fontSize: '0.875rem' },
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
          outline: `3px solid ${theme.palette.primary.main}`,
          outlineOffset: 3,
        },
      }),
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          transition: 'border-color 140ms cubic-bezier(0.2, 0, 0, 1), background-color 140ms cubic-bezier(0.2, 0, 0, 1), box-shadow 140ms cubic-bezier(0.2, 0, 0, 1)',
        },
        outlined: ({ theme }) => ({
          borderColor: theme.palette.divider,
        }),
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          minHeight: 44,
          padding: '9px 18px',
          lineHeight: 1.35,
          transition: 'background-color 140ms cubic-bezier(0.2, 0, 0, 1), border-color 140ms cubic-bezier(0.2, 0, 0, 1), transform 120ms cubic-bezier(0.2, 0, 0, 1)',
          '&:active:not(:disabled)': {
            '@media (prefers-reduced-motion: no-preference)': {
              transform: 'scale(0.985)',
            },
          },
        },
        sizeSmall: {
          minHeight: 36,
          padding: '6px 13px',
          fontSize: '0.8125rem',
          '@media (pointer: coarse)': {
            minHeight: 44,
            padding: '8px 14px',
          },
        },
        outlined: ({ theme }) => ({
          borderColor: theme.palette.mode === 'dark' ? '#8E8677' : '#767063',
        }),
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          minWidth: 44,
          minHeight: 44,
          borderRadius: 9,
          transition: 'background-color 140ms cubic-bezier(0.2, 0, 0, 1), color 140ms cubic-bezier(0.2, 0, 0, 1), transform 120ms cubic-bezier(0.2, 0, 0, 1)',
          '&:active:not(:disabled)': {
            '@media (prefers-reduced-motion: no-preference)': {
              transform: 'scale(0.95)',
            },
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        notchedOutline: ({ theme }) => ({
          borderColor: theme.palette.mode === 'dark' ? '#8E8677' : '#767063',
        }),
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          minHeight: 46,
          borderRadius: 9,
          transition: 'background-color 140ms cubic-bezier(0.2, 0, 0, 1), color 140ms cubic-bezier(0.2, 0, 0, 1)',
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          minHeight: 44,
          minWidth: 44,
          textTransform: 'none',
          transition: 'background-color 140ms cubic-bezier(0.2, 0, 0, 1), border-color 140ms cubic-bezier(0.2, 0, 0, 1)',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontVariantNumeric: 'tabular-nums',
        },
      },
    },
    MuiTooltip: { styleOverrides: { tooltip: { fontSize: '0.8125rem' } } },
  },
});
