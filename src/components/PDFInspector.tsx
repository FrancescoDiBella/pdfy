import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import {
  InfoOutlined,
  DownloadOutlined,
  VerifiedUserOutlined,
  CheckCircleOutlined,
  WarningAmberOutlined,
  DescriptionOutlined,
  CompressOutlined,
} from '@mui/icons-material';
import ToolIntro from './ToolIntro';
import PDFSessionControls from './PDFSessionControls';
import { usePDFSession, type PDFSession } from '../hooks/usePDFSession';
import { generateSamplePDF } from '../utils/pdfSamples';
import { readPDFInfo, writePDFInfo, type MetadataFields } from '../utils/pdfInfo';
import {
  auditPDFPrivacy,
  DEFAULT_SANITIZE_OPTIONS,
  sanitizePDF,
  type FormSanitizeAction,
  type PrivacyAuditReport,
  type SanitizeOptions,
} from '../utils/pdfSanitize';

async function prepare(file: File) {
  const bytes = await file.arrayBuffer();
  const [info, privacy] = await Promise.all([readPDFInfo(bytes), auditPDFPrivacy(bytes)]);
  return { ...info, privacy };
}
type Info = Awaited<ReturnType<typeof prepare>>;

export default function PDFInspector({
  initialFile,
  active = true,
  onSessionChange,
  onOpenInRead,
  onOpenInCompress,
}: {
  initialFile?: File | null;
  active?: boolean;
  onSessionChange?: (active: boolean) => void;
  onOpenInRead?: (file: File) => void;
  onOpenInCompress?: (file: File) => void;
}) {
  const replacement = usePDFSession(prepare, initialFile);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    onSessionChange?.(!!replacement.session);
  }, [replacement.session, onSessionChange]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      {!replacement.session && <ToolIntro icon={<InfoOutlined />} title="Inspect & sanitize metadata" description="Check page sizes, edit document fields, or strip hidden metadata and scripts." />}
      <PDFSessionControls tool="Info" active={active} hasSession={!!replacement.session} busy={replacement.isReading || isExporting} pendingName={replacement.pending?.file.name} error={replacement.error}
        onOpen={replacement.open} onSample={() => replacement.open(() => generateSamplePDF('executive-brief'))} onCancel={replacement.cancel} onConfirm={replacement.confirm} />
      {replacement.session && (
        <Box component="fieldset" disabled={replacement.isReading || !!replacement.pending} sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}>
          <InfoWorkspace
            key={replacement.session.id}
            session={replacement.session}
            onExporting={setIsExporting}
            onOpenInRead={onOpenInRead}
            onOpenInCompress={onOpenInCompress}
          />
        </Box>
      )}
    </Box>
  );
}

const fieldLabels: Record<keyof MetadataFields, string> = {
  title: 'Document title', author: 'Author', subject: 'Subject', keywords: 'Keywords (comma-separated)', creator: 'Creator application', producer: 'PDF producer',
};

function describeAuditRow(found: boolean, detectedText: string, cleanText = 'None detected') {
  return {
    found,
    detail: found ? detectedText : cleanText,
  };
}

