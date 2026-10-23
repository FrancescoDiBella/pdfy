import { useCallback, useEffect, useRef, useState } from 'react';

export interface PDFSession<T> {
  id: number;
  file: File;
  data: T;
}

// Validate and prepare a replacement completely before asking to discard a session.
export function usePDFSession<T>(prepare: (file: File) => Promise<T>, initialFile?: File | null) {
  // The parent remounts a tool for a new handoff; this seed never replaces edits.
  const [seed] = useState(initialFile);
  const [session, setSession] = useState<PDFSession<T> | null>(null);
  const [pending, setPending] = useState<PDFSession<T> | null>(null);
  const [isReading, setIsReading] = useState(!!seed);
  const [error, setError] = useState<string | null>(null);
  const current = useRef<PDFSession<T> | null>(null);
  const request = useRef({ sequence: 0 });

  const read = useCallback(async (source: File | (() => Promise<File>), id: number) => {
    let name = 'the sample PDF';
    try {
      const file = typeof source === 'function' ? await source() : source;
      name = file.name;
      const data = await prepare(file);
      if (id !== request.current.sequence) return;
      const next = { id, file, data };
      if (current.current) {
        setPending(next);
      } else {
        current.current = next;
        setSession(next);
      }
    } catch {
      if (id === request.current.sequence) setError(`Could not open “${name}”. Choose a valid, unprotected PDF with at least one page. Your current work has been kept.`);
    } finally {
      if (id === request.current.sequence) setIsReading(false);
    }
  }, [prepare]);

  useEffect(() => {
    const token = request.current;
    if (seed) void read(seed, ++token.sequence);
    return () => { token.sequence++; };
  }, [seed, read]);

  const open = (source: File | (() => Promise<File>)) => {
    const id = ++request.current.sequence;
    setIsReading(true);
    setError(null);
    setPending(null);
    return read(source, id);
  };

  const confirm = () => {
    if (!pending) return;
    current.current = pending;
    setSession(pending);
    setPending(null);
  };

  return { session, pending, isReading, error, open, confirm, cancel: () => setPending(null) };
}
