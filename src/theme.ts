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
    /* Content-layer surfaces: clean elevated Apple grouped cards (no refraction over dense text) */
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          transition: 'border-color 160ms cubic-bezier(0.2, 0, 0, 1), background-color 160ms cubic-bezier(0.2, 0, 0, 1), box-shadow 160ms cubic-bezier(0.2, 0, 0, 1)',
        },
        outlined: ({ theme }) => ({
          borderRadius: 18,
          borderColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.11)' : 'rgba(15, 23, 42, 0.09)',
          boxShadow: theme.palette.mode === 'dark'
            ? '0 2px 10px -2px rgba(0, 0, 0, 0.36), inset 0 1px 0 rgba(255, 255, 255, 0.06)'
            : '0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px -16px rgba(15, 23, 42, 0.12)',
          '@media (forced-colors: active)': {
            borderColor: 'CanvasText',
            boxShadow: 'none',
          },
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
          borderColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.18)' : 'rgba(15, 23, 42, 0.14)',
          backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.66)',
          '&:hover': {
            backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.09)' : 'rgba(255, 255, 255, 0.90)',
            borderColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.28)' : 'rgba(15, 23, 42, 0.22)',
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
          borderRadius: 14,
        },
        notchedOutline: ({ theme }) => ({
          borderColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.20)' : 'rgba(15, 23, 42, 0.18)',
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
    /* Apple capsule tabs with high-contrast pill indicator */
    MuiTabs: {
      styleOverrides: {
        root: {
          minHeight: 46,
        },
        indicator: ({ theme }) => ({
          height: 'calc(100% - 8px)',
          top: 4,
          bottom: 4,
          borderRadius: 999,
          zIndex: 0,
          backgroundColor: theme.palette.mode === 'dark'
            ? 'rgba(90, 169, 255, 0.16)'
            : 'rgba(0, 98, 204, 0.11)',
          boxShadow: theme.palette.mode === 'dark'
            ? 'inset 0 1px 0.5px rgba(255, 255, 255, 0.22)'
            : 'inset 0 1px 0.5px rgba(255, 255, 255, 0.90), 0 1px 3px rgba(0, 98, 204, 0.10)',
          '@media (forced-colors: active)': {
            display: 'none',
          },
        }),
      },
    },
    MuiTab: {
      styleOverrides: {
        root: ({ theme }) => ({
          position: 'relative',
          zIndex: 1,
          minHeight: 46,
          borderRadius: 999,
          textTransform: 'none',
          fontWeight: 600,
          fontSize: '0.875rem',
          letterSpacing: '-0.01em',
          color: theme.palette.text.secondary,
          transition: 'color 150ms cubic-bezier(0.2, 0, 0, 1)',
          '&.Mui-selected': {
            color: theme.palette.primary.main,
            fontWeight: 700,
            '@media (forced-colors: active)': {
              outline: '2px solid Highlight',
              outlineOffset: -3,
            },
          },
        }),
      },
    },
    MuiToggleButtonGroup: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: 999,
          padding: 3,
          backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.06)' : 'rgba(15, 23, 42, 0.05)',
          border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.10)' : 'rgba(15, 23, 42, 0.08)'}`,
          gap: 2,
          '@media (forced-colors: active)': {
            backgroundColor: 'Canvas',
            borderColor: 'CanvasText',
          },
        }),
        grouped: {
          border: 0,
          borderRadius: '999px !important',
          margin: 0,
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: ({ theme }) => ({
          minHeight: 40,
          minWidth: 44,
          borderRadius: 999,
          border: 0,
          textTransform: 'none',
          fontWeight: 600,
          color: theme.palette.text.secondary,
          '@media (pointer: coarse)': {
            minHeight: 44,
          },
          transition: 'background-color 150ms cubic-bezier(0.2, 0, 0, 1), color 150ms cubic-bezier(0.2, 0, 0, 1), box-shadow 150ms cubic-bezier(0.2, 0, 0, 1)',
          '&:hover': {
            backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.07)' : 'rgba(15, 23, 42, 0.05)',
            color: theme.palette.text.primary,
          },
          '&.Mui-selected, &.Mui-selected:hover': {
            backgroundColor: theme.palette.mode === 'dark' ? '#243248' : '#FFFFFF',
            color: theme.palette.primary.main,
            boxShadow: theme.palette.mode === 'dark'
              ? '0 2px 8px -2px rgba(0, 0, 0, 0.45), inset 0 1px 0.5px rgba(255, 255, 255, 0.22)'
              : '0 2px 8px -2px rgba(15, 23, 42, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.95)',
            '@media (forced-colors: active)': {
              border: '2px solid Highlight',
              boxShadow: 'none',
            },
          },
        }),
      },
    },
    /* Authentic iOS 26 / macOS Tahoe capsule toggle switch */
    MuiSwitch: {
      styleOverrides: {
        root: {
          width: 56,
          height: 40,
          padding: '8px 6px',
        },
        sizeSmall: {
          width: 46,
          height: 32,
          padding: '6px 5px',
          '& .MuiSwitch-switchBase': {
            padding: '8px 7px',
            '&.Mui-checked': {
              transform: 'translateX(16px)',
            },
          },
          '& .MuiSwitch-thumb': {
            width: 16,
            height: 16,
          },
        },
        switchBase: ({ theme }) => ({
          padding: '10px 8px',
          color: '#FFFFFF',
          transitionDuration: '180ms',
          '&.Mui-checked': {
            transform: 'translateX(20px)',
            color: '#FFFFFF',
            '& + .MuiSwitch-track': {
              backgroundColor: theme.palette.primary.main,
              opacity: 1,
              borderColor: 'transparent',
            },
          },
          '&.Mui-disabled + .MuiSwitch-track': {
            opacity: theme.palette.mode === 'dark' ? 0.28 : 0.36,
          },
        }),
        thumb: {
          boxSizing: 'border-box',
          width: 20,
          height: 20,
          backgroundColor: '#FFFFFF',
          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.30), 0 0 0 0.5px rgba(15, 23, 42, 0.08)',
        },
        track: ({ theme }) => ({
          borderRadius: 999,
          opacity: 1,
          backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.24)' : 'rgba(15, 23, 42, 0.24)',
          border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.14)' : 'rgba(15, 23, 42, 0.12)'}`,
          transition: 'background-color 180ms cubic-bezier(0.2, 0, 0, 1), border-color 180ms cubic-bezier(0.2, 0, 0, 1)',
          '@media (forced-colors: active)': {
            border: '1px solid CanvasText',
          },
        }),
      },
    },
    /* Navigation / Overlay Glass: Dialogs, Drawers, Menus */
    MuiDialog: {
      styleOverrides: {
        root: {
          '& > .MuiBackdrop-root': {
            backgroundColor: 'rgba(10, 13, 20, 0.34)',
            backdropFilter: 'blur(8px) saturate(140%)',
            WebkitBackdropFilter: 'blur(8px) saturate(140%)',
            '@media (prefers-reduced-transparency: reduce)': {
              backdropFilter: 'none',
              WebkitBackdropFilter: 'none',
            },
          },
        },
        paper: ({ theme }) => ({
          borderRadius: 24,
          backgroundColor: theme.palette.mode === 'dark' ? 'rgba(22, 28, 42, 0.88)' : 'rgba(255, 255, 255, 0.88)',
          backdropFilter: 'blur(28px) saturate(195%)',
          WebkitBackdropFilter: 'blur(28px) saturate(195%)',
          border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.82)'}`,
          boxShadow: theme.palette.mode === 'dark'
            ? '0 24px 56px -14px rgba(0, 0, 0, 0.78), inset 0 1px 0.5px rgba(255, 255, 255, 0.22)'
            : '0 20px 50px -14px rgba(15, 23, 42, 0.22), 0 0 0 1px rgba(15, 23, 42, 0.06), inset 0 1px 0.5px rgba(255, 255, 255, 0.94)',
          '@media (prefers-reduced-transparency: reduce)': {
            backgroundColor: theme.palette.background.paper,
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
            borderColor: theme.palette.divider,
          },
          '@media (forced-colors: active)': {
            backgroundColor: 'Canvas',
            border: '1px solid CanvasText',
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
            boxShadow: 'none',
          },
        }),
      },
    },
    MuiDrawer: {
      styleOverrides: {
        root: {
          '& > .MuiBackdrop-root': {
            backgroundColor: 'rgba(10, 13, 20, 0.30)',
            backdropFilter: 'blur(6px) saturate(135%)',
            WebkitBackdropFilter: 'blur(6px) saturate(135%)',
            '@media (prefers-reduced-transparency: reduce)': {
              backdropFilter: 'none',
              WebkitBackdropFilter: 'none',
            },
          },
        },
        paper: ({ theme }) => ({
          backgroundColor: theme.palette.mode === 'dark' ? 'rgba(22, 28, 42, 0.86)' : 'rgba(255, 255, 255, 0.86)',
          backdropFilter: 'blur(28px) saturate(195%)',
          WebkitBackdropFilter: 'blur(28px) saturate(195%)',
          borderColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.80)',
          boxShadow: theme.palette.mode === 'dark'
            ? '0 22px 54px -12px rgba(0, 0, 0, 0.78), inset 0 1px 0.5px rgba(255, 255, 255, 0.22)'
            : '0 18px 46px -12px rgba(15, 23, 42, 0.20), 0 0 0 1px rgba(15, 23, 42, 0.06), inset 0 1px 0.5px rgba(255, 255, 255, 0.92)',
          '@media (prefers-reduced-transparency: reduce)': {
            backgroundColor: theme.palette.background.paper,
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
            borderColor: theme.palette.divider,
          },
          '@media (forced-colors: active)': {
            backgroundColor: 'Canvas',
            border: '1px solid CanvasText',
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
            boxShadow: 'none',
          },
        }),
      },
    },
    MuiMenu: {
      styleOverrides: {
        list: {
          padding: '5px',
        },
        paper: ({ theme }) => ({
          borderRadius: 18,
          backgroundColor: theme.palette.mode === 'dark' ? 'rgba(24, 30, 44, 0.86)' : 'rgba(255, 255, 255, 0.88)',
          backdropFilter: 'blur(28px) saturate(195%)',
          WebkitBackdropFilter: 'blur(28px) saturate(195%)',
          border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.80)'}`,
          boxShadow: theme.palette.mode === 'dark'
            ? '0 18px 42px -10px rgba(0, 0, 0, 0.74), inset 0 1px 0.5px rgba(255, 255, 255, 0.20)'
            : '0 14px 36px -10px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(15, 23, 42, 0.06), inset 0 1px 0.5px rgba(255, 255, 255, 0.92)',
          '@media (prefers-reduced-transparency: reduce)': {
            backgroundColor: theme.palette.background.paper,
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
            borderColor: theme.palette.divider,
          },
          '@media (forced-colors: active)': {
            backgroundColor: 'Canvas',
            border: '1px solid CanvasText',
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
            boxShadow: 'none',
          },
        }),
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          minHeight: 40,
          '@media (pointer: coarse)': {
            minHeight: 44,
          },
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: 16,
          border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(15, 23, 42, 0.08)'}`,
          backdropFilter: 'blur(18px) saturate(180%)',
          WebkitBackdropFilter: 'blur(18px) saturate(180%)',
          boxShadow: theme.palette.mode === 'dark'
            ? '0 12px 28px -10px rgba(0, 0, 0, 0.56), inset 0 1px 0 rgba(255, 255, 255, 0.14)'
            : '0 10px 26px -12px rgba(15, 23, 42, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.85)',
          '@media (prefers-reduced-transparency: reduce)': {
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
          },
          '@media (forced-colors: active)': {
            border: '1px solid CanvasText',
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
            boxShadow: 'none',
          },
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
        tooltip: ({ theme }) => ({
          fontSize: '0.8125rem',
          borderRadius: 10,
          backdropFilter: 'blur(14px) saturate(170%)',
          WebkitBackdropFilter: 'blur(14px) saturate(170%)',
          border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.18)'}`,
        }),
      },
    },
  },
});