function InfoWorkspace({
  session: { file, data },
  onExporting,
  onOpenInRead,
  onOpenInCompress,
}: {
  session: PDFSession<Info>;
  onExporting: (busy: boolean) => void;
  onOpenInRead?: (file: File) => void;
  onOpenInCompress?: (file: File) => void;
}) {
  const [fields, setFields] = useState(data.fields);
  const [isExporting, setIsExporting] = useState(false);
  const [feedback, setFeedback] = useState<{ severity: 'success' | 'error'; message: string } | null>(null);
  const [sanitizeOptions, setSanitizeOptions] = useState<SanitizeOptions>(DEFAULT_SANITIZE_OPTIONS);
  const [sanitizedResult, setSanitizedResult] = useState<{
    file: File;
    before: PrivacyAuditReport;
    after: PrivacyAuditReport;
    removedCategories: string[];
  } | null>(null);

  const download = async (clear: boolean) => {
    if (isExporting) return;
    setIsExporting(true);
    onExporting(true);
    setFeedback(null);
    try {
      const bytes = await writePDFInfo(await file.arrayBuffer(), fields, clear);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${clear ? 'metadata-cleared' : 'metadata'}_${file.name}`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setFeedback({ severity: 'success', message: clear ? 'Download started with the six displayed fields cleared. Your working values have been kept.' : 'Download started with your updated document properties.' });
    } catch {
      setFeedback({ severity: 'error', message: 'Could not download the PDF. Your file and edits have been kept. Try again.' });
    } finally {
      setIsExporting(false);
      onExporting(false);
    }
  };

  const runSanitize = async () => {
    if (isExporting) return;
    setIsExporting(true);
    onExporting(true);
    setFeedback(null);
    try {
      const result = await sanitizePDF(await file.arrayBuffer(), sanitizeOptions);
      const sanitizedName = `sanitized_${file.name}`;
      const sanitizedFile = new File([result.bytes as BlobPart], sanitizedName, { type: 'application/pdf' });
      const url = URL.createObjectURL(sanitizedFile);
      const link = document.createElement('a');
      link.href = url;
      link.download = sanitizedName;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setSanitizedResult({
        file: sanitizedFile,
        before: result.before,
        after: result.after,
        removedCategories: result.removedCategories,
      });
    } catch {
      setFeedback({ severity: 'error', message: 'Could not sanitize the PDF. Your original file has been kept. Try again.' });
    } finally {
      setIsExporting(false);
      onExporting(false);
    }
  };

  const { privacy } = data;
  const infoDetailParts: string[] = [];
  if (privacy.infoFieldsPresent.length > 0) infoDetailParts.push(privacy.infoFieldsPresent.join(', '));
  if (privacy.customInfoKeys.length > 0) infoDetailParts.push(`+${privacy.customInfoKeys.length} custom`);
  if (privacy.hasDates) infoDetailParts.push('timestamps');

  const auditRows = [
    {
      key: 'info',
      label: 'Info dictionary & timestamps',
      ...describeAuditRow(
        privacy.infoFieldsPresent.length > 0 || privacy.customInfoKeys.length > 0 || privacy.hasDates,
        infoDetailParts.join(' · '),
      ),
    },
    {
      key: 'xmp',
      label: 'XMP XML metadata',
      ...describeAuditRow(
        privacy.hasXmpMetadata,
        `Embedded XML stream (${privacy.xmpByteLength.toLocaleString()} bytes)`,
      ),
    },
    {
      key: 'annotations',
      label: 'Annotations & comments',
      ...describeAuditRow(
        privacy.annotationCount > 0,
        `${privacy.annotationCount} non-form annotation${privacy.annotationCount === 1 ? '' : 's'}`,
      ),
    },
    {
      key: 'forms',
      label: 'Interactive form fields',
      ...describeAuditRow(
        privacy.hasAcroForm || privacy.formFieldCount > 0,
        privacy.formFieldCount > 0
          ? `${privacy.formFieldCount} interactive field${privacy.formFieldCount === 1 ? '' : 's'}`
          : 'AcroForm dictionary present',
      ),
    },
    {
      key: 'outlines',
      label: 'Document outline / bookmarks',
      ...describeAuditRow(privacy.hasOutlines, 'Bookmark tree present'),
    },
    {
      key: 'actions',
      label: 'Actions, JavaScript & attachments',
      ...describeAuditRow(
        privacy.hasDocumentActions || privacy.hasEmbeddedFiles,
        [
          privacy.hasDocumentActions ? 'OpenAction / JavaScript' : '',
          privacy.hasEmbeddedFiles ? 'Embedded attachments' : '',
        ].filter(Boolean).join(' · '),
      ),
    },
  ];

  const anySanitizeEnabled = (
    sanitizeOptions.stripInfoAndDates
    || sanitizeOptions.stripXmpMetadata
    || sanitizeOptions.stripAnnotations
    || sanitizeOptions.formAction !== 'keep'
    || sanitizeOptions.stripOutlines
    || sanitizeOptions.stripActionsAndAttachments
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, minWidth: 0 }}>
        <Typography variant="h2" sx={{ overflowWrap: 'anywhere' }}>{file.name}</Typography>
        <Typography color="text.secondary" className="tabular-nums">{(file.size / 1024).toFixed(1)} KB · {data.pages.length} pages</Typography>
      </Paper>
      {feedback && <Alert severity={feedback.severity}>{feedback.message}</Alert>}
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <VerifiedUserOutlined color="primary" aria-hidden="true" />
            <Typography variant="h2">Privacy audit & deep sanitizer</Typography>
          </Box>
          <Typography
            variant="body2"
            className="tabular-nums"
            data-testid="privacy-findings-summary"
            sx={{ fontWeight: 700, color: privacy.totalFindings > 0 ? 'primary.main' : 'text.primary' }}
          >
            {privacy.totalFindings > 0
              ? `${privacy.totalFindings} of 6 categories detected`
              : '0 of 6 categories detected'}
          </Typography>
        </Box>
        <Typography color="text.secondary">
          Inspect hidden document metadata and active PDF features, then export a deeply sanitized copy without leaving your device. Visual page text and images stay intact; use Edit redactions for sensitive visible text.
        </Typography>
        <Box
          component="ul"
          aria-label="Privacy audit findings"
          sx={{
            listStyle: 'none',
            m: 0,
            p: 0,
            display: 'grid',
            gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' },
            gap: 1.25,
          }}
        >
          {auditRows.map(row => (
            <Box
              component="li"
              key={row.key}
              sx={{
                p: 1.5,
                borderRadius: 1.5,
                border: 1,
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1.25,
                minWidth: 0,
              }}
            >
              {row.found ? (
                <WarningAmberOutlined fontSize="small" color="warning" aria-hidden="true" sx={{ mt: 0.25, flexShrink: 0 }} />
              ) : (
                <CheckCircleOutlined fontSize="small" color="success" aria-hidden="true" sx={{ mt: 0.25, flexShrink: 0 }} />
              )}
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{row.label}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflowWrap: 'anywhere' }}>
                  {row.detail}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
        <Divider />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 0.5, alignItems: 'center' }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={sanitizeOptions.stripInfoAndDates}
                disabled={isExporting}
                onChange={event => setSanitizeOptions(prev => ({ ...prev, stripInfoAndDates: event.target.checked }))}
              />
            }
            label="Remove Info dictionary & timestamps"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={sanitizeOptions.stripXmpMetadata}
                disabled={isExporting}
                onChange={event => setSanitizeOptions(prev => ({ ...prev, stripXmpMetadata: event.target.checked }))}
              />
            }
            label="Strip XMP XML metadata streams"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={sanitizeOptions.stripAnnotations}
                disabled={isExporting}
                onChange={event => setSanitizeOptions(prev => ({ ...prev, stripAnnotations: event.target.checked }))}
              />
            }
            label="Remove annotations & comments"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={sanitizeOptions.stripOutlines}
                disabled={isExporting}
                onChange={event => setSanitizeOptions(prev => ({ ...prev, stripOutlines: event.target.checked }))}
              />
            }
            label="Remove outline / bookmarks"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={sanitizeOptions.stripActionsAndAttachments}
                disabled={isExporting}
                onChange={event => setSanitizeOptions(prev => ({ ...prev, stripActionsAndAttachments: event.target.checked }))}
              />
            }
            label="Strip JavaScript, OpenAction & attachments"
          />
          <FormControl size="small" fullWidth disabled={isExporting} sx={{ mt: { xs: 1, sm: 0 } }}>
            <InputLabel id="sanitize-forms-label">Interactive form fields</InputLabel>
            <Select
              labelId="sanitize-forms-label"
              label="Interactive form fields"
              value={sanitizeOptions.formAction}
              onChange={event => setSanitizeOptions(prev => ({ ...prev, formAction: event.target.value as FormSanitizeAction }))}
            >
              <MenuItem value="flatten">Flatten values (make read-only)</MenuItem>
              <MenuItem value="remove">Remove form fields completely</MenuItem>
              <MenuItem value="keep">Keep interactive form fields</MenuItem>
            </Select>
          </FormControl>
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
          <Button
            variant="contained"
            startIcon={isExporting ? <CircularProgress size={18} color="inherit" /> : <VerifiedUserOutlined />}
            disabled={isExporting || !anySanitizeEnabled}
            onClick={runSanitize}
          >
            Sanitize & download PDF
          </Button>
          {sanitizedResult && onOpenInRead && (
            <Button
              variant="outlined"
              startIcon={<DescriptionOutlined />}
              disabled={isExporting}
              onClick={() => onOpenInRead(sanitizedResult.file)}
            >
              Open sanitized copy in Read
            </Button>
          )}
          {sanitizedResult && onOpenInCompress && (
            <Button
              variant="outlined"
              startIcon={<CompressOutlined />}
              disabled={isExporting}
              onClick={() => onOpenInCompress(sanitizedResult.file)}
            >
              Compress sanitized copy
            </Button>
          )}
        </Box>
        {sanitizedResult && (
          <Alert severity="success" data-testid="sanitize-verification-alert">
            Sanitized copy downloaded ({(sanitizedResult.file.size / 1024).toFixed(1)} KB). Verified{' '}
            <strong>{sanitizedResult.after.totalFindings} of 6</strong> categories remaining (down from{' '}
            {sanitizedResult.before.totalFindings}).
            {sanitizedResult.removedCategories.length > 0
              ? ` Cleaned: ${sanitizedResult.removedCategories.join(', ')}.`
              : ' Document already had no matching privacy findings.'}
          </Alert>
        )}
      </Paper>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 3fr) minmax(0, 2fr)' }, gap: 2, minWidth: 0 }}>
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <Typography variant="h2">Document properties</Typography>
          <Typography color="text.secondary">These six fields come from the PDF Info dictionary. To remove XMP metadata, timestamps, annotations, or active actions as well, use the Privacy audit & deep sanitizer above.</Typography>
          {(Object.keys(fieldLabels) as (keyof MetadataFields)[]).map(key => (
            <TextField key={key} label={fieldLabels[key]} value={fields[key]} fullWidth disabled={isExporting} onChange={event => { setFields(previous => ({ ...previous, [key]: event.target.value })); setFeedback(null); }} />
          ))}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <Button variant="contained" startIcon={isExporting ? <CircularProgress size={18} color="inherit" /> : <DownloadOutlined />} disabled={isExporting} onClick={() => download(false)}>Download updated PDF</Button>
            <Button variant="outlined" disabled={isExporting} onClick={() => download(true)}>Download without these fields</Button>
          </Box>
          <Divider />
          <Box
            component="dl"
            sx={{
              m: 0,
              display: 'grid',
              gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(160px, auto) minmax(0, 1fr)' },
              rowGap: 1.25,
              columnGap: 2.5,
              alignItems: 'baseline',
              overflowWrap: 'anywhere',
            }}
          >
            <Typography component="dt" variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>Created</Typography>
            <Typography component="dd" variant="body2" className="tabular-nums" sx={{ m: 0 }}>{data.creationDate}</Typography>
            <Typography component="dt" variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>Last modified in the source file</Typography>
            <Typography component="dd" variant="body2" className="tabular-nums" sx={{ m: 0 }}>{data.modificationDate}</Typography>
          </Box>
        </Paper>
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, minWidth: 0, alignSelf: 'start' }}>
          <Typography variant="h2" sx={{ mb: 1 }}>Page dimensions</Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>72 points equal one inch. Sizes describe the source pages before rotation.</Typography>
          <Box
            role="region"
            aria-label="Page dimensions"
            tabIndex={0}
            className="pdfy-scroll-region"
            sx={{
              maxHeight: 500,
              maxWidth: '100%',
              overflow: 'auto',
              containerType: 'inline-size',
            }}
          >
            <Box
              component="table"
              sx={{
                width: '100%',
                borderCollapse: 'separate',
                borderSpacing: 0,
                fontVariantNumeric: 'tabular-nums',
                fontSize: '0.875rem',
                '& thead th': {
                  position: 'sticky',
                  top: 0,
                  zIndex: 1,
                  bgcolor: 'background.paper',
                  color: 'text.secondary',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  textAlign: 'left',
                  py: 1,
                  px: 1,
                  borderBottom: '2px solid',
                  borderColor: 'divider',
                  whiteSpace: 'nowrap',
                },
                '& thead th:not(:first-of-type), & tbody td': {
                  textAlign: 'right',
                },
                '& tbody th': {
                  textAlign: 'left',
                  fontWeight: 650,
                  color: 'text.primary',
                  py: 1.25,
                  px: 1,
                  borderBottom: 1,
                  borderColor: 'divider',
                  whiteSpace: 'nowrap',
                },
                '& tbody td': {
                  color: 'text.primary',
                  py: 1.25,
                  px: 1,
                  borderBottom: 1,
                  borderColor: 'divider',
                  whiteSpace: 'nowrap',
                },
                '& tbody tr:last-child th, & tbody tr:last-child td': {
                  borderBottom: 0,
                },
                '& tbody tr:hover': {
                  bgcolor: 'action.hover',
                },
                '@container (width < 340px)': {
                  '&, & thead, & tbody, & tr, & th, & td': {
                    display: 'block',
                  },
                  '& thead': {
                    display: 'none',
                  },
                  '& tbody tr': {
                    py: 1.25,
                    borderBottom: 1,
                    borderColor: 'divider',
                  },
                  '& tbody tr:last-child': {
                    borderBottom: 0,
                  },
                  '& tbody th': {
                    borderBottom: 0,
                    py: 0,
                    px: 0,
                    pb: 0.75,
                    fontSize: '0.9375rem',
                  },
                  '& tbody td': {
                    borderBottom: 0,
                    py: 0.25,
                    px: 0,
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 1.5,
                    textAlign: 'right',
                  },
                  '& tbody td::before': {
                    color: 'text.secondary',
                    fontWeight: 500,
                    textAlign: 'left',
                  },
                  '& tbody td:nth-of-type(1)::before': {
                    content: '"Points"',
                  },
                  '& tbody td:nth-of-type(2)::before': {
                    content: '"Millimeters"',
                  },
                  '& tbody td:nth-of-type(3)::before': {
                    content: '"Rotation"',
                  },
                },
              }}
            >
              <thead>
                <tr>
                  <th scope="col">Page</th>
                  <th scope="col">Points</th>
                  <th scope="col">Millimeters</th>
                  <th scope="col">Rotation</th>
                </tr>
              </thead>
              <tbody>
                {data.pages.map(page => (
                  <tr key={page.number}>
                    <th scope="row">Page {page.number}</th>
                    <td>{page.width.toFixed(1)} × {page.height.toFixed(1)}</td>
                    <td>{(page.width * 25.4 / 72).toFixed(1)} × {(page.height * 25.4 / 72).toFixed(1)}</td>
                    <td>{page.rotation}°</td>
                  </tr>
                ))}
              </tbody>
            </Box>
          </Box>
        </Paper>
      </Box>
    </Box>
  );
}
