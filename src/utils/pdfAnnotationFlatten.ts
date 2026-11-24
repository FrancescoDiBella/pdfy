import {
  BlendMode,
  PDFArray,
  PDFBool,
  PDFButton,
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFOptionList,
  PDFRadioGroup,
  PDFRef,
  PDFStream,
  PDFString,
  PDFTextField,
  PDFDict,
  StandardFonts,
  cmyk,
  concatTransformationMatrix,
  drawObject,
  grayscale,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  clip,
  endPath,
  rectangle,
} from 'pdf-lib';
import type { Color, PDFFont, PDFPage } from 'pdf-lib';

const NON_PRINTABLE_SUBTYPES = new Set([
  'Popup',
  'Link',
  'Sound',
  'Movie',
  'Screen',
  'TrapNet',
  'PrinterMark',
  '3D',
  'RichMedia',
]);

// Annotation flag bits (ISO 32000-1 Table 165)
const ANNOT_FLAG_HIDDEN = 1 << 1; // 2
const ANNOT_FLAG_PRINT = 1 << 2; // 4
const ANNOT_FLAG_NO_VIEW = 1 << 5; // 32

// Field flag bit for pushbutton widgets (ISO 32000-1 Table 226)
const FIELD_FLAG_PUSHBUTTON = 1 << 16; // 65536

export interface FlattenAnnotationsOptions {
  /** Only flatten AcroForm widget annotations (leaves markup/comment annotations in /Annots). */
  widgetsOnly?: boolean;
  /** Keep /Annots intact instead of removing flattened annotations. */
  keepAnnotations?: boolean;
  /** Keep annotations that require a browser raster fallback in /Annots instead of removing them. */
  preserveFallbackAnnotations?: boolean;
}

export interface FlattenPageResult {
  flattenedCount: number;
  needsRasterFallback: boolean;
}

export interface FlattenDocumentResult {
  flattenedCount: number;
  fallbackPages: Set<number>;
}

function asFiniteNumbers(arr: PDFArray | undefined): number[] | null {
  if (!arr) return null;
  const out: number[] = [];
  for (let i = 0; i < arr.size(); i++) {
    const item = arr.lookupMaybe(i, PDFNumber);
    if (!item) return null;
    const val = item.asNumber();
    if (!Number.isFinite(val)) return null;
    out.push(val);
  }
  return out;
}

function lookupInheritable(dict: PDFDict, keyName: string): unknown {
  const key = PDFName.of(keyName);
  let current: PDFDict | undefined = dict;
  for (let depth = 0; depth < 16 && current; depth++) {
    const val = current.lookup(key);
    if (val !== undefined) return val;
    current = current.lookupMaybe(PDFName.of('Parent'), PDFDict);
  }
  return undefined;
}

function decodePdfText(obj: unknown): string {
  if (obj instanceof PDFString || obj instanceof PDFHexString) {
    return obj.decodeText();
  }
  if (obj instanceof PDFName) {
    return obj.decodeText();
  }
  return '';
}

function parseColorArray(arr: PDFArray | undefined): Color | undefined {
  const nums = asFiniteNumbers(arr);
  if (!nums) return undefined;
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  if (nums.length === 1) return grayscale(clamp01(nums[0]));
  if (nums.length === 3) return rgb(clamp01(nums[0]), clamp01(nums[1]), clamp01(nums[2]));
  if (nums.length === 4) return cmyk(clamp01(nums[0]), clamp01(nums[1]), clamp01(nums[2]), clamp01(nums[3]));
  return undefined;
}

