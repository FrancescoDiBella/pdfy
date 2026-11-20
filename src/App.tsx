import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  Alert, Box, Typography, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText,
  Button, IconButton, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
  CircularProgress, Snackbar, useMediaQuery,
} from '@mui/material';
import { useColorScheme, useTheme } from '@mui/material/styles';
import {
  DescriptionOutlined, MergeType, CallSplit, EditOutlined, DashboardCustomizeOutlined,
  InfoOutlined, PrintOutlined, AssignmentOutlined, PermMediaOutlined, CompressOutlined,
  CompareArrowsOutlined, BookmarksOutlined, Menu as MenuIcon, Close, LockOutlined, CloudUploadOutlined,
  SearchOutlined, BrightnessAutoOutlined, LightModeOutlined, DarkModeOutlined, AutoAwesomeOutlined,
} from '@mui/icons-material';
import PDFViewer from './components/PDFViewer';
import AppearanceControl from './components/AppearanceControl';
import CommandPalette, { type PaletteCommand } from './components/CommandPalette';
import LiquidGlassFilters from './components/LiquidGlassFilters';
import { preparePDFs } from './utils/pdfMerge';
import { generateSamplePDF } from './utils/pdfSamples';
import { isCommandPaletteShortcut } from './utils/commandPalette';

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

const mobileDockModes: ReadonlyArray<ViewMode> = ['view', 'edit', 'organize', 'compare'];

const toolKeywords: Record<ViewMode, readonly string[]> = {
  view: ['read', 'viewer', 'find', 'search', 'outline', 'thumbnails', 'text'],
  edit: ['edit', 'annotate', 'sign', 'signature', 'draw', 'text', 'redact', 'crop'],
  forms: ['forms', 'fill', 'acroform', 'flatten', 'checkbox', 'fields'],
  compare: ['compare', 'diff', 'visual', 'versions', 'changes'],
  bookmarks: ['bookmarks', 'toc', 'table of contents', 'outline', 'headings'],
  organize: ['organize', 'reorder', 'rotate', 'watermark', 'bates', 'headers', 'footers', 'page numbers'],
  merge: ['merge', 'combine', 'join', 'append'],
  split: ['split', 'extract', 'chunks', 'zip', 'separate'],
  convert: ['convert', 'images', 'png', 'jpeg', 'scan', 'table', 'csv', 'tsv', 'markdown', 'json', 'excel'],
  compress: ['compress', 'shrink', 'optimize', 'size', 'smaller'],
  print: ['print', 'booklet', 'n-up', 'handout', 'ink'],
  inspect: ['info', 'metadata', 'privacy', 'audit', 'sanitize', 'strip', 'properties'],
};

function FolioMark({ size = 28 }: { size?: number }) {
  return (
    <Box
      component="svg"
      aria-hidden="true"
      viewBox="0 0 48 48"
      fill="none"
      sx={{ width: size, height: size, flexShrink: 0, display: 'block' }}
    >
      <defs>
        <linearGradient id="pdfy-app-icon-bg" x1="6" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3B9BFF" />
          <stop offset="100%" stopColor="#0055C4" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="42" height="42" rx="11.5" fill="url(#pdfy-app-icon-bg)" />
      <rect x="3.75" y="3.75" width="40.5" height="40.5" rx="10.75" stroke="rgba(255,255,255,0.34)" strokeWidth="1.5" />
      <path d="M16 12.5h11.5L34 19v16.5a2 2 0 0 1-2 2H16a2 2 0 0 1-2-2v-21a2 2 0 0 1 2-2Z" fill="rgba(255,255,255,0.95)" />
      <path d="M27.5 12.5V17a2 2 0 0 0 2 2H34Z" fill="rgba(186,219,255,0.95)" />
      <rect x="18" y="23" width="12" height="2.4" rx="1.2" fill="#0062CC" />
      <rect x="18" y="28" width="9" height="2.4" rx="1.2" fill="#64748B" />
    </Box>
  );
}

function focusWorkspace(mode: ViewMode) {
  document.getElementById(mode === 'edit' ? 'editor-session' : 'workspace-title')?.focus();
}

