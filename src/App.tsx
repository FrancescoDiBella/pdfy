import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Typography, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText,
  Button, IconButton, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
  CircularProgress, Snackbar, useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  DescriptionOutlined, MergeType, CallSplit, EditOutlined, DashboardCustomizeOutlined,
  InfoOutlined, PrintOutlined, AssignmentOutlined, PermMediaOutlined, CompressOutlined,
  CompareArrowsOutlined, BookmarksOutlined, Menu as MenuIcon, Close, LockOutlined, CloudUploadOutlined,
} from '@mui/icons-material';
import PDFViewer from './components/PDFViewer';
import AppearanceControl from './components/AppearanceControl';
import { preparePDFs } from './utils/pdfMerge';

const PDFMerger = lazy(() => import('./components/PDFMerger'));
const PDFSplitter = lazy(() => import('./components/PDFSplitter'));
const PDFOrganizer = lazy(() => import('./components/PDFOrganizer'));
const PDFInspector = lazy(() => import('./components/PDFInspector'));
const PDFPrinter = lazy(() => import('./components/PDFPrinter'));
const PDFForms = lazy(() => import('./components/PDFForms'));
const PDFConverter = lazy(() => import('./components/PDFConverter'));
const PDFCompressor = lazy(() => import('./components/PDFCompressor'));
const PDFCompare = lazy(() => import('./components/PDFCompare'));
const PDFBookmarks = lazy(() => import('./components/PDFBookmarks'));
const AdvancedEditor = lazy(() => import('./components/AdvancedEditor'));

export type ViewMode = 'view' | 'edit' | 'forms' | 'compare' | 'bookmarks' | 'organize' | 'merge' | 'split' | 'convert' | 'compress' | 'print' | 'inspect';
type Session = { file: File | null; version: number };
type HandoffMode = 'view' | 'edit' | 'forms' | 'compare' | 'bookmarks' | 'organize' | 'split' | 'compress' | 'print' | 'inspect';
type Handoff = { mode: HandoffMode; file: File };

interface LaunchParamsLike {
  files?: Array<{ getFile: () => Promise<File> }>;
}

interface WindowWithLaunchQueue extends Window {
  launchQueue?: {
    setConsumer: (consumer: (launchParams: LaunchParamsLike) => void | Promise<void>) => void;
  };
}

