import { pdfjs } from 'react-pdf';
import { pdfDocumentOptions } from './pdfRendering.ts';
import {
  assembleBurnedInRedactions,
  REDACTION_BURN_IN_DPI,
  type RasterizedPageImage,
} from './pdfRedaction.ts';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

const MAX_CANVAS_PIXELS = 16_000_000;

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('Could not encode flattened PDF page.'));
    }, 'image/png');
  });
}

export async function burnInPDFRedactions(
  editedPdfBytes: Uint8Array,
  redactedPageIndices: readonly number[],
  dpi = REDACTION_BURN_IN_DPI,
): Promise<Uint8Array> {
  if (redactedPageIndices.length === 0) {
    return editedPdfBytes;
  }

  const task = pdfjs.getDocument({ data: editedPdfBytes.slice(), ...pdfDocumentOptions });
  try {
    const pdf = await task.promise;
    const targetScale = Math.max(72, Math.min(300, dpi)) / 72;

    return await assembleBurnedInRedactions(
      editedPdfBytes,
      redactedPageIndices,
      async (pageIndex): Promise<RasterizedPageImage> => {
        const page = await pdf.getPage(pageIndex + 1);
        try {
          const baseViewport = page.getViewport({ scale: 1 });
          const maxScale = Math.sqrt(MAX_CANVAS_PIXELS / Math.max(1, baseViewport.width * baseViewport.height));
          const scale = Math.max(0.1, Math.min(targetScale, maxScale));
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(viewport.width));
          canvas.height = Math.max(1, Math.round(viewport.height));
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Canvas 2D context is unavailable.');

          context.fillStyle = '#FFFFFF';
          context.fillRect(0, 0, canvas.width, canvas.height);

          await page.render({ canvas, canvasContext: context, viewport }).promise;

          const pngBlob = await canvasToPngBlob(canvas);
          const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());
          canvas.width = 0;
          canvas.height = 0;

          return {
            mimeType: 'image/png',
            bytes: pngBytes,
            widthPt: baseViewport.width,
            heightPt: baseViewport.height,
          };
        } finally {
          page.cleanup();
        }
      },
    );
  } finally {
    await task.destroy();
  }
}
