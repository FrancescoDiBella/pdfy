import { useId, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  Alert,
  Box,
  Button,
  FormControlLabel,
  Paper,
  Slider,
  Switch,
  Typography,
} from '@mui/material';
import {
  ContentCopy,
  DownloadOutlined,
  TableChartOutlined,
} from '@mui/icons-material';
import { PDFDocument } from 'pdf-lib';
import { pdfjs } from 'react-pdf';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import PDFSessionControls from './PDFSessionControls';
import ToolIntro from './ToolIntro';
import { usePDFSession, type PDFSession } from '../hooks/usePDFSession';
import { pdfDocumentOptions } from '../utils/pdfRendering';
import { generateSamplePDF } from '../utils/pdfSamples';
import {
  extractTablesFromPages,
  serializeTableToCSV,
  serializeTableToJSON,
  serializeTableToMarkdown,
  serializeTableToTSV,
  splitTableHeaderAndBody,
  type ExtractedPDFTable,
  type PageTableTextInput,
} from '../utils/pdfTableExtract';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

async function preparePdfForTables(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdfCheck = await PDFDocument.load(bytes, { updateMetadata: false });
  const pageCount = pdfCheck.getPageCount();
  if (!pageCount) throw new Error('This PDF has no pages.');

  const loadingTask = pdfjs.getDocument({ data: bytes, ...pdfDocumentOptions });
  const proxy = await loadingTask.promise;
  try {
    const pages: PageTableTextInput[] = [];
    for (let p = 1; p <= proxy.numPages; p++) {
      const page = await proxy.getPage(p);
      const content = await page.getTextContent();
      const items = content.items
        .filter((item): item is TextItem => 'str' in item)
        .map(item => ({
          str: item.str,
          transform: item.transform,
          width: item.width,
        }));
      pages.push({ pageNumber: p, items });
    }
    return { pageCount, pages };
  } finally {
    await proxy.destroy();
  }
}

function triggerTextDownload(content: string, mimeType: string, filename: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function PDFTableExtractorTab({
  initialFile,
  active,
}: {
  initialFile?: File | null;
  active: boolean;
}) {
  const replacement = usePDFSession(preparePdfForTables, initialFile);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      {!replacement.session && (
        <ToolIntro
          icon={<TableChartOutlined />}
          title="Extract tables to CSV, Excel, or JSON"
          description="Detect aligned columns in selectable PDFs and copy as TSV or export as CSV, JSON, or Markdown."
        />
      )}
      <PDFSessionControls
        tool="Convert tables"
        active={active}
        hasSession={!!replacement.session}
        busy={replacement.isReading}
        pendingName={replacement.pending?.file.name}
        error={replacement.error}
        onOpen={replacement.open}
        onSample={() => replacement.open(() => generateSamplePDF('service-invoice'))}
        onCancel={replacement.cancel}
        onConfirm={replacement.confirm}
      />
      {replacement.session && (
        <Box component="fieldset" disabled={replacement.isReading || !!replacement.pending} sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}>
          <TableExtractorWorkspace key={replacement.session.id} session={replacement.session} />
        </Box>
      )}
    </Box>
  );
}

