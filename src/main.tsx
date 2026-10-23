import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import PWAStatus from './components/PWAStatus';
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
      default: '#0B0F17',
      paper: '#111827',
    },
    text: {
      primary: '#F9FAFB',
      secondary: '#9CA3AF',
      disabled: '#6B7280',
    },
    divider: 'rgba(255, 255, 255, 0.08)',
  },

  shape: {
    borderRadius: 8,
  },

  typography: {
    fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, sans-serif',
    h1: {
      fontFamily: '"Plus Jakarta Sans", sans-serif',
      fontSize: 24,
      fontWeight: 700,
      letterSpacing: '-0.02em',
    },
    h2: {
      fontFamily: '"Plus Jakarta Sans", sans-serif',
      fontSize: 16,
      fontWeight: 600,
      letterSpacing: '-0.01em',
    },
    h5: {
      fontFamily: '"Plus Jakarta Sans", sans-serif',
      fontWeight: 600,
    },
    body1: {
      fontSize: 14,
      fontWeight: 400,
      letterSpacing: '0.01em',
      lineHeight: 1.6,
    },
    body2: {
      fontSize: 13,
      fontWeight: 500,
      letterSpacing: '0.01em',
    },
    caption: {
      fontSize: 11.5,
      fontWeight: 400,
    },
    button: {
      fontFamily: '"Plus Jakarta Sans", sans-serif',
      textTransform: 'none' as const,
      fontWeight: 600,
      fontSize: 13,
      letterSpacing: '0.01em',
    },
  },

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: '#0B0F17',
        },
      },
    },

    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: '#111827',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: 'none',
        },
      },
    },

    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          padding: '8px 18px',
          transition: 'transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.15s ease, border-color 0.15s ease',
          '&:active': {
            transform: 'scale(0.98)',
          },
          '&.MuiButton-containedPrimary': {
            backgroundColor: '#4F46E5',
            color: '#F9FAFB',
            fontWeight: 600,
            boxShadow: 'none',
            '&:hover': {
              backgroundColor: '#6366F1',
              boxShadow: 'none',
            },
          },
          '&.MuiButton-outlined': {
            borderColor: 'rgba(255, 255, 255, 0.12)',
            color: '#D1D5DB',
            '&:hover': {
              borderColor: '#6366F1',
              color: '#F9FAFB',
              backgroundColor: 'rgba(99, 102, 241, 0.08)',
            },
          },
        },
      },
    },

    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          transition: 'transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.15s ease',
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
            backgroundColor: 'rgba(11, 15, 23, 0.65)',
            borderRadius: 8,
            fontSize: 13,
            '& fieldset': {
              borderColor: 'rgba(255, 255, 255, 0.1)',
              transition: 'border-color 0.15s ease',
            },
            '&:hover fieldset': {
              borderColor: 'rgba(255, 255, 255, 0.2)',
            },
            '&.Mui-focused fieldset': {
              borderColor: '#6366F1',
            },
          },
        },
      },
    },

    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: '#1F2937',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: 6,
          fontSize: 11,
          padding: '5px 10px',
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
        },
      },
    },

    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: '#111827',
          borderRight: '1px solid rgba(255, 255, 255, 0.08)',
        },
      },
    },

    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#111827',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: 'none',
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
      <PWAStatus />
    </ThemeProvider>
  </React.StrictMode>,
);

