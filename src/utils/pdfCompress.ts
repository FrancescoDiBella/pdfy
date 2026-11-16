import { PDFDocument } from 'pdf-lib';

export type CompressPresetId = 'lossless' | 'balanced' | 'maximum' | 'custom';

export interface CompressOptions {
  preset: CompressPresetId;
  dpi: number;
  jpegQuality: number;
  grayscale: boolean;
  stripMetadata: boolean;
  flattenForms: boolean;
}

export interface PDFSizeAnalysis {
  pageCount: number;
  originalBytes: number;
  averageBytesPerPage: number;
  formFieldCount: number;
  hasMetadata: boolean;
}

export interface CompressSavingsSummary {
  originalBytes: number;
  compressedBytes: number;
  savedBytes: number;
  percentSaved: number;
  shrank: boolean;
}

export const COMPRESS_PRESETS: Array<{
  id: Exclude<CompressPresetId, 'custom'>;
  label: string;
  description: string;
  patch: Partial<CompressOptions>;
}> = [
  {
    id: 'lossless',
    label: 'Lossless Cleanup',
    description: 'Re-packs object streams while keeping 100% sharp vector text and original resolution.',
    patch: { preset: 'lossless', stripMetadata: false, flattenForms: false },
  },
  {
    id: 'balanced',
    label: 'Balanced (144 DPI)',
    description: 'Shrinks heavy scanned PDFs while keeping body text crisp for reading and printing.',
    patch: { preset: 'balanced', dpi: 144, jpegQuality: 0.74, grayscale: false, stripMetadata: false, flattenForms: true },
  },
  {
    id: 'maximum',
    label: 'Maximum Shrink (108 DPI)',
    description: 'Compact JPEG + optional grayscale optimization tailored for strict email/upload limits.',
    patch: { preset: 'maximum', dpi: 108, jpegQuality: 0.56, grayscale: true, stripMetadata: true, flattenForms: true },
  },
];

export const DEFAULT_COMPRESS_OPTIONS: CompressOptions = {
  preset: 'balanced',
  dpi: 144,
  jpegQuality: 0.74,
  grayscale: false,
  stripMetadata: false,
  flattenForms: true,
};

export function formatByteSize(bytes: number): string {
  const abs = Math.max(0, bytes);
  if (abs < 1024) return `${abs} B`;
  if (abs < 1024 * 1024) return `${(abs / 1024).toFixed(1)} KB`;
  return `${(abs / (1024 * 1024)).toFixed(2)} MB`;
}

export function computeSavingsSummary(originalBytes: number, compressedBytes: number): CompressSavingsSummary {
  const safeOriginal = Math.max(1, originalBytes);
  const savedBytes = originalBytes - compressedBytes;
  const percentSaved = Number(((savedBytes / safeOriginal) * 100).toFixed(1));
  return {
    originalBytes,
    compressedBytes,
    savedBytes,
    percentSaved,
    shrank: compressedBytes < originalBytes,
  };
}

export function applyGrayscaleToCanvasData(data: Uint8ClampedArray): Uint8ClampedArray {
  for (let i = 0; i < data.length; i += 4) {
    const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    data[i] = lum;
    data[i + 1] = lum;
    data[i + 2] = lum;
  }
  return data;
}

export async function analyzePDFSize(bytes: Uint8Array | ArrayBuffer): Promise<PDFSizeAnalysis> {
  const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const pdf = await PDFDocument.load(raw, { updateMetadata: false });
  const pageCount = pdf.getPageCount();
  if (!pageCount) throw new Error('This PDF has no pages.');

  let formFieldCount: number;
  try {
    formFieldCount = pdf.getForm().getFields().length;
  } catch {
    formFieldCount = 0;
  }

  const hasMetadata = Boolean(
    pdf.getTitle()
    || pdf.getAuthor()
    || pdf.getSubject()
    || pdf.getCreator()
    || pdf.getProducer()
    || (pdf.getKeywords()?.length ?? 0) > 0,
  );

  return {
    pageCount,
    originalBytes: raw.byteLength,
    averageBytesPerPage: Math.round(raw.byteLength / pageCount),
    formFieldCount,
    hasMetadata,
  };
}

export async function optimizePDFLossless(
  bytes: Uint8Array | ArrayBuffer,
  options: Pick<CompressOptions, 'stripMetadata' | 'flattenForms'>,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes, { updateMetadata: !options.stripMetadata });
  if (!pdf.getPageCount()) throw new Error('This PDF has no pages.');

  if (options.flattenForms) {
    try {
      const form = pdf.getForm();
      if (form.getFields().length > 0) {
        form.flatten();
      }
    } catch {
      // Ignore unparseable form dictionaries during lossless re-pack
    }
  }

  if (options.stripMetadata) {
    pdf.setTitle('');
    pdf.setAuthor('');
    pdf.setSubject('');
    pdf.setCreator('');
    pdf.setProducer('');
    pdf.setKeywords([]);
  }

  return await pdf.save({ useObjectStreams: true });
}
