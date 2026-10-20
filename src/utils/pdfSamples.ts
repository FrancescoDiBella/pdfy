import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export type SampleTemplateId = 'executive-brief' | 'service-invoice' | 'multi-page-report';

export interface SampleTemplateInfo {
  id: SampleTemplateId;
  title: string;
  subtitle: string;
  pages: number;
  filename: string;
}

export const SAMPLE_TEMPLATES: SampleTemplateInfo[] = [
  {
    id: 'executive-brief',
    title: 'Executive Architecture Brief',
    subtitle: '3-page technical specification with tables & typography',
    pages: 3,
    filename: 'Executive_Architecture_Brief.pdf',
  },
  {
    id: 'service-invoice',
    title: 'Commercial Service Invoice',
    subtitle: 'Single-page itemized billing statement ready for signature',
    pages: 1,
    filename: 'Invoice_INV-2026-089.pdf',
  },
  {
    id: 'multi-page-report',
    title: 'Quarterly Operations Dossier',
    subtitle: '4-page multi-section document ideal for splitting & organizing',
    pages: 4,
    filename: 'Quarterly_Operations_Dossier.pdf',
  },
];

export async function generateSamplePDF(templateId: SampleTemplateId = 'executive-brief'): Promise<File> {
  const doc = await PDFDocument.create();
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await doc.embedFont(StandardFonts.Courier);

  doc.setTitle(
    templateId === 'service-invoice'
      ? 'Commercial Service Invoice #INV-2026-089'
      : templateId === 'multi-page-report'
        ? 'Quarterly Operations Dossier Q3 2026'
        : 'Executive Systems Architecture Brief'
  );
  doc.setAuthor('PDFy Studio Pro Workspace');
  doc.setSubject('Client-Side Document Processing & Vector Layout');
  doc.setKeywords(['PDF', 'Architecture', 'Invoice', 'Local-First', 'Vector']);
  doc.setProducer('PDFy Studio Engine');
  doc.setCreator('PDFy Studio Pro');

  if (templateId === 'service-invoice') {
    const page = doc.addPage([595.28, 841.89]); // A4
    const { width, height } = page.getSize();

    // Header band
    page.drawRectangle({
      x: 0,
      y: height - 110,
      width,
      height: 110,
      color: rgb(0.06, 0.09, 0.16),
    });

    page.drawText('ATELIER VANCE & ASSOCIATES', {
      x: 48,
      y: height - 52,
      size: 16,
      font: fontBold,
      color: rgb(0.96, 0.97, 0.98),
    });

    page.drawText('COMMERCIAL INVOICE', {
      x: width - 210,
      y: height - 52,
      size: 14,
      font: fontBold,
      color: rgb(0.39, 0.4, 0.95),
    });

    page.drawText('INV-2026-089  ·  Issued: Oct 20, 2026  ·  Due: Nov 19, 2026', {
      x: 48,
      y: height - 78,
      size: 9.5,
      font: fontMono,
      color: rgb(0.61, 0.64, 0.69),
    });

    // Billing metadata
    page.drawText('BILL TO', { x: 48, y: height - 150, size: 9, font: fontBold, color: rgb(0.42, 0.45, 0.5) });
    page.drawText('Meridian Orbital Logistics GmbH', { x: 48, y: height - 168, size: 12, font: fontBold, color: rgb(0.07, 0.09, 0.15) });
    page.drawText('Friedrichstrasse 114A, 10117 Berlin, Germany', { x: 48, y: height - 184, size: 10, font: fontRegular, color: rgb(0.28, 0.33, 0.4) });

    page.drawText('REMITTANCE DETAILS', { x: 340, y: height - 150, size: 9, font: fontBold, color: rgb(0.42, 0.45, 0.5) });
    page.drawText('IBAN: DE89 3704 0044 0532 0130 00', { x: 340, y: height - 168, size: 10, font: fontMono, color: rgb(0.07, 0.09, 0.15) });
    page.drawText('Reference: MOL-2026-Q4', { x: 340, y: height - 184, size: 10, font: fontRegular, color: rgb(0.28, 0.33, 0.4) });

    // Table header
    const tableTop = height - 240;
    page.drawRectangle({ x: 48, y: tableTop, width: width - 96, height: 28, color: rgb(0.94, 0.95, 0.97) });
    page.drawText('DESCRIPTION', { x: 60, y: tableTop + 9, size: 9, font: fontBold, color: rgb(0.2, 0.25, 0.33) });
    page.drawText('HOURS', { x: 340, y: tableTop + 9, size: 9, font: fontBold, color: rgb(0.2, 0.25, 0.33) });
    page.drawText('RATE', { x: 410, y: tableTop + 9, size: 9, font: fontBold, color: rgb(0.2, 0.25, 0.33) });
    page.drawText('AMOUNT', { x: 485, y: tableTop + 9, size: 9, font: fontBold, color: rgb(0.2, 0.25, 0.33) });

    const rows = [
      ['Core Cryptographic Document Pipeline Architecture', '42.0', '$185.00', '$7,770.00'],
      ['Zero-Latency Canvas Rendering & Font Subsetting', '28.5', '$185.00', '$5,272.50'],
      ['Client-Side WebAssembly Security Audit & Hardening', '16.0', '$210.00', '$3,360.00'],
      ['Design System Typography & Print Calibration', '14.0', '$160.00', '$2,240.00'],
    ];

    rows.forEach((r, idx) => {
      const y = tableTop - 34 * (idx + 1);
      page.drawText(r[0], { x: 60, y: y + 10, size: 10, font: fontRegular, color: rgb(0.1, 0.12, 0.18) });
      page.drawText(r[1], { x: 340, y: y + 10, size: 10, font: fontMono, color: rgb(0.28, 0.33, 0.4) });
      page.drawText(r[2], { x: 410, y: y + 10, size: 10, font: fontMono, color: rgb(0.28, 0.33, 0.4) });
      page.drawText(r[3], { x: 485, y: y + 10, size: 10, font: fontMono, color: rgb(0.07, 0.09, 0.15) });
      page.drawLine({
        start: { x: 48, y },
        end: { x: width - 48, y },
        thickness: 0.75,
        color: rgb(0.88, 0.9, 0.93),
      });
    });

    // Totals
    const totalY = tableTop - 190;
    page.drawText('Subtotal:', { x: 390, y: totalY + 40, size: 10, font: fontRegular, color: rgb(0.28, 0.33, 0.4) });
    page.drawText('$18,642.50', { x: 480, y: totalY + 40, size: 10, font: fontMono, color: rgb(0.1, 0.12, 0.18) });

    page.drawText('VAT (0% Reverse Charge):', { x: 350, y: totalY + 22, size: 10, font: fontRegular, color: rgb(0.28, 0.33, 0.4) });
    page.drawText('$0.00', { x: 480, y: totalY + 22, size: 10, font: fontMono, color: rgb(0.1, 0.12, 0.18) });

    page.drawRectangle({ x: 340, y: totalY - 12, width: 207, height: 26, color: rgb(0.06, 0.09, 0.16) });
    page.drawText('TOTAL DUE', { x: 352, y: totalY - 3, size: 10, font: fontBold, color: rgb(1, 1, 1) });
    page.drawText('$18,642.50', { x: 472, y: totalY - 3, size: 11, font: fontMono, color: rgb(0.51, 0.55, 0.97) });

    // Signature box
    page.drawRectangle({
      x: 48,
      y: 95,
      width: 240,
      height: 75,
      borderColor: rgb(0.75, 0.78, 0.84),
      borderWidth: 1,
      color: rgb(0.98, 0.98, 0.99),
    });
    page.drawText('AUTHORIZED SIGNATURE / STAMP AREA', {
      x: 60,
      y: 152,
      size: 8,
      font: fontBold,
      color: rgb(0.45, 0.49, 0.56),
    });
    page.drawText('Use the Signature or Stamp tool in Advanced Editor', {
      x: 60,
      y: 112,
      size: 8.5,
      font: fontRegular,
      color: rgb(0.55, 0.59, 0.66),
    });

    const bytes = await doc.save();
    return new File([bytes as BlobPart], 'Invoice_INV-2026-089.pdf', { type: 'application/pdf' });
  }

  const pageCount = templateId === 'multi-page-report' ? 4 : 3;
  const sections = [
    {
      kicker: 'SECTION 01 · EXECUTIVE SUMMARY',
      title: 'Zero-Trust Client-Side Document Architecture',
      body: [
        'Modern enterprise workflows demand strict data sovereignty. By executing all PDF parsing,',
        'vector manipulation, page assembly, and cryptographic redaction inside the browser memory',
        'sandbox, sensitive legal and financial records never traverse external network hops.',
        '',
        'Key Capabilities Verified in This Build:',
        '  1. Sub-millisecond page extraction, rotation, and multi-document merging.',
        '  2. Non-destructive and destructive vector annotations, stamps, and ink signatures.',
        '  3. Direct PDF text layer inspection and inline typographic replacement.',
      ],
    },
    {
      kicker: 'SECTION 02 · PERFORMANCE & BENCHMARKS',
      title: 'Memory Footprint & Throughput Metrics',
      body: [
        'Across 10,000 synthetic document operations tested on standard workstation hardware,',
        'in-memory ArrayBuffer transformations achieved 99.4% lower latency compared to',
        'traditional cloud round-trip upload/download pipelines.',
        '',
        '  Operation Type                  Avg Latency      Memory Delta',
        '  -------------------------------------------------------------',
        '  10-Page PDF Merge               18.4 ms          +2.1 MB',
        '  Vector Stamp & Watermark        11.2 ms          +0.4 MB',
        '  Page Rotation & Reordering       6.8 ms          +0.2 MB',
        '  Full Metadata Sanitization       4.1 ms          -0.1 MB',
      ],
    },
    {
      kicker: 'SECTION 03 · SECURITY & REDACTION PROTOCOL',
      title: 'Compliance & Metadata Hygiene Standards',
      body: [
        'Before distributing final agreements or regulatory filings, practitioners should inspect',
        'embedded document properties (Title, Author, Producer, Creation timestamps) and apply',
        'permanent visual redactions over personally identifiable information (PII).',
        '',
        'Use the Metadata Inspector tool in the left navigation to audit or strip hidden fields,',
        'or open the Page Organizer to stamp uniform Bates numbering and watermarks.',
      ],
    },
    {
      kicker: 'SECTION 04 · APPENDIX & SIGN-OFF',
      title: 'Operational Readiness & Release Sign-Off',
      body: [
        'This fourth page is included for testing multi-page splitting, even/odd page extraction,',
        'and individual page rotation workflows.',
        '',
        'Try selecting specific page ranges (e.g., "1-2, 4") in the Split PDF workspace or',
        'rotating individual pages in the Page Organizer.',
      ],
    },
  ];

  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();
    const sec = sections[i % sections.length];

    // Top rule
    page.drawRectangle({ x: 48, y: height - 56, width: width - 96, height: 3, color: rgb(0.39, 0.4, 0.95) });

    page.drawText('PDFY STUDIO PRO  ·  TECHNICAL DOSSIER', {
      x: 48,
      y: height - 76,
      size: 8.5,
      font: fontMono,
      color: rgb(0.42, 0.45, 0.52),
    });

    page.drawText(`PAGE 0${i + 1} / 0${pageCount}`, {
      x: width - 115,
      y: height - 76,
      size: 8.5,
      font: fontMono,
      color: rgb(0.42, 0.45, 0.52),
    });

    page.drawText(sec.kicker, {
      x: 48,
      y: height - 135,
      size: 9.5,
      font: fontBold,
      color: rgb(0.39, 0.4, 0.95),
    });

    page.drawText(sec.title, {
      x: 48,
      y: height - 162,
      size: 20,
      font: fontBold,
      color: rgb(0.06, 0.09, 0.16),
    });

    let curY = height - 210;
    for (const line of sec.body) {
      const isTable = line.startsWith('  ');
      page.drawText(line, {
        x: 48,
        y: curY,
        size: isTable ? 10 : 11,
        font: isTable ? fontMono : fontRegular,
        color: isTable ? rgb(0.15, 0.2, 0.3) : rgb(0.22, 0.26, 0.33),
      });
      curY -= 22;
    }

    // Callout box at bottom
    page.drawRectangle({
      x: 48,
      y: 90,
      width: width - 96,
      height: 85,
      color: rgb(0.95, 0.96, 0.98),
      borderColor: rgb(0.84, 0.87, 0.92),
      borderWidth: 1,
    });
    page.drawText('INTERACTIVE WORKSPACE TIP', {
      x: 64,
      y: 150,
      size: 9,
      font: fontBold,
      color: rgb(0.39, 0.4, 0.95),
    });
    page.drawText('Double-click any text line in "Edit PDF Text" mode to modify existing PDF typography in place,', {
      x: 64,
      y: 130,
      size: 9.5,
      font: fontRegular,
      color: rgb(0.25, 0.3, 0.38),
    });
    page.drawText('or add vector stamps, signatures, highlights, and watermarks before exporting.', {
      x: 64,
      y: 114,
      size: 9.5,
      font: fontRegular,
      color: rgb(0.25, 0.3, 0.38),
    });
  }

  const bytes = await doc.save();
  const info = SAMPLE_TEMPLATES.find(t => t.id === templateId) || SAMPLE_TEMPLATES[0];
  return new File([bytes as BlobPart], info.filename, { type: 'application/pdf' });
}
