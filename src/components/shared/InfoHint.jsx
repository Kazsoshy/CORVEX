import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const POPOVER_WIDTH = 280;
const VIEWPORT_PAD = 8;
const CLOSE_DELAY_MS = 120;

/**
 * Lightweight BM-safe explainer: button + hover/focus/click popover.
 * Renders in a portal so table overflow does not clip the tip.
 */
export function InfoHint({ label = 'More information', children, className = '' }) {
  const id = useId();
  const rootRef = useRef(null);
  const popoverRef = useRef(null);
  const closeTimerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);

  function clearCloseTimer() {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function openHint() {
    clearCloseTimer();
    setOpen(true);
    // Coords set in layout effect after portal mounts.
  }

  function scheduleClose() {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, CLOSE_DELAY_MS);
  }

  function placePopover() {
    const trigger = rootRef.current?.querySelector('.info-hint__trigger');
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const pop = popoverRef.current;
    const height = pop?.offsetHeight || 120;
    const width = Math.min(POPOVER_WIDTH, window.innerWidth - VIEWPORT_PAD * 2);

    let left = rect.right + 8;
    if (left + width > window.innerWidth - VIEWPORT_PAD) {
      left = Math.max(VIEWPORT_PAD, rect.left - width - 8);
    }

    let top = rect.top;
    if (top + height > window.innerHeight - VIEWPORT_PAD) {
      top = Math.max(VIEWPORT_PAD, rect.bottom - height);
    }
    if (top < VIEWPORT_PAD) top = VIEWPORT_PAD;

    setCoords({ top, left, width });
  }

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return undefined;
    }
    placePopover();
    function onReposition() {
      placePopover();
    }
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open, children]);

  useEffect(() => () => clearCloseTimer(), []);

  useEffect(() => {
    if (!open) return undefined;
    function onDocPointer(event) {
      const inRoot = rootRef.current?.contains(event.target);
      const inPop = popoverRef.current?.contains(event.target);
      if (!inRoot && !inPop) setOpen(false);
    }
    function onKey(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span
      ref={rootRef}
      className={`info-hint ${className}`.trim()}
      onMouseEnter={openHint}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        className="info-hint__trigger"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          clearCloseTimer();
          setOpen((v) => !v);
        }}
        onFocus={openHint}
        onBlur={(e) => {
          if (popoverRef.current?.contains(e.relatedTarget)) return;
          scheduleClose();
        }}
      >
        i
      </button>
      {open && typeof document !== 'undefined'
        ? createPortal(
          <span
            id={id}
            ref={popoverRef}
            role="tooltip"
            className="info-hint__popover info-hint__popover--portal"
            style={coords
              ? { top: coords.top, left: coords.left, width: coords.width, visibility: 'visible' }
              : { top: 0, left: 0, visibility: 'hidden' }}
            onMouseEnter={openHint}
            onMouseLeave={scheduleClose}
          >
            {children}
          </span>,
          document.body
        )
        : null}
    </span>
  );
}
