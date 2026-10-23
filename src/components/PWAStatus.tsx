import { useRef, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Snackbar } from '@mui/material';
import { useRegisterSW } from 'virtual:pwa-register/react';

export default function PWAStatus() {
  const [confirmUpdate, setConfirmUpdate] = useState(false);
  const [registrationFailed, setRegistrationFailed] = useState(false);
  const [externalUpdate, setExternalUpdate] = useState(false);
  const updateApproved = useRef(false);
  const reloadPending = useRef(false);
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError() { setRegistrationFailed(true); },
    onNeedReload() {
      reloadPending.current = true;
      // Another tab may activate the worker. Only this tab's consent permits a reload.
      if (updateApproved.current) window.location.reload();
      else setExternalUpdate(true);
    },
  });
  const hasUpdate = needRefresh || externalUpdate;

  const dismiss = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
    setRegistrationFailed(false);
    setExternalUpdate(false);
  };

  const applyUpdate = async () => {
    setConfirmUpdate(false);
    updateApproved.current = true;
    try {
      if (reloadPending.current) window.location.reload();
      else await updateServiceWorker(true);
    } catch {
      updateApproved.current = false;
      setRegistrationFailed(true);
    }
  };

  return (
    <>
      <Snackbar open={offlineReady || hasUpdate || registrationFailed} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
        <Alert
          severity={registrationFailed ? 'warning' : 'info'}
          onClose={dismiss}
          action={hasUpdate && !registrationFailed ? (
            <>
              <Button color="inherit" size="small" onClick={() => setConfirmUpdate(true)}>Review update</Button>
              <Button color="inherit" size="small" onClick={dismiss}>Later</Button>
            </>
          ) : undefined}
        >
          {registrationFailed
            ? 'Offline setup or update failed. You can keep using PDFy and retry by reopening it online.'
            : hasUpdate
              ? 'A new version of PDFy is ready.'
              : 'PDFy is ready for offline use. Export your work before closing.'}
        </Alert>
      </Snackbar>
      <Dialog open={confirmUpdate} onClose={() => setConfirmUpdate(false)} aria-labelledby="pwa-update-title" aria-describedby="pwa-update-description">
        <DialogTitle id="pwa-update-title">Update PDFy?</DialogTitle>
        <DialogContent>
          <DialogContentText id="pwa-update-description">
            Export any unsaved work in every open PDFy tab before updating. Reloading this tab clears its open files and edits. You can cancel and continue working.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmUpdate(false)} autoFocus>Cancel</Button>
          <Button onClick={applyUpdate} variant="contained">Reload and update</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
