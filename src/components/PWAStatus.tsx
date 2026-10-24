import { useRef, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Snackbar } from '@mui/material';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { activateWaitingWorker } from '../utils/serviceWorkerUpdate';

export default function PWAStatus() {
  const [confirmUpdate, setConfirmUpdate] = useState(false);
  const [registrationFailed, setRegistrationFailed] = useState(false);
  const [externalUpdate, setExternalUpdate] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const updateInProgress = useRef(false);
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
  } = useRegisterSW({
    onRegisterError() { setRegistrationFailed(true); },
    onNeedReload() {
      // Activation elsewhere must never reload this tab without its own consent.
      setExternalUpdate(true);
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
    if (updateInProgress.current) return;
    updateInProgress.current = true;
    setIsUpdating(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      await activateWaitingWorker(registration?.waiting ?? null);
      window.location.reload();
    } catch {
      updateInProgress.current = false;
      setIsUpdating(false);
      setConfirmUpdate(false);
      setRegistrationFailed(true);
    }
  };

  return (
    <>
      <Snackbar open={offlineReady || hasUpdate || registrationFailed} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} sx={{ bottom: { xs: 'calc(64px + env(safe-area-inset-bottom))', sm: 24 }, maxHeight: 'calc(100dvh - 120px)', overflow: 'auto' }}>
        <Alert
          severity={registrationFailed ? 'warning' : 'info'}
          sx={{ flexWrap: 'wrap', '& .MuiAlert-message': { flex: '1 1 160px' }, '& .MuiAlert-action': { flexWrap: 'wrap' } }}
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
      <Dialog open={confirmUpdate} onClose={() => { if (!updateInProgress.current) setConfirmUpdate(false); }} aria-labelledby="pwa-update-title" aria-describedby="pwa-update-description">
        <DialogTitle id="pwa-update-title">Update PDFy?</DialogTitle>
        <DialogContent aria-busy={isUpdating}>
          <DialogContentText id="pwa-update-description">
            Export any unsaved work in every open PDFy tab before updating. Reloading this tab clears its open files and edits. You can cancel and continue working.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmUpdate(false)} disabled={isUpdating} autoFocus>Cancel</Button>
          <Button onClick={applyUpdate} disabled={isUpdating} variant="contained">{isUpdating ? 'Updating…' : 'Reload and update'}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
