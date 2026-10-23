import { useId, useRef } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material';
import { FolderOpenOutlined, AutoFixHigh } from '@mui/icons-material';

interface Props {
  tool: string;
  active: boolean;
  hasSession: boolean;
  busy: boolean;
  pendingName?: string;
  error: string | null;
  onOpen: (file: File) => void;
  onSample: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function PDFSessionControls({ tool, active, hasSession, busy, pendingName, error, onOpen, onSample, onCancel, onConfirm }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  return (
    <>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        <Button ref={openButton} variant="contained" startIcon={<FolderOpenOutlined />} disabled={busy} onClick={() => input.current?.click()}>
          {busy ? 'Please wait…' : hasSession ? 'Open another PDF' : 'Open PDF'}
        </Button>
        <input ref={input} hidden type="file" accept="application/pdf,.pdf" aria-label={`PDF for ${tool}`} disabled={busy} onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) onOpen(file);
        }} />
        <Button variant="outlined" startIcon={<AutoFixHigh />} disabled={busy} onClick={onSample}>Try a sample PDF</Button>
      </Box>
      {error && <Alert severity="error" sx={{ overflowWrap: 'anywhere' }}>{error}</Alert>}
      <Dialog open={active && !!pendingName} onClose={onCancel} aria-labelledby={titleId} aria-describedby={descriptionId} disableRestoreFocus slotProps={{ transition: { onExited: () => { if (active) openButton.current?.focus(); } } }}>
        <DialogTitle id={titleId}>Replace the {tool} document?</DialogTitle>
        <DialogContent>
          <DialogContentText id={descriptionId} sx={{ overflowWrap: 'anywhere' }}>
            Opening “{pendingName}” will discard this tool’s current work. Download anything you want to keep first. Other tools will keep their sessions.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap', gap: 1, p: 2 }}>
          <Button autoFocus onClick={onCancel}>Cancel</Button>
          <Button variant="contained" onClick={onConfirm}>Replace document</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
