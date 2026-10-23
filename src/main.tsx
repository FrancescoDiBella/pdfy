import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import './index.css';
import App from './App';
import PWAStatus from './components/PWAStatus';
import { workspaceTheme } from './theme';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={workspaceTheme} defaultMode="system" noSsr>
      <CssBaseline />
      <App />
      <PWAStatus />
    </ThemeProvider>
  </React.StrictMode>,
);