export default function App() {
  const theme = useTheme();
  const { mode: colorMode, setMode: setColorMode } = useColorScheme();
  const desktop = useMediaQuery('(min-width:900px) and (min-height:600px)');
  const wideHeader = useMediaQuery('(min-width:600px)');
  const [viewMode, setViewMode] = useState<ViewMode>('view');
  const [sharedFile, setSharedFile] = useState<File | null>(null);
  const [sessions, setSessions] = useState<Partial<Record<ViewMode, Session>>>({ view: { file: null, version: 0 } });
  const [activeDocs, setActiveDocs] = useState<Partial<Record<ViewMode, boolean>>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuSelected, setMenuSelected] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isCommandPaletteShortcut(event)) {
        event.preventDefault();
        setPaletteOpen(current => !current);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const paletteCommands = useMemo<PaletteCommand[]>(() => {
    const toolEntries: PaletteCommand[] = navItems.map(item => ({
      id: `tool:${item.mode}`,
      label: item.title,
      subtitle: item.description,
      category: 'Tools',
      keywords: [item.label, item.group, ...toolKeywords[item.mode]],
      badge: viewMode === item.mode ? 'Active' : item.group,
      icon: item.icon,
      onSelect: () => navigate(item.mode),
    }));

    const quickEntries: PaletteCommand[] = [
      {
        id: 'action:sample-read',
        label: 'Load sample PDF in Read',
        subtitle: 'Generate the local Executive Brief sample document offline.',
        category: 'Quick actions',
        keywords: ['sample', 'demo', 'example', 'executive', 'brief', 'read'],
        icon: <AutoAwesomeOutlined />,
        onSelect: () => {
          void generateSamplePDF('executive-brief').then(sample => openInToolRef.current('view', sample));
        },
      },
    ];

    const appearanceEntries: PaletteCommand[] = [
      {
        id: 'theme:system',
        label: 'Appearance: System',
        subtitle: 'Follow your operating system light or dark preference.',
        category: 'Appearance',
        keywords: ['theme', 'appearance', 'auto', 'system'],
        badge: colorMode === 'system' ? 'Current' : undefined,
        icon: <BrightnessAutoOutlined />,
        onSelect: () => setColorMode('system'),
      },
      {
        id: 'theme:light',
        label: 'Appearance: Light',
        subtitle: 'Use warm light paper surfaces.',
        category: 'Appearance',
        keywords: ['theme', 'appearance', 'light', 'day'],
        badge: colorMode === 'light' ? 'Current' : undefined,
        icon: <LightModeOutlined />,
        onSelect: () => setColorMode('light'),
      },
      {
        id: 'theme:dark',
        label: 'Appearance: Dark',
        subtitle: 'Use low-glare dark workspace surfaces.',
        category: 'Appearance',
        keywords: ['theme', 'appearance', 'dark', 'night'],
        badge: colorMode === 'dark' ? 'Current' : undefined,
        icon: <DarkModeOutlined />,
        onSelect: () => setColorMode('dark'),
      },
    ];

    return [...toolEntries, ...quickEntries, ...appearanceEntries];
  }, [colorMode, navigate, setColorMode, viewMode]);

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
  const activeDockIndex = mobileDockModes.indexOf(viewMode);
  const dropTargetMessage = viewMode === 'merge'
    ? 'Drop PDF(s) to add to Merge'
    : viewMode === 'convert'
      ? 'Drop PDF to open in Read'
      : `Drop PDF to open in ${current.label}`;

  const navigation = (
    <Box className="pdfy-scroll-region" sx={{ p: 1.15, pb: !desktop ? 'max(18px, env(safe-area-inset-bottom, 0px))' : 1.2, height: '100%', display: 'flex', flexDirection: 'column', gap: desktop ? 0.65 : 1, overflowY: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.1, pb: !desktop ? 0.65 : 0.1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {!desktop && <FolioMark size={24} />}
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.07em', fontSize: '0.7rem' }}>
            {!desktop ? 'PDFY TOOLS' : 'PDF TOOLS'}
          </Typography>
        </Box>
        {!desktop && <IconButton aria-label="Close tools menu" onClick={() => setMenuOpen(false)}><Close /></IconButton>}
      </Box>
      <Box component="nav" id="tools-navigation" aria-label="PDF tools" sx={{ display: 'flex', flexDirection: 'column', gap: desktop ? 0.85 : 1.1 }}>
        {navGroups.map(group => (
          <Box key={group}>
            <Typography
              component="div"
              variant="caption"
              color="text.secondary"
              sx={{ px: 1.3, pb: 0.3, fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.05em' }}
            >
              {group}
            </Typography>
            <List disablePadding>
              {navItems.filter(item => item.group === group).map(item => {
                const active = viewMode === item.mode;
                return (
                  <ListItem key={item.mode} disablePadding sx={{ mb: desktop ? 0.15 : 0.25 }}>
                    <ListItemButton
                      component="button"
                      selected={active}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => navigate(item.mode)}
                      sx={{
                        width: '100%',
                        minHeight: desktop ? 35 : 44,
                        '@media (pointer: coarse)': { minHeight: 44 },
                        borderRadius: 999,
                        color: active ? 'primary.main' : 'text.primary',
                        bgcolor: active ? 'var(--pdfy-glass-active-bg)' : 'transparent',
                        boxShadow: active ? 'var(--pdfy-glass-active-shadow)' : 'none',
                        '&.Mui-selected': {
                          bgcolor: 'var(--pdfy-glass-active-bg)',
                        },
                        '&.Mui-selected:hover': {
                          bgcolor: 'var(--pdfy-glass-active-bg)',
                        },
                        textAlign: 'left',
                        px: 1.35,
                        py: desktop ? 0.35 : 0.65,
                      }}
                    >
                      <ListItemIcon sx={{ color: active ? 'primary.main' : 'text.secondary', minWidth: 30, '& svg': { fontSize: 19 } }}>{item.icon}</ListItemIcon>
                      <ListItemText
                        primary={item.label}
                        slotProps={{ primary: { sx: { fontWeight: active ? 700 : 500, fontSize: '0.85rem', letterSpacing: '-0.01em' } } }}
                      />
                    </ListItemButton>
                  </ListItem>
                );
              })}
            </List>
          </Box>
        ))}
      </Box>
      <Box sx={{ mt: 'auto', px: 1.25, pt: 1, borderTop: 1, borderColor: 'var(--pdfy-glass-hairline)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.65, mb: 0.2 }}>
          <LockOutlined sx={{ fontSize: 14, color: 'primary.main' }} />
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary' }}>100% on-device</Typography>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.38 }}>
          Local-only · Download before closing.
        </Typography>
      </Box>
    </Box>
  );

  return (
    <>
      <LiquidGlassFilters />
      <a className="skip-link" href={viewMode === 'edit' ? '#editor-session' : '#workspace-title'}>Skip to workspace</a>
      <Box hidden={viewMode === 'edit'} data-testid="workspace" data-theme={theme.palette.mode} className="pdfy-workspace-shell" sx={{ display: 'flex', flexDirection: 'column', height: '100dvh', color: 'text.primary' }}>
        <Box
          component="header"
          className="pdfy-glass-header"
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: { xs: 0.75, sm: 1.25 },
            zIndex: 10,
            flexShrink: 0,
          }}
        >
          <Box
            className="lg-surface lg-pill"
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: { xs: 0.5, sm: 0.9 },
              minWidth: 0,
              minHeight: 46,
              pl: desktop ? 1.5 : 0.25,
              pr: { xs: 1.25, sm: 1.75 },
              py: desktop ? 0.6 : 0.125,
            }}
          >
            {!desktop && (
              <IconButton
                aria-label="Open tools menu"
                aria-expanded={menuOpen}
                aria-controls={menuOpen ? 'tools-navigation' : undefined}
                onClick={() => { setMenuSelected(false); setMenuOpen(true); }}
              >
                <MenuIcon />
              </IconButton>
            )}
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <FolioMark size={wideHeader ? 26 : 22} />
            </Box>
            <Typography component="span" sx={{ fontSize: { xs: '1.02rem', sm: '1.125rem' }, fontWeight: 700, letterSpacing: '-0.03em', whiteSpace: 'nowrap' }}>
              PDFy
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                display: { xs: 'none', md: 'block' },
                pl: 1,
                borderLeft: 1,
                borderColor: 'var(--pdfy-glass-hairline)',
                fontWeight: 500,
                whiteSpace: 'nowrap',
              }}
            >
              Local PDF workbench
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.65, sm: 0.85 }, flexShrink: 0 }}>
            {wideHeader ? (
              <Button
                variant="outlined"
                size="small"
                color="inherit"
                className="lg-surface lg-pill lg-interactive"
                aria-keyshortcuts="Control+K Meta+K"
                onClick={() => setPaletteOpen(true)}
                sx={{
                  bgcolor: 'var(--lg-fill-regular)',
                  backgroundImage: 'var(--lg-surface-sheen)',
                  boxShadow: 'var(--lg-shadow-pill)',
                  borderColor: 'var(--lg-outer-hairline)',
                  color: 'text.primary',
                  borderRadius: 999,
                  minHeight: 40,
                  '@media (pointer: coarse)': { minHeight: 44 },
                  px: 1.6,
                  gap: 1,
                  '&:hover': {
                    bgcolor: 'var(--lg-fill-panel)',
                    boxShadow: 'var(--lg-shadow-pill)',
                    borderColor: 'var(--lg-outer-hairline)',
                  },
                }}
              >
                <SearchOutlined fontSize="small" aria-hidden="true" />
                <span>Quick jump</span>
                <kbd aria-hidden="true" className="pdfy-kbd-hint">⌘K</kbd>
              </Button>
            ) : (
              <IconButton
                className="lg-surface lg-orb lg-interactive"
                aria-label="Quick jump"
                aria-keyshortcuts="Control+K Meta+K"
                onClick={() => setPaletteOpen(true)}
                sx={{
                  color: 'text.primary',
                  bgcolor: 'var(--lg-fill-regular)',
                  backgroundImage: 'var(--lg-surface-sheen)',
                  boxShadow: 'var(--lg-shadow-pill)',
                  '&:hover': {
                    bgcolor: 'var(--lg-fill-panel)',
                    boxShadow: 'var(--lg-shadow-pill)',
                  },
                }}
              >
                <SearchOutlined fontSize="small" />
              </IconButton>
            )}
            <AppearanceControl />
          </Box>
        </Box>
        <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {desktop ? (
            <Box
              component="aside"
              className="lg-surface lg-panel"
              sx={{
                width: 220,
                flexShrink: 0,
                m: 1.5,
                mt: 0.75,
                mr: 0,
                borderRadius: '24px',
                overflow: 'hidden',
              }}
            >
              {navigation}
            </Box>
          ) : (
            <Drawer
              open={menuOpen}
              onClose={() => setMenuOpen(false)}
              ModalProps={{ disableRestoreFocus: menuSelected }}
              slotProps={{
                paper: {
                  className: 'lg-surface lg-panel',
                  sx: {
                    width: 276,
                    maxWidth: 'calc(100vw - 24px)',
                    m: 1,
                    height: 'calc(100% - 16px)',
                    borderRadius: '24px',
                  },
                },
                transition: { onExited: () => { if (menuSelected) focusWorkspace(viewMode); } },
              }}
            >
              {navigation}
            </Drawer>
          )}
          <Box component="main" className="pdfy-scroll-region pdfy-workspace-main" sx={{ flex: 1, minWidth: 0, overflow: 'auto', containerType: 'inline-size', px: { xs: 1.5, sm: 2.5, lg: 3.5 }, pt: { xs: 1, sm: 1.5, lg: 1.75 }, pb: desktop ? { xs: 2.5, lg: 3.5 } : 'calc(92px + env(safe-area-inset-bottom, 0px))', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ width: '100%', maxWidth: 1200, mx: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ mb: { xs: 1.25, sm: 2 }, pb: { xs: 0.75, sm: 1.25 }, borderBottom: { xs: 0, sm: 1 }, borderColor: 'var(--pdfy-glass-hairline)', flexShrink: 0 }}>
                <Typography id="workspace-title" variant="h1" tabIndex={-1} sx={{ width: 'fit-content', mb: 0.25 }}>{current.title}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ maxWidth: '64ch' }}>{current.description}</Typography>
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
        {!desktop && (
          <Box component="nav" aria-label="Quick tools" className="pdfy-mobile-dock">
            <Box className="pdfy-mobile-dock-bar">
              <Box
                className="lg-surface lg-pill pdfy-mobile-dock-capsule"
                style={{ '--lg-active-index': Math.max(0, activeDockIndex) } as CSSProperties}
              >
                <span
                  aria-hidden="true"
                  className="lg-surface lg-lens pdfy-mobile-dock-lens"
                  data-visible={activeDockIndex >= 0 ? 'true' : 'false'}
                />
                {mobileDockModes.map(mode => {
                  const item = navItems.find(entry => entry.mode === mode)!;
                  const active = viewMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      className="pdfy-mobile-dock-btn"
                      aria-current={active ? 'page' : undefined}
                      onClick={() => navigate(mode)}
                    >
                      <Box component="span" aria-hidden="true" sx={{ display: 'inline-flex', '& svg': { fontSize: 20 } }}>
                        {item.icon}
                      </Box>
                      <span className="pdfy-mobile-dock-label">{item.label}</span>
                    </button>
                  );
                })}
              </Box>
              <button
                type="button"
                className="lg-surface lg-orb lg-interactive pdfy-mobile-dock-orb"
                aria-label="More tools"
                aria-expanded={menuOpen}
                aria-controls={menuOpen ? 'tools-navigation' : undefined}
                data-active={activeDockIndex < 0 ? 'true' : 'false'}
                onClick={() => { setMenuSelected(false); setMenuOpen(true); }}
              >
                <MenuIcon aria-hidden="true" sx={{ fontSize: 21 }} />
              </button>
            </Box>
          </Box>
        )}
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
            bgcolor: 'color-mix(in oklab, var(--pdfy-canvas) 66%, transparent)',
            backdropFilter: 'blur(10px) saturate(140%)',
          }}
        >
          <Box
            className="lg-surface lg-panel"
            sx={{
              px: 4,
              py: 3.5,
              borderRadius: '26px',
              outline: '2px dashed',
              outlineColor: 'primary.main',
              outlineOffset: '-10px',
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
      <CommandPalette open={paletteOpen} commands={paletteCommands} onClose={() => setPaletteOpen(false)} />
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
