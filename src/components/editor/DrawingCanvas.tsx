import { useEffect, useRef } from 'react';
import type { PointerEvent } from 'react';
import type { StrokePoint } from './types';

interface Props {
  width: number; height: number; isActive: boolean; strokeColor: string; strokeWidth: number; opacity: number;
  onGesture: (active: boolean) => void;
  onStrokeComplete: (points: StrokePoint[]) => void;
}

export default function DrawingCanvas({ width, height, isActive, strokeColor, strokeWidth, opacity, onGesture, onStrokeComplete }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pointer = useRef<number | null>(null);
  const points = useRef<StrokePoint[]>([]);
  useEffect(() => {
    const node = canvas.current;
    const cancel = () => {
      const id = pointer.current; if (id === null) return;
      pointer.current = null; points.current = [];
      node?.getContext('2d')?.clearRect(0, 0, width, height);
      if (node?.hasPointerCapture(id)) node.releasePointerCapture(id);
      onGesture(false);
    };
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape' && pointer.current !== null) { event.preventDefault(); cancel(); } };
    const hidden = () => { if (document.hidden) cancel(); };
    const dialog = (focus: FocusEvent) => { if (focus.target instanceof Element && focus.target.closest('[role="dialog"]')) cancel(); };
    window.addEventListener('keydown', escape); window.addEventListener('blur', cancel); document.addEventListener('visibilitychange', hidden); document.addEventListener('focusin', dialog);
    return () => { cancel(); window.removeEventListener('keydown', escape); window.removeEventListener('blur', cancel); document.removeEventListener('visibilitychange', hidden); document.removeEventListener('focusin', dialog); };
  }, [onGesture, width, height]);
  const position = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(width, (event.clientX - rect.left) * width / rect.width)), y: Math.max(0, Math.min(height, (event.clientY - rect.top) * height / rect.height)) };
  };
  const clear = () => { points.current = []; pointer.current = null; onGesture(false); canvas.current?.getContext('2d')?.clearRect(0, 0, width, height); };
  return <canvas ref={canvas} width={width} height={height} aria-label="Freehand drawing surface"
    onPointerDown={event => {
      if (!isActive || !event.isPrimary || event.button !== 0 || pointer.current !== null) return;
      event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
      pointer.current = event.pointerId; points.current = [position(event)]; onGesture(true);
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
      const end = position(event);
      const previous = points.current.at(-1);
      if (previous && (previous.x !== end.x || previous.y !== end.y)) points.current.push(end);
      if (points.current.length >= 2) onStrokeComplete(points.current);
      clear(); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }}
    onPointerCancel={event => { if (event.pointerId === pointer.current) clear(); }} onLostPointerCapture={event => { if (event.pointerId === pointer.current) clear(); }}
    style={{ position: 'absolute', inset: 0, width, height, zIndex: isActive ? 30 : 5, cursor: isActive ? 'crosshair' : 'default', pointerEvents: isActive ? 'auto' : 'none', touchAction: isActive ? 'none' : 'auto' }} />;
}
