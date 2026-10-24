import { useEffect, useRef } from 'react';
import type { PointerEvent } from 'react';
import type { StrokePoint } from './types';

interface Props {
  width: number; height: number; isActive: boolean; strokeColor: string; strokeWidth: number; opacity: number;
  onStrokeComplete: (points: StrokePoint[]) => void;
}

export default function DrawingCanvas({ width, height, isActive, strokeColor, strokeWidth, opacity, onStrokeComplete }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pointer = useRef<number | null>(null);
  const points = useRef<StrokePoint[]>([]);
  useEffect(() => {
    pointer.current = null; points.current = [];
    canvas.current?.getContext('2d')?.clearRect(0, 0, width, height);
  }, [width, height, isActive]);
  const position = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * width / rect.width, y: (event.clientY - rect.top) * height / rect.height };
  };
  const clear = () => { points.current = []; pointer.current = null; canvas.current?.getContext('2d')?.clearRect(0, 0, width, height); };
  return <canvas ref={canvas} width={width} height={height} aria-label="Freehand drawing surface"
    onPointerDown={event => {
      if (!isActive || !event.isPrimary || event.button !== 0 || pointer.current !== null) return;
      event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
      pointer.current = event.pointerId; points.current = [position(event)];
    }}
    onPointerMove={event => {
      if (pointer.current !== event.pointerId) return;
      event.preventDefault(); points.current.push(position(event));
      const ctx = event.currentTarget.getContext('2d'); if (!ctx) return;
      ctx.clearRect(0, 0, width, height); ctx.globalAlpha = opacity; ctx.strokeStyle = strokeColor; ctx.lineWidth = strokeWidth; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(points.current[0].x, points.current[0].y);
      for (const point of points.current.slice(1)) ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }}
    onPointerUp={event => {
      if (pointer.current !== event.pointerId) return;
      if (points.current.length >= 2) onStrokeComplete(points.current);
      clear(); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }}
    onPointerCancel={event => { if (event.pointerId === pointer.current) clear(); }} onLostPointerCapture={event => { if (event.pointerId === pointer.current) clear(); }}
    style={{ position: 'absolute', inset: 0, width, height, zIndex: isActive ? 30 : 5, cursor: isActive ? 'crosshair' : 'default', pointerEvents: isActive ? 'auto' : 'none', touchAction: isActive ? 'none' : 'auto' }} />;
}
