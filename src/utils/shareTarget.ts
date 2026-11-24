export const SHARE_QUERY_PARAM = 'shared';
export const SHARE_CONSUME_MESSAGE = 'PDFY_CONSUME_SHARED_FILES';

const SHARE_DB_NAME = 'pdfy-share-handoff';
const SHARE_STORE_NAME = 'shares';
const SHARE_TTL_MS = 2 * 60 * 1000;

interface StoredShareRecord {
  name: string;
  type: string;
  lastModified: number;
  buffer: ArrayBuffer;
}

interface StoredShareEntry {
  createdAt: number;
  records: StoredShareRecord[];
}

export function extractSharedTokenFromSearch(search: string): { token: string | null; cleanSearch: string } {
  const params = new URLSearchParams(search);
  const token = params.get(SHARE_QUERY_PARAM)?.trim() || null;
  if (!token) {
    return { token: null, cleanSearch: search };
  }
  params.delete(SHARE_QUERY_PARAM);
  const rest = params.toString();
  return { token, cleanSearch: rest ? `?${rest}` : '' };
}

function openShareDb(): Promise<IDBDatabase | null> {
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

async function takeSharedFilesFromIdb(token: string): Promise<File[]> {
  const db = await openShareDb();
  if (!db) return [];
  try {
    const entry = await new Promise<StoredShareEntry | null>(resolve => {
      const tx = db.transaction(SHARE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(SHARE_STORE_NAME);
      const getReq = store.get(token);
      let found: StoredShareEntry | null = null;
      getReq.onsuccess = () => {
        found = (getReq.result as StoredShareEntry | undefined) ?? null;
        store.delete(token);
      };
      tx.oncomplete = () => resolve(found);
      tx.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    });
    if (!entry || !Array.isArray(entry.records) || Date.now() - entry.createdAt > SHARE_TTL_MS) {
      return [];
    }
    return entry.records.map(record => new File([record.buffer], record.name || 'shared.pdf', {
      type: record.type || 'application/pdf',
      lastModified: record.lastModified || Date.now(),
    }));
  } catch {
    return [];
  } finally {
    db.close();
  }
}

async function requestFromServiceWorker(token: string): Promise<File[]> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return [];
  let worker: ServiceWorker | null = navigator.serviceWorker.controller;
  if (!worker) {
    try {
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>(resolve => window.setTimeout(() => resolve(null), 1500)),
      ]);
      worker = registration?.active ?? null;
    } catch {
      worker = null;
    }
  }
  if (!worker) return [];

  return await new Promise<File[]>(resolve => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => resolve([]), 1500);
    channel.port1.onmessage = event => {
      window.clearTimeout(timer);
      const payload = event.data as { records?: StoredShareRecord[]; files?: unknown[] } | null;
      if (Array.isArray(payload?.records)) {
        resolve(payload.records.map(record => new File([record.buffer], record.name || 'shared.pdf', {
          type: record.type || 'application/pdf',
          lastModified: record.lastModified || Date.now(),
        })));
      } else if (Array.isArray(payload?.files)) {
        resolve(payload.files.filter((item): item is File => item instanceof File));
      } else {
        resolve([]);
      }
    };
    try {
      worker.postMessage({ type: SHARE_CONSUME_MESSAGE, token }, [channel.port2]);
    } catch {
      window.clearTimeout(timer);
      resolve([]);
    }
  });
}

/**
 * Retrieves and immediately deletes any PDF files shared via Android's Web Share Target API.
 */
export async function consumeSharedPdfFiles(token: string): Promise<File[]> {
  const fromWorker = await requestFromServiceWorker(token);
  const fromIdb = await takeSharedFilesFromIdb(token);
  return fromWorker.length > 0 ? fromWorker : fromIdb;
}
