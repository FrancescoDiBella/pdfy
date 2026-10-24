import { useEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject, PointerEvent, KeyboardEvent } from 'react';
import { Box, IconButton } from '@mui/material';
import { OpenInFull } from '@mui/icons-material';
import { logicalPoint, sameBounds, transformBounds } from '../../utils/editorGeometry';
import type { Bounds, Size } from '../../utils/editorGeometry';

interface Props {
  itemId: string; bounds: Bounds; pageSize: Size; zoom: number; selected: boolean; enabled: boolean; label: string;
  preserveRatio: boolean; showResize: boolean; pageRef: RefObject<HTMLDivElement | null>; children: (bounds: Bounds) => ReactNode;
  onSelect: () => void; onEdit: () => void; onCommit: (bounds: Bounds) => void; onGesture: (active: boolean) => void; isGestureActive: () => boolean;
}
interface Gesture { id: number; target: HTMLButtonElement; start: Bounds; from: { x: number; y: number }; operation: 'move' | 'resize'; client: { x: number; y: number } }

export default function EditorElementFrame({ itemId, bounds, pageSize, zoom, selected, enabled, label, preserveRatio, showResize, pageRef, children, onSelect, onEdit, onCommit, onGesture, isGestureActive }: Props) {
  const [preview, setPreview] = useState<Bounds | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const dispose = useRef<(() => void) | null>(null);
  useEffect(() => () => { dispose.current?.(); }, []);
  const focusPage = () => pageRef.current?.focus({ preventScroll: true });
  const finish = (commit?: Bounds) => {
    const current = gesture.current; if (!current) return;
    // Clear identity before releasing capture: lostpointercapture must not finalize twice.
    gesture.current = null; dispose.current?.(); dispose.current = null;
    if (current.target.hasPointerCapture(current.id)) current.target.releasePointerCapture(current.id);
    setPreview(null); onGesture(false);
    if (commit && !sameBounds(current.start, commit)) onCommit(commit);
  };
  const point = (event: PointerEvent<HTMLButtonElement>) => {
    const rect = pageRef.current!.getBoundingClientRect();
    return logicalPoint({ x: event.clientX, y: event.clientY }, rect, pageSize);
  };
  const begin = (event: PointerEvent<HTMLButtonElement>, operation: 'move' | 'resize') => {
    if (!enabled || !event.isPrimary || event.button !== 0 || gesture.current || isGestureActive() || !pageRef.current) return;
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const current: Gesture = { id: event.pointerId, target: event.currentTarget, start: bounds, from: point(event), operation, client: { x: event.clientX, y: event.clientY } };
    gesture.current = current; onSelect(); focusPage(); onGesture(true);
    const cancel = () => finish();
    const escape = (key: globalThis.KeyboardEvent) => { if (key.key === 'Escape') { key.preventDefault(); cancel(); } };
    const hidden = () => { if (document.hidden) cancel(); };
    const dialog = (focus: FocusEvent) => { if (focus.target instanceof Element && focus.target.closest('[role="dialog"]')) cancel(); };
    window.addEventListener('keydown', escape); window.addEventListener('blur', cancel); document.addEventListener('visibilitychange', hidden); document.addEventListener('focusin', dialog);
    dispose.current = () => {
      window.removeEventListener('keydown', escape); window.removeEventListener('blur', cancel); document.removeEventListener('visibilitychange', hidden); document.removeEventListener('focusin', dialog);
      if (gesture.current) {
        const activeGesture = gesture.current; gesture.current = null;
        if (activeGesture.target.hasPointerCapture(activeGesture.id)) activeGesture.target.releasePointerCapture(activeGesture.id);
        onGesture(false);
      }
    };
  };
  const nextBounds = (event: PointerEvent<HTMLButtonElement>, current: Gesture) => Math.hypot(event.clientX - current.client.x, event.clientY - current.client.y) < 3 ? current.start : transformBounds(current.start, current.from, point(event), pageSize, current.operation, preserveRatio);
  const events = {
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => { const current = gesture.current; if (!current || event.pointerId !== current.id) return; event.preventDefault(); setPreview(nextBounds(event, current)); },
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => { const current = gesture.current; if (!current || event.pointerId !== current.id) return; event.preventDefault(); finish(nextBounds(event, current)); },
    onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => { if (event.pointerId === gesture.current?.id) finish(); },
    onLostPointerCapture: (event: PointerEvent<HTMLButtonElement>) => { if (event.pointerId === gesture.current?.id) finish(); },
  };
  const keys = (event: KeyboardEvent<HTMLButtonElement>, operation: 'move' | 'resize') => {
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!direction) return;
    event.preventDefault(); event.stopPropagation();
    if (isGestureActive()) return;
    const step = event.shiftKey ? 10 : 1;
    onCommit(transformBounds(bounds, { x: 0, y: 0 }, { x: direction[0] * step, y: direction[1] * step }, pageSize, operation, preserveRatio));
  };
  const visible = preview ?? bounds;
  const hitWidth = Math.max(44, visible.width * zoom); const hitHeight = Math.max(44, visible.height * zoom);
  const hitLeft = Math.min(0, (pageSize.width - visible.x) * zoom - hitWidth);
  const hitTop = Math.min(0, (pageSize.height - visible.y) * zoom - hitHeight);
  const resizeLeft = Math.min(Math.max(-visible.x * zoom, visible.width * zoom - 22), (pageSize.width - visible.x) * zoom - 44);
  const resizeTop = Math.min(Math.max(-visible.y * zoom, visible.height * zoom - 22), (pageSize.height - visible.y) * zoom - 44);
  return <Box id={`editor-item-${itemId}`} className="editor-item" data-transforming={!!preview} style={{ width: visible.width * zoom, height: visible.height * zoom, transform: `translate(${visible.x * zoom}px, ${visible.y * zoom}px)` }} sx={{ position: 'absolute', left: 0, top: 0, zIndex: selected ? 20 : 10, pointerEvents: enabled ? 'auto' : 'none' }}>
    <Box sx={{ width: '100%', height: '100%', outline: selected && enabled ? '2px solid' : 'none', outlineColor: 'primary.main', borderRadius: '2px', pointerEvents: 'none' }}>{children(visible)}</Box>
    {enabled && <Box component="button" type="button" aria-label={`Select ${label} item`} aria-pressed={selected} aria-describedby="editor-canvas-help" onPointerDown={event => begin(event, 'move')} {...events} onClick={event => { event.stopPropagation(); if (!isGestureActive()) { onSelect(); focusPage(); } }} onDoubleClick={event => { event.stopPropagation(); if (!isGestureActive()) onEdit(); }} onKeyDown={event => keys(event, 'move')} sx={{ position: 'absolute', left: hitLeft, top: hitTop, width: hitWidth, height: hitHeight, border: 0, p: 0, bgcolor: 'transparent', cursor: preview ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none', '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 } }} />}
    {enabled && selected && showResize && <IconButton aria-label={`Resize ${label} item`} aria-describedby="editor-canvas-help" onPointerDown={event => begin(event, 'resize')} {...events} onClick={event => event.stopPropagation()} onKeyDown={event => keys(event, 'resize')} sx={{ position: 'absolute', left: resizeLeft, top: resizeTop, width: 44, height: 44, border: '1px solid', borderColor: 'primary.main', bgcolor: 'background.paper', color: 'primary.main', boxShadow: 2, cursor: 'nwse-resize', touchAction: 'none', '&:hover': { bgcolor: 'background.paper' } }}><OpenInFull sx={{ fontSize: 18 }} /></IconButton>}
  </Box>;
}
