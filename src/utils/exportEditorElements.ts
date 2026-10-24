import { degrees, rgb, pushGraphicsState, popGraphicsState, moveTo, lineTo, closePath, clip, endPath } from 'pdf-lib';
import type { PDFDocument, PDFFont } from 'pdf-lib';
import type { EditorElement } from '../components/editor/types';
import { pageGeometry, pdfScale, toPDFPoint, textLayout, textPoint, sourceMask } from './editorGeometry.ts';

const color = (hex: string) => rgb(...([0, 2, 4].map(index => (parseInt(hex.replace('#', '').slice(index, index + 2), 16) || 0) / 255) as [number, number, number]));

export async function drawEditorElements(doc: PDFDocument, elements: EditorElement[], resolveFont: (doc: PDFDocument, element: EditorElement) => Promise<PDFFont>) {
  const pages = doc.getPages();
  // Cover original source content before drawing overlays, so another edit cannot erase an annotation.
  for (const element of elements) {
    const mask = sourceMask(element); const page = pages[element.pageIndex ?? 0];
    if (mask && page) page.drawRectangle({ ...mask, rotate: degrees(mask.rotation), color: color(element.fillColor || '#FFFFFF') });
  }
  for (const element of elements) {
    const page = pages[element.pageIndex ?? 0]; if (!page) continue;
    const geometry = pageGeometry(page); const scale = pdfScale(geometry);
    const bottom = toPDFPoint({ x: element.x, y: element.y + element.height }, geometry);
    const width = element.width * scale; const height = element.height * scale;
    const rotate = degrees(geometry.rotation); const opacity = element.opacity ?? 1;
    if (element.type === 'text' || element.type === 'edit-text') {
      const corners = [[0, 0], [element.width, 0], [element.width, element.height], [0, element.height]].map(([x, y]) => toPDFPoint({ x: element.x + x, y: element.y + y }, geometry));
      page.pushOperators(pushGraphicsState(), moveTo(corners[0].x, corners[0].y), ...corners.slice(1).map(point => lineTo(point.x, point.y)), closePath(), clip(), endPath());
      const font = await resolveFont(doc, element); const size = (element.fontSize ?? 16) * scale;
      const padding = element.type === 'text' ? 4 : 0; const lineHeight = (element.fontSize ?? 16) * 1.2;
      const availableWidth = Math.max(size, (textLayout(element, element.textRotation).width - 2 * padding) * scale);
      const lines: string[] = [];
      for (const paragraph of (element.content || '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n')) {
        let line = '';
        for (const character of paragraph) {
          if (line && font.widthOfTextAtSize(line + character, size) > availableWidth) {
            const space = line.lastIndexOf(' ');
            if (space > 0) { lines.push(line.slice(0, space)); line = line.slice(space + 1); }
            if (line && font.widthOfTextAtSize(line + character, size) > availableWidth) { lines.push(line); line = ''; }
          }
          line += character;
        }
        lines.push(line);
      }
      for (const [index, line] of lines.entries()) {
        const remaining = Math.max(0, availableWidth - font.widthOfTextAtSize(line, size));
        const align = element.textAlign === 'center' ? remaining / 2 : element.textAlign === 'right' ? remaining : 0;
        const baseline = toPDFPoint(textPoint(element, { x: padding + align / scale, y: padding + (element.fontSize ?? 16) + index * lineHeight }), geometry);
        page.drawText(line, { ...baseline, size, font, color: color(element.strokeColor || '#0F172A'), opacity, rotate: degrees(geometry.rotation - (element.textRotation ?? 0)) });
      }
      page.pushOperators(popGraphicsState());
    } else if (element.type === 'image' && element.src) {
      const image = element.src.startsWith('data:image/png') ? await doc.embedPng(element.src) : await doc.embedJpg(element.src);
      page.drawImage(image, { ...bottom, width, height, rotate, opacity });
    } else if (element.type === 'draw' && element.points) {
      for (let index = 1; index < element.points.length; index++) {
        const previous = element.points[index - 1]; const point = element.points[index];
        page.drawLine({ start: toPDFPoint({ x: element.x + previous.x, y: element.y + previous.y }, geometry), end: toPDFPoint({ x: element.x + point.x, y: element.y + point.y }, geometry), thickness: (element.strokeWidth ?? 3) * scale, color: color(element.strokeColor || '#0F172A'), opacity });
      }
    } else if (element.type === 'circle') {
      const center = toPDFPoint({ x: element.x + element.width / 2, y: element.y + element.height / 2 }, geometry);
      const sideways = geometry.rotation === 90 || geometry.rotation === 270;
      page.drawEllipse({ ...center, xScale: (sideways ? height : width) / 2, yScale: (sideways ? width : height) / 2, color: color(element.fillColor || '#6366F1'), borderColor: color(element.fillColor || '#6366F1'), borderWidth: (element.strokeWidth ?? 2) * scale, opacity: element.opacity ?? .35 });
    } else {
      const fill = color(element.fillColor || (element.type === 'highlight' ? '#FACC15' : element.type === 'redact' ? '#000000' : '#6366F1'));
      page.drawRectangle({ ...bottom, width, height, rotate, color: fill, borderColor: fill, borderWidth: element.type === 'highlight' || element.type === 'redact' ? 0 : (element.strokeWidth ?? 2) * scale, opacity: element.type === 'redact' ? 1 : element.opacity ?? (element.type === 'highlight' ? .4 : .35) });
    }
  }
}
