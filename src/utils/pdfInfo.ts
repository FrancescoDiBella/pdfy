import { PDFDocument } from 'pdf-lib';

export interface MetadataFields {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;
}

function formatDate(read: () => Date | undefined) {
  try {
    return read()?.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC') ?? 'Not recorded';
  } catch {
    return 'Unavailable';
  }
}

export async function readPDFInfo(bytes: ArrayBuffer | Uint8Array) {
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  if (!pdf.getPageCount()) throw new Error('Empty PDF');
  return {
    fields: {
      title: pdf.getTitle() ?? '', author: pdf.getAuthor() ?? '', subject: pdf.getSubject() ?? '',
      keywords: pdf.getKeywords() ?? '', creator: pdf.getCreator() ?? '', producer: pdf.getProducer() ?? '',
    },
    creationDate: formatDate(() => pdf.getCreationDate()),
    modificationDate: formatDate(() => pdf.getModificationDate()),
    pages: pdf.getPages().map((page, index) => ({
      number: index + 1, width: page.getWidth(), height: page.getHeight(), rotation: page.getRotation().angle,
    })),
  };
}

export async function writePDFInfo(bytes: ArrayBuffer | Uint8Array, fields: MetadataFields, clear = false) {
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  pdf.setTitle(clear ? '' : fields.title);
  pdf.setAuthor(clear ? '' : fields.author);
  pdf.setSubject(clear ? '' : fields.subject);
  pdf.setKeywords(clear ? [] : fields.keywords.split(',').map(word => word.trim()).filter(Boolean));
  pdf.setCreator(clear ? '' : fields.creator);
  pdf.setProducer(clear ? '' : fields.producer);
  if (!clear) pdf.setModificationDate(new Date());
  return pdf.save();
}
