import { useEffect, useRef, useState } from 'react';
import type { ComponentProps, FormEvent, KeyboardEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  Paper,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add,
  ArrowDownward,
  ArrowUpward,
  AutoAwesomeOutlined,
  BookmarkAddOutlined,
  BookmarksOutlined,
  CallSplit,
  DeleteOutlined,
  DescriptionOutlined,
  DownloadOutlined,
  FormatIndentDecrease,
  FormatIndentIncrease,
  NavigateBefore,
  NavigateNext,
  UndoOutlined,
} from '@mui/icons-material';
import { PDFDocument } from 'pdf-lib';
import { Document, Page, pdfjs } from 'react-pdf';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import ToolIntro from './ToolIntro';
import PDFSessionControls from './PDFSessionControls';
import { usePDFSession, type PDFSession } from '../hooks/usePDFSession';
import { generateSamplePDF } from '../utils/pdfSamples';
import { pdfDocumentOptions } from '../utils/pdfRendering';
import { flattenOutlineItems } from '../utils/pdfTextSearch';
import {
  detectHeadingsFromTextItems,
  indentBookmark,
  MAX_BOOKMARK_DEPTH,
  moveBookmark,
  outdentBookmark,
  readPDFBookmarks,
  writePDFBookmarks,
  type BookmarkNode,
  type PageHeadingInput,
} from '../utils/pdfBookmarks';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

type PdfProxyLike = Parameters<NonNullable<ComponentProps<typeof Document>['onLoadSuccess']>>[0];

async function prepare(file: File) {
  const bytes = await file.arrayBuffer();
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  const pageCount = pdf.getPageCount();
  if (!pageCount) throw new Error('Empty PDF');
  const initialBookmarks = await readPDFBookmarks(bytes).catch(() => []);
  return { pageCount, initialBookmarks };
}

function isImeConfirmingEnter(event: KeyboardEvent<HTMLElement>): boolean {
  return Boolean(event.nativeEvent.isComposing || event.keyCode === 229);
}

function triggerPdfDownload(bytes: Uint8Array, filename: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function PDFBookmarks({
  initialFile,
  active = true,
  onSessionChange,
  onOpenInRead,
  onOpenInSplit,
}: {
  initialFile?: File | null;
  active?: boolean;
  onSessionChange?: (active: boolean) => void;
  onOpenInRead?: (file: File) => void;
  onOpenInSplit?: (file: File) => void;
}) {
  const replacement = usePDFSession(prepare, initialFile);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    onSessionChange?.(!!replacement.session);
  }, [replacement.session, onSessionChange]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      {!replacement.session && (
        <ToolIntro
          icon={<BookmarksOutlined />}
          title="Build a clickable table of contents"
          description="Edit existing bookmarks or auto-detect headings to embed a nested PDF outline."
        />
      )}
      <PDFSessionControls
        tool="Bookmarks"
        active={active}
        hasSession={!!replacement.session}
        busy={replacement.isReading || isExporting}
        pendingName={replacement.pending?.file.name}
        error={replacement.error}
        onOpen={replacement.open}
        onSample={() => replacement.open(() => generateSamplePDF('executive-brief'))}
        onCancel={replacement.cancel}
        onConfirm={replacement.confirm}
      />
      {replacement.session && (
        <Box component="fieldset" disabled={replacement.isReading || !!replacement.pending} sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}>
          <BookmarksWorkspace
            key={replacement.session.id}
            session={replacement.session}
            onExporting={setIsExporting}
            onOpenInRead={onOpenInRead}
            onOpenInSplit={onOpenInSplit}
          />
        </Box>
      )}
    </Box>
  );
}

