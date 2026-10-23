import { useState } from 'react';
import {
  Box, Typography, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText,
  Button, IconButton, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
  useMediaQuery,
} from '@mui/material';
import { ThemeProvider, useTheme } from '@mui/material/styles';
import {
  DescriptionOutlined, MergeType, CallSplit, EditOutlined, DashboardCustomizeOutlined,
  InfoOutlined, Menu as MenuIcon, Close, LockOutlined,
} from '@mui/icons-material';
import PDFViewer from './components/PDFViewer';
import PDFMerger from './components/PDFMerger';
import PDFSplitter from './components/PDFSplitter';
import PDFOrganizer from './components/PDFOrganizer';
import PDFInspector from './components/PDFInspector';
import AdvancedEditor from './components/AdvancedEditor';
import AppearanceControl from './components/AppearanceControl';
import { legacyTheme } from './legacyTheme';

export type ViewMode = 'view' | 'edit' | 'organize' | 'merge' | 'split' | 'inspect';
type Session = { file: File | null; version: number };
type Handoff = { mode: 'edit' | 'organize'; file: File };

const navItems = [
  { mode: 'view', label: 'Read', title: 'Read PDF', description: 'Open a document, find your page, and take the next step.', icon: <DescriptionOutlined /> },
  { mode: 'edit', label: 'Edit', title: 'Edit PDF', description: 'Add text, drawings, and signatures.', icon: <EditOutlined /> },
  { mode: 'organize', label: 'Organize', title: 'Organize pages', description: 'Reorder, rotate, and watermark your pages.', icon: <DashboardCustomizeOutlined /> },
  { mode: 'merge', label: 'Merge', title: 'Merge PDFs', description: 'Bring your documents together in the right order.', icon: <MergeType /> },
  { mode: 'split', label: 'Split', title: 'Split PDF', description: 'Choose the pages you need and save them separately.', icon: <CallSplit /> },
  { mode: 'inspect', label: 'Info', title: 'Document info', description: 'Review and update the details stored in your PDF.', icon: <InfoOutlined /> },
] as const;

function focusWorkspace(mode: ViewMode) {
  document.getElementById(mode === 'edit' ? 'editor-session' : 'workspace-title')?.focus();
}