function parseDefaultAppearance(da: string): { fontSize: number; color: Color } {
  let fontSize = 11;
  let color: Color = rgb(0, 0, 0);

  const tfMatch = /\/[^\s/]+\s+([0-9]*\.?[0-9]+)\s+Tf/.exec(da);
  if (tfMatch) {
    const parsed = Number(tfMatch[1]);
    if (Number.isFinite(parsed) && parsed > 0) fontSize = parsed;
  }

  const rgMatch = /([0-9]*\.?[0-9]+)\s+([0-9]*\.?[0-9]+)\s+([0-9]*\.?[0-9]+)\s+rg/.exec(da);
  if (rgMatch) {
    const [r, g, b] = [Number(rgMatch[1]), Number(rgMatch[2]), Number(rgMatch[3])];
    if ([r, g, b].every(Number.isFinite)) {
      color = rgb(Math.max(0, Math.min(1, r)), Math.max(0, Math.min(1, g)), Math.max(0, Math.min(1, b)));
    }
  } else {
    const gMatch = /([0-9]*\.?[0-9]+)\s+g\b/.exec(da);
    if (gMatch) {
      const gVal = Number(gMatch[1]);
      if (Number.isFinite(gVal)) color = grayscale(Math.max(0, Math.min(1, gVal)));
    }
  }

  return { fontSize, color };
}

function readBorderWidth(annot: PDFDict, fallback: number): number {
  const bs = annot.lookupMaybe(PDFName.of('BS'), PDFDict);
  const w = bs?.lookupMaybe(PDFName.of('W'), PDFNumber)?.asNumber();
  if (w !== undefined && Number.isFinite(w)) return Math.max(0, w);
  const border = asFiniteNumbers(annot.lookupMaybe(PDFName.of('Border'), PDFArray));
  if (border && border.length >= 3) return Math.max(0, border[2]);
  return fallback;
}

function readOpacity(annot: PDFDict, fallback: number): number {
  const ca = annot.lookupMaybe(PDFName.of('CA'), PDFNumber)?.asNumber();
  if (ca !== undefined && Number.isFinite(ca)) return Math.max(0, Math.min(1, ca));
  return fallback;
}

function shouldSkipAnnotation(annot: PDFDict, subtype: string): boolean {
  if (!subtype || NON_PRINTABLE_SUBTYPES.has(subtype)) return true;

  const flags = annot.lookupMaybe(PDFName.of('F'), PDFNumber)?.asNumber() ?? 0;
  if ((flags & ANNOT_FLAG_HIDDEN) !== 0) return true;
  if ((flags & ANNOT_FLAG_NO_VIEW) !== 0 && (flags & ANNOT_FLAG_PRINT) === 0) return true;

  if (subtype === 'Widget') {
    const ft = lookupInheritable(annot, 'FT');
    const ff = lookupInheritable(annot, 'Ff');
    const isBtn = ft instanceof PDFName && ft.decodeText() === 'Btn';
    const ffNum = ff instanceof PDFNumber ? ff.asNumber() : 0;
    if (isBtn && (ffNum & FIELD_FLAG_PUSHBUTTON) !== 0 && (flags & ANNOT_FLAG_PRINT) === 0) {
      return true;
    }
  }

  return false;
}

interface ResolvedAppearance {
  stream: PDFStream;
  ref: PDFRef;
}

function resolveNormalAppearance(
  doc: PDFDocument,
  annot: PDFDict,
): { appearance: ResolvedAppearance | null; intentionallyOff: boolean } {
  const apDict = annot.lookupMaybe(PDFName.of('AP'), PDFDict);
  if (!apDict) return { appearance: null, intentionallyOff: false };

  const rawN = apDict.get(PDFName.of('N'));
  if (!rawN) return { appearance: null, intentionallyOff: false };

  const lookedN = doc.context.lookup(rawN);
  if (lookedN instanceof PDFStream) {
    const ref = rawN instanceof PDFRef ? rawN : doc.context.register(lookedN);
    return { appearance: { stream: lookedN, ref }, intentionallyOff: false };
  }

  if (lookedN instanceof PDFDict) {
    const asName = annot.lookupMaybe(PDFName.of('AS'), PDFName)
      ?? (() => {
        const v = lookupInheritable(annot, 'V');
        return v instanceof PDFName ? v : undefined;
      })();

    if (!asName) {
      return { appearance: null, intentionallyOff: true };
    }

    const rawState = lookedN.get(asName);
    if (!rawState) {
      return { appearance: null, intentionallyOff: asName.decodeText() === 'Off' };
    }
    const lookedState = doc.context.lookup(rawState);
    if (lookedState instanceof PDFStream) {
      const ref = rawState instanceof PDFRef ? rawState : doc.context.register(lookedState);
      return { appearance: { stream: lookedState, ref }, intentionallyOff: false };
    }
    return { appearance: null, intentionallyOff: asName.decodeText() === 'Off' };
  }

  return { appearance: null, intentionallyOff: false };
}