function isPdfCandidate(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

function hasDraggedFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

const navItems = [
  { mode: 'view', group: 'Workspace', label: 'Read', title: 'Read PDF', description: 'Open a document, find your page, and take the next step.', icon: <DescriptionOutlined /> },
  { mode: 'edit', group: 'Workspace', label: 'Edit', title: 'Edit PDF', description: 'Add text, drawings, and signatures.', icon: <EditOutlined /> },
  { mode: 'forms', group: 'Workspace', label: 'Forms', title: 'Fill forms', description: 'Detect fillable PDF fields, enter values, and flatten copies.', icon: <AssignmentOutlined /> },
  { mode: 'compare', group: 'Workspace', label: 'Compare', title: 'Compare PDFs', description: 'Compare two PDF versions side by side with visual pixel diffs and text diffs.', icon: <CompareArrowsOutlined /> },
  { mode: 'bookmarks', group: 'Pages & Files', label: 'Bookmarks', title: 'Edit bookmarks', description: 'Build a clickable table of contents, auto-detect headings, and embed PDF outlines.', icon: <BookmarksOutlined /> },
  { mode: 'organize', group: 'Pages & Files', label: 'Organize', title: 'Organize pages', description: 'Reorder, rotate, and watermark your pages.', icon: <DashboardCustomizeOutlined /> },
  { mode: 'merge', group: 'Pages & Files', label: 'Merge', title: 'Merge PDFs', description: 'Bring your documents together in the right order.', icon: <MergeType /> },
  { mode: 'split', group: 'Pages & Files', label: 'Split', title: 'Split PDF', description: 'Choose the pages you need and save them separately.', icon: <CallSplit /> },
  { mode: 'convert', group: 'Pages & Files', label: 'Convert', title: 'Convert images & PDFs', description: 'Build PDFs from photos/scans or export PDF pages as PNG and JPEG images.', icon: <PermMediaOutlined /> },
  { mode: 'compress', group: 'Optimize & Output', label: 'Compress', title: 'Compress PDF', description: 'Shrink PDF file size offline, inspect output clarity, and compare byte savings.', icon: <CompressOutlined /> },
  { mode: 'print', group: 'Optimize & Output', label: 'Print', title: 'Print PDF', description: 'Prepare N-up handouts, booklets, and ink-saver sheets for your OS printer.', icon: <PrintOutlined /> },
  { mode: 'inspect', group: 'Optimize & Output', label: 'Info', title: 'Document info', description: 'Review and update the details stored in your PDF.', icon: <InfoOutlined /> },
] as const;

const navGroups = ['Workspace', 'Pages & Files', 'Optimize & Output'] as const;

function FolioMark({ size = 30 }: { size?: number }) {
  return (
    <Box
      component="svg"
      aria-hidden="true"
      viewBox="0 0 48 48"
      fill="none"
      sx={{ width: size, height: size, flexShrink: 0, display: 'block' }}
    >
      <path d="M10 4h19l11 11v29a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" fill="var(--pdfy-paper)" stroke="var(--pdfy-ink)" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M29 4v9a2 2 0 0 0 2 2h9Z" fill="var(--pdfy-mat-bg)" stroke="var(--pdfy-ink)" strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="14" y="19" width="12" height="4" rx="1" fill="var(--pdfy-accent)" />
      <path d="M14 28h19M14 34h14" stroke="var(--pdfy-ink-muted)" strokeWidth="2.5" strokeLinecap="round" />
    </Box>
  );
}

function focusWorkspace(mode: ViewMode) {
  document.getElementById(mode === 'edit' ? 'editor-session' : 'workspace-title')?.focus();
}

export default function App() {
  const theme = useTheme();
  const desktop = useMediaQuery('(min-width:900px) and (min-height:600px)');
  const [viewMode, setViewMode] = useState<ViewMode>('view');
  const [sharedFile, setSharedFile] = useState<File | null>(null);
  const [sessions, setSessions] = useState<Partial<Record<ViewMode, Session>>>({ view: { file: null, version: 0 } });
  const [activeDocs, setActiveDocs] = useState<Partial<Record<ViewMode, boolean>>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuSelected, setMenuSelected] = useState(false);
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [handoffConfirmed, setHandoffConfirmed] = useState(false);
  const [fileDragActive, setFileDragActive] = useState(false);
  const [dropNotice, setDropNotice] = useState<{ severity: 'error' | 'warning' | 'info'; message: string } | null>(null);
  const dragDepthRef = useRef(0);
  const mergeDropHandlerRef = useRef<((files: File[]) => void) | null>(null);
  const current = navItems.find(item => item.mode === viewMode)!;

  useEffect(() => {
    document.documentElement.dataset.theme = theme.palette.mode;
  }, [theme.palette.mode]);

  const setToolActive = useCallback((mode: ViewMode, active: boolean) => {
    setActiveDocs(prev => (prev[mode] === active ? prev : { ...prev, [mode]: active }));
  }, []);

  const sessionHandlers = useMemo(() => ({
    edit: (active: boolean) => setToolActive('edit', active),
    forms: (active: boolean) => setToolActive('forms', active),
    compare: (active: boolean) => setToolActive('compare', active),
    bookmarks: (active: boolean) => setToolActive('bookmarks', active),
    organize: (active: boolean) => setToolActive('organize', active),
    split: (active: boolean) => setToolActive('split', active),
    compress: (active: boolean) => setToolActive('compress', active),
    print: (active: boolean) => setToolActive('print', active),
    inspect: (active: boolean) => setToolActive('inspect', active),
  }), [setToolActive]);

  const registerMergeDropHandler = useCallback((handler: ((files: File[]) => void) | null) => {
    mergeDropHandlerRef.current = handler;
  }, []);

  const navigate = useCallback((mode: ViewMode) => {
    // Each tool owns a stable input snapshot. Navigation must not replace its work.
    setSessions(previous => previous[mode] ? previous : { ...previous, [mode]: { file: mode === 'split' ? null : sharedFile, version: 0 } });
    setViewMode(mode);
    if (menuOpen && !desktop) {
      setMenuSelected(true);
      setMenuOpen(false);
    } else {
      setMenuOpen(false);
      requestAnimationFrame(() => focusWorkspace(mode));
    }
  }, [sharedFile, menuOpen, desktop]);

  const openInTool = useCallback((mode: HandoffMode, file: File) => {
    const hasActiveDoc = mode === 'view' ? !!sharedFile : !!activeDocs[mode];
    if (hasActiveDoc) {
      setHandoff({ mode, file });
      setHandoffConfirmed(false);
      setConfirmOpen(true);
    } else {
      if (mode === 'view') {
        setSharedFile(file);
      }
      setSessions(previous => ({
        ...previous,
        [mode]: { file, version: (previous[mode]?.version ?? 0) + 1 },
      }));
      navigate(mode);
    }
  }, [sharedFile, activeDocs, navigate]);

  const openInToolRef = useRef(openInTool);
  const viewModeRef = useRef(viewMode);
  useEffect(() => {
    openInToolRef.current = openInTool;
    viewModeRef.current = viewMode;
  });

  useEffect(() => {
    const onDragEnter = (event: DragEvent) => {
      if (!hasDraggedFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current += 1;
      setFileDragActive(true);
    };

    const onDragOver = (event: DragEvent) => {
      if (!hasDraggedFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
      setFileDragActive(true);
    };

    const onDragLeave = (event: DragEvent) => {
      if (!hasDraggedFiles(event)) return;
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setFileDragActive(false);
      }
    };

    const onWindowBlurOrDragEnd = () => {
      dragDepthRef.current = 0;
      setFileDragActive(false);
    };

    const onDrop = async (event: DragEvent) => {
      if (!hasDraggedFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current = 0;
      setFileDragActive(false);
      const droppedFiles = Array.from(event.dataTransfer?.files ?? []);
      if (!droppedFiles.length) return;
      const pdfFiles = droppedFiles.filter(isPdfCandidate);
      if (!pdfFiles.length) {
        setDropNotice({ severity: 'warning', message: 'Drop a PDF file (.pdf) to open it in PDFy.' });
        return;
      }

      if (viewModeRef.current === 'merge' && mergeDropHandlerRef.current) {
        mergeDropHandlerRef.current(pdfFiles);
        return;
      }

      const candidate = pdfFiles[0];
      const { accepted } = await preparePDFs([candidate]);
      if (!accepted.length) {
        setDropNotice({
          severity: 'error',
          message: `Could not open “${candidate.name}”. Choose a readable PDF with at least one page and no password protection.`,
        });
        return;
      }

      const targetMode: HandoffMode = viewModeRef.current === 'convert' || viewModeRef.current === 'merge'
        ? 'view'
        : viewModeRef.current;
      openInToolRef.current(targetMode, accepted[0].file);
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('dragend', onWindowBlurOrDragEnd);
    window.addEventListener('blur', onWindowBlurOrDragEnd);
    window.addEventListener('drop', onDrop);

    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('dragend', onWindowBlurOrDragEnd);
      window.removeEventListener('blur', onWindowBlurOrDragEnd);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  useEffect(() => {
    const win = window as WindowWithLaunchQueue;
    if (!win.launchQueue?.setConsumer) return;
    win.launchQueue.setConsumer(async launchParams => {
      const handles = launchParams.files;
      if (!handles?.length) return;
      try {
        const files = await Promise.all(handles.map(handle => handle.getFile()));
        const pdfCandidate = files.find(isPdfCandidate);
        if (!pdfCandidate) {
          setDropNotice({ severity: 'warning', message: 'The opened file is not a PDF document.' });
          return;
        }
        const { accepted } = await preparePDFs([pdfCandidate]);
        if (!accepted.length) {
          setDropNotice({
            severity: 'error',
            message: `Could not open “${pdfCandidate.name}”. Choose a readable PDF with at least one page and no password protection.`,
          });
          return;
        }
        openInToolRef.current('view', accepted[0].file);
      } catch {
        setDropNotice({ severity: 'error', message: 'Could not open the launched PDF file.' });
      }
    });
  }, []);

  const replaceSession = () => {
    if (!handoff) return;
    if (handoff.mode === 'view') {
      setSharedFile(handoff.file);
    }
    setSessions(previous => ({ ...previous, [handoff.mode]: { file: handoff.file, version: (previous[handoff.mode]?.version ?? 0) + 1 } }));
    setHandoffConfirmed(true);
    setConfirmOpen(false);
    navigate(handoff.mode);
  };

  const handoffLabel = navItems.find(item => item.mode === handoff?.mode)?.label ?? 'tool';
  const dropTargetMessage = viewMode === 'merge'
    ? 'Drop PDF(s) to add to Merge'
    : viewMode === 'convert'
      ? 'Drop PDF to open in Read'
      : `Drop PDF to open in ${current.label}`;

  const navigation = (
    <Box className="pdfy-scroll-region" sx={{ p: 1.75, height: '100%', display: 'flex', flexDirection: 'column', gap: 1.5, overflowY: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1, pb: !desktop ? 1 : 0, borderBottom: !desktop ? 1 : 0, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {!desktop && <FolioMark size={24} />}
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.08em' }}>
            {!desktop ? 'PDFY TOOLS' : 'PDF TOOLS'}
          </Typography>
        </Box>
        {!desktop && <IconButton aria-label="Close tools menu" onClick={() => setMenuOpen(false)}><Close /></IconButton>}
      </Box>
      <Box component="nav" id="tools-navigation" aria-label="PDF tools" sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {navGroups.map((group, groupIndex) => (
          <Box key={group} sx={{ pt: groupIndex > 0 ? 1 : 0, borderTop: groupIndex > 0 ? 1 : 0, borderColor: 'divider' }}>
            <Typography
              component="div"
              variant="caption"
              color="text.secondary"
              sx={{ px: 1.25, pb: 0.5, fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.04em' }}
            >
              {group}
            </Typography>
            <List disablePadding>
              {navItems.filter(item => item.group === group).map(item => {
                const active = viewMode === item.mode;
                return (
                  <ListItem key={item.mode} disablePadding sx={{ mb: 0.5 }}>
                    <ListItemButton
                      component="button"
                      selected={active}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => navigate(item.mode)}
                      sx={{
                        width: '100%',
                        color: active ? 'primary.main' : 'text.primary',
                        borderInlineStart: '3px solid',
                        borderColor: active ? 'primary.main' : 'transparent',
                        bgcolor: active ? 'action.selected' : 'transparent',
                        textAlign: 'left',
                        px: 1.25,
                      }}
                    >
                      <ListItemIcon sx={{ color: active ? 'primary.main' : 'text.secondary', minWidth: 36 }}>{item.icon}</ListItemIcon>
                      <ListItemText
                        primary={item.label}
                        slotProps={{ primary: { sx: { fontWeight: 600, fontSize: '0.9rem' } } }}
                      />
                    </ListItemButton>
                  </ListItem>
                );
              })}
            </List>
          </Box>
        ))}
      </Box>
      <Box sx={{ mt: 'auto', p: 1.25, pt: 2, borderTop: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
          <LockOutlined sx={{ fontSize: 17, color: 'primary.main' }} />
          <Typography variant="body2" sx={{ fontWeight: 600 }}>Your files stay on your device</Typography>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.5 }}>
          Switch tools without losing your place. Download your work before closing or reloading this tab.
        </Typography>
      </Box>
    </Box>
  );

  return (
    <>
      <a className="skip-link" href={viewMode === 'edit' ? '#editor-session' : '#workspace-title'}>Skip to workspace</a>
      <Box hidden={viewMode === 'edit'} data-testid="workspace" data-theme={theme.palette.mode} sx={{ display: 'flex', flexDirection: 'column', height: '100dvh', bgcolor: 'background.default', color: 'text.primary' }}>
        <Box component="header" sx={{ px: { xs: 1, md: 3 }, py: 0.75, minHeight: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
            {!desktop && <IconButton aria-label="Open tools menu" aria-expanded={menuOpen} aria-controls={menuOpen ? 'tools-navigation' : undefined} onClick={() => { setMenuSelected(false); setMenuOpen(true); }}><MenuIcon /></IconButton>}
            <Box sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center' }}><FolioMark size={30} /></Box>
            <Typography component="span" sx={{ fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif', fontSize: '1.375rem', fontWeight: 700, letterSpacing: '-0.025em' }}>PDFy</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' }, pl: 1, borderLeft: 1, borderColor: 'divider' }}>
              Local PDF workbench
            </Typography>
          </Box>
          <AppearanceControl />
        </Box>
        <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {desktop ? (
            <Box component="aside" sx={{ width: 236, flexShrink: 0, bgcolor: 'background.paper', borderRight: 1, borderColor: 'divider' }}>{navigation}</Box>
          ) : (
            <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} ModalProps={{ disableRestoreFocus: menuSelected }} slotProps={{ paper: { sx: { width: 280, maxWidth: 'calc(100vw - 24px)' } }, transition: { onExited: () => { if (menuSelected) focusWorkspace(viewMode); } } }}>{navigation}</Drawer>
          )}
          <Box component="main" className="pdfy-scroll-region" sx={{ flex: 1, minWidth: 0, overflow: 'auto', containerType: 'inline-size', scrollPaddingTop: 2, p: { xs: 1.5, sm: 3, lg: 4 }, display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ width: '100%', maxWidth: 1200, mx: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ mb: { xs: 2, sm: 3 }, pb: 2, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
                <Typography id="workspace-title" variant="h1" tabIndex={-1} sx={{ width: 'fit-content', mb: 0.75 }}>{current.title}</Typography>
                <Typography color="text.secondary" sx={{ maxWidth: '62ch' }}>{current.description}</Typography>
              </Box>
              {navItems.filter(item => item.mode !== 'edit' && sessions[item.mode]).map(item => {
                const session = sessions[item.mode]!;
                const content = item.mode === 'view' ? (
                  <PDFViewer activeFile={sharedFile} active={viewMode === 'view'} onFileLoaded={setSharedFile} onOpenInEditor={file => openInTool('edit', file)} onOpenInOrganizer={file => openInTool('organize', file)} onOpenInPrint={file => openInTool('print', file)} onOpenInCompress={file => openInTool('compress', file)} onOpenInCompare={file => openInTool('compare', file)} />
                ) : item.mode === 'forms' ? (
                  <PDFForms initialFile={session.file} active={viewMode === 'forms'} onSessionChange={sessionHandlers.forms} onOpenInPrint={file => openInTool('print', file)} onOpenInCompress={file => openInTool('compress', file)} onOpenInEditor={file => openInTool('edit', file)} />
                ) : item.mode === 'compare' ? (
                  <PDFCompare initialFile={session.file} active={viewMode === 'compare'} onSessionChange={sessionHandlers.compare} />
                ) : item.mode === 'bookmarks' ? (
                  <PDFBookmarks initialFile={session.file} active={viewMode === 'bookmarks'} onSessionChange={sessionHandlers.bookmarks} onOpenInRead={file => openInTool('view', file)} onOpenInSplit={file => openInTool('split', file)} />
                ) : item.mode === 'convert' ? (
                  <PDFConverter initialFile={session.file} active={viewMode === 'convert'} onOpenInPrint={file => openInTool('print', file)} onOpenInEditor={file => openInTool('edit', file)} />
                ) : item.mode === 'compress' ? (
                  <PDFCompressor initialFile={session.file} active={viewMode === 'compress'} onSessionChange={sessionHandlers.compress} onOpenInPrint={file => openInTool('print', file)} onOpenInOrganizer={file => openInTool('organize', file)} />
                ) : item.mode === 'merge' ? (
                  <PDFMerger onOpenInOrganizer={file => openInTool('organize', file)} onRegisterDropHandler={registerMergeDropHandler} />
                ) : item.mode === 'organize' ? (
                  <PDFOrganizer initialFile={session.file} active={viewMode === 'organize'} onSessionChange={sessionHandlers.organize} onOpenInPrint={file => openInTool('print', file)} onOpenInCompress={file => openInTool('compress', file)} onOpenInEditor={file => openInTool('edit', file)} />
                ) : item.mode === 'split' ? (
                  <PDFSplitter initialFile={session.file} active={viewMode === 'split'} onSessionChange={sessionHandlers.split} onOpenInOrganizer={file => openInTool('organize', file)} onOpenInEditor={file => openInTool('edit', file)} onOpenInCompress={file => openInTool('compress', file)} />
                ) : item.mode === 'print' ? (
                  <PDFPrinter initialFile={session.file} active={viewMode === 'print'} onSessionChange={sessionHandlers.print} />
                ) : (
                  <PDFInspector initialFile={session.file} active={viewMode === 'inspect'} onSessionChange={sessionHandlers.inspect} onOpenInRead={file => openInTool('view', file)} onOpenInCompress={file => openInTool('compress', file)} />
                );
                return (
                  <Box key={`${item.mode}-${session.version}`} hidden={viewMode !== item.mode} data-tool={item.mode} sx={{ flex: 1, minHeight: 'min-content', display: 'flex', flexDirection: 'column' }}>
                    <Suspense fallback={<Box sx={{ py: 6, display: 'grid', placeItems: 'center' }}><CircularProgress aria-label={`Loading ${item.label}`} /></Box>}>
                      {content}
                    </Suspense>
                  </Box>
                );
              })}
            </Box>
          </Box>
        </Box>
      </Box>
      {sessions.edit && (
          <Box key={sessions.edit.version} component="main" id="editor-session" aria-label="Edit PDF" tabIndex={-1} hidden={viewMode !== 'edit'} sx={{ color: 'text.primary', minHeight: '100dvh' }}>
            <Suspense fallback={<Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}><CircularProgress aria-label="Loading Edit PDF" /></Box>}>
              <AdvancedEditor initialFile={sessions.edit.file} active={viewMode === 'edit'} onSessionChange={sessionHandlers.edit} onBack={() => navigate('view')} onPrint={file => openInTool('print', file)} onCompress={file => openInTool('compress', file)} onOrganize={file => openInTool('organize', file)} />
            </Suspense>
          </Box>
      )}
      {fileDragActive && (
        <Box
          aria-hidden="true"
          data-testid="global-pdf-drop-overlay"
          sx={{
            position: 'fixed',
            inset: 0,
            zIndex: t => t.zIndex.modal + 2,
            pointerEvents: 'none',
            display: 'grid',
            placeItems: 'center',
            p: 3,
            bgcolor: 'color-mix(in oklab, var(--pdfy-paper) 82%, transparent)',
            backdropFilter: 'blur(4px)',
          }}
        >
          <Box
            sx={{
              px: 4,
              py: 3.5,
              borderRadius: 3,
              border: '2px dashed',
              borderColor: 'primary.main',
              bgcolor: 'background.paper',
              boxShadow: 6,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 1.5,
              textAlign: 'center',
              maxWidth: 420,
            }}
          >
            <CloudUploadOutlined color="primary" sx={{ fontSize: 40 }} />
            <Typography variant="h2" sx={{ fontSize: '1.25rem' }}>
              {dropTargetMessage}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Processed 100% locally in your browser.
            </Typography>
          </Box>
        </Box>
      )}
      <Snackbar
        open={!!dropNotice}
        autoHideDuration={5000}
        onClose={() => setDropNotice(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {dropNotice ? (
          <Alert severity={dropNotice.severity} onClose={() => setDropNotice(null)} sx={{ overflowWrap: 'anywhere' }}>
            {dropNotice.message}
          </Alert>
        ) : undefined}
      </Snackbar>
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} aria-labelledby="replace-title" aria-describedby="replace-description" disableRestoreFocus={handoffConfirmed} slotProps={{ transition: { onExited: () => { if (handoffConfirmed) focusWorkspace(viewMode); } } }}>
        <DialogTitle id="replace-title">Replace the {handoffLabel} document?</DialogTitle>
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
