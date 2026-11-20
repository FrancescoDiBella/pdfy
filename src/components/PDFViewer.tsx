import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import {
  Box, Button, Typography, Paper, CircularProgress, IconButton, Tooltip, Divider, Alert, TextField, InputAdornment,
  Menu, MenuItem, ListItemIcon, ListItemText, useMediaQuery,
} from '@mui/material';
import {
  FolderOpenOutlined, ZoomIn, ZoomOut, RotateRight, ViewSidebarOutlined, EditOutlined,
  DashboardCustomizeOutlined, DescriptionOutlined, PrintOutlined, CompressOutlined, CompareArrowsOutlined,
  SearchOutlined, TocOutlined, KeyboardArrowUp, KeyboardArrowDown, Close, ContentCopy, DownloadOutlined,
  MenuBookOutlined, FullscreenOutlined, FullscreenExitOutlined, MoreHoriz,
} from '@mui/icons-material';
import { Document, Page, pdfjs } from 'react-pdf';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { generateSamplePDF } from '../utils/pdfSamples';
import { preparePDFs } from '../utils/pdfMerge';
import { pdfDocumentOptions } from '../utils/pdfRendering';
import {
  buildDocumentPlainText,
  flattenOutlineItems,
  normalizePageTextItems,
  searchDocumentPages,
  type ExtractedPageText,
  type FlattenedOutlineItem,
} from '../utils/pdfTextSearch';
import {
  buildPageSpreads,
  computePageRenderWidth,
  computeScrollProgress,
  SPREAD_MIN_VIEWPORT_WIDTH,
  type ReaderLayoutMode,
} from '../utils/pdfReaderLayout';
import ToolIntro from './ToolIntro';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

type PdfProxyLike = Parameters<NonNullable<ComponentProps<typeof Document>['onLoadSuccess']>>[0];

interface Props {
  activeFile: File | null;
  active?: boolean;
  onFileLoaded: (file: File) => void;
  onOpenInEditor: (file: File) => void;
  onOpenInOrganizer: (file: File) => void;
  onOpenInPrint?: (file: File) => void;
  onOpenInCompress?: (file: File) => void;
  onOpenInCompare?: (file: File) => void;
}

function ViewerPage({ viewRotation, ...props }: ComponentProps<typeof Page> & { viewRotation: number }) {
  const [originalRotation, setOriginalRotation] = useState<number>();
  return <Page {...props} rotate={originalRotation === undefined ? undefined : (originalRotation + viewRotation) % 360} onLoadSuccess={page => setOriginalRotation(page.rotate)} />;
}

function clearReaderHighlights() {
  if (typeof CSS === 'undefined' || !('highlights' in CSS)) return;
  const registry = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
  registry?.delete('pdfy-search-matches');
  registry?.delete('pdfy-search-active');
}

