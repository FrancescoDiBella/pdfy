import { useState } from 'react';
import { 
  Box, 
  AppBar, 
  Toolbar, 
  Typography, 
  Drawer, 
  List, 
  ListItem, 
  ListItemButton,
  ListItemIcon, 
  ListItemText,
  Button,
  Chip
} from '@mui/material';
import { 
  Description as DocumentIcon,
  MergeType as MergeIcon,
  CallSplit as SplitIcon,
  Edit as EditIcon,
  Add as AddIcon,
  Lock as LockIcon
} from '@mui/icons-material';
import PDFViewer from './components/PDFViewer';
import PDFMerger from './components/PDFMerger';
import PDFSplitter from './components/PDFSplitter';
import AdvancedEditor from './components/AdvancedEditor';

const drawerWidth = 260;

type ViewMode = 'view' | 'merge' | 'split' | 'edit';

const navItems: { mode: ViewMode; label: string; icon: React.ReactNode }[] = [
  { mode: 'view', label: 'View PDF', icon: <DocumentIcon /> },
  { mode: 'merge', label: 'Merge PDFs', icon: <MergeIcon /> },
  { mode: 'split', label: 'Split PDF', icon: <SplitIcon /> },
  { mode: 'edit', label: 'Advanced Editor', icon: <EditIcon /> },
];

function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('view');

  // Advanced Editor is a full-screen experience with its own layout
  if (viewMode === 'edit') {
    return <AdvancedEditor onBack={() => setViewMode('view')} />;
  }

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* ─── Top Bar ─── */}
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar sx={{ gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexGrow: 1 }}>
            <Box sx={{ 
              width: 36, height: 36, borderRadius: '10px', 
              background: 'linear-gradient(135deg, #6366F1, #A855F7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)',
              flexShrink: 0,
            }}>
              <DocumentIcon sx={{ color: '#fff', fontSize: 20 }} />
            </Box>
            <Typography variant="h1" component="div" sx={{ fontSize: 20 }}>
              PDFy <span style={{ color: '#A855F7', fontWeight: 300 }}>Studio</span>
            </Typography>
          </Box>

          <Chip
            icon={<LockIcon sx={{ fontSize: '14px !important' }} />}
            label="100% Local"
            size="small"
            sx={{
              bgcolor: 'rgba(16, 185, 129, 0.12)',
              color: '#10B981',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              fontWeight: 600,
              fontSize: 11,
              height: 28,
              '& .MuiChip-icon': { color: '#10B981' },
            }}
          />
        </Toolbar>
      </AppBar>

      {/* ─── Sidebar ─── */}
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: 'border-box' },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Button 
            variant="contained" 
            fullWidth 
            startIcon={<AddIcon />} 
            sx={{ py: 1.5 }}
            onClick={() => setViewMode('edit')}
          >
            Create Blank PDF
          </Button>

          <Box>
            <Typography 
              variant="caption" 
              sx={{ color: 'text.disabled', ml: 1, mb: 1, display: 'block', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}
            >
              Tools
            </Typography>
            <List disablePadding>
              {navItems.map(({ mode, label, icon }) => (
                <ListItem key={mode} disablePadding sx={{ mb: 0.5 }}>
                  <ListItemButton 
                    selected={viewMode === mode} 
                    onClick={() => setViewMode(mode)}
                    sx={{ 
                      borderRadius: 2, 
                      py: 1,
                      '&.Mui-selected': {
                        bgcolor: 'rgba(99, 102, 241, 0.12)',
                        '&:hover': { bgcolor: 'rgba(99, 102, 241, 0.18)' },
                      },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 40, color: viewMode === mode ? '#6366F1' : '#9CA3AF' }}>
                      {icon}
                    </ListItemIcon>
                    <ListItemText 
                      primary={label} 
                      slotProps={{ 
                        primary: { 
                          sx: {
                            fontSize: 13, 
                            fontWeight: viewMode === mode ? 600 : 400,
                            color: viewMode === mode ? '#F9FAFB' : '#9CA3AF',
                          },
                        },
                      }} 
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Box>
        </Box>
      </Drawer>

      {/* ─── Main Content ─── */}
      <Box component="main" sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <Toolbar />
        <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', p: 3 }}>
          {viewMode === 'view' && <PDFViewer />}
          {viewMode === 'merge' && <PDFMerger />}
          {viewMode === 'split' && <PDFSplitter />}
        </Box>
      </Box>
    </Box>
  );
}

export default App;
