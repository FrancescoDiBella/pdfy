// Transient Web Share Target handoff for Android PWAs.
// Shared PDFs stay in memory (with a short-lived IndexedDB backup deleted immediately on read)
// and are NEVER written to CacheStorage.
(() => {
  const SHARE_DB_NAME = 'pdfy-share-handoff';
  const SHARE_STORE_NAME = 'shares';
  const SHARE_TTL_MS = 2 * 60 * 1000;
  const CONSUME_MESSAGE = 'PDFY_CONSUME_SHARED_FILES';
  const pendingShares = new Map();

  function pruneMemoryShares() {
    const cutoff = Date.now() - SHARE_TTL_MS;
    for (const [token, entry] of pendingShares.entries()) {
      if (entry.createdAt < cutoff) pendingShares.delete(token);
    }
  }

  function openShareDb() {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    return new Promise(resolve => {
      try {
        const request = indexedDB.open(SHARE_DB_NAME, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(SHARE_STORE_NAME)) {
            db.createObjectStore(SHARE_STORE_NAME);
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async function serializeFiles(files) {
    const now = Date.now();
    return await Promise.all(files.map(async file => ({
      name: file.name || 'shared.pdf',
      type: file.type || 'application/pdf',
      lastModified: typeof file.lastModified === 'number' && Number.isFinite(file.lastModified) ? file.lastModified : now,
      buffer: await file.arrayBuffer(),
    })));
  }

  async function saveShareToIdb(token, records) {
    const db = await openShareDb();
    if (!db) return;
    try {
      await new Promise(resolve => {
        const tx = db.transaction(SHARE_STORE_NAME, 'readwrite');
        tx.objectStore(SHARE_STORE_NAME).put({ createdAt: Date.now(), records }, token);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      });
    } catch {
      // In-memory handoff still succeeds if IndexedDB is unavailable.
    } finally {
      db.close();
    }
  }

  async function deleteShareFromIdb(token) {
    const db = await openShareDb();
    if (!db) return;
    try {
      await new Promise(resolve => {
        const tx = db.transaction(SHARE_STORE_NAME, 'readwrite');
        tx.objectStore(SHARE_STORE_NAME).delete(token);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      });
    } catch {
      // Best-effort cleanup.
    } finally {
      db.close();
    }
  }

  self.addEventListener('fetch', event => {
    if (event.request.method !== 'POST') return;
    const targetPath = new URL('share-target', self.registration.scope).pathname;
    let requestPath;
    try {
      requestPath = new URL(event.request.url).pathname;
    } catch {
      return;
    }
    if (requestPath !== targetPath) return;

    event.respondWith((async () => {
      pruneMemoryShares();
      const token = self.crypto && typeof self.crypto.randomUUID === 'function'
        ? self.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      try {
        const formData = await event.request.formData();
        const named = formData.getAll('pdf').filter(item => item instanceof File && item.size > 0);
        const files = named.length > 0
          ? named
          : Array.from(formData.values()).filter(item => item instanceof File && item.size > 0);
        if (files.length > 0) {
          const records = await serializeFiles(files);
          pendingShares.set(token, { records, createdAt: Date.now() });
          await saveShareToIdb(token, records);
        }
      } catch {
        // Redirect cleanly even if formData parsing fails; the app will show a notice if empty.
      }
      const redirectUrl = new URL(`./?shared=${encodeURIComponent(token)}`, self.registration.scope);
      return Response.redirect(redirectUrl.href, 303);
    })());
  });

  self.addEventListener('message', event => {
    const data = event.data;
    if (!data || data.type !== CONSUME_MESSAGE || typeof data.token !== 'string') return;
    const port = event.ports && event.ports[0];
    if (!port) return;

    const entry = pendingShares.get(data.token);
    pendingShares.delete(data.token);
    pruneMemoryShares();

    const records = entry ? entry.records : [];
    event.waitUntil(deleteShareFromIdb(data.token));
    port.postMessage({ records });
  });
})();
