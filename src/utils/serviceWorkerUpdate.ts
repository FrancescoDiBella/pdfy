// A first-visit tab may not have a controller. Wait for the worker itself to
// activate instead of relying on a controllerchange event before reloading.
export async function activateWaitingWorker(worker: ServiceWorker | null): Promise<void> {
  if (!worker || worker.state === 'activated') return;

  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      worker.removeEventListener('statechange', checkState);
    };
    const checkState = () => {
      if (worker.state === 'activated') {
        cleanup();
        resolve();
      } else if (worker.state === 'redundant') {
        cleanup();
        reject(new Error('The update was replaced before it could activate.'));
      }
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('The update timed out. Your current session is still open.'));
    }, 10000);

    worker.addEventListener('statechange', checkState);
    checkState();
    if (worker.state !== 'activated' && worker.state !== 'redundant') {
      try {
        worker.postMessage({ type: 'SKIP_WAITING' });
      } catch (error) {
        cleanup();
        reject(error);
      }
    }
  });
}
