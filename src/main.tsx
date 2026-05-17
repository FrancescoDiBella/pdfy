import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#6366F1',
      light: '#818CF8',
      dark: '#4F46E5',
    },
    secondary: {
      main: '#06B6D4',
      light: '#22D3EE',
      dark: '#0891B2',
    },
    success: {
      main: '#10B981',
    },
    error: {
      main: '#EF4444',
    },
    background: {
      default: '#0B0F19',
      paper: 'rgba(22, 30, 49, 0.65)',
    },
    text: {
      primary: '#F9FAFB',
      secondary: '#9CA3AF',
      disabled: '#4B5563',
    },
    divider: 'rgba(255, 255, 255, 0.08)',
  },

  shape: {
    borderRadius: 8,
  },

  typography: {
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    h1: {
      fontSize: 24,
      fontWeight: 700,
      letterSpacing: '-0.02em',
    },
    h2: {
      fontSize: 16,
      fontWeight: 600,
      letterSpacing: '-0.01em',
    },
    body1: {
      fontSize: 14,
      fontWeight: 400,
      letterSpacing: 0,
    },
    body2: {
      fontSize: 13,
      fontWeight: 500,
      letterSpacing: '0.01em',
    },
    caption: {
      fontSize: 11,
      fontWeight: 400,
    },
    button: {
      textTransform: 'none' as const,
      fontWeight: 500,
      fontSize: 13,
      letterSpacing: '0.01em',
    },
  },

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: '#0B0F19',
        },
      },
    },

    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: 'rgba(22, 30, 49, 0.65)',
          backdropFilter: 'blur(16px) saturate(180%)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 4px 30px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        },
      },
    },

    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          padding: '8px 20px',
          transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:active': {
            transform: 'scale(0.97)',
          },
          '&.MuiButton-containedPrimary': {
            background: 'linear-gradient(135deg, #6366F1 0%, #A855F7 100%)',
            color: '#F9FAFB',
            fontWeight: 600,
            boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)',
            '&:hover': {
              background: 'linear-gradient(135deg, #818CF8 0%, #C084FC 100%)',
              boxShadow: '0 6px 20px rgba(99, 102, 241, 0.45)',
            },
          },
          '&.MuiButton-outlined': {
            borderColor: 'rgba(255, 255, 255, 0.08)',
            color: '#9CA3AF',
            '&:hover': {
              borderColor: '#6366F1',
              color: '#F9FAFB',
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
            },
          },
        },
      },
    },

    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
          color: '#9CA3AF',
          '&:hover': {
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
            color: '#F9FAFB',
          },
          '&:active': {
            transform: 'scale(0.97)',
          },
          '&:focus-visible': {
            boxShadow: '0 0 0 2px #06B6D4',
          },
        },
      },
    },

    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            backgroundColor: 'rgba(11, 15, 25, 0.5)',
            borderRadius: 8,
            fontSize: 13,
            '& fieldset': {
              borderColor: 'rgba(255, 255, 255, 0.08)',
              transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
            },
            '&:hover fieldset': {
              borderColor: 'rgba(255, 255, 255, 0.15)',
            },
            '&.Mui-focused fieldset': {
              borderColor: '#6366F1',
              boxShadow: '0 0 0 1px #6366F1',
            },
          },
        },
      },
    },

    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: 'rgba(22, 30, 49, 0.95)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 8,
          fontSize: 11,
          padding: '6px 12px',
        },
      },
    },

    MuiSlider: {
      styleOverrides: {
        root: {
          color: '#6366F1',
          height: 4,
        },
        thumb: {
          width: 14,
          height: 14,
          '&:hover, &.Mui-focusVisible': {
            boxShadow: '0 0 0 6px rgba(99, 102, 241, 0.25)',
          },
        },
        track: {
          background: 'linear-gradient(90deg, #6366F1, #A855F7)',
          border: 'none',
        },
      },
    },

    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(22, 30, 49, 0.65)',
          backdropFilter: 'blur(16px) saturate(180%)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: 'none',
        },
      },
    },

    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: 'rgba(22, 30, 49, 0.65)',
          backdropFilter: 'blur(16px) saturate(180%)',
          borderRight: '1px solid rgba(255, 255, 255, 0.08)',
        },
      },
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
