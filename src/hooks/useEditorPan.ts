import { useEffect, useRef } from 'react';
import type { PointerEvent } from 'react';

interface Pan { id: number; node: HTMLDivElement; x: number; y: number; left: number; top: number; clear: () => void }
export function useEditorPan(enabled: boolean, context: string, onGesture: (active: boolean) => void, isGestureActive: () => boolean) {
  const pan = useRef<Pan | null>(null);
  const abort = useRef<(() => void) | null>(null);
  useEffect(() => () => { abort.current?.(); }, [enabled, context, onGesture]);
  const finish = (rollback: boolean) => {
    const current = pan.current; if (!current) return;
    pan.current = null; abort.current = null; current.clear();
    if (rollback) { current.node.scrollLeft = current.left; current.node.scrollTop = current.top; }
    if (current.node.hasPointerCapture(current.id)) current.node.releasePointerCapture(current.id);
    onGesture(false);
  };
  const update = (event: PointerEvent<HTMLDivElement>, current: Pan) => { current.node.scrollLeft = current.left - (event.clientX - current.x); current.node.scrollTop = current.top - (event.clientY - current.y); };
  return {
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      // Touch keeps browser-native panning and inertia. Mouse Pan uses a grab gesture.
      if (!enabled || event.pointerType !== 'mouse' || event.button !== 0 || !event.isPrimary || isGestureActive()) return;
      event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
      const cancel = () => finish(true);
      const escape = (key: globalThis.KeyboardEvent) => { if (key.key === 'Escape') { key.preventDefault(); cancel(); } };
      const hidden = () => { if (document.hidden) cancel(); };
      const dialog = (focus: FocusEvent) => { if (focus.target instanceof Element && focus.target.closest('[role="dialog"]')) cancel(); };
      window.addEventListener('keydown', escape); window.addEventListener('blur', cancel); document.addEventListener('visibilitychange', hidden); document.addEventListener('focusin', dialog);
      pan.current = { id: event.pointerId, node: event.currentTarget, x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop, clear: () => { window.removeEventListener('keydown', escape); window.removeEventListener('blur', cancel); document.removeEventListener('visibilitychange', hidden); document.removeEventListener('focusin', dialog); } };
      abort.current = cancel; onGesture(true);
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => { const current = pan.current; if (current && event.pointerId === current.id) { event.preventDefault(); update(event, current); } },
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => { const current = pan.current; if (current && event.pointerId === current.id) { update(event, current); finish(false); } },
    onPointerCancel: (event: PointerEvent<HTMLDivElement>) => { if (event.pointerId === pan.current?.id) finish(true); },
    onLostPointerCapture: (event: PointerEvent<HTMLDivElement>) => { if (event.pointerId === pan.current?.id) finish(true); },
  };
}
