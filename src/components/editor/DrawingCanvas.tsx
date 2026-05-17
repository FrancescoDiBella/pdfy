import { useRef } from 'react';
import type { StrokePoint } from './types';

interface Props {
  width: number;
  height: number;
  isActive: boolean;
  strokeColor: string;
  strokeWidth: number;
  opacity: number;
  /** Called when a new stroke is finished */
  onStrokeComplete: (points: StrokePoint[]) => void;
}

export default function DrawingCanvas({ width, height, isActive, strokeColor, strokeWidth, opacity, onStrokeComplete }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const currentPoints = useRef<StrokePoint[]>([]);

  const getPos = (e: React.MouseEvent<HTMLCanvasElement>): StrokePoint => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isActive) return;
    e.stopPropagation();
    isDrawing.current = true;
    currentPoints.current = [getPos(e)];
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current || !isActive) return;
    const point = getPos(e);
    currentPoints.current.push(point);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear previous frame of the live stroke
    ctx.clearRect(0, 0, width, height);

    // Draw current in-progress stroke
    const pts = currentPoints.current;
    if (pts.length < 2) return;
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const mid = {
        x: (pts[i - 1].x + pts[i].x) / 2,
        y: (pts[i - 1].y + pts[i].y) / 2,
      };
      ctx.quadraticCurveTo(pts[i - 1].x, pts[i - 1].y, mid.x, mid.y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  const handleMouseUp = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    if (currentPoints.current.length >= 2) {
      onStrokeComplete(currentPoints.current);
    }
    currentPoints.current = [];
  };

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{
        position: 'absolute',
        top: 0, left: 0,
        width, height,
        zIndex: isActive ? 30 : 5,
        cursor: isActive ? 'crosshair' : 'default',
        pointerEvents: isActive ? 'auto' : 'none',
      }}
    />
  );
}
