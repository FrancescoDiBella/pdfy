import type { EditorElement, StrokePoint } from '../components/editor/types';
import type { PDFPage } from 'pdf-lib';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';

export interface Bounds { x: number; y: number; width: number; height: number }
export interface Size { width: number; height: number }
export interface PageGeometry extends Bounds { rotation: number }
export const EDITOR_WIDTH = 794;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function pageGeometry(page: PDFPage): PageGeometry {
  const media = page.getMediaBox(); const crop = page.getCropBox();
  const x = Math.max(media.x, crop.x); const y = Math.max(media.y, crop.y);
  const width = Math.min(media.x + media.width, crop.x + crop.width) - x;
  const height = Math.min(media.y + media.height, crop.y + crop.height) - y;
  const box = width > 0 && height > 0 ? { x, y, width, height } : media;
  if (![box.x, box.y, box.width, box.height].every(Number.isFinite) || box.width <= 0 || box.height <= 0) throw new Error('Invalid page geometry');
  const rotation = ((page.getRotation().angle % 360) + 360) % 360;
  return { ...box, rotation };
}

export function editorSize(page: PageGeometry): Size {
  const sideways = page.rotation === 90 || page.rotation === 270;
  return { width: EDITOR_WIDTH, height: EDITOR_WIDTH * (sideways ? page.width / page.height : page.height / page.width) };
}

export function pdfScale(page: PageGeometry) { return (page.rotation === 90 || page.rotation === 270 ? page.height : page.width) / EDITOR_WIDTH; }

export function toPDFPoint(point: StrokePoint, page: PageGeometry): StrokePoint {
  const scale = pdfScale(page); const u = point.x * scale; const v = point.y * scale;
  if (page.rotation === 90) return { x: page.x + v, y: page.y + u };
  if (page.rotation === 180) return { x: page.x + page.width - u, y: page.y + v };
  if (page.rotation === 270) return { x: page.x + page.width - v, y: page.y + page.height - u };
  return { x: page.x + u, y: page.y + page.height - v };
}

export function toEditorPoint(point: StrokePoint, page: PageGeometry): StrokePoint {
  const x = point.x - page.x; const y = point.y - page.y; const scale = pdfScale(page);
  if (page.rotation === 90) return { x: y / scale, y: x / scale };
  if (page.rotation === 180) return { x: (page.width - x) / scale, y: y / scale };
  if (page.rotation === 270) return { x: (page.height - y) / scale, y: (page.width - x) / scale };
  return { x: x / scale, y: (page.height - y) / scale };
}

export function sourceTextGeometry(item: TextItem, page: PageGeometry) {
  if (![...item.transform, item.width, item.height].every(Number.isFinite) || item.width <= 0) return null;
  const [a, b, c, d, x, y] = item.transform;
  const baselineLength = Math.hypot(a, b); const upLength = Math.hypot(c, d);
  if (!baselineLength || !upLength || Math.abs((a * c + b * d) / (baselineLength * upLength)) > .01) return null;
  const height = Math.abs(item.height) || upLength;
  const points = [
    { x: x - height * c / upLength * .25, y: y - height * d / upLength * .25 }, { x: x + item.width * a / baselineLength - height * c / upLength * .25, y: y + item.width * b / baselineLength - height * d / upLength * .25 },
    { x: x + height * c / upLength, y: y + height * d / upLength },
    { x: x + item.width * a / baselineLength + height * c / upLength, y: y + item.width * b / baselineLength + height * d / upLength },
  ].map(point => toEditorPoint(point, page));
  const angle = (Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x) * 180 / Math.PI + 360) % 360;
  const textRotation = (Math.round(angle / 90) * 90) % 360;
  if (Math.min(Math.abs(angle - textRotation), 360 - Math.abs(angle - textRotation)) > .1) return null;
  const left = Math.min(...points.map(point => point.x)); const top = Math.min(...points.map(point => point.y));
  return { x: left, y: top, width: Math.max(.1, Math.max(...points.map(point => point.x)) - left), height: Math.max(.1, Math.max(...points.map(point => point.y)) - top), fontSize: height / pdfScale(page), textRotation, originalPdfAngle: Math.atan2(b, a) * 180 / Math.PI };
}

export function sourceMask(element: EditorElement) {
  if (element.type !== 'edit-text' || element.originalPdfX === undefined || element.originalPdfY === undefined) return null;
  const height = element.originalPdfH ?? 0; const rotation = element.originalPdfAngle ?? 0; const angle = rotation * Math.PI / 180;
  return { x: element.originalPdfX + Math.sin(angle) * height * .25, y: element.originalPdfY - Math.cos(angle) * height * .25, width: element.originalPdfW ?? 0, height: height * 1.25, rotation };
}

