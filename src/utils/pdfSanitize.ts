import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFObject,
  PDFRawStream,
  PDFRef,
  PDFStream,
} from 'pdf-lib';

export type FormSanitizeAction = 'flatten' | 'remove' | 'keep';

export interface PrivacyAuditReport {
  pageCount: number;
  infoFieldsPresent: string[];
  customInfoKeys: string[];
  hasDates: boolean;
  hasXmpMetadata: boolean;
  xmpByteLength: number;
  annotationCount: number;
  formFieldCount: number;
  hasAcroForm: boolean;
  hasOutlines: boolean;
  hasDocumentActions: boolean;
  hasEmbeddedFiles: boolean;
  totalFindings: number;
}

export interface SanitizeOptions {
  stripInfoAndDates: boolean;
  stripXmpMetadata: boolean;
  stripAnnotations: boolean;
  formAction: FormSanitizeAction;
  stripOutlines: boolean;
  stripActionsAndAttachments: boolean;
}

export interface SanitizeResult {
  bytes: Uint8Array;
  before: PrivacyAuditReport;
  after: PrivacyAuditReport;
  removedCategories: string[];
}

export const DEFAULT_SANITIZE_OPTIONS: SanitizeOptions = {
  stripInfoAndDates: true,
  stripXmpMetadata: true,
  stripAnnotations: true,
  formAction: 'flatten',
  stripOutlines: true,
  stripActionsAndAttachments: true,
};

const STANDARD_INFO_KEYS = new Set([
  'Title',
  'Author',
  'Subject',
  'Keywords',
  'Creator',
  'Producer',
  'CreationDate',
  'ModDate',
]);

function readStreamByteLength(obj: unknown): number {
  if (obj instanceof PDFRawStream) {
    return obj.getContents().byteLength;
  }
  if (obj instanceof PDFStream) {
    return obj.getContents().byteLength;
  }
  return 0;
}

function getInfoDict(pdf: PDFDocument): PDFDict | undefined {
  const raw = pdf.context.trailerInfo.Info;
  if (!raw) return undefined;
  const lookedUp = pdf.context.lookup(raw);
  return lookedUp instanceof PDFDict ? lookedUp : undefined;
}

function getNamesDict(pdf: PDFDocument): PDFDict | undefined {
  const raw = pdf.catalog.get(PDFName.of('Names'));
  if (!raw) return undefined;
  const lookedUp = pdf.context.lookup(raw);
  return lookedUp instanceof PDFDict ? lookedUp : undefined;
}

function isWidgetAnnotation(pdf: PDFDocument, annotRef: PDFObject | undefined): boolean {
  const annot = pdf.context.lookup(annotRef);
  if (!(annot instanceof PDFDict)) return false;
  const subtype = annot.get(PDFName.of('Subtype'));
  return subtype instanceof PDFName && subtype.asString() === '/Widget';
}

function safeCheckDate(reader: () => Date | undefined): boolean {
  try {
    return reader() !== undefined;
  } catch {
    return true; // Malformed date entry still exists in the Info dict.
  }
}

