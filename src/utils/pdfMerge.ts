import { PDFDocument } from 'pdf-lib';

export interface QueuedPDF {
  id: string;
  file: File;
  pageCount: number;
}

export async function preparePDFs(files: File[]) {
  const accepted: QueuedPDF[] = [];
  const rejected: string[] = [];
  for (const file of files) {
    try {
      const document = await PDFDocument.load(await file.arrayBuffer());
      if (document.getPageCount() === 0) throw new Error('Empty PDF');
      accepted.push({ id: crypto.randomUUID(), file, pageCount: document.getPageCount() });
    } catch {
      rejected.push(file.name);
    }
  }
  return { accepted, rejected };
}

// IDs keep identical filenames independent and remain stable after reordering.
export function reorderPDFs(queue: QueuedPDF[], sourceId: string, targetId: string) {
  const from = queue.findIndex(item => item.id === sourceId);
  const to = queue.findIndex(item => item.id === targetId);
  if (from < 0 || to < 0 || from === to) return queue;
  const reordered = [...queue];
  const [item] = reordered.splice(from, 1);
  reordered.splice(to, 0, item);
  return reordered;
}

export async function mergePDFs(queue: QueuedPDF[]) {
  if (queue.length < 2) throw new Error('Select at least two PDF files.');
  const merged = await PDFDocument.create();
  for (const { file } of queue) {
    const source = await PDFDocument.load(await file.arrayBuffer());
    const pages = await merged.copyPages(source, source.getPageIndices());
    pages.forEach(page => merged.addPage(page));
  }
  return merged.save();
}

export async function appendPDFsToFile(baseFile: File, incomingFiles: File[]) {
  const { accepted, rejected } = await preparePDFs(incomingFiles);
  if (accepted.length === 0) {
    return {
      combinedFile: baseFile,
      previousPageCount: 0,
      addedCount: 0,
      acceptedNames: [] as string[],
      rejected,
    };
  }
  const combined = await PDFDocument.load(await baseFile.arrayBuffer());
  const previousPageCount = combined.getPageCount();
  let addedCount = 0;
  for (const item of accepted) {
    const source = await PDFDocument.load(await item.file.arrayBuffer());
    const pages = await combined.copyPages(source, source.getPageIndices());
    pages.forEach(page => combined.addPage(page));
    addedCount += pages.length;
  }
  const combinedBytes = await combined.save();
  return {
    combinedFile: new File([combinedBytes as BlobPart], baseFile.name, { type: 'application/pdf' }),
    previousPageCount,
    addedCount,
    acceptedNames: accepted.map(item => item.file.name),
    rejected,
  };
}
