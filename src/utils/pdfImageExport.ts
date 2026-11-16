import { pdfjs } from 'react-pdf';
import { pdfDocumentOptions } from './pdfRendering.ts';
import { parsePageRange } from './pageRanges.ts';
import { applyScanFilterToImageData } from './pdfConvert.ts';
import type { ImageScanFilter } from './pdfConvert.ts';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

const MAX_CANVAS_PIXELS = 16_000_000;

export interface LoadedImageSource {
  id: string;
  name: string;
  mimeType: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
  originalBytes: Uint8Array;
  previewUrl: string;
  rotation: 0 | 90 | 180 | 270;
}

export interface RenderedPDFImage {
  pageNumber: number;
  filename: string;
  blob: Blob;
  previewUrl: string;
  width: number;
  height: number;
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: 'image/png' | 'image/jpeg', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('Could not encode image data.'));
    }, mimeType, quality);
  });
}

async function decodeImageToCanvas(file: File): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const width = Math.max(1, img.naturalWidth);
    const height = Math.max(1, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context is unavailable.');
    context.drawImage(img, 0, 0, width, height);
    return { canvas, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function prepareImageFiles(files: File[]): Promise<{ accepted: LoadedImageSource[]; rejected: string[] }> {
  const accepted: LoadedImageSource[] = [];
  const rejected: string[] = [];

  for (const file of files) {
    const lower = file.name.toLowerCase();
    const isSupportedType =
      file.type === 'image/png'
      || file.type === 'image/jpeg'
      || file.type === 'image/webp'
      || lower.endsWith('.png')
      || lower.endsWith('.jpg')
      || lower.endsWith('.jpeg')
      || lower.endsWith('.webp');

    if (!isSupportedType) {
      rejected.push(file.name);
      continue;
    }

    try {
      const { canvas, width, height } = await decodeImageToCanvas(file);
      const outputMime: 'image/png' | 'image/jpeg' = file.type === 'image/jpeg' || lower.endsWith('.jpg') || lower.endsWith('.jpeg')
        ? 'image/jpeg'
        : 'image/png';
      const normalizedBlob = await canvasToBlob(canvas, outputMime, outputMime === 'image/jpeg' ? 0.92 : undefined);
      canvas.width = 0;
      canvas.height = 0;

      const bytes = new Uint8Array(await normalizedBlob.arrayBuffer());
      const previewUrl = URL.createObjectURL(normalizedBlob);
      accepted.push({
        id: crypto.randomUUID(),
        name: file.name,
        mimeType: outputMime,
        width,
        height,
        originalBytes: bytes,
        previewUrl,
        rotation: 0,
      });
    } catch {
      rejected.push(file.name);
    }
  }

  return { accepted, rejected };
}

export async function encodeImageWithFilter(source: LoadedImageSource, filter: ImageScanFilter): Promise<{ mimeType: 'image/png' | 'image/jpeg'; bytes: Uint8Array }> {
  if (filter === 'original') {
    return { mimeType: source.mimeType, bytes: source.originalBytes };
  }

  const blob = new Blob([source.originalBytes as BlobPart], { type: source.mimeType });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas 2D context is unavailable.');
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    applyScanFilterToImageData(imageData.data);
    context.putImageData(imageData, 0, 0);
    const outBlob = await canvasToBlob(canvas, 'image/jpeg', 0.88);
    canvas.width = 0;
    canvas.height = 0;
    return {
      mimeType: 'image/jpeg',
      bytes: new Uint8Array(await outBlob.arrayBuffer()),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportPDFPagesToImages(
  pdfBytes: Uint8Array,
  fileName: string,
  options: {
    rangeMode: 'all' | 'custom';
    pageRange: string;
    format: 'image/png' | 'image/jpeg';
    dpi: 96 | 150 | 250;
    jpegQuality: number;
  },
  onProgress?: (completed: number, total: number) => void,
): Promise<RenderedPDFImage[]> {
  const task = pdfjs.getDocument({ data: pdfBytes.slice(), ...pdfDocumentOptions });
  const results: RenderedPDFImage[] = [];
  const baseName = fileName.replace(/\.pdf$/i, '') || 'document';
  const ext = options.format === 'image/png' ? 'png' : 'jpg';

  try {
    const pdf = await task.promise;
    const selectedIndices = options.rangeMode === 'custom'
      ? parsePageRange(options.pageRange, pdf.numPages)
      : Array.from({ length: pdf.numPages }, (_, i) => i);

    if (!selectedIndices.length) throw new Error('Select at least one page to export.');

    const targetScale = options.dpi / 72;

    for (let idx = 0; idx < selectedIndices.length; idx++) {
      onProgress?.(idx, selectedIndices.length);
      const pageNumber = selectedIndices[idx] + 1;
      const page = await pdf.getPage(pageNumber);
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
        const blob = await canvasToBlob(canvas, options.format, options.format === 'image/jpeg' ? options.jpegQuality : undefined);
        const width = canvas.width;
        const height = canvas.height;
        canvas.width = 0;
        canvas.height = 0;

        results.push({
          pageNumber,
          filename: `${baseName}_page_${pageNumber}.${ext}`,
          blob,
          previewUrl: URL.createObjectURL(blob),
          width,
          height,
        });
      } finally {
        page.cleanup();
      }
      onProgress?.(idx + 1, selectedIndices.length);
    }

    return results;
  } catch (error) {
    results.forEach(item => URL.revokeObjectURL(item.previewUrl));
    throw error;
  } finally {
    await task.destroy();
  }
}
