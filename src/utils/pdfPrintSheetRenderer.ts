import { PDFDocument } from 'pdf-lib';
import { pdfjs } from 'react-pdf';
import { pdfDocumentOptions } from './pdfRendering.ts';
import { applyColorTransformToImageData } from './pdfPrint.ts';
import type { ComposedPrintResult, PrintColorMode, RasterizedPrintPage } from './pdfPrint.ts';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

const MAX_CANVAS_PIXELS = 16_000_000;
const PRINT_ROOT_ID = 'pdfy-print-root';
const PRINT_STYLE_ID = 'pdfy-print-page-style';

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('Could not encode rendered print sheet.'));
    }, 'image/png');
  });
}

let activeAfterPrint: (() => void) | null = null;

async function renderSheetCanvas(
  pdf: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>,
  pageNumber: number,
  colorMode: PrintColorMode,
  targetScale: number,
): Promise<{ canvas: HTMLCanvasElement; widthPt: number; heightPt: number }> {
  const page = await pdf.getPage(pageNumber);
  try {
    const baseViewport = page.getViewport({ scale: 1 });
    const maxScaleForMemory = Math.sqrt(MAX_CANVAS_PIXELS / Math.max(1, baseViewport.width * baseViewport.height));
    const scale = Math.max(0.1, Math.min(targetScale, maxScaleForMemory));
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const context = canvas.getContext('2d', { willReadFrequently: colorMode !== 'color' });
    if (!context) throw new Error('Canvas 2D context is unavailable.');

    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvas,
      canvasContext: context,
      viewport,
      annotationMode: pdfjs.AnnotationMode.ENABLE,
    }).promise;

    if (colorMode !== 'color') {
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      applyColorTransformToImageData(imageData.data, colorMode);
      context.putImageData(imageData, 0, 0);
    }

    return { canvas, widthPt: baseViewport.width, heightPt: baseViewport.height };
  } finally {
    page.cleanup();
  }
}

export function createPrintFallbackRenderer(sourceBytes: Uint8Array) {
  let loadingTask: ReturnType<typeof pdfjs.getDocument> | null = null;
  let pdfPromise: Promise<Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>> | null = null;

  const getPdf = () => {
    if (!pdfPromise) {
      loadingTask = pdfjs.getDocument({ data: sourceBytes.slice(), ...pdfDocumentOptions });
      pdfPromise = loadingTask.promise;
    }
    return pdfPromise;
  };

  return {
    renderPage: async (pageIndex: number): Promise<RasterizedPrintPage | null> => {
      const pdf = await getPdf();
      const { canvas, widthPt, heightPt } = await renderSheetCanvas(pdf, pageIndex + 1, 'color', 3);
      try {
        const blob = await canvasToBlob(canvas);
        return {
          bytes: new Uint8Array(await blob.arrayBuffer()),
          mimeType: 'image/png',
          widthPt,
          heightPt,
        };
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }
    },
    dispose: async (): Promise<void> => {
      if (loadingTask) {
        const task = loadingTask;
        loadingTask = null;
        pdfPromise = null;
        await task.destroy().catch(() => {});
      }
    },
  };
}

export async function buildColorTransformedPDF(
  composed: ComposedPrintResult,
  colorMode: PrintColorMode,
  onProgress?: (completed: number, total: number) => void,
): Promise<Uint8Array> {
  if (colorMode === 'color') return composed.bytes;

  const task = pdfjs.getDocument({ data: composed.bytes.slice(), ...pdfDocumentOptions });
  try {
    const pdf = await task.promise;
    const outDoc = await PDFDocument.create();
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      onProgress?.(pageNumber - 1, pdf.numPages);
      const { canvas, widthPt, heightPt } = await renderSheetCanvas(pdf, pageNumber, colorMode, 2.25);
      try {
        const blob = await canvasToBlob(canvas);
        const pngBytes = new Uint8Array(await blob.arrayBuffer());
        const embedded = await outDoc.embedPng(pngBytes);
        const page = outDoc.addPage([widthPt, heightPt]);
        page.drawImage(embedded, { x: 0, y: 0, width: widthPt, height: heightPt });
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }
      onProgress?.(pageNumber, pdf.numPages);
    }
    return await outDoc.save();
  } finally {
    await task.destroy();
  }
}

export function clearPrintSheets(): void {
  if (activeAfterPrint) {
    window.removeEventListener('afterprint', activeAfterPrint);
    activeAfterPrint = null;
  }
  document.body.classList.remove('pdfy-printing');
  const existingRoot = document.getElementById(PRINT_ROOT_ID);
  if (existingRoot) {
    existingRoot.querySelectorAll('img').forEach(img => {
      if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
    });
    existingRoot.remove();
  }
  document.getElementById(PRINT_STYLE_ID)?.remove();
}

export async function prepareAndInvokeOSPrint(
  composed: ComposedPrintResult,
  colorMode: PrintColorMode,
  onProgress?: (completed: number, total: number) => void,
): Promise<() => void> {
  clearPrintSheets();

  const task = pdfjs.getDocument({ data: composed.bytes.slice(), ...pdfDocumentOptions });
  const objectUrls: string[] = [];

  try {
    const pdf = await task.promise;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      onProgress?.(pageNumber - 1, pdf.numPages);
      const { canvas } = await renderSheetCanvas(pdf, pageNumber, colorMode, 2.5);
      try {
        const blob = await canvasToBlob(canvas);
        objectUrls.push(URL.createObjectURL(blob));
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }
      onProgress?.(pageNumber, pdf.numPages);
    }

    const style = document.createElement('style');
    style.id = PRINT_STYLE_ID;
    const widthPt = Math.round(composed.sheetWidth * 100) / 100;
    const heightPt = Math.round(composed.sheetHeight * 100) / 100;
    style.textContent = `@media print { @page { size: ${widthPt}pt ${heightPt}pt; margin: 0; } }`;
    document.head.appendChild(style);

    const root = document.createElement('div');
    root.id = PRINT_ROOT_ID;
    root.setAttribute('aria-hidden', 'true');

    const decodePromises: Promise<void>[] = [];
    for (const url of objectUrls) {
      const sheet = document.createElement('div');
      sheet.className = 'pdfy-print-sheet';
      const img = document.createElement('img');
      img.alt = '';
      img.src = url;
      const loaded = new Promise<void>(resolve => {
        img.onload = () => {
          if (typeof img.decode === 'function') {
            void img.decode().catch(() => {}).finally(() => resolve());
          } else {
            resolve();
          }
        };
        img.onerror = () => resolve();
      });
      decodePromises.push(loaded);
      sheet.appendChild(img);
      root.appendChild(sheet);
    }

    document.body.classList.add('pdfy-printing');
    document.body.appendChild(root);
    await Promise.all(decodePromises);

    const cleanup = () => {
      clearPrintSheets();
    };
    activeAfterPrint = cleanup;
    window.addEventListener('afterprint', cleanup, { once: true });

    window.print();
    return cleanup;
  } catch (error) {
    objectUrls.forEach(url => URL.revokeObjectURL(url));
    clearPrintSheets();
    throw error;
  } finally {
    await task.destroy();
  }
}