function TableExtractorWorkspace({
  session: { file, data },
}: {
  session: PDFSession<{ pageCount: number; pages: PageTableTextInput[] }>;
}) {
  const [columnGapPt, setColumnGapPt] = useState(14);
  const [firstRowIsHeader, setFirstRowIsHeader] = useState(true);
  const [feedback, setFeedback] = useState<{ severity: 'success' | 'info' | 'error'; message: string } | null>(null);

  const tables = useMemo(
    () => extractTablesFromPages(data.pages, { columnGapPt }),
    [data.pages, columnGapPt],
  );

  const baseName = file.name.replace(/\.pdf$/i, '') || 'document';

  const handleCopyTSV = async (table: ExtractedPDFTable) => {
    const tsv = serializeTableToTSV(table, firstRowIsHeader);
    try {
      await navigator.clipboard.writeText(tsv);
      setFeedback({
        severity: 'success',
        message: `Copied Table ${table.tableIndexInPage} (Page ${table.pageNumber}) as TSV — paste directly into Excel or Google Sheets.`,
      });
    } catch {
      setFeedback({ severity: 'error', message: 'Clipboard copy failed. Use Download CSV instead.' });
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 1 }}>
          <Typography variant="h2" sx={{ overflowWrap: 'anywhere' }}>{file.name}</Typography>
          <Typography variant="body2" color="text.secondary" className="tabular-nums" data-testid="extracted-tables-summary">
            {data.pageCount} {data.pageCount === 1 ? 'page' : 'pages'} · {tables.length} {tables.length === 1 ? 'table' : 'tables'} detected
          </Typography>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) auto' }, gap: 2, alignItems: 'center' }}>
          <Box>
            <Typography variant="caption" color="text.secondary" className="tabular-nums">
              Column separation sensitivity ({columnGapPt} pt gap)
            </Typography>
            <Slider
              aria-label="Column separation sensitivity"
              min={6}
              max={36}
              step={2}
              value={columnGapPt}
              onChange={(_, value) => setColumnGapPt(value as number)}
            />
          </Box>
          <FormControlLabel
            control={
              <Switch
                checked={firstRowIsHeader}
                onChange={event => setFirstRowIsHeader(event.target.checked)}
              />
            }
            label="First row as column headers"
          />
        </Box>
      </Paper>

      {feedback && <Alert severity={feedback.severity} onClose={() => setFeedback(null)}>{feedback.message}</Alert>}

      {tables.length === 0 ? (
        <Alert severity="info">
          No multi-column tables were detected at the current {columnGapPt} pt column gap. Try lowering the column separation slider if columns are close together, or check that the PDF contains selectable text.
        </Alert>
      ) : (
        tables.map(table => (
          <ExtractedTableCard
            key={table.id}
            table={table}
            firstRowIsHeader={firstRowIsHeader}
            baseName={baseName}
            onCopyTSV={() => void handleCopyTSV(table)}
            onDownload={(format, content, mime, ext) => {
              const filename = `${baseName}_p${table.pageNumber}_table${table.tableIndexInPage}.${ext}`;
              triggerTextDownload(content, mime, filename);
              setFeedback({ severity: 'success', message: `Downloaded ${filename} (${format}).` });
            }}
          />
        ))
      )}
    </Box>
  );
}

function ExtractedTableCard({
  table,
  firstRowIsHeader,
  baseName,
  onCopyTSV,
  onDownload,
}: {
  table: ExtractedPDFTable;
  firstRowIsHeader: boolean;
  baseName: string;
  onCopyTSV: () => void;
  onDownload: (format: string, content: string, mime: string, ext: string) => void;
}) {
  const captionId = useId();
  const { headers, bodyRows } = splitTableHeaderAndBody(table, firstRowIsHeader);

  return (
    <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 }, display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography variant="body2" color="text.secondary" className="tabular-nums">
          Page {table.pageNumber} · Table {table.tableIndexInPage} · {bodyRows.length} data {bodyRows.length === 1 ? 'row' : 'rows'} × {headers.length} columns
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          <Button size="small" variant="contained" startIcon={<DownloadOutlined />} onClick={() => onDownload('CSV', serializeTableToCSV(table, firstRowIsHeader), 'text/csv;charset=utf-8', 'csv')}>
            Download CSV
          </Button>
          <Button size="small" variant="outlined" startIcon={<ContentCopy />} onClick={onCopyTSV}>
            Copy TSV
          </Button>
          <Button size="small" variant="outlined" onClick={() => onDownload('JSON', serializeTableToJSON(table, firstRowIsHeader), 'application/json;charset=utf-8', 'json')}>
            Download JSON
          </Button>
          <Button size="small" variant="outlined" onClick={() => onDownload('Markdown', serializeTableToMarkdown(table, firstRowIsHeader), 'text/markdown;charset=utf-8', 'md')}>
            Download .md
          </Button>
        </Box>
      </Box>

      {/* Semantic responsive table following Modern Web Guidance (responsive-table) */}
      <div
        tabIndex={0}
        role="region"
        aria-labelledby={captionId}
        className="pdfy-responsive-table-wrapper pdfy-scroll-region"
      >
        <table className="pdfy-responsive-table">
          <caption id={captionId}>
            {baseName} — Page {table.pageNumber}, Table {table.tableIndexInPage}
          </caption>
          <thead>
            <tr>
              {headers.map((header, colIdx) => (
                <th key={colIdx} scope="col">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bodyRows.map((row, rowIdx) => (
              <tr key={rowIdx}>
                {headers.map((header, colIdx) => {
                  const value = row[colIdx] ?? '';
                  if (colIdx === 0) {
                    return <th key={colIdx} scope="row">{value || `Row ${rowIdx + 1}`}</th>;
                  }
                  const labelStyle = { '--col-label': JSON.stringify(header) } as CSSProperties;
                  return (
                    <td key={colIdx} style={labelStyle}>
                      {value}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Paper>
  );
}