function BookmarksWorkspace({
  session: { file, data },
  onExporting,
  onOpenInRead,
  onOpenInSplit,
}: {
  session: PDFSession<{ pageCount: number; initialBookmarks: BookmarkNode[] }>;
  onExporting: (busy: boolean) => void;
  onOpenInRead?: (file: File) => void;
  onOpenInSplit?: (file: File) => void;
}) {
  const { pageCount, initialBookmarks } = data;
  const [bookmarks, setBookmarks] = useState<BookmarkNode[]>(initialBookmarks);
  const [history, setHistory] = useState<BookmarkNode[][]>([]);
  const [previewPage, setPreviewPage] = useState(1);
  const [newTitle, setNewTitle] = useState('');
  const [newPageInput, setNewPageInput] = useState('1');
  const [titleError, setTitleError] = useState('');
  const [pageError, setPageError] = useState('');
  const [detectedHeadings, setDetectedHeadings] = useState<BookmarkNode[]>([]);
  const [isScanningText, setIsScanningText] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [feedback, setFeedback] = useState<{ severity: 'success' | 'info' | 'error'; message: string } | null>(null);
  const [statusAnnouncement, setStatusAnnouncement] = useState('');

  const mountedRef = useRef(true);
  const nextIdRef = useRef(initialBookmarks.length + 1);
  const newTitleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const commitBookmarks = (next: BookmarkNode[], announcement: string, animateReorder = false) => {
    const apply = () => {
      setHistory(prev => [...prev.slice(-19), bookmarks]);
      setBookmarks(next);
    };

    const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const docWithTransition = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (animateReorder && !reducedMotion && next.length <= 100 && typeof docWithTransition.startViewTransition === 'function') {
      docWithTransition.startViewTransition(apply);
    } else {
      apply();
    }
    setStatusAnnouncement(announcement);
    setFeedback(null);
  };

  const handleDocumentLoadSuccess = (pdf: PdfProxyLike) => {
    void (async () => {
      try {
        // If pdf-lib found no direct-ref outlines (e.g. named destinations), hydrate from pdfjs outline.
        if (initialBookmarks.length === 0) {
          const rawOutline = await pdf.getOutline().catch(() => null);
          const flat = await flattenOutlineItems(rawOutline, async dest => {
            const resolved = typeof dest === 'string' ? await pdf.getDestination(dest) : dest;
            if (!Array.isArray(resolved) || !resolved[0]) return null;
            const pageIndex = await pdf.getPageIndex(resolved[0]);
            return pageIndex + 1;
          });
          if (mountedRef.current && flat.length > 0) {
            setBookmarks(current =>
              current.length > 0
                ? current
                : flat.map((item, idx) => ({
                    id: `pdfjs-${idx + 1}`,
                    title: item.title,
                    pageNumber: Math.max(1, Math.min(pageCount, item.pageNumber ?? 1)),
                    depth: Math.min(MAX_BOOKMARK_DEPTH, item.depth),
                  })),
            );
          }
        }

        const pageInputs: PageHeadingInput[] = [];
        for (let p = 1; p <= pdf.numPages; p++) {
          if (!mountedRef.current) return;
          const page = await pdf.getPage(p);
          const content = await page.getTextContent();
          const items = content.items
            .filter((item): item is TextItem => 'str' in item)
            .map(item => ({
              str: item.str,
              hasEOL: item.hasEOL,
              transform: item.transform,
              fontName: item.fontName,
            }));
          pageInputs.push({ pageNumber: p, items });
        }
        if (!mountedRef.current) return;
        setDetectedHeadings(detectHeadingsFromTextItems(pageInputs));
      } catch {
        if (mountedRef.current) setDetectedHeadings([]);
      } finally {
        if (mountedRef.current) setIsScanningText(false);
      }
    })();
  };

  const handleAddBookmark = (event: FormEvent) => {
    event.preventDefault();
    const cleanedTitle = newTitle.trim();
    const parsedPage = Number.parseInt(newPageInput, 10);
    let hasError = false;

    if (!cleanedTitle) {
      setTitleError('Enter a bookmark title before adding.');
      hasError = true;
    } else {
      setTitleError('');
    }

    if (!Number.isFinite(parsedPage) || parsedPage < 1 || parsedPage > pageCount) {
      setPageError(`Enter a page number between 1 and ${pageCount}.`);
      hasError = true;
    } else {
      setPageError('');
    }

    if (hasError) {
      if (!cleanedTitle) newTitleInputRef.current?.focus();
      return;
    }

    const added: BookmarkNode = {
      id: `bm-user-${nextIdRef.current++}`,
      title: cleanedTitle,
      pageNumber: parsedPage,
      depth: 0,
    };
    const next = [...bookmarks, added];
    commitBookmarks(next, `Added bookmark "${added.title}" targeting page ${added.pageNumber}. Total ${next.length} bookmarks.`);
    setNewTitle('');
    setPreviewPage(parsedPage);
  };

  const handleAutoDetect = () => {
    if (detectedHeadings.length === 0) {
      setFeedback({ severity: 'info', message: 'No distinct heading typography was detected automatically. Add bookmarks manually below.' });
      return;
    }
    const fresh = detectedHeadings.map(item => ({
      ...item,
      id: `bm-auto-${nextIdRef.current++}`,
    }));
    commitBookmarks(fresh, `Detected ${fresh.length} headings across the document.`);
    setFeedback({ severity: 'success', message: `Detected ${fresh.length} heading${fresh.length === 1 ? '' : 's'} from page typography. Review, reorder, or nest them before exporting.` });
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setHistory(prev => prev.slice(0, -1));
    setBookmarks(previous);
    setStatusAnnouncement(`Undid last bookmark change. ${previous.length} bookmarks in outline.`);
    setFeedback(null);
  };

  const buildUpdatedPdfFile = async (): Promise<{ bytes: Uint8Array; file: File }> => {
    const bytes = await writePDFBookmarks(await file.arrayBuffer(), bookmarks);
    const outName = `bookmarked_${file.name}`;
    return {
      bytes,
      file: new File([bytes as BlobPart], outName, { type: 'application/pdf' }),
    };
  };

  const handleExportDownload = async () => {
    if (isExporting) return;
    setIsExporting(true);
    onExporting(true);
    setFeedback(null);
    try {
      const { bytes, file: outFile } = await buildUpdatedPdfFile();
      triggerPdfDownload(bytes, outFile.name);
      setFeedback({
        severity: 'success',
        message: bookmarks.length > 0
          ? `Download started with ${bookmarks.length} embedded PDF bookmark${bookmarks.length === 1 ? '' : 's'}.`
          : 'Download started with all embedded bookmarks removed.',
      });
    } catch {
      setFeedback({ severity: 'error', message: 'Could not write bookmarks into this PDF. Your edits have been kept. Try again.' });
    } finally {
      setIsExporting(false);
      onExporting(false);
    }
  };

  const handleHandoff = async (target: (nextFile: File) => void) => {
    if (isExporting) return;
    setIsExporting(true);
    onExporting(true);
    setFeedback(null);
    try {
      const { file: outFile } = await buildUpdatedPdfFile();
      target(outFile);
    } catch {
      setFeedback({ severity: 'error', message: 'Could not prepare the bookmarked PDF for handoff. Try again.' });
    } finally {
      setIsExporting(false);
      onExporting(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      {/* Single persistent visually hidden status region per dynamic-sort guidance */}
      <Typography component="p" role="status" className="sr-only">
        {statusAnnouncement}
      </Typography>

      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h2" sx={{ overflowWrap: 'anywhere' }}>{file.name}</Typography>
            <Typography variant="body2" color="text.secondary" className="tabular-nums" data-testid="bookmarks-count-summary">
              {pageCount} {pageCount === 1 ? 'page' : 'pages'} · {bookmarks.length} {bookmarks.length === 1 ? 'bookmark' : 'bookmarks'}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <Button
              variant="contained"
              startIcon={isExporting ? <CircularProgress size={18} color="inherit" aria-hidden="true" /> : <DownloadOutlined />}
              disabled={isExporting}
              onClick={() => void handleExportDownload()}
            >
              Download bookmarked PDF
            </Button>
            {onOpenInRead && (
              <Button
                variant="outlined"
                startIcon={<DescriptionOutlined />}
                disabled={isExporting}
                onClick={() => void handleHandoff(onOpenInRead)}
              >
                Open in Read
              </Button>
            )}
            {onOpenInSplit && (
              <Button
                variant="outlined"
                startIcon={<CallSplit />}
                disabled={isExporting || bookmarks.length === 0}
                onClick={() => void handleHandoff(onOpenInSplit)}
              >
                Split by bookmarks
              </Button>
            )}
          </Box>
        </Box>
      </Paper>

      {feedback && <Alert severity={feedback.severity} onClose={() => setFeedback(null)}>{feedback.message}</Alert>}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 7fr) minmax(0, 5fr)' }, gap: 2, alignItems: 'start', minWidth: 0 }}>
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Typography variant="h3">Outline entries</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              <Button
                size="small"
                variant="outlined"
                startIcon={isScanningText ? <CircularProgress size={15} color="inherit" aria-hidden="true" /> : <AutoAwesomeOutlined />}
                disabled={isScanningText || isExporting}
                onClick={handleAutoDetect}
              >
                Auto-detect headings
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<UndoOutlined />}
                disabled={history.length === 0 || isExporting}
                onClick={handleUndo}
              >
                Undo
              </Button>
              <Button
                size="small"
                variant="outlined"
                disabled={bookmarks.length === 0 || isExporting}
                onClick={() => commitBookmarks([], 'Cleared all bookmarks.')}
              >
                Clear all
              </Button>
            </Box>
          </Box>

          <Box component="form" onSubmit={handleAddBookmark} noValidate sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) 110px auto' }, gap: 1.25, alignItems: 'start' }}>
            <TextField
              inputRef={newTitleInputRef}
              size="small"
              label="New bookmark title"
              placeholder="e.g. Chapter 1: Overview"
              value={newTitle}
              error={!!titleError}
              helperText={titleError || undefined}
              disabled={isExporting}
              slotProps={{ htmlInput: { 'aria-invalid': titleError ? 'true' : 'false' } }}
              onChange={event => {
                setNewTitle(event.target.value);
                if (titleError) setTitleError('');
              }}
              onKeyDown={event => {
                if (event.key === 'Enter' && isImeConfirmingEnter(event)) {
                  event.preventDefault();
                }
              }}
            />
            <TextField
              size="small"
              label="Target page"
              type="number"
              value={newPageInput}
              error={!!pageError}
              helperText={pageError || undefined}
              disabled={isExporting}
              slotProps={{ htmlInput: { min: 1, max: pageCount, step: 1, 'aria-invalid': pageError ? 'true' : 'false' } }}
              onChange={event => {
                setNewPageInput(event.target.value);
                if (pageError) setPageError('');
              }}
            />
            <Button type="submit" variant="contained" startIcon={<Add />} disabled={isExporting} sx={{ minHeight: 40 }}>
              Add bookmark
            </Button>
          </Box>

          <Divider />

          {bookmarks.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No bookmarks yet. Click <strong>Auto-detect headings</strong> to scan typography automatically, or add entries manually above.
            </Typography>
          ) : (
            <Box
              component="ul"
              aria-label="Document bookmarks"
              sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 1 }}
            >
              {bookmarks.map((item, index) => (
                <Box
                  component="li"
                  key={item.id}
                  className="pdfy-bookmark-row"
                  sx={{
                    pl: { xs: item.depth * 1.5, sm: item.depth * 2.5 },
                    minWidth: 0,
                  }}
                >
                  <Box
                    sx={{
                      p: 1.25,
                      borderRadius: 1.5,
                      border: 1,
                      borderColor: previewPage === item.pageNumber ? 'primary.main' : 'divider',
                      bgcolor: 'background.paper',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 1,
                      minWidth: 0,
                    }}
                  >
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) 92px' }, gap: 1, alignItems: 'center' }}>
                      <TextField
                        size="small"
                        label={`Bookmark ${index + 1} title`}
                        value={item.title}
                        disabled={isExporting}
                        onFocus={() => setPreviewPage(item.pageNumber)}
                        onKeyDown={event => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            if (isImeConfirmingEnter(event)) return;
                            (event.currentTarget as HTMLInputElement).blur();
                          }
                        }}
                        onChange={event => {
                          const nextVal = event.target.value;
                          setBookmarks(prev => prev.map(row => (row.id === item.id ? { ...row, title: nextVal } : row)));
                        }}
                      />
                      <TextField
                        size="small"
                        label={`Bookmark ${index + 1} page`}
                        type="number"
                        value={item.pageNumber}
                        disabled={isExporting}
                        slotProps={{ htmlInput: { min: 1, max: pageCount, step: 1 } }}
                        onChange={event => {
                          const parsed = Number.parseInt(event.target.value, 10);
                          if (!Number.isFinite(parsed)) return;
                          const clamped = Math.max(1, Math.min(pageCount, parsed));
                          setBookmarks(prev => prev.map(row => (row.id === item.id ? { ...row, pageNumber: clamped } : row)));
                          setPreviewPage(clamped);
                        }}
                      />
                    </Box>

                    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 0.5 }}>
                      <Typography variant="caption" color="text.secondary" className="tabular-nums">
                        Level {item.depth + 1} · Page {item.pageNumber}
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.25 }}>
                        <Tooltip title="Move bookmark up">
                          <span>
                            <IconButton
                              size="small"
                              aria-label={`Move ${item.title || `bookmark ${index + 1}`} up`}
                              disabled={index === 0 || isExporting}
                              onClick={() => {
                                const next = moveBookmark(bookmarks, index, -1);
                                commitBookmarks(next, `Moved "${item.title}" to position ${index} of ${next.length}.`, true);
                              }}
                            >
                              <ArrowUpward fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Move bookmark down">
                          <span>
                            <IconButton
                              size="small"
                              aria-label={`Move ${item.title || `bookmark ${index + 1}`} down`}
                              disabled={index === bookmarks.length - 1 || isExporting}
                              onClick={() => {
                                const next = moveBookmark(bookmarks, index, 1);
                                commitBookmarks(next, `Moved "${item.title}" to position ${index + 2} of ${next.length}.`, true);
                              }}
                            >
                              <ArrowDownward fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Outdent level">
                          <span>
                            <IconButton
                              size="small"
                              aria-label={`Outdent ${item.title || `bookmark ${index + 1}`}`}
                              disabled={item.depth === 0 || isExporting}
                              onClick={() => {
                                const next = outdentBookmark(bookmarks, index);
                                commitBookmarks(next, `Outdented "${item.title}" to level ${next[index].depth + 1}.`);
                              }}
                            >
                              <FormatIndentDecrease fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Indent under previous bookmark">
                          <span>
                            <IconButton
                              size="small"
                              aria-label={`Indent ${item.title || `bookmark ${index + 1}`}`}
                              disabled={index === 0 || item.depth >= MAX_BOOKMARK_DEPTH || item.depth > bookmarks[index - 1].depth || isExporting}
                              onClick={() => {
                                const next = indentBookmark(bookmarks, index);
                                commitBookmarks(next, `Indented "${item.title}" to level ${next[index].depth + 1}.`);
                              }}
                            >
                              <FormatIndentIncrease fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Remove bookmark">
                          <span>
                            <IconButton
                              size="small"
                              aria-label={`Remove ${item.title || `bookmark ${index + 1}`}`}
                              disabled={isExporting}
                              onClick={() => {
                                const next = bookmarks.filter(row => row.id !== item.id);
                                commitBookmarks(next, `Removed "${item.title}". ${next.length} bookmarks remaining.`);
                              }}
                            >
                              <DeleteOutlined fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Box>
                    </Box>
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </Paper>

        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Typography variant="h3" className="tabular-nums">Page {previewPage} of {pageCount}</Typography>
            <Button
              size="small"
              variant="outlined"
              startIcon={<BookmarkAddOutlined />}
              disabled={isExporting}
              onClick={() => {
                setNewPageInput(String(previewPage));
                newTitleInputRef.current?.focus();
              }}
            >
              Use page {previewPage}
            </Button>
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<NavigateBefore />}
              disabled={previewPage <= 1}
              onClick={() => setPreviewPage(p => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              size="small"
              variant="outlined"
              endIcon={<NavigateNext />}
              disabled={previewPage >= pageCount}
              onClick={() => setPreviewPage(p => Math.min(pageCount, p + 1))}
            >
              Next
            </Button>
          </Box>
          <Box className="pdfy-workbench-mat" sx={{ p: 1.5, borderRadius: 1.5, display: 'grid', placeItems: 'center', minHeight: 280, overflow: 'hidden' }}>
            <Document
              file={file}
              options={pdfDocumentOptions}
              onLoadSuccess={handleDocumentLoadSuccess}
              onLoadError={() => setIsScanningText(false)}
              loading={<CircularProgress aria-label="Loading page preview" />}
              error={<Alert severity="warning">Preview could not be rendered, but you can still edit and save bookmarks.</Alert>}
            >
              <Box
                sx={{
                  bgcolor: '#FFFFFF',
                  maxWidth: '100%',
                  overflow: 'hidden',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.14)',
                  '& .react-pdf__Page__canvas': { display: 'block', maxWidth: '100%', height: 'auto !important' },
                }}
              >
                <Page pageNumber={previewPage} width={340} renderTextLayer={false} renderAnnotationLayer={false} />
              </Box>
            </Document>
          </Box>
        </Paper>
      </Box>
    </Box>
  );
}