/**
 * Merges missing default AcroForm resources (/DR) into an appearance stream's /Resources
 * so fonts referenced by widget appearance streams resolve reliably after flattening.
 */
function ensureAppearanceResources(doc: PDFDocument, apStream: PDFStream, drDict: PDFDict | undefined): void {
  if (!drDict) return;
  let res = apStream.dict.lookupMaybe(PDFName.of('Resources'), PDFDict);
  if (!res) {
    res = doc.context.obj({});
    apStream.dict.set(PDFName.of('Resources'), res);
  }

  for (const categoryName of ['Font', 'ExtGState', 'ColorSpace', 'XObject']) {
    const key = PDFName.of(categoryName);
    const drSub = drDict.lookupMaybe(key, PDFDict);
    if (!drSub) continue;
    let resSub = res.lookupMaybe(key, PDFDict);
    if (!resSub) {
      resSub = doc.context.obj({});
      res.set(key, resSub);
    }
    for (const [entryKey, entryVal] of drSub.entries()) {
      if (!resSub.has(entryKey)) {
        resSub.set(entryKey, entryVal);
      }
    }
  }
}

/**
 * Computes the ISO 32000-1 Section 12.5.5 affine matrix [sx, 0, 0, sy, tx, ty]
 * mapping an annotation appearance XObject (with BBox & optional Matrix) into the annotation Rect.
 */
export function computeAppearanceMatrix(
  rect: [number, number, number, number],
  bbox: [number, number, number, number],
  matrix: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0],
): [number, number, number, number, number, number] | null {
  const rectMinX = Math.min(rect[0], rect[2]);
  const rectMinY = Math.min(rect[1], rect[3]);
  const rectW = Math.abs(rect[2] - rect[0]);
  const rectH = Math.abs(rect[3] - rect[1]);
  if (rectW <= 1e-6 || rectH <= 1e-6) return null;

  const [m0, m1, m2, m3, m4, m5] = matrix;
  const [bx1, by1, bx2, by2] = bbox;
  const corners: Array<[number, number]> = [
    [bx1, by1],
    [bx2, by1],
    [bx2, by2],
    [bx1, by2],
  ];

  let axMin = Infinity;
  let ayMin = Infinity;
  let axMax = -Infinity;
  let ayMax = -Infinity;
  for (const [cx, cy] of corners) {
    const x = m0 * cx + m2 * cy + m4;
    const y = m1 * cx + m3 * cy + m5;
    if (x < axMin) axMin = x;
    if (x > axMax) axMax = x;
    if (y < ayMin) ayMin = y;
    if (y > ayMax) ayMax = y;
  }

  const aw = axMax - axMin;
  const ah = ayMax - ayMin;
  if (!Number.isFinite(aw) || !Number.isFinite(ah) || aw <= 1e-6 || ah <= 1e-6) return null;

  const sx = rectW / aw;
  const sy = rectH / ah;
  const tx = rectMinX - axMin * sx;
  const ty = rectMinY - ayMin * sy;
  if (![sx, sy, tx, ty].every(Number.isFinite)) return null;

  return [sx, 0, 0, sy, tx, ty];
}