export function sourceMaskBounds(element: EditorElement, page: PageGeometry): Bounds | null {
  const mask = sourceMask(element); if (!mask) return null;
  const angle = mask.rotation * Math.PI / 180;
  const corners = [[0, 0], [mask.width, 0], [0, mask.height], [mask.width, mask.height]].map(([x, y]) => toEditorPoint({ x: mask.x + x * Math.cos(angle) - y * Math.sin(angle), y: mask.y + x * Math.sin(angle) + y * Math.cos(angle) }, page));
  const left = Math.min(...corners.map(point => point.x)); const top = Math.min(...corners.map(point => point.y));
  return { x: left, y: top, width: Math.max(...corners.map(point => point.x)) - left, height: Math.max(...corners.map(point => point.y)) - top };
}

export function textLayout(bounds: Bounds, rotation = 0) {
  const sideways = rotation === 90 || rotation === 270;
  return { width: sideways ? bounds.height : bounds.width, height: sideways ? bounds.width : bounds.height, x: rotation === 90 || rotation === 180 ? bounds.width : 0, y: rotation === 180 || rotation === 270 ? bounds.height : 0, rotation };
}

export function textPoint(element: Bounds & { textRotation?: number }, local: StrokePoint): StrokePoint {
  const layout = textLayout(element, element.textRotation);
  const angle = layout.rotation * Math.PI / 180;
  return { x: element.x + layout.x + local.x * Math.cos(angle) - local.y * Math.sin(angle), y: element.y + layout.y + local.x * Math.sin(angle) + local.y * Math.cos(angle) };
}

export function logicalPoint(point: StrokePoint, rect: Bounds, size: Size): StrokePoint {
  return { x: (point.x - rect.x) * size.width / rect.width, y: (point.y - rect.y) * size.height / rect.height };
}

export function constrainBounds(bounds: Bounds, size: Size, minimum = 10): Bounds {
  const width = clamp(bounds.width, Math.min(minimum, size.width), size.width);
  const height = clamp(bounds.height, Math.min(minimum, size.height), size.height);
  return { x: clamp(bounds.x, 0, size.width - width), y: clamp(bounds.y, 0, size.height - height), width, height };
}

export function transformBounds(start: Bounds, from: StrokePoint, to: StrokePoint, size: Size, operation: 'move' | 'resize', preserveRatio = false): Bounds {
  const dx = to.x - from.x; const dy = to.y - from.y;
  if (Math.abs(dx) + Math.abs(dy) < .0001) return start;
  if (operation === 'move') return constrainBounds({ ...start, x: start.x + dx, y: start.y + dy }, size, .1);
  if (preserveRatio) {
    const desired = (start.width * (start.width + dx) + start.height * (start.height + dy)) / (start.width ** 2 + start.height ** 2);
    const maximum = Math.min((size.width - start.x) / start.width, (size.height - start.y) / start.height);
    const minimum = Math.min(maximum, Math.max(10 / start.width, 10 / start.height));
    const ratio = clamp(desired, minimum, maximum);
    return { ...start, width: start.width * ratio, height: start.height * ratio };
  }
  return { ...start, width: clamp(start.width + dx, Math.min(10, size.width - start.x), size.width - start.x), height: clamp(start.height + dy, Math.min(10, size.height - start.y), size.height - start.y) };
}

export function sameBounds(a: Bounds, b: Bounds) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.width - b.width) + Math.abs(a.height - b.height) < 0.01; }

export function updateGeometry(element: EditorElement, patch: Partial<EditorElement>, size: Size): EditorElement {
  let geometry = constrainBounds({ ...element, ...patch }, size, element.type === 'edit-text' ? .1 : 10);
  if (element.type === 'image' && (patch.lockAspectRatio ?? element.lockAspectRatio) !== false && (patch.width !== undefined || patch.height !== undefined)) {
    const ratio = element.width / element.height;
    const width = patch.width ?? (patch.height ?? element.height) * ratio;
    const maximum = Math.min((size.width - geometry.x) / element.width, (size.height - geometry.y) / element.height);
    const minimum = Math.min(maximum, Math.max(10 / element.width, 10 / element.height));
    const scale = clamp(width / element.width, minimum, maximum);
    geometry = { ...geometry, width: element.width * scale, height: element.height * scale };
  }
  const next = { ...element, ...patch, ...geometry };
  if (element.type === 'draw' && element.points && (next.width !== element.width || next.height !== element.height)) {
    next.points = element.points.map(point => ({ x: point.x * next.width / element.width, y: point.y * next.height / element.height }));
  }
  return next;
}
