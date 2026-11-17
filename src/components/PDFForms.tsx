import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  FormControlLabel,
  FormLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import {
  AssignmentOutlined,
  ChevronLeft,
  ChevronRight,
  CompressOutlined,
  DownloadOutlined,
  EditOutlined,
  PrintOutlined,
  RestartAltOutlined,
  SearchOutlined,
} from '@mui/icons-material';
import { Document, Page, pdfjs } from 'react-pdf';
import { usePDFSession, type PDFSession } from '../hooks/usePDFSession';
import {
  applyPDFFormValues,
  extractInitialFormValues,
  inspectPDFForm,
  type FormFieldDescriptor,
  type FormFieldValues,
  type PDFFormInspection,
} from '../utils/pdfForms';
import { pdfDocumentOptions } from '../utils/pdfRendering';
import { generateSamplePDF } from '../utils/pdfSamples';
import PDFSessionControls from './PDFSessionControls';
import ToolIntro from './ToolIntro';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

interface PreparedFormSession {
  bytes: Uint8Array;
  inspection: PDFFormInspection;
}

async function prepare(file: File): Promise<PreparedFormSession> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const inspection = await inspectPDFForm(bytes);
  return { bytes, inspection };
}

export default function PDFForms({
  initialFile,
  active = true,
  onSessionChange,
  onOpenInPrint,
  onOpenInCompress,
  onOpenInEditor,
}: {
  initialFile?: File | null;
  active?: boolean;
  onSessionChange?: (active: boolean) => void;
  onOpenInPrint?: (file: File) => void;
  onOpenInCompress?: (file: File) => void;
  onOpenInEditor?: (file: File) => void;
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
          icon={<AssignmentOutlined />}
          title="Fill interactive PDF forms"
          description="Detect text boxes, checkboxes, radio groups, and dropdowns automatically. Save editable copies or flatten values permanently."
        >
          <Typography color="text.secondary">
            All form data stays on your device. Try the built-in request form sample to test every field type right away.
          </Typography>
        </ToolIntro>
      )}
      <PDFSessionControls
        tool="Forms"
        active={active}
        hasSession={!!replacement.session}
        busy={replacement.isReading || isExporting}
        pendingName={replacement.pending?.file.name}
        error={replacement.error}
        onOpen={replacement.open}
        onSample={() => replacement.open(() => generateSamplePDF('application-form'))}
        onCancel={replacement.cancel}
        onConfirm={replacement.confirm}
      />
      {replacement.session && (
        <Box
          component="fieldset"
          disabled={replacement.isReading || !!replacement.pending}
          sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}
        >
          <FormsWorkspace
            key={replacement.session.id}
            session={replacement.session}
            onExporting={setIsExporting}
            onOpenInPrint={onOpenInPrint}
            onOpenInCompress={onOpenInCompress}
            onOpenInEditor={onOpenInEditor}
          />
        </Box>
      )}
    </Box>
  );
}