function drawAppearanceXObject(
  doc: PDFDocument,
  page: PDFPage,
  rect: [number, number, number, number],
  appearance: ResolvedAppearance,
  drDict: PDFDict | undefined,
): boolean {
  const { stream, ref } = appearance;
  const rectW = Math.abs(rect[2] - rect[0]);
  const rectH = Math.abs(rect[3] - rect[1]);
  if (rectW <= 1e-6 || rectH <= 1e-6) return false;

  if (!stream.dict.has(PDFName.of('Type'))) {
    stream.dict.set(PDFName.of('Type'), PDFName.of('XObject'));
  }
  if (!stream.dict.has(PDFName.of('Subtype'))) {
    stream.dict.set(PDFName.of('Subtype'), PDFName.of('Form'));
  }
  if (!stream.dict.has(PDFName.of('FormType'))) {
    stream.dict.set(PDFName.of('FormType'), PDFNumber.of(1));
  }

  let bboxNums = asFiniteNumbers(stream.dict.lookupMaybe(PDFName.of('BBox'), PDFArray));
  if (!bboxNums || bboxNums.length < 4) {
    bboxNums = [0, 0, rectW, rectH];
    stream.dict.set(PDFName.of('BBox'), doc.context.obj(bboxNums));
  }

  const matrixNums = asFiniteNumbers(stream.dict.lookupMaybe(PDFName.of('Matrix'), PDFArray));
  const apMatrix: [number, number, number, number, number, number] =
    matrixNums && matrixNums.length >= 6
      ? [matrixNums[0], matrixNums[1], matrixNums[2], matrixNums[3], matrixNums[4], matrixNums[5]]
      : [1, 0, 0, 1, 0, 0];

  const cm = computeAppearanceMatrix(
    rect,
    [bboxNums[0], bboxNums[1], bboxNums[2], bboxNums[3]],
    apMatrix,
  );
  if (!cm) return false;

  ensureAppearanceResources(doc, stream, drDict);

  const xObjectKey = page.node.newXObject('PrintAnnot', ref);
  page.pushOperators(
    pushGraphicsState(),
    concatTransformationMatrix(cm[0], cm[1], cm[2], cm[3], cm[4], cm[5]),
    drawObject(xObjectKey),
    popGraphicsState(),
  );
  return true;
}

function sanitizeWinAnsiFallback(text: string): string {
  return text.replace(/[^\x20-\x7E\xA0-\xFF\n\r\t]/gu, '?');
}

function wrapTextToWidth(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const lines: string[] = [];
  const paragraphs = text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
  for (const paragraph of paragraphs) {
    if (!paragraph) {
      lines.push('');
      continue;
    }
    let current = '';
    for (const ch of paragraph) {
      if (current && font.widthOfTextAtSize(current + ch, fontSize) > maxWidth) {
        const spaceIdx = current.lastIndexOf(' ');
        if (spaceIdx > 0) {
          lines.push(current.slice(0, spaceIdx));
          current = current.slice(spaceIdx + 1);
        }
        if (current && font.widthOfTextAtSize(current + ch, fontSize) > maxWidth) {
          lines.push(current);
          current = '';
        }
      }
      current += ch;
    }
    lines.push(current);
  }
  return lines;
}

function drawTextBoxFallback(
  page: PDFPage,
  rect: [number, number, number, number],
  text: string,
  font: PDFFont,
  fontSize: number,
  textColor: Color,
  align: number,
  bgColor: Color | undefined,
  borderWidth: number,
  borderColor: Color | undefined,
  opacity: number,
): boolean {
  const minX = Math.min(rect[0], rect[2]);
  const minY = Math.min(rect[1], rect[3]);
  const width = Math.abs(rect[2] - rect[0]);
  const height = Math.abs(rect[3] - rect[1]);
  if (width <= 1 || height <= 1) return false;

  if (bgColor || (borderWidth > 0 && borderColor)) {
    page.drawRectangle({
      x: minX,
      y: minY,
      width,
      height,
      color: bgColor,
      borderColor: borderWidth > 0 ? borderColor : undefined,
      borderWidth: borderWidth > 0 ? borderWidth : 0,
      opacity,
    });
  }

  let hasUnencodable = false;
  let safeText = text;
  try {
    font.encodeText(safeText.replace(/[\r\n\t]/g, ' '));
  } catch {
    hasUnencodable = true;
    safeText = sanitizeWinAnsiFallback(safeText);
  }

  const padding = Math.min(4, width * 0.1, height * 0.15);
  const availW = Math.max(fontSize, width - padding * 2);
  const effectiveSize = Math.max(5, Math.min(fontSize, height - padding));
  const lineHeight = effectiveSize * 1.2;
  const lines = wrapTextToWidth(safeText, font, effectiveSize, availW);

  page.pushOperators(
    pushGraphicsState(),
    rectangle(minX, minY, width, height),
    clip(),
    endPath(),
  );

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const lineW = font.widthOfTextAtSize(line, effectiveSize);
    const offset = align === 1 ? Math.max(0, (availW - lineW) / 2) : align === 2 ? Math.max(0, availW - lineW) : 0;
    const baselineY = minY + height - padding - effectiveSize - i * lineHeight;
    if (baselineY + effectiveSize < minY) break;
    page.drawText(line, {
      x: minX + padding + offset,
      y: baselineY,
      size: effectiveSize,
      font,
      color: textColor,
      opacity,
    });
  }

  page.pushOperators(popGraphicsState());
  return hasUnencodable;
}

