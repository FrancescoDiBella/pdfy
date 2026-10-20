import { useState } from 'react';
import {
  Box,
  Typography,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Button,
  Divider,
} from '@mui/material';
import {
  DescriptionOutlined as DocumentIcon,
  MergeType as MergeIcon,
  CallSplit as SplitIcon,
  EditOutlined as EditIcon,
  BrandingWatermarkOutlined as OrganizeIcon,
  VerifiedUserOutlined as InspectIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import PDFViewer from './components/PDFViewer';
import PDFMerger from './components/PDFMerger';
import PDFSplitter from './components/PDFSplitter';
import PDFOrganizer from './components/PDFOrganizer';
import PDFInspector from './components/PDFInspector';
import AdvancedEditor from './components/AdvancedEditor';

const drawerWidth = 264;

export type ViewMode = 'view' | 'edit' | 'organize' | 'merge' | 'split' | 'inspect';

const navItems: { mode: ViewMode; label: string; shortLabel: string; icon: React.ReactNode }[] = [
  { mode: 'view', label: 'Reader & Preview', shortLabel: 'Reader', icon: <DocumentIcon sx={{ fontSize: 19 }} /> },
  { mode: 'edit', label: 'Advanced Vector Editor', shortLabel: 'Editor', icon: <EditIcon sx={{ fontSize: 19 }} /> },
  { mode: 'organize', label: 'Organize & Watermark', shortLabel: 'Organizer', icon: <OrganizeIcon sx={{ fontSize: 19 }} /> },
  { mode: 'merge', label: 'Merge Documents', shortLabel: 'Merge', icon: <MergeIcon sx={{ fontSize: 19 }} /> },
  { mode: 'split', label: 'Split & Extract Pages', shortLabel: 'Split', icon: <SplitIcon sx={{ fontSize: 19 }} /> },
  { mode: 'inspect', label: 'Metadata & Privacy', shortLabel: 'Metadata', icon: <InspectIcon sx={{ fontSize: 19 }} /> },
];

function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('view');
  const [sharedFile, setSharedFile] = useState<File | null>(null);

  if (viewMode === 'edit') {
    return (
      <AdvancedEditor
        initialFile={sharedFile}
        onBack={() => setViewMode('view')}
      />
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', bgcolor: '#0B0F17' }}>
      {/* ─── Strict 3-Zone Top Bar Contract ─── */}
      <Box
        component="header"
        sx={{
          height: 60,
          flexShrink: 0,
          px: 3,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 4,
          bgcolor: '#111827',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          zIndex: 1200,
        }}
      >
        {/* Zone 1: Single text element wordmark */}
        <Typography
          component="div"
          onClick={() => setViewMode('view')}
          sx={{
            fontFamily: '"Plus Jakarta Sans", sans-serif',
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: '#F9FAFB',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            cursor: 'pointer',
          }}
        >
          PDFy Studio Pro
        </Typography>

        {/* Zone 2: 5 concise single-line navigation links */}
        <Box
          component="nav"
          sx={{
            display: { xs: 'none', md: 'flex' },
            alignItems: 'center',
            gap: 3.5,
          }}
        >
          {navItems
            .filter(item => item.mode !== 'edit')
            .map(item => {
              const active = viewMode === item.mode;
              return (
                <Box
                  key={item.mode}
                  component="button"
                  onClick={() => setViewMode(item.mode)}
                  sx={{
                    background: 'none',
                    border: 'none',
                    padding: '4px 0',
                    cursor: 'pointer',
                    fontFamily: '"Plus Jakarta Sans", sans-serif',
                    fontSize: 13,
                    fontWeight: active ? 600 : 500,
                    color: active ? '#F9FAFB' : '#9CA3AF',
                    borderBottom: active ? '2px solid #6366F1' : '2px solid transparent',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    transition: 'color 0.15s ease, border-color 0.15s ease',
                    '&:hover': {
                      color: '#F9FAFB',
                    },
                  }}
                >
                  {item.shortLabel}
                </Box>
              );
            })}
        </Box>

        {/* Zone 3: 1 Primary Action */}
        <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setViewMode('edit')}
            sx={{ whiteSpace: 'nowrap', flexShrink: 0, py: 0.9, px: 2 }}
          >
            Open Canvas Editor
          </Button>
        </Box>
      </Box>

      {/* ─── Workspace Body (Sidebar + Main Viewport) ─── */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Navigation Sidebar */}
        <Drawer
          variant="permanent"
          sx={{
            width: drawerWidth,
            flexShrink: 0,
            [`& .MuiDrawer-paper`]: {
              width: drawerWidth,
              boxSizing: 'border-box',
              position: 'relative',
              height: '100%',
            },
          }}
        >
          <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%', gap: 2.5 }}>
            <Box>
              <Typography
                variant="caption"
                sx={{
                  color: 'text.secondary',
                  px: 1.5,
                  mb: 1,
                  display: 'block',
                  fontWeight: 600,
                }}
              >
                Document Suites
              </Typography>
              <List disablePadding>
                {navItems.map(({ mode, label, icon }) => {
                  const selected = viewMode === mode;
                  return (
                    <ListItem key={mode} disablePadding sx={{ mb: 0.5 }}>
                      <ListItemButton
                        selected={selected}
                        onClick={() => setViewMode(mode)}
                        sx={{
                          borderRadius: 1.5,
                          py: 1,
                          px: 1.5,
                          '&.Mui-selected': {
                            bgcolor: 'rgba(99, 102, 241, 0.14)',
                            '&:hover': { bgcolor: 'rgba(99, 102, 241, 0.2)' },
                          },
                        }}
                      >
                        <ListItemIcon
                          sx={{
                            minWidth: 34,
                            color: selected ? '#818CF8' : '#9CA3AF',
                          }}
                        >
                          {icon}
                        </ListItemIcon>
                        <ListItemText
                          primary={label}
                          slotProps={{
                            primary: {
                              sx: {
                                fontSize: 13,
                                fontWeight: selected ? 600 : 400,
                                color: selected ? '#F9FAFB' : '#9CA3AF',
                                whiteSpace: 'nowrap',
                              },
                            },
                          }}
                        />
                      </ListItemButton>
                    </ListItem>
                  );
                })}
              </List>
            </Box>

            <Divider />

            {/* Active Document Context */}
            <Box sx={{ px: 1.5 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block', mb: 0.75 }}>
                Active Session Buffer
              </Typography>
              {sharedFile ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: '#F9FAFB', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {sharedFile.name}
                  </Typography>
                  <Typography className="mono" sx={{ fontSize: 11, color: 'text.secondary' }}>
                    {(sharedFile.size / 1024).toFixed(1)} KB · In-Memory
                  </Typography>
                </Box>
              ) : (
                <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block' }}>
                  No file buffered yet. Open a PDF or load a sample template.
                </Typography>
              )}
            </Box>

            {/* Quiet Footer Info */}
            <Box sx={{ mt: 'auto', px: 1.5, pt: 2, borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                100% Client-Side Execution
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 0.25 }}>
                Files are processed in browser memory and never uploaded.
              </Typography>
            </Box>
          </Box>
        </Drawer>

        {/* Main Content Viewport */}
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            overflow: 'hidden',
            p: 3,
          }}
        >
          {viewMode === 'view' && (
            <PDFViewer
              activeFile={sharedFile}
              onFileLoaded={f => setSharedFile(f)}
              onOpenInEditor={f => {
                setSharedFile(f);
                setViewMode('edit');
              }}
              onOpenInOrganizer={f => {
                setSharedFile(f);
                setViewMode('organize');
              }}
            />
          )}
          {viewMode === 'organize' && <PDFOrganizer initialFile={sharedFile} />}
          {viewMode === 'merge' && <PDFMerger />}
          {viewMode === 'split' && <PDFSplitter />}
          {viewMode === 'inspect' && <PDFInspector initialFile={sharedFile} />}
        </Box>
      </Box>
    </Box>
  );
}

export default App;
