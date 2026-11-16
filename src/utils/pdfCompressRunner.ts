import { PDFDocument } from 'pdf-lib';
import { pdfjs } from 'react-pdf';
import { pdfDocumentOptions } from './pdfRendering.ts';
import { applyGrayscaleToCanvasData, optimizePDFLossless } from './pdfCompress.ts';
import type { CompressOptions } from './pdfCompress.ts';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

const MAX_CANVAS_PIXELS = 16_000_000;

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('Could not encode compressed PDF page.'));
    }, 'image/jpeg', Math.max(0.25, Math.min(0.95, quality)));
  });
}

export async function runPDFCompression(
  sourceBytes: Uint8Array,
  options: CompressOptions,
  onProgress?: (completed: number, total: number) => void,
): Promise<Uint8Array> {
  if (options.preset === 'lossless') {
    onProgress?.(0, 1);
    const bytes = await optimizePDFLossless(sourceBytes, options);
    onProgress?.(1, 1);
    return bytes;
  }

  const task = pdfjs.getDocument({ data: sourceBytes.slice(), ...pdfDocumentOptions });
  try {
    const pdf = await task.promise;
    const outDoc = await PDFDocument.create();

    if (!options.stripMetadata) {
      try {
        const srcMeta = await PDFDocument.load(sourceBytes, { updateMetadata: false });
        const title = srcMeta.getTitle();
        const author = srcMeta.getAuthor();
        if (title) outDoc.setTitle(title);
        if (author) outDoc.setAuthor(author);
      } catch {
        // Proceed cleanly without copying metadata if header fields fail to parse
      }
    }

    const targetScale = Math.max(72, Math.min(300, options.dpi)) / 72;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      onProgress?.(pageNumber - 1, pdf.numPages);
      const page = await pdf.getPage(pageNumber);
      try {
        const baseViewport = page.getViewport({ scale: 1 });
        const maxScale = Math.sqrt(MAX_CANVAS_PIXELS / Math.max(1, baseViewport.width * baseViewport.height));
        const scale = Math.max(0.1, Math.min(targetScale, maxScale));
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));
        const context = canvas.getContext('2d', { willReadFrequently: options.grayscale });
        if (!context) throw new Error('Canvas 2D context is unavailable.');

        context.fillStyle = '#FFFFFF';
        context.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvas, canvasContext: context, viewport }).promise;

        if (options.grayscale) {
          const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
          applyGrayscaleToCanvasData(imageData.data);
          context.putImageData(imageData, 0, 0);
        }

        const jpegBlob = await canvasToJpegBlob(canvas, options.jpegQuality);
        const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
        const embedded = await outDoc.embedJpg(jpegBytes);
        const outPage = outDoc.addPage([baseViewport.width, baseViewport.height]);
        outPage.drawImage(embedded, {
          x: 0,
          y: 0,
          width: baseViewport.width,
          height: baseViewport.height,
        });

        canvas.width = 0;
        canvas.height = 0;
      } finally {
        page.cleanup();
      }
      onProgress?.(pageNumber, pdf.numPages);
    }

    return await outDoc.save({ useObjectStreams: true });
  } finally {
    await task.destroy();
  }
}
