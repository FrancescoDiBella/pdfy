export type ElementType = 'text' | 'image' | 'rect';

export interface EditorElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  content?: string;
  src?: string;
  fontSize?: number;
  fontWeight?: number;
  textAlign?: 'left' | 'center' | 'right';
  fillColor?: string;
  strokeWidth?: number;
  opacity?: number;
}
