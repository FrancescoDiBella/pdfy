import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import { Close, SearchOutlined } from '@mui/icons-material';
import { filterCommands, groupCommands, type CommandItem } from '../utils/commandPalette';

export interface PaletteCommand extends CommandItem {
  icon: ReactNode;
  onSelect: () => void;
}

interface Props {
  open: boolean;
  commands: ReadonlyArray<PaletteCommand>;
  onClose: () => void;
}

let cachedSupportsDisplayTransition: boolean | undefined;

function canTransitionDisplay(): boolean {
  if (cachedSupportsDisplayTransition !== undefined) return cachedSupportsDisplayTransition;
  if (typeof window === 'undefined' || !window.CSS?.supports?.('transition-behavior', 'allow-discrete') || !document.body) {
    return false;
  }
  const probe = document.createElement('div');
  probe.style.cssText = 'transition: display 1s allow-discrete !important; display: block;';
  document.body.appendChild(probe);
  void getComputedStyle(probe).display;
  probe.style.display = 'none';
  cachedSupportsDisplayTransition = getComputedStyle(probe).display === 'block';
  probe.remove();
  return cachedSupportsDisplayTransition;
}

function supportsTopLayerExit(): boolean {
  return typeof window !== 'undefined' && Boolean(window.CSS?.supports?.('overlay', 'auto')) && canTransitionDisplay();
}

async function closeTopLayerDialog(dialog: HTMLDialogElement): Promise<void> {
  if (!dialog.open) return;
  if (!supportsTopLayerExit()) {
    dialog.setAttribute('data-closing', '');
    const animations = dialog.getAnimations({ subtree: true });
    if (animations.length > 0) {
      await Promise.race([
        Promise.allSettled(animations.map(animation => animation.finished)),
        new Promise(resolve => setTimeout(resolve, 2000)),
      ]);
    }
    if (!dialog.hasAttribute('data-closing')) return;
    dialog.removeAttribute('data-closing');
  }
  if (dialog.open) {
    dialog.close();
  }
}

