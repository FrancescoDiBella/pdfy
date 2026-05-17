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
  Button
} from '@mui/material';
import { 
  Description as DocumentIcon,
  MergeType as MergeIcon,
  CallSplit as SplitIcon,
  Edit as EditIcon,
  Add as AddIcon
} from '@mui/icons-material';
import PDFViewer from './components/PDFViewer';
import PDFMerger from './components/PDFMerger';
import PDFSplitter from './components/PDFSplitter';
import AdvancedEditor from './components/AdvancedEditor';

const drawerWidth = 260;

type ViewMode = 'view' | 'merge' | 'split' | 'edit';

function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('view');

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexGrow: 1 }}>
            <Box sx={{ 
              width: 40, height: 40, borderRadius: 2, 
              background: 'linear-gradient(45deg, #FF3366, #00C6FF)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(255, 51, 102, 0.4)'
            }}>
              <DocumentIcon sx={{ color: '#fff' }} />
            </Box>
            <Typography variant="h5" component="div" sx={{ fontWeight: 700, letterSpacing: '1px' }}>
              PDFy <span style={{ color: '#FF3366', fontWeight: 300 }}>Studio</span>
            </Typography>
          </Box>
        </Toolbar>
      </AppBar>
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: 'border-box', borderRight: '1px solid rgba(255,255,255,0.05)' },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto', p: 2 }}>
          <Button 
            variant="contained" 
            fullWidth 
            startIcon={<AddIcon />} 
            sx={{ mb: 3, py: 1.5 }}
            onClick={() => setViewMode('edit')}
          >
            Create Blank PDF
          </Button>

          <Typography variant="overline" sx={{ color: 'text.secondary', ml: 2, fontWeight: 600 }}>Tools</Typography>
          <List>
            <ListItem disablePadding sx={{ mb: 1 }}>
              <ListItemButton 
                selected={viewMode === 'view'} 
                onClick={() => setViewMode('view')}
                sx={{ borderRadius: 2 }}
              >
                <ListItemIcon><DocumentIcon color={viewMode === 'view' ? 'primary' : 'inherit'} /></ListItemIcon>
                <ListItemText primary="View PDF" />
              </ListItemButton>
            </ListItem>
            <ListItem disablePadding sx={{ mb: 1 }}>
              <ListItemButton 
                selected={viewMode === 'merge'} 
                onClick={() => setViewMode('merge')}
                sx={{ borderRadius: 2 }}
              >
                <ListItemIcon><MergeIcon color={viewMode === 'merge' ? 'primary' : 'inherit'} /></ListItemIcon>
                <ListItemText primary="Merge PDFs" />
              </ListItemButton>
            </ListItem>
            <ListItem disablePadding sx={{ mb: 1 }}>
              <ListItemButton 
                selected={viewMode === 'split'} 
                onClick={() => setViewMode('split')}
                sx={{ borderRadius: 2 }}
              >
                <ListItemIcon><SplitIcon color={viewMode === 'split' ? 'primary' : 'inherit'} /></ListItemIcon>
                <ListItemText primary="Split PDF" />
              </ListItemButton>
            </ListItem>
            <ListItem disablePadding sx={{ mb: 1 }}>
              <ListItemButton 
                selected={viewMode === 'edit'} 
                onClick={() => setViewMode('edit')}
                sx={{ borderRadius: 2 }}
              >
                <ListItemIcon><EditIcon color={viewMode === 'edit' ? 'primary' : 'inherit'} /></ListItemIcon>
                <ListItemText primary="Advanced Editor" />
              </ListItemButton>
            </ListItem>
          </List>
        </Box>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: 3, display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <Toolbar />
        <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {viewMode === 'view' && <PDFViewer />}
          {viewMode === 'merge' && <PDFMerger />}
          {viewMode === 'split' && <PDFSplitter />}
          {viewMode === 'edit' && <AdvancedEditor />}
        </Box>
      </Box>
    </Box>
  );
}

export default App;