export default function App() {
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const [viewMode, setViewMode] = useState<ViewMode>('view');
  const [sharedFile, setSharedFile] = useState<File | null>(null);
  const [sessions, setSessions] = useState<Partial<Record<ViewMode, Session>>>({ view: { file: null, version: 0 } });
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuSelected, setMenuSelected] = useState(false);
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [handoffConfirmed, setHandoffConfirmed] = useState(false);
  const current = navItems.find(item => item.mode === viewMode)!;

  const navigate = (mode: ViewMode) => {
    // Each tool owns a stable input snapshot. Navigation must not replace its work.
    setSessions(previous => previous[mode] ? previous : { ...previous, [mode]: { file: sharedFile, version: 0 } });
    setViewMode(mode);
    if (menuOpen && !desktop) {
      setMenuSelected(true);
      setMenuOpen(false);
    } else {
      setMenuOpen(false);
      requestAnimationFrame(() => focusWorkspace(mode));
    }
  };

  const openInTool = (mode: Handoff['mode'], file: File) => {
    if (sessions[mode]) {
      setHandoff({ mode, file });
      setHandoffConfirmed(false);
      setConfirmOpen(true);
    } else {
      setSessions(previous => ({ ...previous, [mode]: { file, version: 0 } }));
      navigate(mode);
    }
  };

  const replaceSession = () => {
    if (!handoff) return;
    setSessions(previous => ({ ...previous, [handoff.mode]: { file: handoff.file, version: (previous[handoff.mode]?.version ?? 0) + 1 } }));
    setHandoffConfirmed(true);
    setConfirmOpen(false);
    navigate(handoff.mode);
  };

  const navigation = (
    <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pl: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.08em' }}>PDF TOOLS</Typography>
        {!desktop && <IconButton aria-label="Close tools menu" onClick={() => setMenuOpen(false)}><Close /></IconButton>}
      </Box>
      <Box component="nav" id="tools-navigation" aria-label="PDF tools">
        <List disablePadding>
          {navItems.map(item => (
            <ListItem key={item.mode} disablePadding sx={{ mb: 0.75 }}>
              <ListItemButton
                component="button" selected={viewMode === item.mode} aria-current={viewMode === item.mode ? 'page' : undefined}
                onClick={() => navigate(item.mode)} sx={{ width: '100%', color: viewMode === item.mode ? 'primary.main' : 'text.secondary', textAlign: 'left' }}
              >
                <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} slotProps={{ primary: { sx: { fontWeight: viewMode === item.mode ? 700 : 500 } } }} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Box>
      <Box sx={{ mt: 'auto', p: 1, pt: 3, borderTop: 1, borderColor: 'divider' }}>
        <LockOutlined sx={{ fontSize: 20, color: 'text.secondary', mb: 0.5 }} />
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>Your files stay on your device</Typography>
        <Typography variant="caption" color="text.secondary">Switch tools without losing your place. Download your work before closing or reloading this tab.</Typography>
      </Box>
    </Box>
  );

  return (
    <>
      <a className="skip-link" href={viewMode === 'edit' ? '#editor-session' : '#workspace-title'}>Skip to workspace</a>
      <Box hidden={viewMode === 'edit'} data-testid="workspace" data-theme={theme.palette.mode} sx={{ display: 'flex', flexDirection: 'column', height: '100dvh', bgcolor: 'background.default', color: 'text.primary' }}>
        <Box component="header" sx={{ px: { xs: 1, md: 3 }, py: 1, minHeight: 72, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {!desktop && <IconButton aria-label="Open tools menu" aria-expanded={menuOpen} aria-controls={menuOpen ? 'tools-navigation' : undefined} onClick={() => { setMenuSelected(false); setMenuOpen(true); }}><MenuIcon /></IconButton>}
            <Box sx={{ color: 'primary.main', display: { xs: 'none', sm: 'grid' }, placeItems: 'center', bgcolor: 'action.selected', width: 38, height: 42, borderRadius: 2 }}><DescriptionOutlined /></Box>
            <Typography component="span" sx={{ fontSize: 23, fontWeight: 800, letterSpacing: '-0.04em' }}>PDFy</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' }, ml: 1 }}>A little simpler. All yours.</Typography>
          </Box>
          <AppearanceControl />
        </Box>
        <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {desktop ? (
            <Box component="aside" sx={{ width: 232, flexShrink: 0, bgcolor: 'background.paper', borderRight: 1, borderColor: 'divider' }}>{navigation}</Box>
          ) : (
            <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} ModalProps={{ disableRestoreFocus: menuSelected }} slotProps={{ paper: { sx: { width: 280, maxWidth: 'calc(100vw - 24px)' } }, transition: { onExited: () => { if (menuSelected) focusWorkspace(viewMode); } } }}>{navigation}</Drawer>
          )}
          <Box component="main" sx={{ flex: 1, minWidth: 0, overflow: 'auto', p: { xs: 2, sm: 3, lg: 4 }, display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ mb: 3, flexShrink: 0 }}>
              <Typography id="workspace-title" variant="h1" tabIndex={-1} sx={{ width: 'fit-content', mb: 0.75 }}>{current.title}</Typography>
              <Typography color="text.secondary">{current.description}</Typography>
            </Box>
            {navItems.filter(item => item.mode !== 'edit' && sessions[item.mode]).map(item => {
              const session = sessions[item.mode]!;
              const legacy = item.mode === 'organize';
              const content = item.mode === 'view' ? (
                <PDFViewer activeFile={sharedFile} onFileLoaded={setSharedFile} onOpenInEditor={file => openInTool('edit', file)} onOpenInOrganizer={file => openInTool('organize', file)} />
              ) : item.mode === 'merge' ? <PDFMerger /> : item.mode === 'organize' ? <PDFOrganizer initialFile={session.file} /> : item.mode === 'split' ? <PDFSplitter active={viewMode === 'split'} /> : <PDFInspector initialFile={session.file} active={viewMode === 'inspect'} />;
              return (
                <Box key={`${item.mode}-${session.version}`} hidden={viewMode !== item.mode} data-tool={item.mode} sx={{ flex: 1, minHeight: 'min-content', display: 'flex', flexDirection: 'column' }}>
                  {legacy ? <ThemeProvider theme={legacyTheme}><Box sx={{ p: { xs: 1, sm: 2 }, borderRadius: 2, bgcolor: 'background.default', color: 'text.primary', overflow: 'auto', flex: 1 }}>{content}</Box></ThemeProvider> : content}
                </Box>
              );
            })}
          </Box>
        </Box>
      </Box>
      {sessions.edit && (
        <ThemeProvider theme={legacyTheme}>
          <Box key={sessions.edit.version} component="main" id="editor-session" aria-label="Edit PDF" tabIndex={-1} hidden={viewMode !== 'edit'} sx={{ color: 'text.primary' }}>
            <AdvancedEditor initialFile={sessions.edit.file} active={viewMode === 'edit'} onBack={() => navigate('view')} />
          </Box>
        </ThemeProvider>
      )}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} aria-labelledby="replace-title" aria-describedby="replace-description" disableRestoreFocus={handoffConfirmed} slotProps={{ transition: { onExited: () => { if (handoffConfirmed) focusWorkspace(viewMode); } } }}>
        <DialogTitle id="replace-title">Replace the {handoff?.mode === 'edit' ? 'Edit' : 'Organize'} document?</DialogTitle>
        <DialogContent>
          <DialogContentText id="replace-description" sx={{ overflowWrap: 'anywhere' }}>
            Opening “{handoff?.file.name}” here will discard this tool’s current session. Download any work you want to keep first. Other tools will keep their files and changes.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap', gap: 1, p: 2 }}>
          <Button autoFocus onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={replaceSession}>Replace document</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