function drawAnnotationFallback(
  page: PDFPage,
  annot: PDFDict,
  subtype: string,
  rect: [number, number, number, number],
  getFont: () => Promise<PDFFont>,
): Promise<{ drew: boolean; needsRasterFallback: boolean }> {
  return (async () => {
    const minX = Math.min(rect[0], rect[2]);
    const minY = Math.min(rect[1], rect[3]);
    const width = Math.abs(rect[2] - rect[0]);
    const height = Math.abs(rect[3] - rect[1]);
    const color = parseColorArray(annot.lookupMaybe(PDFName.of('C'), PDFArray));
    const interiorColor = parseColorArray(annot.lookupMaybe(PDFName.of('IC'), PDFArray));
    const opacity = readOpacity(annot, subtype === 'Highlight' ? 0.4 : 1);

    if (subtype === 'Highlight' || subtype === 'Underline' || subtype === 'StrikeOut' || subtype === 'Squiggly') {
      const quads = asFiniteNumbers(annot.lookupMaybe(PDFName.of('QuadPoints'), PDFArray));
      const boxes: Array<{ x: number; y: number; w: number; h: number }> = [];
      if (quads && quads.length >= 8) {
        for (let i = 0; i + 7 < quads.length; i += 8) {
          const xs = [quads[i], quads[i + 2], quads[i + 4], quads[i + 6]];
          const ys = [quads[i + 1], quads[i + 3], quads[i + 5], quads[i + 7]];
          const qx = Math.min(...xs);
          const qy = Math.min(...ys);
          const qw = Math.max(...xs) - qx;
          const qh = Math.max(...ys) - qy;
          if (qw > 0 && qh > 0) boxes.push({ x: qx, y: qy, w: qw, h: qh });
        }
      }
      if (!boxes.length && width > 0 && height > 0) {
        boxes.push({ x: minX, y: minY, w: width, h: height });
      }
      const markupColor = color ?? (subtype === 'Highlight' ? rgb(1, 0.92, 0.23) : rgb(0.85, 0.15, 0.15));
      for (const box of boxes) {
        if (subtype === 'Highlight') {
          page.drawRectangle({
            x: box.x,
            y: box.y,
            width: box.w,
            height: box.h,
            color: markupColor,
            opacity,
            blendMode: BlendMode.Multiply,
          });
        } else {
          const lineY = subtype === 'StrikeOut' ? box.y + box.h * 0.45 : box.y + Math.max(1, box.h * 0.1);
          page.drawLine({
            start: { x: box.x, y: lineY },
            end: { x: box.x + box.w, y: lineY },
            thickness: Math.max(1, Math.min(2.5, box.h * 0.08)),
            color: markupColor,
            opacity,
          });
        }
      }
      return { drew: boxes.length > 0, needsRasterFallback: false };
    }

    if (subtype === 'Square' || subtype === 'Circle') {
      const borderWidth = readBorderWidth(annot, 1);
      const stroke = color ?? (!interiorColor ? rgb(0, 0, 0) : undefined);
      if (subtype === 'Square') {
        page.drawRectangle({
          x: minX,
          y: minY,
          width,
          height,
          color: interiorColor,
          borderColor: borderWidth > 0 ? stroke : undefined,
          borderWidth,
          opacity,
          borderOpacity: opacity,
        });
      } else {
        page.drawEllipse({
          x: minX + width / 2,
          y: minY + height / 2,
          xScale: width / 2,
          yScale: height / 2,
          color: interiorColor,
          borderColor: borderWidth > 0 ? stroke : undefined,
          borderWidth,
          opacity,
          borderOpacity: opacity,
        });
      }
      return { drew: true, needsRasterFallback: false };
    }

    if (subtype === 'Line') {
      const lCoords = asFiniteNumbers(annot.lookupMaybe(PDFName.of('L'), PDFArray));
      if (lCoords && lCoords.length >= 4) {
        const borderWidth = readBorderWidth(annot, 1);
        page.drawLine({
          start: { x: lCoords[0], y: lCoords[1] },
          end: { x: lCoords[2], y: lCoords[3] },
          thickness: Math.max(0.5, borderWidth),
          color: color ?? rgb(0, 0, 0),
          opacity,
        });
        return { drew: true, needsRasterFallback: false };
      }
      return { drew: false, needsRasterFallback: true };
    }

    if (subtype === 'Ink') {
      const inkList = annot.lookupMaybe(PDFName.of('InkList'), PDFArray);
      if (inkList) {
        const thickness = Math.max(0.75, readBorderWidth(annot, 2));
        const inkColor = color ?? rgb(0, 0, 0);
        let drewAny = false;
        for (let i = 0; i < inkList.size(); i++) {
          const pts = asFiniteNumbers(inkList.lookupMaybe(i, PDFArray));
          if (!pts || pts.length < 4) continue;
          for (let j = 2; j + 1 < pts.length; j += 2) {
            page.drawLine({
              start: { x: pts[j - 2], y: pts[j - 1] },
              end: { x: pts[j], y: pts[j + 1] },
              thickness,
              color: inkColor,
              opacity,
            });
            drewAny = true;
          }
        }
        return { drew: drewAny, needsRasterFallback: false };
      }
      return { drew: false, needsRasterFallback: true };
    }

    if (subtype === 'FreeText') {
      const contents = decodePdfText(annot.lookup(PDFName.of('Contents')));
      const hasRichText = annot.has(PDFName.of('RC'));
      const da = decodePdfText(annot.lookup(PDFName.of('DA')));
      const { fontSize, color: textColor } = parseDefaultAppearance(da);
      const align = annot.lookupMaybe(PDFName.of('Q'), PDFNumber)?.asNumber() ?? 0;
      const borderWidth = readBorderWidth(annot, 0);
      const font = await getFont();
      const unencodable = drawTextBoxFallback(
        page,
        rect,
        contents,
        font,
        fontSize,
        textColor,
        align,
        color,
        borderWidth,
        textColor,
        opacity,
      );
      return { drew: true, needsRasterFallback: unencodable || hasRichText };
    }

    if (subtype === 'Widget') {
      const rawV = lookupInheritable(annot, 'V');
      const valueText = decodePdfText(rawV);
      if (!valueText || valueText === 'Off') {
        return { drew: false, needsRasterFallback: false };
      }
      const da = decodePdfText(lookupInheritable(annot, 'DA'));
      const { fontSize, color: textColor } = parseDefaultAppearance(da);
      const align = (() => {
        const q = lookupInheritable(annot, 'Q');
        return q instanceof PDFNumber ? q.asNumber() : 0;
      })();
      const font = await getFont();
      drawTextBoxFallback(page, rect, valueText, font, fontSize, textColor, align, undefined, 0, undefined, 1);
      // Always request browser raster fallback if a filled widget had no /AP and pdf-lib couldn't generate one.
      return { drew: true, needsRasterFallback: true };
    }

    if (subtype === 'Redact') {
      page.drawRectangle({
        x: minX,
        y: minY,
        width,
        height,
        color: interiorColor ?? rgb(0, 0, 0),
        opacity: 1,
      });
      return { drew: true, needsRasterFallback: true };
    }

    // Stamp, Text (sticky note), Caret, Polygon, PolyLine without /AP: defer to PDF.js when available.
    return { drew: false, needsRasterFallback: true };
  })();
}