function FormsWorkspace({
  session: { file, data },
  onExporting,
  onOpenInPrint,
  onOpenInCompress,
  onOpenInEditor,
}: {
  session: PDFSession<PreparedFormSession>;
  onExporting: (busy: boolean) => void;
  onOpenInPrint?: (file: File) => void;
  onOpenInCompress?: (file: File) => void;
  onOpenInEditor?: (file: File) => void;
}) {
  const { bytes, inspection } = data;
  const initialValues = useMemo(() => extractInitialFormValues(inspection.fields), [inspection.fields]);
  const [values, setValues] = useState<FormFieldValues>(initialValues);
  const [flattenOnExport, setFlattenOnExport] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [previewPage, setPreviewPage] = useState(1);
  const [previewWidth, setPreviewWidth] = useState(440);
  const [isExporting, setIsExporting] = useState(false);
  const [feedback, setFeedback] = useState<{ severity: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [previewState, setPreviewState] = useState<{ key: string; blob: Blob } | null>(null);
  const [previewErrorState, setPreviewErrorState] = useState<{ key: string; message: string } | null>(null);

  const previewRef = useRef<HTMLDivElement>(null);
  const previewSeq = useRef(0);
  const printButtonRef = useRef<HTMLButtonElement>(null);
  const compressButtonRef = useRef<HTMLButtonElement>(null);
  const pendingHandoffRef = useRef<{ target: 'print' | 'compress'; file: File } | null>(null);

  const valuesKey = useMemo(() => JSON.stringify(values), [values]);
  const activePreviewError = previewErrorState?.key === valuesKey ? previewErrorState.message : null;
  const previewBlob = !activePreviewError && previewState?.key === valuesKey ? previewState.blob : null;
  const isUpdatingPreview = inspection.fields.length > 0 && !activePreviewError && previewState?.key !== valuesKey;

  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width;
      if (width > 0) setPreviewWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (inspection.fields.length === 0) return;
    const seq = ++previewSeq.current;
    const timer = window.setTimeout(async () => {
      try {
        const renderedBytes = await applyPDFFormValues(bytes, values, { flatten: false });
        if (seq !== previewSeq.current) return;
        setPreviewErrorState(null);
        setPreviewState({
          key: valuesKey,
          blob: new Blob([renderedBytes as BlobPart], { type: 'application/pdf' }),
        });
      } catch (err) {
        if (seq !== previewSeq.current) return;
        const message = err instanceof Error ? err.message : 'Could not update form preview.';
        setPreviewState(null);
        setPreviewErrorState({ key: valuesKey, message });
      }
    }, 120);

    return () => window.clearTimeout(timer);
  }, [bytes, inspection.fields.length, values, valuesKey]);

  useEffect(() => {
    if (isExporting || !pendingHandoffRef.current) return;
    const next = pendingHandoffRef.current;
    pendingHandoffRef.current = null;
    if (next.target === 'print') {
      printButtonRef.current?.focus();
      onOpenInPrint?.(next.file);
    } else {
      compressButtonRef.current?.focus();
      onOpenInCompress?.(next.file);
    }
  }, [isExporting, onOpenInPrint, onOpenInCompress]);

  const filteredFields = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return inspection.fields;
    return inspection.fields.filter(field => field.name.toLowerCase().includes(query));
  }, [inspection.fields, searchQuery]);

  const updateField = (name: string, nextValue: string | boolean | string[]) => {
    setFeedback(null);
    setValues(prev => ({ ...prev, [name]: nextValue }));
  };

  const resetFields = () => {
    setFeedback({ severity: 'info', message: 'Form fields restored to their original document values.' });
    setValues(initialValues);
  };

  const handleDownload = async () => {
    if (isExporting || !!activePreviewError) return;
    setIsExporting(true);
    onExporting(true);
    setFeedback(null);
    try {
      const output = await applyPDFFormValues(bytes, values, { flatten: flattenOnExport });
      const url = URL.createObjectURL(new Blob([output as BlobPart], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${flattenOnExport ? 'flattened' : 'filled'}_${file.name}`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setFeedback({
        severity: 'success',
        message: flattenOnExport
          ? `Downloaded flattened_${file.name} with form fields baked into page content.`
          : `Downloaded filled_${file.name} with editable form fields preserved.`,
      });
    } catch (err) {
      setFeedback({
        severity: 'error',
        message: err instanceof Error ? err.message : 'Could not save the filled PDF. Try again.',
      });
    } finally {
      setIsExporting(false);
      onExporting(false);
    }
  };

  const handleSendTo = async (target: 'print' | 'compress') => {
    const callback = target === 'print' ? onOpenInPrint : onOpenInCompress;
    if (isExporting || !callback || !!activePreviewError) return;
    setIsExporting(true);
    onExporting(true);
    setFeedback(null);
    try {
      const output = await applyPDFFormValues(bytes, values, { flatten: true });
      pendingHandoffRef.current = {
        target,
        file: new File([output as BlobPart], `filled_${file.name}`, { type: 'application/pdf' }),
      };
    } catch (err) {
      pendingHandoffRef.current = null;
      setFeedback({
        severity: 'error',
        message: err instanceof Error ? err.message : `Could not prepare this form for ${target}.`,
      });
    } finally {
      setIsExporting(false);
      onExporting(false);
    }
  };

  const safePreviewFile = inspection.fields.length === 0 ? file : previewBlob;
  const pageDisplayWidth = Math.max(140, Math.min(520, previewWidth - 32));
  const safePage = Math.min(Math.max(1, previewPage), inspection.pageCount);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h2" sx={{ overflowWrap: 'anywhere' }}>{file.name}</Typography>
            <Typography role="status" color="text.secondary" className="tabular-nums">
              {inspection.pageCount} {inspection.pageCount === 1 ? 'page' : 'pages'} · {inspection.fields.length} interactive {inspection.fields.length === 1 ? 'field' : 'fields'}
              {inspection.unsupportedCount > 0 ? ` · ${inspection.unsupportedCount} non-fillable widget(s)` : ''}
            </Typography>
          </Box>
          {inspection.fields.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              <Button
                variant="contained"
                startIcon={isExporting ? <CircularProgress size={18} color="inherit" /> : <DownloadOutlined />}
                disabled={isExporting || !!activePreviewError}
                onClick={handleDownload}
                sx={{ minWidth: { sm: 215 } }}
              >
                {flattenOnExport ? 'Download flattened PDF' : 'Download filled PDF'}
              </Button>
              {onOpenInPrint && (
                <Button
                  ref={printButtonRef}
                  variant="outlined"
                  startIcon={<PrintOutlined />}
                  disabled={isExporting || !!activePreviewError}
                  onClick={() => void handleSendTo('print')}
                >
                  Print…
                </Button>
              )}
              {onOpenInCompress && (
                <Button
                  ref={compressButtonRef}
                  variant="outlined"
                  startIcon={<CompressOutlined />}
                  disabled={isExporting || !!activePreviewError}
                  onClick={() => void handleSendTo('compress')}
                >
                  Compress…
                </Button>
              )}
            </Box>
          )}
        </Box>
        {inspection.hasXfa && (
          <Alert severity="warning">
            This document uses dynamic XFA form definitions. Only standard AcroForm fields can be edited offline.
          </Alert>
        )}
      </Paper>

      {feedback && (
        <Alert severity={feedback.severity} onClose={() => setFeedback(null)} sx={{ overflowWrap: 'anywhere' }}>
          {feedback.message}
        </Alert>
      )}

      {inspection.fields.length === 0 ? (
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <Alert severity="info">
            No interactive AcroForm fields were detected in this document. Many PDFs are static scans or flat layouts without fillable fields.
          </Alert>
          {onOpenInEditor && (
            <Box>
              <Button variant="contained" startIcon={<EditOutlined />} onClick={() => onOpenInEditor(file)}>
                Add text or signatures in Edit instead
              </Button>
            </Box>
          )}
        </Paper>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1.05fr) minmax(0, 0.95fr)' },
            gap: 2,
            alignItems: 'start',
            minWidth: 0,
          }}
        >
          <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
              <Typography variant="h3">Form fields</Typography>
              <Button size="small" variant="text" startIcon={<RestartAltOutlined />} disabled={isExporting} onClick={resetFields}>
                Reset fields
              </Button>
            </Box>

            <TextField
              size="small"
              label="Filter fields by name"
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              fullWidth
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchOutlined fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
            />

            <FormControlLabel
              control={
                <Switch
                  checked={flattenOnExport}
                  disabled={isExporting}
                  onChange={event => {
                    setFlattenOnExport(event.target.checked);
                    setFeedback(null);
                  }}
                />
              }
              label="Flatten fields on download (bake values permanently so recipients cannot edit them)"
            />

            <Divider />

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              {filteredFields.length === 0 ? (
                <Typography color="text.secondary">No form fields match “{searchQuery}”.</Typography>
              ) : (
                filteredFields.map(field => (
                  <FormFieldControl
                    key={field.name}
                    field={field}
                    value={values[field.name]}
                    disabled={isExporting}
                    onChange={val => updateField(field.name, val)}
                  />
                ))
              )}
            </Box>
          </Paper>

          <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0, position: { lg: 'sticky' }, top: { lg: 16 } }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
              <Typography variant="h3">Live form preview</Typography>
              {inspection.pageCount > 1 && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <IconButton
                    aria-label="Previous preview page"
                    disabled={safePage <= 1}
                    onClick={() => setPreviewPage(prev => Math.max(1, prev - 1))}
                  >
                    <ChevronLeft />
                  </IconButton>
                  <Typography role="status" variant="body2" className="tabular-nums" sx={{ minWidth: 84, textAlign: 'center', fontWeight: 600 }}>
                    Page {safePage} of {inspection.pageCount}
                  </Typography>
                  <IconButton
                    aria-label="Next preview page"
                    disabled={safePage >= inspection.pageCount}
                    onClick={() => setPreviewPage(prev => Math.min(inspection.pageCount, prev + 1))}
                  >
                    <ChevronRight />
                  </IconButton>
                </Box>
              )}
            </Box>

            <Box
              ref={previewRef}
              role="region"
              aria-label="Filled form preview"
              tabIndex={0}
              className="pdfy-workbench-mat pdfy-scroll-region"
              sx={{
                minHeight: 340,
                p: 2,
                borderRadius: 2,
                display: 'flex',
                alignItems: 'safe center',
                justifyContent: 'safe center',
                overflow: 'auto',
              }}
            >
              {activePreviewError ? (
                <Alert severity="error" sx={{ overflowWrap: 'anywhere' }}>{activePreviewError}</Alert>
              ) : isUpdatingPreview || !safePreviewFile ? (
                <CircularProgress aria-label="Updating form preview" />
              ) : (
                <Box
                  data-testid="forms-preview-sheet"
                  sx={{
                    bgcolor: '#FFFFFF',
                    boxShadow: '0 6px 24px rgba(0,0,0,0.16)',
                    lineHeight: 0,
                    maxWidth: '100%',
                    overflow: 'hidden',
                    '& .react-pdf__Page__canvas': { display: 'block', maxWidth: '100% !important', height: 'auto !important' },
                  }}
                >
                  <Document
                    file={safePreviewFile}
                    options={pdfDocumentOptions}
                    loading={<CircularProgress aria-label="Rendering form preview" />}
                    error={<Alert severity="warning">Preview unavailable, but downloading and printing still work.</Alert>}
                  >
                    <Page pageNumber={safePage} width={pageDisplayWidth} renderTextLayer={false} renderAnnotationLayer={false} />
                  </Document>
                </Box>
              )}
            </Box>
          </Paper>
        </Box>
      )}
    </Box>
  );
}

function FormFieldControl({
  field,
  value,
  disabled,
  onChange,
}: {
  field: FormFieldDescriptor;
  value: string | boolean | string[];
  disabled: boolean;
  onChange: (next: string | boolean | string[]) => void;
}) {
  const locked = disabled || field.readOnly;
  const badgeRow = (field.required || field.readOnly) ? (
    <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 0.5 }}>
      {field.required && <Chip size="small" label="Required" color="primary" variant="outlined" />}
      {field.readOnly && <Chip size="small" label="Read-only" variant="outlined" />}
    </Box>
  ) : null;

  if (field.type === 'text') {
    const textValue = typeof value === 'string' ? value : '';
    return (
      <Box sx={{ minWidth: 0 }}>
        {badgeRow}
        <TextField
          label={field.name}
          value={textValue}
          onChange={event => onChange(event.target.value)}
          disabled={locked}
          multiline={field.multiline}
          minRows={field.multiline ? 3 : undefined}
          required={field.required}
          fullWidth
          slotProps={{
            htmlInput: field.maxLength ? { maxLength: field.maxLength } : undefined,
          }}
        />
      </Box>
    );
  }

  if (field.type === 'checkbox') {
    return (
      <Box sx={{ minWidth: 0 }}>
        {badgeRow}
        <FormControlLabel
          control={
            <Checkbox
              checked={value === true}
              disabled={locked}
              onChange={event => onChange(event.target.checked)}
            />
          }
          label={<Typography sx={{ overflowWrap: 'anywhere' }}>{field.name}</Typography>}
        />
      </Box>
    );
  }

  if (field.type === 'radio') {
    const selected = typeof value === 'string' ? value : '';
    return (
      <FormControl component="fieldset" disabled={locked} sx={{ minWidth: 0 }}>
        {badgeRow}
        <FormLabel sx={{ overflowWrap: 'anywhere' }}>{field.name}</FormLabel>
        <RadioGroup
          value={selected}
          onChange={event => onChange(event.target.value)}
          row
        >
          {field.options.map(option => (
            <FormControlLabel key={option} value={option} control={<Radio />} label={option} />
          ))}
        </RadioGroup>
      </FormControl>
    );
  }

  // dropdown or optionList
  const currentArray = Array.isArray(value)
    ? value
    : typeof value === 'string' && value
      ? [value]
      : [];

  return (
    <Box sx={{ minWidth: 0 }}>
      {badgeRow}
      <TextField
        select
        label={field.name}
        value={field.multiselect ? currentArray : (currentArray[0] ?? '')}
        disabled={locked}
        fullWidth
        slotProps={{
          select: {
            multiple: field.multiselect,
            onChange: event => {
              const raw = event.target.value;
              if (Array.isArray(raw)) {
                onChange(raw.map(String));
              } else {
                const str = String(raw);
                onChange(str ? [str] : []);
              }
            },
          },
        }}
      >
        {!field.multiselect && <MenuItem value="">None selected</MenuItem>}
        {field.options.map(option => (
          <MenuItem key={option} value={option}>{option}</MenuItem>
        ))}
      </TextField>
    </Box>
  );
}
