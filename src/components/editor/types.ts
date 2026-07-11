export type ElementType = 'text' | 'image' | 'rect' | 'draw' | 'edit-text';

export interface StrokePoint {
  x: number;
  y: number;
}

export interface EditorElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  pageIndex?: number;
  content?: string;
  src?: string;
  fontSize?: number;
  fontWeight?: number;
  textAlign?: 'left' | 'center' | 'right';
  fillColor?: string;
  strokeWidth?: number;
  opacity?: number;
  // Freehand drawing
  points?: StrokePoint[];
  strokeColor?: string;
  // Existing text editing metadata
  originalText?: string;
  originalPdfX?: number;
  originalPdfY?: number;
  originalPdfW?: number;
  originalPdfH?: number;
}