function widgetHasNormalAppearance(doc: PDFDocument, widgetDict: PDFDict): boolean {
  const { appearance, intentionallyOff } = resolveNormalAppearance(doc, widgetDict);
  return appearance !== null || intentionallyOff;
}

function fieldHasVisibleValue(field: unknown): boolean {
  if (field instanceof PDFTextField) {
    return (field.getText() ?? '').length > 0;
  }
  if (field instanceof PDFCheckBox) {
    return field.isChecked();
  }
  if (field instanceof PDFRadioGroup) {
    return Boolean(field.getSelected());
  }
  if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
    return field.getSelected().length > 0;
  }
  return false;
}

/**
 * Ensures AcroForm fields on `targetPageIndices` have up-to-date appearance streams (/AP /N)
 * without clobbering already-valid appearances (which may use custom or Unicode fonts).
 * Returns any target page indices where appearance regeneration failed (e.g. non-WinAnsi text).
 */
export async function prepareFormFieldAppearances(
  doc: PDFDocument,
  targetPageIndices: readonly number[],
): Promise<Set<number>> {
  const fallbackPages = new Set<number>();
  if (!doc.catalog.has(PDFName.of('AcroForm'))) return fallbackPages;

  let form: ReturnType<PDFDocument['getForm']>;
  try {
    form = doc.getForm();
  } catch {
    return fallbackPages;
  }

  // Map every annotation dict on target pages to its page index (does not rely on optional /P).
  const dictToPageIndex = new Map<PDFDict, number>();
  for (const pageIndex of targetPageIndices) {
    if (pageIndex < 0 || pageIndex >= doc.getPageCount()) continue;
    const page = doc.getPage(pageIndex);
    const annots = page.node.Annots();
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i++) {
      const dict = annots.lookupMaybe(i, PDFDict);
      if (dict) dictToPageIndex.set(dict, pageIndex);
    }
  }

  const needAppearances = form.acroForm.dict.lookup(PDFName.of('NeedAppearances')) === PDFBool.True;
  let embeddedFont: PDFFont | null = null;
  const getFont = async () => {
    if (!embeddedFont) embeddedFont = await doc.embedFont(StandardFonts.Helvetica);
    return embeddedFont;
  };

  let fields: ReturnType<typeof form.getFields>;
  try {
    fields = form.getFields();
  } catch {
    return fallbackPages;
  }

  for (const field of fields) {
    const widgets = field.acroField.getWidgets();
    const touchedPages = new Set<number>();
    let missingAppearance = false;

    for (const widget of widgets) {
      const pageIndex = dictToPageIndex.get(widget.dict);
      if (pageIndex === undefined) continue;
      touchedPages.add(pageIndex);
      if (!widgetHasNormalAppearance(doc, widget.dict)) {
        missingAppearance = true;
      }
    }

    if (touchedPages.size === 0) continue;

    const shouldRegenerate = needAppearances || (missingAppearance && fieldHasVisibleValue(field));
    if (!shouldRegenerate) continue;

    try {
      if (field instanceof PDFCheckBox || field instanceof PDFRadioGroup) {
        field.defaultUpdateAppearances();
      } else if (
        field instanceof PDFTextField
        || field instanceof PDFDropdown
        || field instanceof PDFOptionList
        || field instanceof PDFButton
      ) {
        const font = await getFont();
        field.defaultUpdateAppearances(font);
      } else if (missingAppearance) {
        touchedPages.forEach(idx => fallbackPages.add(idx));
      }
    } catch {
      // Non-WinAnsi text, XFA, or malformed field: flag page for PDF.js fallback in browser,
      // and clear stale /AP when NeedAppearances is true so Node vector fallback uses the latest /V.
      if (needAppearances && (field instanceof PDFTextField || field instanceof PDFDropdown || field instanceof PDFOptionList)) {
        for (const widget of widgets) {
          widget.dict.delete(PDFName.of('AP'));
        }
      }
      touchedPages.forEach(idx => fallbackPages.add(idx));
    }
  }

  return fallbackPages;
}

