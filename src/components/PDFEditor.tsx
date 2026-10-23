import { pdfDocumentOptions } from '../utils/pdfRendering';
import { useState } from 'react';
import { Box, Button, Typography, Paper, TextField, CircularProgress } from '@mui/material';
import { CloudUpload as UploadIcon, Save as SaveIcon } from '@mui/icons-material';
import { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown } from 'pdf-lib';
import { Document, Page, pdfjs } from 'react-pdf';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

type FormField = {
  name: string;
  type: string;
  value: string;
  options?: string[];
};

export default function PDFEditor() {
  const [file, setFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocument | null>(null);
  const [fields, setFields] = useState<FormField[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const onFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const selectedFile = event.target.files[0];
      setFile(selectedFile);
      
      const arrayBuffer = await selectedFile.arrayBuffer();
      const loadedPdf = await PDFDocument.load(arrayBuffer);
      setPdfDoc(loadedPdf);

      const form = loadedPdf.getForm();
      const extractedFields = form.getFields().map(f => {
        let type = 'unknown';
        let value = '';
        let options: string[] = [];

        if (f instanceof PDFTextField) {
          type = 'text';
          value = f.getText() || '';
        } else if (f instanceof PDFCheckBox) {
          type = 'checkbox';
          value = f.isChecked() ? 'true' : 'false';
        } else if (f instanceof PDFDropdown) {
          type = 'dropdown';
          options = f.getOptions();
          value = f.getSelected()[0] || '';
        }

        return { name: f.getName(), type, value, options };
      }).filter(f => f.type !== 'unknown');

      setFields(extractedFields);
    }
  };

  const handleFieldChange = (name: string, newValue: string) => {
    setFields(prev => prev.map(f => f.name === name ? { ...f, value: newValue } : f));
  };

  const savePDF = async () => {
    if (!pdfDoc) return;
    setIsSaving(true);
    try {
      const form = pdfDoc.getForm();
      
      fields.forEach(f => {
        const field = form.getField(f.name);
        if (field instanceof PDFTextField) {
          field.setText(f.value);
        } else if (field instanceof PDFCheckBox) {
          if (f.value === 'true') field.check();
          else field.uncheck();
        } else if (field instanceof PDFDropdown) {
          field.select(f.value);
        }
      });

      const savedPdf = await pdfDoc.save();
      const blob = new Blob([savedPdf as any], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `filled_${file?.name || 'document.pdf'}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error saving PDF", error);
      alert("Failed to save PDF.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!file) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <Typography variant="h5" gutterBottom>Fill & Sign</Typography>
        <Typography variant="body2" color="text.secondary">Open a PDF to fill its interactive form fields</Typography>
        <Button
          variant="contained"
          component="label"
          startIcon={<UploadIcon />}
          size="large"
          sx={{ mt: 2 }}
        >
          Select Form PDF
          <input type="file" hidden accept="application/pdf" onChange={onFileChange} />
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', height: '100%', display: 'flex', gap: 2 }}>
      <Paper sx={{ width: 350, p: 2, display: 'flex', flexDirection: 'column', gap: 2, overflow: 'auto' }}>
        <Typography variant="h6">Form Fields</Typography>
        {fields.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No interactive fields found in this PDF.</Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {fields.map((f, i) => (
              <TextField
                key={i}
                label={f.name}
                value={f.value}
                onChange={(e) => handleFieldChange(f.name, e.target.value)}
                variant="outlined"
                size="small"
                fullWidth
              />
            ))}
          </Box>
        )}
        <Box sx={{ mt: 'auto', pt: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Button
            variant="contained"
            color="primary"
            startIcon={isSaving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
            disabled={isSaving}
            onClick={savePDF}
            fullWidth
          >
            {isSaving ? 'Saving...' : 'Save PDF'}
          </Button>
          <Button variant="outlined" component="label" fullWidth>
            Open Different File
            <input type="file" hidden accept="application/pdf" onChange={onFileChange} />
          </Button>
        </Box>
      </Paper>

      <Box sx={{ 
        flexGrow: 1, 
        overflow: 'auto', 
        bgcolor: 'background.default', 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center',
        p: 2,
        borderRadius: 1
      }}>
        <Document
          options={pdfDocumentOptions}
          file={file}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
          loading={<CircularProgress />}
        >
          {Array.from(new Array(numPages || 0), (_, index) => (
            <Paper key={`page_${index + 1}`} elevation={3} sx={{ mb: 2 }}>
              <Page
                pageNumber={index + 1}
                width={600}
                renderTextLayer={true}
                renderAnnotationLayer={true}
              />
            </Paper>
          ))}
        </Document>
      </Box>
    </Box>
  );
}