export default function PDFViewer({ activeFile: file, active = true, onFileLoaded, onOpenInEditor, onOpenInOrganizer, onOpenInPrint, onOpenInCompress, onOpenInCompare }: Props) {
  const compactToolbar = useMediaQuery('(max-width:639.95px)');
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'thumbnails' | 'outline'>('thumbnails');
  const [activePage, setActivePage] = useState(1);
  const [spreadMode, setSpreadMode] = useState<ReaderLayoutMode>('single');
  const [focusMode, setFocusMode] = useState(false);
  const [moreActionsAnchor, setMoreActionsAnchor] = useState<HTMLElement | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState('');
  const [viewportWidth, setViewportWidth] = useState(600);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [extractingForFile, setExtractingForFile] = useState<File | null>(null);
  const [docData, setDocData] = useState<{ file: File; pages: ExtractedPageText[]; outline: FlattenedOutlineItem[] } | null>(null);
  const [statusMessage, setStatusMessage] = useState('');

  const extractedPages = useMemo(() => (docData?.file === file ? docData.pages : []), [docData, file]);
  const outlineItems = useMemo(() => (docData?.file === file ? docData.outline : []), [docData, file]);
  const isExtractingText = extractingForFile !== null && extractingForFile === file;
  const isFocusActive = focusMode && active && Boolean(file);
  const canSpread = numPages >= 2 && viewportWidth >= SPREAD_MIN_VIEWPORT_WIDTH;
  const effectiveSpreadMode: ReaderLayoutMode = spreadMode === 'spread' && canSpread ? 'spread' : 'single';
  const pageSpreads = useMemo(
    () => buildPageSpreads(numPages, effectiveSpreadMode, true),
    [numPages, effectiveSpreadMode],
  );

  const fileInput = useRef<HTMLInputElement>(null);
  const readerStageRef = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const findToggleRef = useRef<HTMLButtonElement>(null);
  const focusToggleRef = useRef<HTMLButtonElement>(null);
  const wasFocusActiveRef = useRef(false);
  const busy = useRef(false);
  const activeDocIdRef = useRef(0);

  const exitFocusMode = useCallback(() => {
    setFocusMode(false);
    if (document.fullscreenElement && document.exitFullscreen) {
      void document.exitFullscreen()
        .catch(() => {})
        .finally(() => {
          requestAnimationFrame(() => focusToggleRef.current?.focus());
        });
    }
  }, []);

  const enterFocusMode = useCallback(() => {
    setFocusMode(true);
    const stage = readerStageRef.current;
    if (stage?.requestFullscreen) {
      void stage.requestFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (wasFocusActiveRef.current && !isFocusActive) {
      focusToggleRef.current?.focus();
    }
    wasFocusActiveRef.current = isFocusActive;
  }, [isFocusActive]);

  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement && focusMode) {
        setFocusMode(false);
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, [focusMode]);

  useEffect(() => {
    if (!isFocusActive) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !searchOpen) {
        event.preventDefault();
        exitFocusMode();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFocusActive, searchOpen, exitFocusMode]);

  useEffect(() => {
    const container = viewport.current;
    const bar = progressBarRef.current;
    if (!container || !bar || !file) return;
    const supportsScrollTimeline = typeof CSS !== 'undefined' && Boolean(CSS.supports?.('animation-timeline', 'scroll()'));
    if (supportsScrollTimeline) return;

    const updateProgress = () => {
      const ratio = computeScrollProgress(container.scrollTop, container.scrollHeight, container.clientHeight);
      bar.style.transform = `scaleX(${ratio})`;
    };
    updateProgress();
    container.addEventListener('scroll', updateProgress, { passive: true });
    return () => container.removeEventListener('scroll', updateProgress);
  }, [file, numPages, effectiveSpreadMode, isFocusActive]);

  useEffect(() => {
    if (!viewport.current) return;
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width;
      if (width > 0) setViewportWidth(width);
    });
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, [file]);

  useEffect(() => {
    clearReaderHighlights();
    activeDocIdRef.current += 1;
    return () => {
      clearReaderHighlights();
    };
  }, [file]);

  const scrollToPage = useCallback((page: number, focusTarget = true) => {
    setActivePage(page);
    const target = document.getElementById(`viewer-page-${page}`);
    target?.scrollIntoView({ block: 'start', behavior: 'instant' });
    if (focusTarget) target?.focus({ preventScroll: true });
  }, []);

  const searchMatches = useMemo(
    () => searchDocumentPages(extractedPages, searchQuery),
    [extractedPages, searchQuery],
  );

  const boundedMatchIndex = searchMatches.length > 0 ? Math.min(activeMatchIndex, searchMatches.length - 1) : 0;
  const activeMatch = searchMatches[boundedMatchIndex] ?? null;

  const openSearchBar = useCallback(() => {
    setSearchOpen(true);
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }, []);

  const closeSearchBar = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery('');
    setActiveMatchIndex(0);
    clearReaderHighlights();
    requestAnimationFrame(() => findToggleRef.current?.focus());
  }, []);

  const stepMatch = useCallback((delta: number) => {
    if (searchMatches.length === 0) return;
    const nextIndex = (boundedMatchIndex + delta + searchMatches.length) % searchMatches.length;
    setActiveMatchIndex(nextIndex);
    const targetMatch = searchMatches[nextIndex];
    if (targetMatch) {
      scrollToPage(targetMatch.pageNumber, false);
    }
  }, [boundedMatchIndex, searchMatches, scrollToPage]);

  useEffect(() => {
    if (!active || !file) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        openSearchBar();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, file, openSearchBar]);

  // Keep highlights synced via the CSS Custom Highlight API across rendered text layers.
  useEffect(() => {
    const syncHighlights = () => {
      clearReaderHighlights();
      const query = searchQuery.trim();
      const HighlightCtor = typeof globalThis !== 'undefined' ? (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => { priority?: number } }).Highlight : undefined;
      const registry = typeof CSS !== 'undefined' && 'highlights' in CSS ? (CSS as unknown as { highlights?: Map<string, unknown> }).highlights : undefined;
      if (!searchOpen || !query || !HighlightCtor || !registry || !viewport.current) return;

      const lowerQuery = query.toLowerCase();
      const allRanges: Range[] = [];
      const activeRanges: Range[] = [];

      for (let pageNumber = 1; pageNumber <= numPages; pageNumber++) {
        const pageEl = document.getElementById(`viewer-page-${pageNumber}`);
        const textLayer = pageEl?.querySelector('.react-pdf__Page__textContent');
        if (!textLayer) continue;

        const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT);
        let node: Node | null = walker.nextNode();
        const textNodes: Text[] = [];
        let fullText = '';
        const starts: number[] = [];

        while (node) {
          if (node instanceof Text && node.data.length > 0) {
            starts.push(fullText.length);
            textNodes.push(node);
            fullText += node.data;
          }
          node = walker.nextNode();
        }

        if (!fullText) continue;
        const lowerText = fullText.toLowerCase();
        let searchPos = 0;

        const findNodeOffset = (charOffset: number): { node: Text; offset: number } | null => {
          for (let i = 0; i < textNodes.length; i++) {
            const start = starts[i];
            const end = start + textNodes[i].data.length;
            if (charOffset >= start && charOffset <= end) {
              return { node: textNodes[i], offset: charOffset - start };
            }
          }
          return null;
        };

        let matchIndexInDomPage = 0;
        while (searchPos <= lowerText.length - lowerQuery.length) {
          const idx = lowerText.indexOf(lowerQuery, searchPos);
          if (idx === -1) break;
          const startPos = findNodeOffset(idx);
          const endPos = findNodeOffset(idx + lowerQuery.length);
          if (startPos && endPos) {
            const range = new Range();
            range.setStart(startPos.node, startPos.offset);
            range.setEnd(endPos.node, endPos.offset);
            if (activeMatch && activeMatch.pageNumber === pageNumber && matchIndexInDomPage === activeMatch.matchIndexInPage) {
              activeRanges.push(range);
            } else {
              allRanges.push(range);
            }
          }
          matchIndexInDomPage += 1;
          searchPos = idx + Math.max(1, lowerQuery.length);
        }
      }

      if (allRanges.length > 0) {
        const matchesHighlight = new HighlightCtor(...allRanges);
        matchesHighlight.priority = 0;
        registry.set('pdfy-search-matches', matchesHighlight);
      }
      if (activeRanges.length > 0) {
        const activeHighlight = new HighlightCtor(...activeRanges);
        activeHighlight.priority = 1;
        registry.set('pdfy-search-active', activeHighlight);
      }
    };

    syncHighlights();
    if (!searchOpen || !searchQuery.trim() || !viewport.current) return;
    const observer = new MutationObserver(() => syncHighlights());
    observer.observe(viewport.current, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [searchOpen, searchQuery, activeMatch, numPages]);

  const handleDocumentLoad = (pdf: PdfProxyLike) => {
    setNumPages(pdf.numPages);
    if (!file) return;
    const loadedFile = file;
    const currentDocId = ++activeDocIdRef.current;
    setExtractingForFile(loadedFile);

    void (async () => {
      try {
        const outline = await pdf.getOutline().catch(() => null);
        const flatOutline = await flattenOutlineItems(outline, async dest => {
          const resolved = typeof dest === 'string' ? await pdf.getDestination(dest) : dest;
          if (!Array.isArray(resolved) || !resolved[0]) return null;
          const pageIndex = await pdf.getPageIndex(resolved[0]);
          return pageIndex + 1;
        });
        if (currentDocId !== activeDocIdRef.current) return;

        const pages: ExtractedPageText[] = [];
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
          if (currentDocId !== activeDocIdRef.current) return;
          const page = await pdf.getPage(pageNumber);
          const content = await page.getTextContent();
          const items = content.items.filter((item): item is TextItem => 'str' in item);
          pages.push({ pageNumber, text: normalizePageTextItems(items) });
        }
        if (currentDocId !== activeDocIdRef.current) return;
        setDocData({ file: loadedFile, pages, outline: flatOutline });
      } catch {
        // Keep viewer usable even if outline or text extraction fails for a malformed PDF.
      } finally {
        if (currentDocId === activeDocIdRef.current) {
          setExtractingForFile(current => (current === loadedFile ? null : current));
        }
      }
    })();
  };

  const fullPlainText = useMemo(() => buildDocumentPlainText(extractedPages), [extractedPages]);

  const handleCopyText = async () => {
    if (!fullPlainText) {
      setStatusMessage('No selectable text found in this document.');
      return;
    }
    try {
      await navigator.clipboard.writeText(fullPlainText);
      setStatusMessage(`Copied text from ${extractedPages.length} ${extractedPages.length === 1 ? 'page' : 'pages'}.`);
    } catch {
      setStatusMessage('Clipboard copy failed.');
    }
  };

  const handleDownloadText = () => {
    if (!file || !fullPlainText) return;
    const baseName = file.name.replace(/\.pdf$/i, '') || 'document';
    const blob = new Blob([fullPlainText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${baseName}.txt`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 250);
    setStatusMessage(`Downloaded ${baseName}.txt.`);
  };

  const openFile = async (getFile: () => Promise<File>) => {
    if (busy.current) return;
    busy.current = true;
    setIsOpening(true);
    setError('');
    try {
      const candidate = await getFile();
      const { accepted } = await preparePDFs([candidate]);
      if (!accepted.length) {
        setError(`Could not open “${candidate.name}”. Choose a readable PDF with at least one page and no password protection.`);
        return;
      }
      setNumPages(accepted[0].pageCount);
      setActivePage(1);
      setRotation(0);
      setScale(1);
      setFocusMode(false);
      setSearchOpen(false);
      setSearchQuery('');
      setActiveMatchIndex(0);
      setStatusMessage('');
      onFileLoaded(candidate);
    } catch {
      setError('Could not open the document. Please try another PDF.');
    } finally {
      busy.current = false;
      setIsOpening(false);
    }
  };

  const toggleSidebar = (tab: 'thumbnails' | 'outline') => {
    if (sidebarOpen && sidebarTab === tab) {
      setSidebarOpen(false);
    } else {
      setSidebarTab(tab);
      setSidebarOpen(true);
    }
  };

  return (
    <Box aria-busy={isOpening} sx={{ width: '100%', flex: 1, minHeight: file ? 480 : undefined, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <input ref={fileInput} aria-label="PDF to read" type="file" hidden accept="application/pdf,.pdf" disabled={isOpening} onChange={event => {
        const selected = event.target.files?.[0];
        event.target.value = '';
        if (selected) void openFile(async () => selected);
      }} />
      {error && <Alert severity="error" onClose={() => setError('')} sx={{ overflowWrap: 'anywhere' }}>{error}</Alert>}
      {!file ? (
        <Box sx={{ width: '100%', maxWidth: 800, mx: 'auto', mt: { xs: 0, md: 2 } }}>
          <ToolIntro icon={<DescriptionOutlined fontSize="large" />} title="Open a PDF to get started" description="Read, edit, or organize a document. Everything is processed on your device, with no account needed.">
            <Button variant="contained" size="large" startIcon={isOpening ? <CircularProgress size={20} color="inherit" /> : <FolderOpenOutlined />} disabled={isOpening} onClick={() => fileInput.current?.click()}>
              {isOpening ? 'Opening PDF…' : 'Open PDF'}
            </Button>
            <Divider sx={{ width: '100%' }} />
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Just looking around?</Typography>
              <Button variant="outlined" disabled={isOpening} onClick={() => void openFile(() => generateSamplePDF('executive-brief'))}>Try a sample PDF</Button>
            </Box>
          </ToolIntro>
          <Box component="ol" aria-label="How it works" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 1.5, p: 0, mt: 2.25, listStyle: 'none' }}>
            {[
              ['Open', 'Choose a file from your device.'],
              ['Make it yours', 'Pick a tool from the menu.'],
              ['Download', 'Save your work before you leave.'],
            ].map(([title, description], index) => (
              <Box component="li" key={title} className="pdfy-glass-subtle" sx={{ display: 'flex', gap: 1.25, p: 1.5, borderRadius: '16px' }}>
                <Typography aria-hidden="true" className="tabular-nums" sx={{ color: 'primary.main', fontWeight: 700 }}>{index + 1}.</Typography>
                <Box><Typography variant="body2" sx={{ fontWeight: 700 }}>{title}</Typography><Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>{description}</Typography></Box>
              </Box>
            ))}
          </Box>
        </Box>
      ) : (
        <>
          <Paper variant="outlined" className="pdfy-glass-card" sx={{ p: compactToolbar ? 1.25 : 1.5, borderRadius: '18px', display: isFocusActive ? 'none' : 'flex', flexDirection: 'column', gap: compactToolbar ? 1 : 1.25 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <DescriptionOutlined color="primary" sx={{ flexShrink: 0 }} />
              <Box sx={{ flex: 1, minWidth: 110, overflowWrap: 'anywhere' }}>
                <Typography variant="body2" sx={{ fontWeight: 700, fontSize: compactToolbar ? '0.8125rem' : '0.875rem', lineHeight: 1.28 }}>{file.name}</Typography>
                <Typography variant="caption" color="text.secondary" className="tabular-nums">
                  {numPages} {numPages === 1 ? 'page' : 'pages'}{compactToolbar ? '' : ' · View changes do not modify the file'}
                </Typography>
              </Box>
              {compactToolbar ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                  <Button variant="contained" size="small" startIcon={<EditOutlined />} onClick={() => onOpenInEditor(file)} sx={{ px: 1.5 }}>Edit PDF</Button>
                  <IconButton
                    aria-label="More document actions"
                    aria-haspopup="menu"
                    aria-expanded={Boolean(moreActionsAnchor)}
                    onClick={event => setMoreActionsAnchor(event.currentTarget)}
                  >
                    <MoreHoriz />
                  </IconButton>
                  <Menu
                    anchorEl={moreActionsAnchor}
                    open={Boolean(moreActionsAnchor)}
                    onClose={() => setMoreActionsAnchor(null)}
                  >
                    <MenuItem disabled={isOpening} onClick={() => { setMoreActionsAnchor(null); fileInput.current?.click(); }}>
                      <ListItemIcon><FolderOpenOutlined fontSize="small" /></ListItemIcon>
                      <ListItemText>Open another PDF</ListItemText>
                    </MenuItem>
                    <MenuItem onClick={() => { setMoreActionsAnchor(null); setRotation(value => (value + 90) % 360); }}>
                      <ListItemIcon><RotateRight fontSize="small" /></ListItemIcon>
                      <ListItemText>Rotate view clockwise</ListItemText>
                    </MenuItem>
                    <MenuItem disabled={isExtractingText || !fullPlainText} onClick={() => { setMoreActionsAnchor(null); void handleCopyText(); }}>
                      <ListItemIcon><ContentCopy fontSize="small" /></ListItemIcon>
                      <ListItemText>Copy text</ListItemText>
                    </MenuItem>
                    <MenuItem disabled={isExtractingText || !fullPlainText} onClick={() => { setMoreActionsAnchor(null); handleDownloadText(); }}>
                      <ListItemIcon><DownloadOutlined fontSize="small" /></ListItemIcon>
                      <ListItemText>Download .txt</ListItemText>
                    </MenuItem>
                    {onOpenInPrint && (
                      <MenuItem onClick={() => { setMoreActionsAnchor(null); onOpenInPrint(file); }}>
                        <ListItemIcon><PrintOutlined fontSize="small" /></ListItemIcon>
                        <ListItemText>Print PDF</ListItemText>
                      </MenuItem>
                    )}
                    {onOpenInCompress && (
                      <MenuItem onClick={() => { setMoreActionsAnchor(null); onOpenInCompress(file); }}>
                        <ListItemIcon><CompressOutlined fontSize="small" /></ListItemIcon>
                        <ListItemText>Compress PDF</ListItemText>
                      </MenuItem>
                    )}
                    {onOpenInCompare && (
                      <MenuItem onClick={() => { setMoreActionsAnchor(null); onOpenInCompare(file); }}>
                        <ListItemIcon><CompareArrowsOutlined fontSize="small" /></ListItemIcon>
                        <ListItemText>Compare PDF</ListItemText>
                      </MenuItem>
                    )}
                    <MenuItem onClick={() => { setMoreActionsAnchor(null); onOpenInOrganizer(file); }}>
                      <ListItemIcon><DashboardCustomizeOutlined fontSize="small" /></ListItemIcon>
                      <ListItemText>Organize pages</ListItemText>
                    </MenuItem>
                  </Menu>
                </Box>
              ) : (
                <Button variant="outlined" size="small" disabled={isOpening} startIcon={<FolderOpenOutlined />} onClick={() => fileInput.current?.click()}>Open another PDF</Button>
              )}
            </Box>
            <Divider sx={{ borderColor: 'var(--pdfy-glass-hairline)' }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: compactToolbar ? 'nowrap' : 'wrap', flexDirection: compactToolbar ? 'column' : 'row' }}>
              <Box
                role="group"
                aria-label="View controls"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  width: compactToolbar ? '100%' : 'auto',
                  flexWrap: compactToolbar ? 'nowrap' : 'wrap',
                  overflowX: compactToolbar ? 'auto' : 'visible',
                  scrollbarWidth: 'none',
                  '&::-webkit-scrollbar': { display: 'none' },
                }}
              >
                <Tooltip title="Page thumbnails">
                  <IconButton aria-label="Page thumbnails" aria-pressed={sidebarOpen && sidebarTab === 'thumbnails'} onClick={() => toggleSidebar('thumbnails')} color={sidebarOpen && sidebarTab === 'thumbnails' ? 'primary' : 'default'}>
                    <ViewSidebarOutlined />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Document outline">
                  <IconButton aria-label="Document outline" aria-pressed={sidebarOpen && sidebarTab === 'outline'} onClick={() => toggleSidebar('outline')} color={sidebarOpen && sidebarTab === 'outline' ? 'primary' : 'default'}>
                    <TocOutlined />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Find in document (Ctrl+F)">
                  <IconButton ref={findToggleRef} aria-label="Find in document" aria-pressed={searchOpen} onClick={() => (searchOpen ? closeSearchBar() : openSearchBar())} color={searchOpen ? 'primary' : 'default'}>
                    <SearchOutlined />
                  </IconButton>
                </Tooltip>
                <IconButton aria-label="Zoom out" disabled={scale <= 0.5} onClick={() => setScale(value => Math.max(0.5, value - 0.25))}><ZoomOut /></IconButton>
                <Button aria-label={`${Math.round(scale * 100)}% zoom, fit page width`} onClick={() => setScale(1)} className="tabular-nums" sx={{ minWidth: 50, px: 0.75, flexShrink: 0 }}>{Math.round(scale * 100)}%</Button>
                <IconButton aria-label="Zoom in" disabled={scale >= 2.5} onClick={() => setScale(value => Math.min(2.5, value + 0.25))}><ZoomIn /></IconButton>
                <IconButton aria-label="Rotate view clockwise" onClick={() => setRotation(value => (value + 90) % 360)}><RotateRight /></IconButton>
                {!compactToolbar && (
                  <Tooltip title={canSpread ? 'Two-page spread' : 'Two-page spread requires 2+ pages on a wider screen'}>
                    <span>
                      <IconButton
                        aria-label="Two-page spread"
                        aria-pressed={effectiveSpreadMode === 'spread'}
                        disabled={!canSpread}
                        color={effectiveSpreadMode === 'spread' ? 'primary' : 'default'}
                        onClick={() => setSpreadMode(current => (current === 'spread' ? 'single' : 'spread'))}
                      >
                        <MenuBookOutlined />
                      </IconButton>
                    </span>
                  </Tooltip>
                )}
                <Tooltip title="Focus reading mode">
                  <IconButton
                    ref={focusToggleRef}
                    aria-label="Focus reading mode"
                    aria-pressed={isFocusActive}
                    color={isFocusActive ? 'primary' : 'default'}
                    onClick={enterFocusMode}
                  >
                    <FullscreenOutlined />
                  </IconButton>
                </Tooltip>
              </Box>
              <Box
                sx={{
                  display: 'flex',
                  gap: 0.75,
                  width: compactToolbar ? '100%' : 'auto',
                  flexWrap: compactToolbar ? 'nowrap' : 'wrap',
                  overflowX: compactToolbar ? 'auto' : 'visible',
                  scrollbarWidth: 'none',
                  '&::-webkit-scrollbar': { display: 'none' },
                  '& > button': { flexShrink: 0, whiteSpace: 'nowrap' },
                }}
              >
                {!compactToolbar && (
                  <>
                    <Button variant="outlined" size="small" startIcon={<ContentCopy />} disabled={isExtractingText || !fullPlainText} onClick={() => void handleCopyText()}>Copy text</Button>
                    <Button variant="outlined" size="small" startIcon={<DownloadOutlined />} disabled={isExtractingText || !fullPlainText} onClick={handleDownloadText}>Download .txt</Button>
                  </>
                )}
                {onOpenInCompare && <Button variant="outlined" size="small" startIcon={<CompareArrowsOutlined />} onClick={() => onOpenInCompare(file)}>Compare PDF</Button>}
                <Button variant="outlined" size="small" startIcon={<DashboardCustomizeOutlined />} onClick={() => onOpenInOrganizer(file)}>Organize pages</Button>
                {onOpenInCompress && <Button variant="outlined" size="small" startIcon={<CompressOutlined />} onClick={() => onOpenInCompress(file)}>Compress PDF</Button>}
                {onOpenInPrint && <Button variant="outlined" size="small" startIcon={<PrintOutlined />} onClick={() => onOpenInPrint(file)}>Print PDF</Button>}
                {!compactToolbar && (
                  <Button variant="contained" size="small" startIcon={<EditOutlined />} onClick={() => onOpenInEditor(file)}>Edit PDF</Button>
                )}
              </Box>
            </Box>
            {searchOpen && (
              <>
                <Divider />
                <Box role="search" aria-label="Find in document" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <TextField
                      inputRef={searchInputRef}
                      size="small"
                      label="Find in document"
                      placeholder="Search text…"
                      value={searchQuery}
                      onChange={event => {
                        const value = event.target.value;
                        setSearchQuery(value);
                        setActiveMatchIndex(0);
                        const nextMatches = searchDocumentPages(extractedPages, value);
                        if (nextMatches[0]) {
                          scrollToPage(nextMatches[0].pageNumber, false);
                        }
                      }}
                      onKeyDown={event => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          stepMatch(event.shiftKey ? -1 : 1);
                        } else if (event.key === 'Escape') {
                          event.preventDefault();
                          closeSearchBar();
                        }
                      }}
                      slotProps={{
                        input: {
                          startAdornment: (
                            <InputAdornment position="start">
                              <SearchOutlined fontSize="small" />
                            </InputAdornment>
                          ),
                        },
                      }}
                      sx={{ flex: '1 1 200px', minWidth: 0 }}
                    />
                    <Typography variant="body2" color="text.secondary" className="tabular-nums" sx={{ minWidth: 88, textAlign: 'center' }}>
                      {isExtractingText
                        ? 'Indexing…'
                        : !searchQuery.trim()
                          ? 'Type to find'
                          : searchMatches.length === 0
                            ? '0 matches'
                            : `${boundedMatchIndex + 1} / ${searchMatches.length}`}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <IconButton aria-label="Previous match" disabled={searchMatches.length === 0} onClick={() => stepMatch(-1)}>
                        <KeyboardArrowUp />
                      </IconButton>
                      <IconButton aria-label="Next match" disabled={searchMatches.length === 0} onClick={() => stepMatch(1)}>
                        <KeyboardArrowDown />
                      </IconButton>
                      <IconButton aria-label="Close find bar" onClick={closeSearchBar}>
                        <Close />
                      </IconButton>
                    </Box>
                  </Box>
                  {activeMatch && (
                    <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                      <Box component="span" className="tabular-nums" sx={{ fontWeight: 700, color: 'text.primary', mr: 0.75 }}>
                        Page {activeMatch.pageNumber}:
                      </Box>
                      {activeMatch.snippetPrefix}
                      <mark className="pdfy-search-snippet-mark">{activeMatch.snippetMatch}</mark>
                      {activeMatch.snippetSuffix}
                    </Typography>
                  )}
                </Box>
              </>
            )}
          </Paper>
          <Typography role="status" className="sr-only">
            {statusMessage || (searchOpen && searchQuery.trim() ? (searchMatches.length === 0 ? `No matches for ${searchQuery.trim()}` : `Match ${boundedMatchIndex + 1} of ${searchMatches.length} on page ${activeMatch?.pageNumber}`) : '')}
          </Typography>
          <Box
            ref={readerStageRef}
            className={isFocusActive ? 'pdfy-reader-focus' : undefined}
            data-focus-mode={isFocusActive ? 'true' : 'false'}
            sx={{ flex: 1, minHeight: 320, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}
          >
            {sidebarOpen && !isFocusActive && (
              <Paper variant="outlined" className="pdfy-scroll-region pdfy-glass-card" sx={{ width: { xs: '100%', sm: 210 }, flexShrink: 0, overflow: 'auto', maxHeight: { xs: 240, sm: 600 }, p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Box role="group" aria-label="Sidebar view" sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.75 }}>
                  <Button
                    size="small"
                    aria-pressed={sidebarTab === 'thumbnails'}
                    variant={sidebarTab === 'thumbnails' ? 'contained' : 'outlined'}
                    onClick={() => setSidebarTab('thumbnails')}
                    sx={{ minWidth: 0, px: 1 }}
                  >
                    Pages
                  </Button>
                  <Button
                    size="small"
                    aria-pressed={sidebarTab === 'outline'}
                    variant={sidebarTab === 'outline' ? 'contained' : 'outlined'}
                    onClick={() => setSidebarTab('outline')}
                    sx={{ minWidth: 0, px: 1 }}
                  >
                    Outline
                  </Button>
                </Box>
                {sidebarTab === 'thumbnails' ? (
                  <Document key={file.name + file.lastModified} options={pdfDocumentOptions} file={file} loading="" error="" className="reader-thumbnails">
                    <Box sx={{ display: 'flex', flexDirection: { xs: 'row', sm: 'column' }, gap: 1.5 }}>
                      {Array.from({ length: numPages }, (_, index) => (
                        <Box component="button" type="button" key={index} aria-label={`Go to page ${index + 1}`} aria-current={activePage === index + 1 ? 'page' : undefined} onClick={() => scrollToPage(index + 1)} sx={{ p: 0.5, borderRadius: 1.5, border: '2px solid', borderColor: activePage === index + 1 ? 'primary.main' : 'divider', bgcolor: 'background.paper', color: 'text.primary', cursor: 'pointer', flexShrink: 0 }}>
                          <ViewerPage pageNumber={index + 1} width={110} viewRotation={rotation} renderTextLayer={false} renderAnnotationLayer={false} />
                          <Typography variant="caption" component="span" className="tabular-nums">Page {index + 1}</Typography>
                        </Box>
                      ))}
                    </Box>
                  </Document>
                ) : outlineItems.length === 0 ? (
                  <Typography variant="caption" color="text.secondary">
                    This PDF has no embedded bookmarks. Use Pages or Find to navigate.
                  </Typography>
                ) : (
                  <Box component="ul" aria-label="Document outline" sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    {outlineItems.map(item => (
                      <Box component="li" key={item.id}>
                        <Button
                          size="small"
                          disabled={item.pageNumber === null}
                          onClick={() => item.pageNumber !== null && scrollToPage(item.pageNumber)}
                          sx={{
                            width: '100%',
                            justifyContent: 'space-between',
                            textAlign: 'left',
                            pl: `${8 + Math.min(item.depth, 3) * 10}px`,
                            pr: 1,
                            py: 0.75,
                            minHeight: 36,
                            color: 'text.primary',
                            fontWeight: item.depth === 0 ? 600 : 400,
                          }}
                        >
                          <Box component="span" sx={{ overflowWrap: 'anywhere', mr: 1 }}>{item.title}</Box>
                          {item.pageNumber !== null && (
                            <Box component="span" className="tabular-nums" sx={{ color: 'text.secondary', fontSize: '0.75rem', flexShrink: 0 }}>
                              p.{item.pageNumber}
                            </Box>
                          )}
                        </Button>
                      </Box>
                    ))}
                  </Box>
                )}
              </Paper>
            )}
            <Box
              ref={viewport}
              role="region"
              aria-label="PDF pages"
              tabIndex={0}
              className="pdfy-workbench-mat pdfy-scroll-region"
              data-layout-mode={effectiveSpreadMode}
              sx={{
                flex: 1,
                minWidth: 0,
                overflow: 'auto',
                maxHeight: isFocusActive ? '100%' : 'calc(100dvh - 220px)',
                minHeight: 360,
                p: 2,
                pb: isFocusActive ? 10 : 2,
                borderRadius: '18px',
                position: 'relative',
              }}
            >
              <div className="pdfy-reader-progress-track" aria-hidden="true">
                <div
                  ref={progressBarRef}
                  className="pdfy-reader-progress-bar"
                  data-testid="reader-progress-bar"
                  aria-hidden="true"
                />
              </div>
              <Document key={file.name + file.lastModified} options={pdfDocumentOptions} file={file} onLoadSuccess={handleDocumentLoad} onLoadError={() => setError('This PDF could not be displayed. Try opening another PDF.')} loading={<CircularProgress aria-label="Loading PDF pages" />} error="">
                {pageSpreads.map((row, rowIndex) => (
                  <Box
                    key={row.join('-')}
                    data-spread-row={rowIndex}
                    sx={{
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'flex-start',
                      gap: row.length > 1 ? 2 : 0,
                      width: 'max-content',
                      mx: 'auto',
                      mb: 3,
                    }}
                  >
                    {row.map(pageNumber => (
                      <Box
                        id={`viewer-page-${pageNumber}`}
                        role="group"
                        tabIndex={-1}
                        aria-label={`Page ${pageNumber}`}
                        key={pageNumber}
                        onClick={() => setActivePage(pageNumber)}
                        sx={{
                          width: 'max-content',
                          boxShadow: '0 4px 20px rgba(0,0,0,0.14)',
                          bgcolor: '#FFFFFF',
                        }}
                      >
                        <ViewerPage
                          pageNumber={pageNumber}
                          width={computePageRenderWidth(viewportWidth, scale, row.length)}
                          viewRotation={rotation}
                          renderTextLayer
                          renderAnnotationLayer
                        />
                      </Box>
                    ))}
                  </Box>
                ))}
              </Document>
            </Box>
            {isFocusActive && (
              <Box
                role="toolbar"
                aria-label="Focus reading controls"
                className="pdfy-glass-pill pdfy-reader-focus-pill"
              >
                <Typography variant="caption" className="tabular-nums" sx={{ px: 1, fontWeight: 700, color: 'text.primary', whiteSpace: 'nowrap' }}>
                  Page {activePage} / {numPages}
                </Typography>
                <IconButton aria-label="Zoom out" size="small" disabled={scale <= 0.5} onClick={() => setScale(value => Math.max(0.5, value - 0.25))}>
                  <ZoomOut fontSize="small" />
                </IconButton>
                <IconButton aria-label="Zoom in" size="small" disabled={scale >= 2.5} onClick={() => setScale(value => Math.min(2.5, value + 0.25))}>
                  <ZoomIn fontSize="small" />
                </IconButton>
                {canSpread && (
                  <IconButton
                    aria-label="Two-page spread"
                    aria-pressed={effectiveSpreadMode === 'spread'}
                    size="small"
                    color={effectiveSpreadMode === 'spread' ? 'primary' : 'default'}
                    onClick={() => setSpreadMode(current => (current === 'spread' ? 'single' : 'spread'))}
                  >
                    <MenuBookOutlined fontSize="small" />
                  </IconButton>
                )}
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<FullscreenExitOutlined fontSize="small" />}
                  onClick={exitFocusMode}
                  sx={{ borderRadius: 99, px: 1.5, whiteSpace: 'nowrap' }}
                >
                  Exit focus
                </Button>
              </Box>
            )}
          </Box>
        </>
      )}
    </Box>
  );
}