function inspectLoadedPDF(pdf: PDFDocument): PrivacyAuditReport {
  const pageCount = pdf.getPageCount();
  if (!pageCount) throw new Error('Empty PDF');

  const infoFieldsPresent: string[] = [];
  const fieldChecks: Array<[string, string | undefined]> = [
    ['Title', pdf.getTitle()],
    ['Author', pdf.getAuthor()],
    ['Subject', pdf.getSubject()],
    ['Keywords', pdf.getKeywords()],
    ['Creator', pdf.getCreator()],
    ['Producer', pdf.getProducer()],
  ];
  for (const [label, value] of fieldChecks) {
    if (value && value.trim().length > 0) {
      infoFieldsPresent.push(label);
    }
  }

  const infoDict = getInfoDict(pdf);
  const customInfoKeys: string[] = [];
  if (infoDict) {
    for (const [key] of infoDict.entries()) {
      const name = key.decodeText();
      if (!STANDARD_INFO_KEYS.has(name)) {
        customInfoKeys.push(name);
      }
    }
  }

  const hasDates = Boolean(
    safeCheckDate(() => pdf.getCreationDate())
    || safeCheckDate(() => pdf.getModificationDate())
    || infoDict?.has(PDFName.of('CreationDate'))
    || infoDict?.has(PDFName.of('ModDate')),
  );

  let xmpByteLength = 0;
  let hasXmpMetadata = false;
  const catalogMeta = pdf.catalog.get(PDFName.of('Metadata'));
  if (catalogMeta) {
    hasXmpMetadata = true;
    xmpByteLength += readStreamByteLength(pdf.context.lookup(catalogMeta));
  }

  let annotationCount = 0;
  let pageHasAdditionalActions = false;

  for (const page of pdf.getPages()) {
    const pageMeta = page.node.get(PDFName.of('Metadata'));
    if (pageMeta) {
      hasXmpMetadata = true;
      xmpByteLength += readStreamByteLength(pdf.context.lookup(pageMeta));
    }

    if (page.node.has(PDFName.of('AA'))) {
      pageHasAdditionalActions = true;
    }

    const annotsRaw = page.node.get(PDFName.of('Annots'));
    const annots = annotsRaw ? pdf.context.lookup(annotsRaw) : undefined;
    if (annots instanceof PDFArray) {
      for (let i = 0; i < annots.size(); i++) {
        const entry = annots.get(i);
        if (!isWidgetAnnotation(pdf, entry)) {
          annotationCount += 1;
        }
      }
    }
  }

  const hasAcroForm = pdf.catalog.has(PDFName.of('AcroForm'));
  let formFieldCount = 0;
  if (hasAcroForm) {
    try {
      formFieldCount = pdf.getForm().getFields().length;
    } catch {
      formFieldCount = 0;
    }
  }

  const hasOutlines = pdf.catalog.has(PDFName.of('Outlines'));
  const namesDict = getNamesDict(pdf);
  const hasJavaScript = Boolean(namesDict?.has(PDFName.of('JavaScript')));
  const hasEmbeddedFiles = Boolean(
    namesDict?.has(PDFName.of('EmbeddedFiles'))
    || pdf.catalog.has(PDFName.of('Collection')),
  );
  const hasDocumentActions = Boolean(
    pdf.catalog.has(PDFName.of('OpenAction'))
    || pdf.catalog.has(PDFName.of('AA'))
    || pageHasAdditionalActions
    || hasJavaScript,
  );

  let totalFindings = 0;
  if (infoFieldsPresent.length > 0 || customInfoKeys.length > 0 || hasDates) totalFindings += 1;
  if (hasXmpMetadata) totalFindings += 1;
  if (annotationCount > 0) totalFindings += 1;
  if (hasAcroForm || formFieldCount > 0) totalFindings += 1;
  if (hasOutlines) totalFindings += 1;
  if (hasDocumentActions || hasEmbeddedFiles) totalFindings += 1;

  return {
    pageCount,
    infoFieldsPresent,
    customInfoKeys,
    hasDates,
    hasXmpMetadata,
    xmpByteLength,
    annotationCount,
    formFieldCount,
    hasAcroForm,
    hasOutlines,
    hasDocumentActions,
    hasEmbeddedFiles,
    totalFindings,
  };
}

export async function auditPDFPrivacy(bytes: ArrayBuffer | Uint8Array): Promise<PrivacyAuditReport> {
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  return inspectLoadedPDF(pdf);
}

function filterPageAnnotations(
  pdf: PDFDocument,
  predicate: (annotRef: PDFObject | undefined) => boolean,
) {
  for (const page of pdf.getPages()) {
    const annotsRaw = page.node.get(PDFName.of('Annots'));
    const annots = annotsRaw ? pdf.context.lookup(annotsRaw) : undefined;
    if (!(annots instanceof PDFArray)) continue;

    const kept = [];
    for (let i = 0; i < annots.size(); i++) {
      const entry = annots.get(i);
      if (predicate(entry)) {
        kept.push(entry);
      } else if (entry instanceof PDFRef) {
        pdf.context.delete(entry);
      }
    }

    if (kept.length === 0) {
      page.node.delete(PDFName.of('Annots'));
      if (annotsRaw instanceof PDFRef) {
        pdf.context.delete(annotsRaw);
      }
    } else if (kept.length !== annots.size()) {
      const nextArray = pdf.context.obj(kept);
      page.node.set(PDFName.of('Annots'), nextArray);
    }
  }
}