/**
 * Flattens printable annotations and AcroForm widgets on `page` directly into its content stream
 * using exact ISO 32000-1 Section 12.5.5 BBox/Matrix/Rect placement.
 */
export async function flattenPageAnnotations(
  doc: PDFDocument,
  page: PDFPage,
  options: FlattenAnnotationsOptions = {},
): Promise<FlattenPageResult> {
  const annots = page.node.Annots();
  if (!annots || annots.size() === 0) {
    return { flattenedCount: 0, needsRasterFallback: false };
  }

  const acroFormDict = doc.catalog.lookupMaybe(PDFName.of('AcroForm'), PDFDict);
  const drDict = acroFormDict?.lookupMaybe(PDFName.of('DR'), PDFDict);

  let fallbackFont: PDFFont | null = null;
  const getFont = async () => {
    if (!fallbackFont) fallbackFont = await doc.embedFont(StandardFonts.Helvetica);
    return fallbackFont;
  };

  let flattenedCount = 0;
  let needsRasterFallback = false;
  const indicesToRemove: number[] = [];

  for (let i = 0; i < annots.size(); i++) {
    const annot = annots.lookupMaybe(i, PDFDict);
    if (!annot) continue;

    const subtype = annot.lookupMaybe(PDFName.of('Subtype'), PDFName)?.decodeText() ?? '';
    if (options.widgetsOnly && subtype !== 'Widget') continue;

    if (shouldSkipAnnotation(annot, subtype)) {
      if (!options.keepAnnotations && (options.widgetsOnly ? subtype === 'Widget' : true)) {
        indicesToRemove.push(i);
      }
      continue;
    }

    const rectNums = asFiniteNumbers(annot.lookupMaybe(PDFName.of('Rect'), PDFArray));
    if (!rectNums || rectNums.length < 4) {
      if (!options.keepAnnotations) indicesToRemove.push(i);
      continue;
    }
    const rect: [number, number, number, number] = [rectNums[0], rectNums[1], rectNums[2], rectNums[3]];

    const { appearance, intentionallyOff } = resolveNormalAppearance(doc, annot);
    let keepThisAnnot = Boolean(options.keepAnnotations);
    if (appearance) {
      if (drawAppearanceXObject(doc, page, rect, appearance, drDict)) {
        flattenedCount += 1;
      }
    } else if (!intentionallyOff) {
      const fallback = await drawAnnotationFallback(page, annot, subtype, rect, getFont);
      if (fallback.needsRasterFallback) {
        needsRasterFallback = true;
        if (options.preserveFallbackAnnotations) {
          keepThisAnnot = true;
        }
      }
      if (fallback.drew) flattenedCount += 1;
    }

    if (!keepThisAnnot) {
      indicesToRemove.push(i);
    }
  }

  if (!options.keepAnnotations && indicesToRemove.length > 0) {
    for (let i = indicesToRemove.length - 1; i >= 0; i--) {
      annots.remove(indicesToRemove[i]);
    }
    if (annots.size() === 0) {
      page.node.delete(PDFName.of('Annots'));
    }
  }

  return { flattenedCount, needsRasterFallback };
}

/**
 * Prepares AcroForm appearances and flattens annotations/widgets across the requested pages.
 */
export async function flattenDocumentAnnotations(
  doc: PDFDocument,
  pageIndices?: readonly number[],
  options: FlattenAnnotationsOptions = {},
): Promise<FlattenDocumentResult> {
  const targets = pageIndices
    ? Array.from(new Set(pageIndices)).filter(i => i >= 0 && i < doc.getPageCount())
    : doc.getPageIndices();

  const fallbackPages = await prepareFormFieldAppearances(doc, targets);
  let flattenedCount = 0;

  for (const pageIndex of targets) {
    const page = doc.getPage(pageIndex);
    const result = await flattenPageAnnotations(doc, page, options);
    flattenedCount += result.flattenedCount;
    if (result.needsRasterFallback) {
      fallbackPages.add(pageIndex);
    }
  }

  if (!options.keepAnnotations && targets.length === doc.getPageCount()) {
    doc.catalog.delete(PDFName.of('AcroForm'));
  }

  return { flattenedCount, fallbackPages };
}
