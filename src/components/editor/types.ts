export type ElementType =
  | 'text'
  | 'image'
  | 'rect'
  | 'circle'
  | 'highlight'
  | 'redact'
  | 'draw'
  | 'edit-text';

export interface StrokePoint {
  x: number;
  y: number;
}

export interface EditorElement {
  id: string;
  type: ElementType;
  label?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pageIndex?: number;
  content?: string;
  src?: string;
  fontSize?: number;
  fontFamily?: string;
  fontStyle?: string;
  fontWeight?: number | string;
  textAlign?: 'left' | 'center' | 'right';
  fillColor?: string;
  strokeWidth?: number;
  opacity?: number;
  // Freehand drawing & text color
  points?: StrokePoint[];
  strokeColor?: string;
  // Existing text editing metadata
  originalText?: string;
  originalPdfX?: number;
  originalPdfY?: number;
  originalPdfW?: number;
  originalPdfH?: number;
}