export async function sanitizePDF(
  bytes: ArrayBuffer | Uint8Array,
  options: SanitizeOptions = DEFAULT_SANITIZE_OPTIONS,
): Promise<SanitizeResult> {
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  const before = inspectLoadedPDF(pdf);
  const removedCategories: string[] = [];

  // 1. Forms first so flatten() preserves field values cleanly before any annotation cleanup.
  if (options.formAction !== 'keep' && (before.hasAcroForm || before.formFieldCount > 0)) {
    if (options.formAction === 'flatten') {
      try {
        pdf.getForm().flatten();
      } catch {
        // Fallback: remove widget annotations and AcroForm if flattening fails on non-standard fields.
        filterPageAnnotations(pdf, entry => !isWidgetAnnotation(pdf, entry));
      }
    } else {
      filterPageAnnotations(pdf, entry => !isWidgetAnnotation(pdf, entry));
    }
    const acroRef = pdf.catalog.get(PDFName.of('AcroForm'));
    pdf.catalog.delete(PDFName.of('AcroForm'));
    if (acroRef instanceof PDFRef) {
      pdf.context.delete(acroRef);
    }
    removedCategories.push(options.formAction === 'flatten' ? 'Interactive forms (flattened)' : 'Interactive forms (removed)');
  }

  // 2. Info dictionary & timestamps
  if (options.stripInfoAndDates) {
    const infoRef = pdf.context.trailerInfo.Info;
    delete pdf.context.trailerInfo.Info;
    if (infoRef instanceof PDFRef) {
      pdf.context.delete(infoRef);
    }
    if (before.infoFieldsPresent.length > 0 || before.customInfoKeys.length > 0 || before.hasDates) {
      removedCategories.push('Info dictionary & timestamps');
    }
  }

  // 3. XMP metadata streams (catalog and per-page)
  if (options.stripXmpMetadata) {
    const catalogMeta = pdf.catalog.get(PDFName.of('Metadata'));
    if (catalogMeta) {
      pdf.catalog.delete(PDFName.of('Metadata'));
      if (catalogMeta instanceof PDFRef) {
        pdf.context.delete(catalogMeta);
      }
    }
    for (const page of pdf.getPages()) {
      const pageMeta = page.node.get(PDFName.of('Metadata'));
      if (pageMeta) {
        page.node.delete(PDFName.of('Metadata'));
        if (pageMeta instanceof PDFRef) {
          pdf.context.delete(pageMeta);
        }
      }
    }
    if (before.hasXmpMetadata) {
      removedCategories.push('XMP XML metadata');
    }
  }

  // 4. Page annotations & comments (preserving widget annotations if forms are kept)
  if (options.stripAnnotations) {
    filterPageAnnotations(pdf, entry => options.formAction === 'keep' && isWidgetAnnotation(pdf, entry));
    if (before.annotationCount > 0) {
      removedCategories.push('Annotations & comments');
    }
  }

  // 5. Document outline / bookmarks
  if (options.stripOutlines) {
    const outlinesRef = pdf.catalog.get(PDFName.of('Outlines'));
    if (outlinesRef) {
      pdf.catalog.delete(PDFName.of('Outlines'));
      if (outlinesRef instanceof PDFRef) {
        pdf.context.delete(outlinesRef);
      }
    }
    if (before.hasOutlines) {
      removedCategories.push('Document outline / bookmarks');
    }
  }

  // 6. Document actions, JavaScript, and embedded files
  if (options.stripActionsAndAttachments) {
    const openAction = pdf.catalog.get(PDFName.of('OpenAction'));
    if (openAction) {
      pdf.catalog.delete(PDFName.of('OpenAction'));
      if (openAction instanceof PDFRef) pdf.context.delete(openAction);
    }
    const catalogAA = pdf.catalog.get(PDFName.of('AA'));
    if (catalogAA) {
      pdf.catalog.delete(PDFName.of('AA'));
      if (catalogAA instanceof PDFRef) pdf.context.delete(catalogAA);
    }
    const collection = pdf.catalog.get(PDFName.of('Collection'));
    if (collection) {
      pdf.catalog.delete(PDFName.of('Collection'));
      if (collection instanceof PDFRef) pdf.context.delete(collection);
    }
    for (const page of pdf.getPages()) {
      const pageAA = page.node.get(PDFName.of('AA'));
      if (pageAA) {
        page.node.delete(PDFName.of('AA'));
        if (pageAA instanceof PDFRef) pdf.context.delete(pageAA);
      }
    }
    const namesRaw = pdf.catalog.get(PDFName.of('Names'));
    const namesDict = namesRaw ? pdf.context.lookup(namesRaw) : undefined;
    if (namesDict instanceof PDFDict) {
      for (const keyName of ['JavaScript', 'EmbeddedFiles'] as const) {
        const entry = namesDict.get(PDFName.of(keyName));
        if (entry) {
          namesDict.delete(PDFName.of(keyName));
          if (entry instanceof PDFRef) pdf.context.delete(entry);
        }
      }
      if (namesDict.keys().length === 0) {
        pdf.catalog.delete(PDFName.of('Names'));
        if (namesRaw instanceof PDFRef) pdf.context.delete(namesRaw);
      }
    }
    if (before.hasDocumentActions || before.hasEmbeddedFiles) {
      removedCategories.push('Actions, JavaScript & attachments');
    }
  }

  const savedBytes = await pdf.save({
    useObjectStreams: true,
    updateFieldAppearances: false,
  });

  const after = await auditPDFPrivacy(savedBytes);
  return {
    bytes: savedBytes,
    before,
    after,
    removedCategories,
  };
}