export default function CommandPalette({ open, commands, onClose }: Props) {
  const titleId = useId();
  const inputId = useId();
  const listboxId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  const closeTokenRef = useRef(0);
  const instantUnmountRef = useRef(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [unmountPending, setUnmountPending] = useState(false);

  const shouldRender = open || unmountPending;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const filtered = useMemo(() => filterCommands(commands, query), [commands, query]);
  const grouped = useMemo(() => groupCommands(filtered), [filtered]);
  const safeSelectedIndex = filtered.length > 0 ? Math.min(selectedIndex, filtered.length - 1) : -1;

  const requestClose = useCallback(() => {
    const dialog = dialogRef.current;
    if (dialog?.open) {
      void closeTopLayerDialog(dialog);
    } else {
      onCloseRef.current();
    }
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      closeTokenRef.current += 1;
      instantUnmountRef.current = false;
      dialog.removeAttribute('data-closing');
      if (!dialog.open) {
        dialog.showModal();
      }
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    } else if (dialog.open) {
      void closeTopLayerDialog(dialog);
    }
  }, [open, shouldRender]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleCancel = (event: Event) => {
      event.preventDefault();
      void closeTopLayerDialog(dialog);
    };

    const handleClose = () => {
      dialog.removeAttribute('data-closing');
      setQuery('');
      setSelectedIndex(0);
      onCloseRef.current();

      const token = ++closeTokenRef.current;
      const animations = instantUnmountRef.current ? [] : dialog.getAnimations({ subtree: true });
      if (animations.length === 0) {
        setUnmountPending(false);
        return;
      }
      setUnmountPending(true);
      void Promise.race([
        Promise.allSettled(animations.map(animation => animation.finished)),
        new Promise(resolve => setTimeout(resolve, 400)),
      ]).then(() => {
        if (closeTokenRef.current === token) {
          setUnmountPending(false);
        }
      });
    };

    dialog.addEventListener('cancel', handleCancel);
    dialog.addEventListener('close', handleClose);

    // Mandatory fallback for browsers without native <dialog closedby="any"> support (e.g. Safari).
    const needsClosedByFallback = typeof HTMLDialogElement !== 'undefined' && !('closedBy' in HTMLDialogElement.prototype);
    const handleBackdropClick = (event: MouseEvent) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const insideContent = (
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width
      );
      if (insideContent) return;
      void closeTopLayerDialog(dialog);
    };

    if (needsClosedByFallback) {
      dialog.addEventListener('click', handleBackdropClick);
    }

    return () => {
      dialog.removeEventListener('cancel', handleCancel);
      dialog.removeEventListener('close', handleClose);
      if (needsClosedByFallback) {
        dialog.removeEventListener('click', handleBackdropClick);
      }
    };
  }, [shouldRender]);

  const runCommand = (command: PaletteCommand) => {
    instantUnmountRef.current = true;
    const dialog = dialogRef.current;
    if (dialog?.open) {
      dialog.removeAttribute('data-closing');
      dialog.close();
    } else {
      onCloseRef.current();
    }
    command.onSelect();
  };

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (filtered.length > 0) {
        setSelectedIndex(current => (current + 1) % filtered.length);
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (filtered.length > 0) {
        setSelectedIndex(current => (current - 1 + filtered.length) % filtered.length);
      }
    } else if (event.key === 'Enter') {
      if (event.nativeEvent.isComposing || event.keyCode === 229) return;
      if (safeSelectedIndex >= 0 && filtered[safeSelectedIndex]) {
        event.preventDefault();
        runCommand(filtered[safeSelectedIndex]);
      }
    }
  };

  const indexById = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((item, index) => map.set(item.id, index));
    return map;
  }, [filtered]);

  if (!shouldRender) return null;

  return (
    <dialog
      ref={dialogRef}
      className="pdfy-command-dialog lg-surface lg-panel"
      aria-labelledby={titleId}
      {...({ closedby: 'any' } as Record<string, unknown>)}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', maxHeight: 'min(560px, calc(100dvh - 32px))' }}>
        <Box sx={{ p: 1.5, pb: 1.15, borderBottom: 1, borderColor: 'var(--pdfy-glass-hairline)' }}>
          <Box className="pdfy-command-search-well">
            <SearchOutlined aria-hidden="true" sx={{ color: 'text.secondary', fontSize: 21, flexShrink: 0 }} />
            <label htmlFor={inputId} id={titleId} className="sr-only">
              Quick command palette
            </label>
            <input
              id={inputId}
              ref={inputRef}
              type="search"
              className="pdfy-command-input"
              placeholder="Jump to a PDF tool, feature, or theme…"
              value={query}
              aria-controls={listboxId}
              aria-autocomplete="list"
              onChange={event => {
                setQuery(event.target.value);
                setSelectedIndex(0);
              }}
              onKeyDown={handleInputKeyDown}
            />
            <IconButton aria-label="Close command palette" onClick={requestClose} size="small">
              <Close fontSize="small" />
            </IconButton>
          </Box>
        </Box>

        <Box
          id={listboxId}
          role="region"
          aria-label="Matching commands"
          className="pdfy-scroll-region pdfy-command-list"
          sx={{ overflowY: 'auto', p: 1.15, pb: 2.5, display: 'flex', flexDirection: 'column', gap: 1.1 }}
        >
          {filtered.length === 0 ? (
            <Box sx={{ py: 4, px: 2, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                No matching tools or actions for “{query.trim()}”.
              </Typography>
            </Box>
          ) : (
            grouped.map(group => (
              <Box key={group.category}>
                <Typography
                  component="div"
                  variant="caption"
                  color="text.secondary"
                  sx={{ px: 1.25, py: 0.4, fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.06em' }}
                >
                  {group.category.toUpperCase()}
                </Typography>
                <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 0.35 }}>
                  {group.items.map(item => {
                    const flatIndex = indexById.get(item.id) ?? 0;
                    const active = flatIndex === safeSelectedIndex;
                    return (
                      <Box component="li" key={item.id}>
                        <button
                          type="button"
                          className="pdfy-command-option"
                          data-active={active ? 'true' : 'false'}
                          onMouseEnter={() => setSelectedIndex(flatIndex)}
                          onClick={() => runCommand(item)}
                        >
                          <Box
                            component="span"
                            aria-hidden="true"
                            sx={{
                              display: 'inline-grid',
                              placeItems: 'center',
                              width: 32,
                              height: 32,
                              borderRadius: '10px',
                              bgcolor: active ? 'var(--lg-segmented-active-bg)' : 'var(--lg-segmented-track)',
                              color: active ? 'primary.main' : 'text.secondary',
                              flexShrink: 0,
                              '& svg': { fontSize: 18 },
                            }}
                          >
                            {item.icon}
                          </Box>
                          <Box sx={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: active ? 'primary.main' : 'text.primary' }}>
                              {item.label}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflowWrap: 'anywhere' }}>
                              {item.subtitle}
                            </Typography>
                          </Box>
                          {item.badge && (
                            <Typography
                              component="span"
                              variant="caption"
                              sx={{
                                px: 1,
                                py: 0.2,
                                borderRadius: 99,
                                border: 1,
                                borderColor: 'var(--lg-outer-hairline)',
                                bgcolor: 'var(--pdfy-glass-subtle)',
                                color: 'text.secondary',
                                fontWeight: 600,
                                fontSize: '0.72rem',
                                flexShrink: 0,
                              }}
                            >
                              {item.badge}
                            </Typography>
                          )}
                        </button>
                      </Box>
                    );
                  })}
                </Box>
              </Box>
            ))
          )}
        </Box>

        <Box sx={{ px: 2, py: 0.9, borderTop: 1, borderColor: 'var(--pdfy-glass-hairline)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
            <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
              <kbd className="pdfy-kbd-hint">↑↓</kbd> Move
            </Typography>
            <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
              <kbd className="pdfy-kbd-hint">↵</kbd> Run
            </Typography>
            <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
              <kbd className="pdfy-kbd-hint">Esc</kbd> Close
            </Typography>
          </Box>
          <Typography variant="caption" color="text.secondary" className="tabular-nums">
            {filtered.length} {filtered.length === 1 ? 'result' : 'results'}
          </Typography>
        </Box>
      </Box>
    </dialog>
  );
}
