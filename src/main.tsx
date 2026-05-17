import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Box from '@mui/material/Box';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#FF3366', // Vibrant, modern red/pink
      light: '#FF6688',
      dark: '#CC0033',
    },
    secondary: {
      main: '#00C6FF',
    },
    background: {
      default: '#0A0A0A',
      paper: 'rgba(20, 20, 20, 0.65)', // Glassmorphism base
    },
    text: {
      primary: '#F0F0F0',
      secondary: '#A0A0A0',
    }
  },
  shape: {
    borderRadius: 16,
  },
  typography: {
    fontFamily: '"Outfit", "Inter", "Roboto", sans-serif',
    h5: {
      fontWeight: 600,
      letterSpacing: '0.5px',
    },
    h6: {
      fontWeight: 600,
    },
    button: {
      textTransform: 'none',
      fontWeight: 600,
    }
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          padding: '8px 24px',
          '&.MuiButton-containedPrimary': {
            background: 'linear-gradient(45deg, #FF3366 30%, #FF6688 90%)',
            boxShadow: '0 4px 14px 0 rgba(255, 51, 102, 0.39)',
            '&:hover': {
              boxShadow: '0 6px 20px rgba(255, 51, 102, 0.23)',
            }
          }
        }
      }
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: 'rgba(10, 10, 10, 0.8)',
          backdropFilter: 'blur(24px)',
          borderRight: '1px solid rgba(255, 255, 255, 0.08)',
        }
      }
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(10, 10, 10, 0.8)',
          backdropFilter: 'blur(24px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: 'none',
        }
      }
    }
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box sx={{ 
        position: 'fixed', 
        top: 0, left: 0, right: 0, bottom: 0, 
        zIndex: -1,
        background: 'radial-gradient(circle at 15% 50%, rgba(255, 51, 102, 0.15), transparent 25%), radial-gradient(circle at 85% 30%, rgba(0, 198, 255, 0.15), transparent 25%)',
        backgroundColor: '#050505'
      }} />
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
