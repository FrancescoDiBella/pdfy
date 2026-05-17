import { useState } from 'react';
import { Box, Button, Typography, Paper, List, ListItem, ListItemText, IconButton, CircularProgress } from '@mui/material';
import { CloudUpload as UploadIcon, Delete as DeleteIcon, MergeType as MergeIcon } from '@mui/icons-material';
import { PDFDocument } from 'pdf-lib';

export default function PDFMerger() {
  const [files, setFiles] = useState<File[]>([]);
  const [isMerging, setIsMerging] = useState(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setFiles(prev => [...prev, ...Array.from(event.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const mergePDFs = async () => {
    if (files.length < 2) return;
    setIsMerging(true);
    try {
      const mergedPdf = await PDFDocument.create();

      for (const file of files) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await PDFDocument.load(arrayBuffer);
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      }

      const mergedPdfFile = await mergedPdf.save();
      const blob = new Blob([mergedPdfFile as any], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = 'merged.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (error) {
      console.error("Error merging PDFs", error);
      alert("Failed to merge PDFs. Please try again.");
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <Box sx={{ width: '100%', maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ textAlign: 'center' }}>
        <Typography variant="h5" gutterBottom>Merge PDFs</Typography>
        <Typography variant="body2" color="text.secondary">Combine multiple PDFs into a single file</Typography>
      </Box>

      <Paper sx={{ p: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, border: '2px dashed', borderColor: 'divider' }}>
        <Button
          variant="outlined"
          component="label"
          startIcon={<UploadIcon />}
          size="large"
        >
          Select PDF Files
          <input type="file" hidden accept="application/pdf" multiple onChange={handleFileChange} />
        </Button>
      </Paper>

      {files.length > 0 && (
        <Paper variant="outlined">
          <List>
            {files.map((file, index) => (
              <ListItem
                key={`${file.name}-${index}`}
                secondaryAction={
                  <IconButton edge="end" aria-label="delete" onClick={() => removeFile(index)}>
                    <DeleteIcon />
                  </IconButton>
                }
              >
                <ListItemText primary={file.name} secondary={`${(file.size / 1024 / 1024).toFixed(2)} MB`} />
              </ListItem>
            ))}
          </List>
        </Paper>
      )}

      <Button
        variant="contained"
        size="large"
        color="primary"
        startIcon={isMerging ? <CircularProgress size={20} color="inherit" /> : <MergeIcon />}
        disabled={files.length < 2 || isMerging}
        onClick={mergePDFs}
      >
        {isMerging ? 'Merging...' : 'Merge PDFs'}
      </Button>
    </Box>
  );
}
